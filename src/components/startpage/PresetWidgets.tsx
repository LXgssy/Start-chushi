"use client";

/* 预设角落小部件层（widgets 字段的运行时，v1.0.7）。
 *
 * 结构：应用层 fixed 定位盒 → sandbox.html?mode=widget（唯一源宿主，见 sandbox.js
 * widgetMode）→ 嵌套 srcdoc iframe（sandbox="allow-scripts"，不透明源，用户 HTML）。
 * 部件内极简 chushi API（notify/open/storage/resize）经两级 postMessage 中继回这里，
 * 白名单复核后执行：open 仅 https、storage 键值限长并持久化到本地
 * localStorage（start:widget-kv，命名空间 = 部件复合键，数据不离开设备）。
 * 卸载路径：删除预设即整盒卸载（装了即生效，删除即失效，无隐藏状态）。
 * 元素钩子：.cl-widgets（层）/ .cl-widget（单盒），可供预设 animations 定制样式；
 * 禅模式跟随 html.zen 隐藏（见 globals.css）。
 */

import { memo, useEffect, useRef, useState } from "react";
import { sandboxWidgetSrc } from "@/lib/startpage/sandbox";
import { smtc, SMTC_COMMANDS, type SmtcState } from "@/lib/startpage/smtc";

export interface ActiveWidget {
  /** 运行时复合键 `${presetId}:${widgetId}` */
  key: string;
  presetName: string;
  name: string;
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
const H_MAX = 320;
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

  /* SMTC 快照广播（v1.8.0）：smtc 单例签名变化才触发；
     只推已订阅部件帧（widgetSmtc 下行经沙箱宿主转发进部件） */
  useEffect(() => {
    smtc.start();
    return smtc.subscribe(() => {
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

  if (props.widgets.length === 0) return null;

  return (
    <div className="cl-widgets">
      {props.widgets.map((w) => (
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
