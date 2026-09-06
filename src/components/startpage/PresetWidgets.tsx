"use client";

/* 预设小部件层（widgets 字段的运行时，v1.0.7 角落磁贴 / v1.8.2 dock 弹出面板）。
 *
 * 结构：应用层 fixed 定位盒 → sandbox.html?mode=widget（唯一源宿主，见 sandbox.js
 * widgetMode）→ 嵌套 srcdoc iframe（sandbox="allow-scripts"，不透明源，用户 HTML）。
 * 部件内极简 chushi API（notify/open/storage/resize/close）经两级 postMessage 中继回这里，
 * 白名单复核后执行：open 仅 https、storage 键值限长并持久化到本地
 * localStorage（start:widget-kv，命名空间 = 部件复合键，数据不离开设备）。
 * dock 表面（v1.8.2）：不出角落，由 Dock 注册按钮，点击在本组件内弹出面板
 * （高度弹簧 + panel-rise/sink 同内建面板语言）；chushi.close() 关闭弹出面板。
 * 卸载路径：删除预设即整盒卸载（装了即生效，删除即失效，无隐藏状态）。
 * 元素钩子：.cl-widgets（层）/ .cl-widget（单盒）/ .cl-dockwidget（dock 弹出面板），
 * 可供预设 animations 定制样式；禅模式跟随 html.zen 隐藏（见 globals.css）。
 */

import { memo, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { sandboxWidgetSrc } from "@/lib/startpage/sandbox";
import { smtc, SMTC_COMMANDS, type SmtcState } from "@/lib/startpage/smtc";
import { MOTION_PROFILES, type MotionProfile } from "./Dock";

export interface ActiveWidget {
  /** 运行时复合键 `${presetId}:${widgetId}` */
  key: string;
  presetName: string;
  name: string;
  /** 表面（v1.8.2）：corner = 角落磁贴；dock = tab 栏按钮 + 弹出面板 */
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
/* v1.9.0：320 → 460 —— dock 面板展开卡含逐字歌词区（部件自 resize，宿主弹簧跟随） */
const H_MAX = 460;
const VALUE_MAX = 4000;

/* dock 弹出面板高度弹簧：与内建面板 PanelStage 同源（用户动效档位，v1.9.0 起不再硬编码） */
const EXIT_EASE = [0.4, 0, 1, 1] as const;
/** 收起退场时长（与 globals.css .panel-sink 同参，+余量后转入 closed） */
const SINK_MS = 240;

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

/** 回推快照给单个部件帧（reqId 携带则同时视作 get 回执） */
function replySmtc(host: Window | null | undefined, wkey: string, reqId?: unknown) {
  if (!host) return;
  const state: SmtcState = smtc.getSnapshot();
  try {
    host.postMessage(
      { type: "widgetSmtc", widgetKey: wkey, state, reqId: typeof reqId === "number" ? reqId : 0 },
      "*"
    );
  } catch {
    /* noop */
  }
}

function PresetWidgets(props: {
  widgets: ActiveWidget[];
  isDark: boolean;
  accent: string;
  onNotify: (title: string, description?: string) => void;
  onOpenUrl: (url: string) => void;
  /** 当前打开的 dock 表面弹出面板 widget 键（v1.8.2，null = 全关） */
  dockPanelKey: string | null;
  /** 关闭 dock 弹出面板（遮罩/再点 dock 按钮/沙箱 chushi.close() 共用同一入口） */
  onCloseDockPanel: () => void;
  /** 动效语言档位（v1.9.0）：弹出面板与内建面板同一套弹簧参数 */
  motionProfile: MotionProfile;
}) {
  /* 盒高：预设初始值 → 沙箱 chushi.resize 跟随（删除的部件自动清理） */
  const [heights, setHeights] = useState<Record<string, number>>({});
  const framesRef = useRef<Map<string, HTMLIFrameElement>>(new Map());
  /** SMTC 通道（v1.8.0）：订阅了快照推送的部件 key 集合（回调期读 ref，见下方 widgetsRef 同模式） */
  const smtcSubsRef = useRef<Set<string>>(new Set());
  /* 消息监听器只挂一次 → 经 ref 读取最新值；ref 写入放 effect（React Compiler 律：
     渲染期不可触 ref，与 page.tsx contentHRef 镜像同模式） */
  const widgetsRef = useRef(props.widgets);
  const kvRef = useRef<Record<string, string>>({});
  const themeRef = useRef({ isDark: props.isDark, accent: props.accent });
  const cbRef = useRef(props);
  useEffect(() => {
    widgetsRef.current = props.widgets;
  });
  useEffect(() => {
    themeRef.current = { isDark: props.isDark, accent: props.accent };
  });
  useEffect(() => {
    cbRef.current = props;
  });

  /* 挂载时读一次 KV；部件列表清空（全部预设删除）时无框架可服务 */
  useEffect(() => {
    kvRef.current = readKv();
  }, []);

  /* SMTC 快照广播（v1.8.0）+ 每拍轻量锚点（v1.9.0）：
     完整快照（含歌词大载荷）签名变化才发；tick {position,fetchedAt,…} 每拍必发——
     seek 后的新位置/插值漂移校正靠它到达部件（否则进度条拖完弹回） */
  useEffect(() => {
    smtc.start();
    const unTick = smtc.onTick(() => {
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
        const host = framesRef.current.get(wkey)?.contentWindow;
        if (!host) continue;
        try {
          host.postMessage({ type: "widgetSmtcTick", widgetKey: wkey, tick }, "*");
        } catch {
          /* noop */
        }
      }
    });
    const unSub = smtc.subscribe(() => {
      const state = smtc.getSnapshot();
      for (const wkey of smtcSubsRef.current) {
        const host = framesRef.current.get(wkey)?.contentWindow;
        if (!host) continue;
        try {
          host.postMessage({ type: "widgetSmtc", widgetKey: wkey, state }, "*");
        } catch {
          /* noop */
        }
      }
    });
    return () => {
      unTick();
      unSub();
    };
  }, []);

  function onMessage(e: MessageEvent) {
    const m = e.data as WidgetApiMsg | null;
    if (!m || typeof m !== "object" || m.type !== "widgetApi") return;
    const wkey = s(m.widgetKey, 80);
    const w = widgetsRef.current.find((x) => x.key === wkey);
    if (!w) return;
    const frame = framesRef.current.get(wkey);
    /* 只信该部件自己的宿主帧（唯一源页），且由该帧内的 inner 转发 */
    const host = frame?.contentWindow;
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
        setHeights((prev) => (prev[wkey] === h ? prev : { ...prev, [wkey]: h }));
        break;
      }
      /* ---------- SMTC 通道（v1.8.0）----------
         smtcGet：立即回推当前快照；smtcSubscribe：登记后同样回推（
         后续变化由 smtc.subscribe 广播承接）；smtcControl：白名单复核后
         转桥，回执 widgetSmtcResult。快照里 track/cover 均为宿主白名单产物。 */
      case "smtcGet": {
        smtc.start();
        replySmtc(framesRef.current.get(wkey)?.contentWindow ?? null, wkey, m.reqId);
        break;
      }
      case "smtcSubscribe": {
        smtc.start();
        smtcSubsRef.current.add(wkey);
        replySmtc(framesRef.current.get(wkey)?.contentWindow ?? null, wkey, m.reqId);
        break;
      }
      case "smtcControl": {
        const cmd = s(m.cmd, 8);
        if (!SMTC_COMMANDS.has(cmd)) break;
        const posRaw = m.position as unknown;
        const pos =
          typeof posRaw === "number" && Number.isFinite(posRaw)
            ? Math.max(0, Math.min(86400, posRaw))
            : undefined;
        smtc.start();
        void smtc.control(cmd, pos).then((ok) => {
          const host = framesRef.current.get(wkey)?.contentWindow;
          if (!host) return;
          try {
            host.postMessage({ type: "widgetSmtcResult", widgetKey: wkey, reqId: m.reqId, ok }, "*");
          } catch {
            /* noop */
          }
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
        try {
          host.postMessage({ type: "widgetStorage", widgetKey: wkey, reqId: m.reqId, op: "storageGet", value: v }, "*");
        } catch {
          /* noop */
        }
        break;
      }
      case "storageSet": {
        const k = `${wkey}:${s(m.key, 64)}`;
        const v = s(m.value, VALUE_MAX);
        kvRef.current = { ...kvRef.current, [k]: v };
        writeKv(kvRef.current);
        try {
          host.postMessage({ type: "widgetStorage", widgetKey: wkey, reqId: m.reqId, op: "storageSet", ok: true }, "*");
        } catch {
          /* noop */
        }
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

  /* 主题/强调色变化 → 下发全部部件帧 */
  useEffect(() => {
    for (const w of props.widgets) {
      const host = framesRef.current.get(w.key)?.contentWindow;
      if (!host) continue;
      try {
        host.postMessage({ type: "widgetTheme", theme: props.isDark ? "dark" : "light", accent: props.accent }, "*");
      } catch {
        /* noop */
      }
    }
  }, [props.isDark, props.accent, props.widgets]);

  /* dock 弹出面板目标（v1.8.2）：dockPanelKey 必须命中 dock 表面部件才渲染 */
  const dw = props.dockPanelKey
    ? props.widgets.find((x) => x.key === props.dockPanelKey && x.surface === "dock")
    : null;
  void dw;
  const cornerWidgets = props.widgets.filter((w) => w.surface !== "dock");
  const dockWidgets = props.widgets.filter((w) => w.surface === "dock");
  const reduceMotion = useReducedMotion();
  const motionSpring = MOTION_PROFILES[props.motionProfile] ?? MOTION_PROFILES.standard;

  /* ---------- 弹出面板相位机（v1.9.0 常驻预热） ----------
   * v1.8.2 的 AnimatePresence 挂载/卸载方案：每次打开新挂 iframe → sandbox.html 冷加载
   * → 嵌套 srcdoc 注入 → 订阅回推，首帧白屏（iframe 默认白底）且动画被加载卡顿拖累。
   * v1.9.0 改为：只要 dock 表面部件存在，弹出容器与 iframe 随页面常驻（预热），
   * SMTC 订阅/封面/歌词在后台持续更新；打开/关闭只动高度与相位类：
   *   closed → open：height 0⇒h 弹簧 + .panel-rise；
   *   open → closing：height ⇒0 (EXIT_EASE 0.22s) + .panel-sink；
   *   closing → (SINK_MS 后) closed：清类，下次打开重播 .panel-rise。
   * iframe 节点永不卸载 = 零重载、零白屏，开面板与内建 PanelStage 同语言同手感。 */
  const [phases, setPhases] = useState<Record<string, "closed" | "open" | "closing">>({});
  useEffect(() => {
    setPhases((prev) => {
      const nextMap: Record<string, "closed" | "open" | "closing"> = {};
      let changed = false;
      const keys = new Set<string>();
      for (const w of props.widgets) {
        if (w.surface !== "dock") continue;
        keys.add(w.key);
        const want =
          props.dockPanelKey === w.key
            ? "open"
            : prev[w.key] === "open" || prev[w.key] === "closing"
              ? "closing"
              : "closed";
        if (prev[w.key] !== want) changed = true;
        nextMap[w.key] = want;
      }
      if (Object.keys(prev).length !== keys.size) changed = true;
      return changed ? nextMap : prev;
    });
  }, [props.dockPanelKey, props.widgets]);
  /* closing → closed：sink 动画播完再清类，下次打开重播 rise */
  useEffect(() => {
    const closing = Object.entries(phases)
      .filter(([, p]) => p === "closing")
      .map(([k]) => k);
    if (closing.length === 0) return;
    const t = setTimeout(() => {
      setPhases((prev) => {
        const n = { ...prev };
        for (const k of closing) if (n[k] === "closing") n[k] = "closed";
        return n;
      });
    }, SINK_MS);
    return () => clearTimeout(t);
  }, [phases]);

  if (props.widgets.length === 0) return null;

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
                height: `${heights[w.key] ?? w.height}px`,
                zIndex: 20,
              }}
            >
              <iframe
                ref={(el) => {
                  if (el) framesRef.current.set(w.key, el);
                  else framesRef.current.delete(w.key);
                }}
                src={sandboxWidgetSrc()}
                onLoad={() => {
                  try {
                    framesRef.current.get(w.key)?.contentWindow?.postMessage(
                      {
                        type: "renderWidget",
                        key: w.key,
                        html: w.html,
                        theme: themeRef.current.isDark ? "dark" : "light",
                        accent: themeRef.current.accent,
                      },
                      "*"
                    );
                  } catch {
                    /* noop */
                  }
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

      {/* ---------- dock 弹出面板（v1.9.0 常驻预热）----------
       * 语言与内建 PanelStage 同源：静态 wrapper 定位（fixed + CSS 居中，不进 framer）→
       * 卡片（开 .panel-rise / 收 .panel-sink，CSS 关键帧承载）→ motion.div 高度弹簧
       * （用户动效档位，与内建面板同参）。iframe 随部件常驻预热（见相位机注释）——
       * 打开瞬间内容已就绪，无白屏、无重载、SMTC 订阅不中断。
       * 卡片本体不加背景：部件 HTML 自带卡片视觉；宿主只负责定位、弹簧与裁剪。 */}
      {dockWidgets.map((w) => {
        const ph = phases[w.key] ?? "closed";
        const open = ph === "open";
        const h = heights[w.key] ?? w.height;
        return (
          <div
            key={w.key}
            className="pointer-events-none fixed bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+60px)] left-1/2 z-40 -translate-x-1/2"
          >
            <div
              data-widget={w.key}
              aria-hidden={!open}
              role={open ? "dialog" : undefined}
              aria-label={w.name}
              className={`cl-dockwidget ${open ? "pointer-events-auto" : "pointer-events-none"} ${
                open && !reduceMotion
                  ? "panel-rise"
                  : ph === "closing" && !reduceMotion
                    ? "panel-sink"
                    : ""
              }`}
              style={{
                transformOrigin: "bottom center",
                willChange: "transform",
                width: `min(92vw, ${w.width}px)`,
              }}
            >
              <motion.div
                className="overflow-hidden rounded-[18px]"
                style={{ contain: "layout" }}
                initial={false}
                animate={{ height: open ? h : 0 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : open
                      ? motionSpring
                      : { duration: 0.22, ease: EXIT_EASE }
                }
              >
                <iframe
                  ref={(el) => {
                    if (el) framesRef.current.set(w.key, el);
                    else framesRef.current.delete(w.key);
                  }}
                  src={sandboxWidgetSrc()}
                  onLoad={() => {
                    try {
                      framesRef.current.get(w.key)?.contentWindow?.postMessage(
                        {
                          type: "renderWidget",
                          key: w.key,
                          html: w.html,
                          theme: themeRef.current.isDark ? "dark" : "light",
                          accent: themeRef.current.accent,
                          /* dock 表面部件以面板形态渲染：沙箱置 dataset.panel，
                             部件据此直开展开卡并把收起键映射为 chushi.close() */
                          panelMode: true,
                        },
                        "*"
                      );
                    } catch {
                      /* noop */
                    }
                  }}
                  title={`初始 dock 面板：${w.name}`}
                  className="block border-0 bg-transparent"
                  style={{ width: "100%", height: h }}
                  sandbox="allow-scripts"
                />
              </motion.div>
            </div>
          </div>
        );
      })}
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
