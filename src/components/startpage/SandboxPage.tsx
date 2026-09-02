"use client";

/* 自定义沙箱页面 overlay（预设 pages 字段的运行时）。
 *
 * 结构：应用层 overlay → sandbox.html?mode=page（唯一源宿主，见 sandbox.js pageMode）
 *       → 嵌套 srcdoc iframe（sandbox="allow-scripts"，不透明源，用户 HTML）。
 * 页面内极简 chushi API（notify/close/open）经两级 postMessage 中继回这里，
 * 白名单复核后执行：open 仅 https、长度上限、每页一次渲染。
 * 关闭路径：页面内 chushi.close() / Esc / 右上角 ×。
 */

import { memo, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PresenceClass } from "./PresenceClass";
import { sandboxPageSrc } from "@/lib/startpage/sandbox";

const SPRING = { type: "spring" as const, stiffness: 420, damping: 34 };

export interface ActivePage {
  /** 运行时复合键 `${presetId}:${pageId}` */
  key: string;
  name: string;
  html: string;
}

type PageApiMsg = {
  type?: unknown;
  op?: unknown;
  pageKey?: unknown;
  title?: unknown;
  description?: unknown;
  url?: unknown;
};

function SandboxPage(props: {
  page: ActivePage | null;
  onClose: () => void;
  onNotify: (title: string, description?: string) => void;
  onOpenUrl: (url: string) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const pageRef = useRef<ActivePage | null>(null);
  useEffect(() => {
    pageRef.current = props.page;
  }, [props.page]);

  function onMessage(e: MessageEvent) {
    const page = pageRef.current;
    if (!page) return;
    const w = frameRef.current?.contentWindow;
    if (!w || e.source !== w) return;
    const m = e.data as PageApiMsg | null;
    if (!m || typeof m !== "object" || m.type !== "pageApi" || m.pageKey !== page.key) return;
    const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
    switch (m.op) {
      case "notify":
        props.onNotify(s(m.title, 24) || "来自自定义页面", s(m.description, 60) || undefined);
        break;
      case "close":
        props.onClose();
        break;
      case "open": {
        const url = s(m.url, 500);
        if (!/^https:\/\//i.test(url)) return;
        try {
          new URL(url);
        } catch {
          return;
        }
        props.onOpenUrl(url);
        break;
      }
      default:
        break;
    }
  }

  useEffect(() => {
    if (!props.page) return;
    window.addEventListener("message", onMessage);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKey);
    };
  }, [props.page, props.onClose, onMessage]);

  /* iframe 加载完成后注入页面（一次挂载只注入一次，sandbox.js 侧同样幂等） */
  const onFrameLoad = useCallback(() => {
    const page = pageRef.current;
    if (!page) return;
    try {
      frameRef.current?.contentWindow?.postMessage(
        { type: "renderPage", key: page.key, html: page.html },
        "*"
      );
    } catch {
      /* noop */
    }
  }, []);

  return (
    <AnimatePresence>
      {props.page && (
        <PresenceClass
          key="sandbox-page"
          role="dialog"
          aria-modal="true"
          aria-label={`自定义页面：${props.page.name}`}
          className="veil-in fixed inset-0 z-[70]"
          /* 入场淡入走 CSS .veil-in（framer WAAPI opacity 入场空窗律）；退场视觉走
             CSS .overlay-sink；卸载由 PresenceClass 定时器接管（v12 WAAPI 退场取消回跳律） */
          exitClass="overlay-sink"
        >
          <iframe
            ref={frameRef}
            src={sandboxPageSrc()}
            onLoad={onFrameLoad}
            title={`初始沙箱页面：${props.page.name}`}
            className="absolute inset-0 h-full w-full border-0 bg-transparent"
            /* allow-scripts 仅此一项：不透明源 + 无同源 + 无顶层导航 */
            sandbox="allow-scripts"
          />
          <button
            type="button"
            onClick={props.onClose}
            aria-label="关闭自定义页面"
            className="absolute right-4 top-4 rounded-full p-2 text-zinc-500 opacity-40 transition-all duration-200 hover:bg-zinc-900/5 hover:opacity-90 dark:text-zinc-400 dark:hover:bg-white/10"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </PresenceClass>
      )}
    </AnimatePresence>
  );
}

export default memo(SandboxPage);
