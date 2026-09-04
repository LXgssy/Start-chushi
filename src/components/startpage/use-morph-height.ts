"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ---------- 面板高度形变的测高 hook（Dock PanelStage / 指令面板共用） ----------
 * 返回 contentH（null = 尚未测高，高度盒走 auto 直就位）与 measureRef
 * （挂到 keyed 视图根元素上，内部由 ResizeObserver 兜底跟踪高度变化）。
 *
 * ⚠ update 必须忽略已脱离文档或零高的元素：视图卸载帧 ResizeObserver 会以
 *   0 尺寸回调一次，把 contentH 毒化成 0 —— 下次打开时高度盒从 0px 弹簧展开，
 *   正是「打开动画变成拉伸、首开与重开不一致」的根因（v1.0.7 探针实证：
 *   首开 inline=auto 纯淡入，重开 inline=0px→240px 弹簧）。
 *
 * armDelay：首开后武装测高的延迟。挂载帧禁止同步 setState（挂载后一帧内的
 * 二次渲染会打断入场），故推迟到入场稳定后；指令面板用较短延迟以便
 * 过滤列表的高度弹簧尽早生效。 */
export function useMorphHeight(armDelay = 500) {
  const [contentH, setContentH] = useState<number | null>(null);
  const contentHRef = useRef<number | null>(null);
  useEffect(() => {
    contentHRef.current = contentH;
  }, [contentH]);
  const roRef = useRef<ResizeObserver | null>(null);
  const armRef = useRef<number | null>(null);
  const measureRef = useCallback(
    (el: HTMLDivElement | null) => {
      /* 退场卸载（el=null）不清理：交叉溶解期共享 roRef 已指向新视图的观察器，
         此处误断会让新视图内部高度变化失察；退场视图的 RO 随元素回收 */
      if (!el) return;
      roRef.current?.disconnect();
      roRef.current = null;
      if (armRef.current != null) {
        window.clearTimeout(armRef.current);
        armRef.current = null;
      }
      const attach = () => {
        const update = () => {
          if (!el.isConnected) return;
          const h = el.offsetHeight;
          if (h <= 0) return; /* 卸载帧 RO 回调 0 尺寸：不得毒化 contentH */
          setContentH(h);
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        roRef.current = ro;
      };
      if (contentHRef.current != null) {
        attach();
      } else {
        armRef.current = window.setTimeout(() => {
          armRef.current = null;
          if (!el.isConnected) return;
          attach();
        }, armDelay);
      }
    },
    [armDelay]
  );
  const reset = useCallback(() => setContentH(null), []);
  return { contentH, measureRef, reset };
}
