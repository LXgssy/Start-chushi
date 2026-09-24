"use client";

/* 预设小部件层（widgets 字段的运行时，v1.0.7 角落磁贴；v2.0.0 dock 面板移交 Dock 统一舞台）。
 *
 * 结构：应用层 fixed 定位盒 → sandbox.html?mode=widget（唯一源宿主，见 sandbox.js
 * widgetMode）→ 嵌套 srcdoc iframe（sandbox="allow-scripts"，不透明源，用户 HTML）。
 * 部件内极简 chushi API（notify/open/storage/resize/close/music/smtc）经两级
 * postMessage 中继回这里，白名单复核后执行：open 仅 https、storage 键值限长并
 * 持久化到本地 localStorage（start:widget-kv，命名空间 = 部件复合键，数据不离开设备）。
 *
 * v2.0.0 分工：dock 表面部件的 iframe 由 Dock 的统一面板舞台渲染（与内建面板同一套
 * 切换动画/模糊语言/常驻预热），本组件只保留——①角落磁贴渲染；②全部部件的 API
 * 消息路由与 SMTC 快照/逐拍锚点广播（帧句柄经 widget-frames 共享注册表互通）；
  * ③高度自报转发（chushi.resize → 页面 widgetHeights，舞台高度盒随之弹簧）。
 *
 * 元素钩子：.cl-widgets（角落层）/ .cl-widget（单盒）/ .cl-dockwidget（dock 部件
 * 视图，现居 Dock 舞台内），可供预设 animations 定制样式；禅模式跟随 html.zen 隐藏。
 */

import { memo, useEffect, useRef } from "react";
import { sandboxWidgetSrc } from "@/lib/startpage/sandbox";
import { smtc, SMTC_COMMANDS } from "@/lib/startpage/smtc";
import { postToWidget, widgetFrameGet, widgetFrameSet, widgetThemeBroadcast } from "@/lib/startpage/widget-frames";
import { smtcSpectrum, type SmtcSpectrum } from "@/lib/startpage/smtc";

export interface ActiveWidget {
  /** 运行时复合键 `${presetId}:${widgetId}` */
  key: string;
  presetName: string;
  name: string;
  /** 表面（v1.8.2）：corner = 角落磁贴；dock = tab 栏按钮 + 弹出面板（v2.0.0 统一舞台） */
  surface: "corner" | "dock";
  /** dock 表面按钮图标（lucide 名 / data:image URL），缺省首字母圆形图标 */
  icon?: string;
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  width: number;
  height: number;
  html: string;
}

const CORNER_CSS: Record<ActiveWidget["corner"], string> = {
  "top-left": "top:calc(env(safe-area-inset-top,0px) + 20px);left:20px;",
  "top-right": "top:calc(env(safe-area-inset-top,0px) + 20px);right:20px;",
  "bottom-left": "bottom:calc(env(safe-area-inset-bottom,0px) + 88px);left:20px;",
  "bottom-right": "bottom:calc(env(safe-area-inset-bottom,0px) + 88px);right:20px;",
};

const KV_KEY = "start:widget-kv";
const H_MIN = 40;
/* dock 面板高度上限（含逐字歌词区；v1.9.0 320→460） */
const H_MAX = 460;
const VALUE_MAX = 4000;

type WidgetApiMsg = {
  type?: unknown;
  op?: unknown;
  widgetKey?: unknown;
  key?: unknown;
  value?: unknown;
  reqId?: unknown;
  width?: unknown;
  height?: unknown;
  title?: unknown;
  description?: unknown;
  url?: unknown;
  /** SMTC 通道（v1.8.0）：控制命令与 seek 位置 */
  cmd?: unknown;
  position?: unknown;
};

const s = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

function readKv(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(KV_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return typeof obj === "object" && obj != null ? (obj as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeKv(kv: Record<string, string>) {
  try {
    window.localStorage.setItem(KV_KEY, JSON.stringify(kv));
  } catch {
    /* 隐私模式等场景静默失败 */
  }
}

/** 向单个部件帧推送当前快照（reqId 携带时兼作 smtcGet 回执） */
function pushSmtcSnapshot(wkey: string, reqId?: unknown) {
  const snap = smtc.getSnapshot();
  postToWidget(wkey, { type: "widgetSmtc", widgetKey: wkey, state: snap, reqId: typeof reqId === "number" ? reqId : 0 });
}

/* v8.2.9 面板开关 → 扩展浮窗镜像（cardAcc/cardForceWord 同律）：
   律动 → cardGlow；浮窗 → cardEnabled；强行逐字 → cardForceWord；
   v8.7.16：全局歌词 → cardDlyric。浮窗/律动默认 true（与面板默认一致），
   强行逐字/全局歌词默认 false（true 字面量才置真）。
   v8.4.4 壳桥律：云端壳内页面没有 chrome API——manifest 已注入 MAIN world
   shim（shim-page.js）把 chrome.storage.local 伪造为 postMessage 桥 →
   壳桥（shell-bridge.js/cs-bridge.js）校验 origin 后代写真 chrome.storage；
   本函数零改动（真 API 与 shim 伪造 API 同签名），镜像在三种运行面统一：
   扩展内页（真 API）/ 壳内云端页（shim→壳桥）/ 纯网页（无 chrome，静默）。 */
function mirrorExtCard(
  fw: string | undefined,
  glow: string | undefined,
  flt: string | undefined,
  dl: string | undefined,
) {
  try {
    const ext = (window as unknown as {
      chrome?: { storage?: { local?: { set?: (o: Record<string, unknown>) => void } } };
    }).chrome;
    if (!ext?.storage?.local?.set) return;
    const patch: Record<string, unknown> = {};
    if (fw !== undefined) patch.cardForceWord = fw === "true";
    if (glow !== undefined) patch.cardGlow = glow !== "false";
    if (flt !== undefined) patch.cardEnabled = flt !== "false";
    if (dl !== undefined) patch.cardDlyric = dl === "true";
    if (Object.keys(patch).length) ext.storage.local.set(patch);
  } catch {
    /* 非 extension 环境（gh-pages 预览） */
  }
}

/* v8.4.4 反向实时同步：chrome.storage.local 变化 → 面板 kv 回写 +
   widgetStoragePatch 下发（面板开关 UI 实时翻转）。
   变化来源：浮窗（全局开关/其他镜像方）、全局歌词浮层（× 钮反向写）、
   其他「初始」标签页（扩展内或壳内）、顶层直访 Pages 的 cs-bridge——
   任一处写键，所有表面跟随。
   回环律：本页面自己 mirrorExtCard 写入触发的 onChanged 回声与新值恒等，
   被下方「同值 no-op」守卫吸收（值不再变化即链断，无震荡）。 */
const EXT_KV_MAP: Record<string, string> = {
  cardEnabled: ":csFloat",
  cardGlow: ":csGlow",
  cardForceWord: ":csForceWord",
  cardDlyric: ":csDlyric", /* v8.7.16 全局歌词（桌面歌词浮层全局显隐） */
};

function PresetWidgets(props: {
  widgets: ActiveWidget[];
  isDark: boolean;
  accent: string;
  onNotify: (title: string, description?: string) => void;
  onOpenUrl: (url: string) => void;
  /** 当前打开的 dock 表面弹出面板 widget 键（v1.8.2，null = 全关）；closePanel 复核用 */
  dockPanelKey: string | null;
  /** 关闭 dock 弹出面板（遮罩/再点 dock 按钮/沙箱 chushi.close() 共用同一入口） */
  onCloseDockPanel: () => void;
  /** 部件自报高度（v2.0.0 由页面持有，统一舞台高度盒随之弹簧） */
  heights: Record<string, number>;
  onResize: (key: string, height: number) => void;
}) {
  const framesRef = useRef<Map<string, HTMLIFrameElement>>(new Map());
  /** SMTC 通道（v1.8.0）：订阅了快照推送的部件 key 集合（回调期读 ref，见下方 widgetsRef 同模式） */
  const smtcSubsRef = useRef<Set<string>>(new Set());
  /** v8.2.0 频谱转发句柄（首个媒体订阅部件出现即挂，卸载/清零即卸） */
  const specUnsubRef = useRef<(() => void) | null>(null);
  /* 消息监听器只挂一次 → 经 ref 读取最新值；ref 写入放 effect（React Compiler 律：
     渲染期不可触 ref，与 page.tsx contentHRef 镜像同模式） */
  const widgetsRef = useRef(props.widgets);
  const kvRef = useRef<Record<string, string>>({});
  const cbRef = useRef(props);
  useEffect(() => {
    widgetsRef.current = props.widgets;
  });
  useEffect(() => {
    cbRef.current = props;
  });

  /* 挂载时读一次 KV；部件列表清空（全部预设删除）时无框架可服务 */
  useEffect(() => {
    kvRef.current = readKv();
    /* v8.2.8 初始镜像：已有开关值同步给浮窗（否则浮窗要等用户
       下一次切换开关才知道面板状态）；v8.2.9 扩至三开关；
       v8.7.16 扩至四开关（全局歌词 cardDlyric） */
    const kv = kvRef.current;
    const fw = Object.entries(kv).find(([k]) => k.endsWith(":csForceWord"));
    const glow = Object.entries(kv).find(([k]) => k.endsWith(":csGlow"));
    const flt = Object.entries(kv).find(([k]) => k.endsWith(":csFloat"));
    const dl = Object.entries(kv).find(([k]) => k.endsWith(":csDlyric"));
    mirrorExtCard(fw ? fw[1] : undefined, glow ? glow[1] : undefined, flt ? flt[1] : undefined, dl ? dl[1] : undefined);
  }, []);

  /* v8.4.4 反向实时：chrome.storage.onChanged（扩展内真事件 / 壳内 shim
     伪造事件，签名一致）→ 回写面板 kv + widgetStoragePatch 下发。
     纯网页无 chrome.storage → 不挂，行为不变。 */
  useEffect(() => {
    const oc = (window as unknown as {
      chrome?: {
        storage?: {
          onChanged?: {
            addListener?: (fn: (ch: Record<string, { newValue?: unknown }>, area: string) => void) => void;
            removeListener?: (fn: (ch: Record<string, { newValue?: unknown }>, area: string) => void) => void;
          };
        };
      };
    }).chrome?.storage?.onChanged;
    if (!oc?.addListener) return;
    const handler = (ch: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local" || !ch || typeof ch !== "object") return;
      for (const [extKey, suffix] of Object.entries(EXT_KV_MAP)) {
        const chg = ch[extKey];
        if (!chg) continue;
        const val = chg.newValue === true || chg.newValue === "true" ? "true" : "false";
        const kv = kvRef.current;
        for (const [k, old] of Object.entries(kv)) {
          if (!k.endsWith(suffix) || old === val) continue; // 同值 no-op = 回声吸收/回环断链
          kvRef.current = { ...kvRef.current, [k]: val };
          writeKv(kvRef.current);
          const wkey = k.slice(0, k.length - suffix.length);
          postToWidget(wkey, { type: "widgetStoragePatch", widgetKey: wkey, key: suffix.slice(1), value: val });
        }
      }
    };
    oc.addListener(handler);
    return () => {
      try {
        if (oc.removeListener) oc.removeListener(handler);
      } catch {
        /* shim 场景移除失败不影响 */
      }
    };
  }, []);

  /* 媒体双通道（v5 全新实现）：
     - 快照通道：签名变化才广播完整 state（含歌词大载荷）；
     - 节拍通道：每拍必发轻量锚点 {position,duration,playing,rate,fetchedAt}——
       seek 后的新位置/插值漂移校正靠它到达部件。 */
  useEffect(() => {
    smtc.start();
    const sendTick = () => {
      const t = smtc.getSnapshot().track;
      if (!t) return;
      const tick = {
        position: t.position,
        duration: t.duration,
        playing: t.playing,
        rate: t.rate,
        fetchedAt: t.fetchedAt,
      };
      for (const wkey of smtcSubsRef.current) {
        postToWidget(wkey, { type: "widgetSmtcTick", widgetKey: wkey, tick });
      }
    };
    const sendSnap = () => {
      const snap = smtc.getSnapshot();
      for (const wkey of smtcSubsRef.current) {
        postToWidget(wkey, { type: "widgetSmtc", widgetKey: wkey, state: snap });
      }
    };
    const offTick = smtc.onTick(sendTick);
    const offSub = smtc.subscribe(sendSnap);
    return () => {
      offTick();
      offSub();
      /* v8.2.0：部件帧宿主卸载同步卸频谱转发 */
      if (specUnsubRef.current) {
        specUnsubRef.current();
        specUnsubRef.current = null;
      }
    };
  }, []);

  /** v8.2.0 频谱帧 → 部件帧（30Hz 已包络，{on,bass,bands,t}） */
  const sendSpectrum = (sp: SmtcSpectrum) => {
    for (const wkey of smtcSubsRef.current) {
      postToWidget(wkey, { type: "widgetSmtcSpectrum", widgetKey: wkey, sp });
    }
  };

  function onMessage(e: MessageEvent) {
    const m = e.data as WidgetApiMsg | null;
    if (!m || typeof m !== "object" || m.type !== "widgetApi") return;
    const wkey = s(m.widgetKey, 80);
    const w = widgetsRef.current.find((x) => x.key === wkey);
    if (!w) return;
    /* 只信该部件自己的宿主帧（唯一源页），且由该帧内的 inner 转发 */
    const host = widgetFrameGet(wkey)?.contentWindow;
    if (!host || e.source !== host) return;

    switch (s(m.op, 16)) {
      case "notify":
        cbRef.current.onNotify(s(m.title, 24) || `来自${w.presetName}`, s(m.description, 60) || undefined);
        break;
      case "open": {
        const url = s(m.url, 500);
        if (!/^https:\/\//i.test(url)) return;
        try {
          new URL(url);
        } catch {
          return;
        }
        cbRef.current.onOpenUrl(url);
        break;
      }
      case "resize": {
        const raw = m.height as unknown;
        const h = Math.round(typeof raw === "number" && Number.isFinite(raw) ? raw : 0);
        if (h < H_MIN || h > H_MAX) return;
        cbRef.current.onResize(wkey, h);
        break;
      }
      /* ---------- 媒体通道（v5 全新实现）----------
         smtcGet：立即回推快照；smtcSubscribe：登记后回推，后续由广播承接；
         smtcControl：白名单复核 → 宿主客户端下发 → 回执 widgetSmtcResult。 */
      case "smtcGet": {
        smtc.start();
        pushSmtcSnapshot(wkey, m.reqId);
        break;
      }
      case "smtcSubscribe": {
        smtc.start();
        smtcSubsRef.current.add(wkey);
        /* v8.2.0：首个订阅部件挂频谱转发（惰性拉起律：无部件订阅不轮询不 boot） */
        if (smtcSubsRef.current.size === 1 && !specUnsubRef.current) {
          specUnsubRef.current = smtcSpectrum.subscribe(sendSpectrum);
        }
        pushSmtcSnapshot(wkey, m.reqId);
        break;
      }
      case "smtcControl": {
        const cmd = s(m.cmd, 8);
        const posRaw = m.position as unknown;
        const pos =
          typeof posRaw === "number" && Number.isFinite(posRaw)
            ? Math.max(0, Math.min(86400, posRaw))
            : undefined;
        if (!SMTC_COMMANDS.has(cmd)) break;
        smtc.start();
        smtc.control(cmd, pos).then((ok) => {
          postToWidget(wkey, { type: "widgetSmtcResult", widgetKey: wkey, reqId: m.reqId, ok });
        });
        break;
      }
      /* ---------- dock 弹出面板关闭（v1.8.2）----------
         沙箱内 chushi.close() → 本操作：仅 dock 表面且正处于打开状态的部件可关，
         与遮罩点击/再点 dock 按钮走同一入口（onCloseDockPanel） */
      case "closePanel": {
        if (w.surface !== "dock" || cbRef.current.dockPanelKey !== wkey) break;
        cbRef.current.onCloseDockPanel();
        break;
      }
      case "storageGet": {
        const k = `${wkey}:${s(m.key, 64)}`;
        const v = kvRef.current[k] ?? "";
        postToWidget(wkey, { type: "widgetStorage", widgetKey: wkey, reqId: m.reqId, op: "storageGet", value: v });
        break;
      }
      case "storageSet": {
        const k = `${wkey}:${s(m.key, 64)}`;
        const v = s(m.value, VALUE_MAX);
        kvRef.current = { ...kvRef.current, [k]: v };
        writeKv(kvRef.current);
        /* v8.2.8/9 面板开关镜像到 chrome.storage.local：csForceWord →
           cardForceWord；csGlow → cardGlow（律动总开关）；csFloat →
           cardEnabled（浮窗全局显隐）；v8.7.16：csDlyric → cardDlyric
           （全局歌词浮层全局显隐）——悬浮卡/歌词浮层任意网页读取 + onChanged */
        if (k.endsWith(":csForceWord")) mirrorExtCard(v, undefined, undefined, undefined);
        else if (k.endsWith(":csGlow")) mirrorExtCard(undefined, v, undefined, undefined);
        else if (k.endsWith(":csFloat")) mirrorExtCard(undefined, undefined, v, undefined);
        else if (k.endsWith(":csDlyric")) mirrorExtCard(undefined, undefined, undefined, v);
        postToWidget(wkey, { type: "widgetStorage", widgetKey: wkey, reqId: m.reqId, op: "storageSet", ok: true });
        break;
      }
      default:
        break;
    }
  }

  useEffect(() => {
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  /* 主题/强调色变化 → 下发全部部件帧（角落 + 统一舞台里的 dock 部件） */
  useEffect(() => {
    widgetThemeBroadcast(props.widgets, props.isDark, props.accent);
  }, [props.isDark, props.accent, props.widgets]);

  if (props.widgets.length === 0) return null;

  const cornerWidgets = props.widgets.filter((w) => w.surface !== "dock");

  return (
    <>
      {cornerWidgets.length > 0 && (
        <div className="cl-widgets">
          {cornerWidgets.map((w) => (
            <div
              key={w.key}
              data-widget={w.key}
              title={w.name}
              className="cl-widget hidden md:block"
              style={{
                position: "fixed",
                ...cssTextToObj(CORNER_CSS[w.corner]),
                width: w.width,
                height: `${props.heights[w.key] ?? w.height}px`,
                zIndex: 20,
              }}
            >
              <iframe
                ref={(el) => {
                  widgetFrameSet(w.key, el);
                }}
                src={sandboxWidgetSrc()}
                onLoad={() => {
                  postToWidget(w.key, {
                    type: "renderWidget",
                    key: w.key,
                    html: w.html,
                    theme: cbRef.current.isDark ? "dark" : "light",
                    accent: cbRef.current.accent,
                  });
                }}
                title={`初始自定义小部件：${w.name}`}
                className="h-full w-full border-0 bg-transparent"
                /* allow-scripts 仅此一项：不透明源 + 无同源 + 无顶层导航 */
                sandbox="allow-scripts"
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** CORNER_CSS 是受控常量（仅 top/left/right/bottom 数值），无需 CSS 解析器 */
function cssTextToObj(css: string): Record<string, string | number> {
  const obj: Record<string, string | number> = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i <= 0) continue;
    obj[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return obj;
}

export default memo(PresetWidgets);
