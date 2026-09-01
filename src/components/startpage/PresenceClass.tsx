"use client";

/* AnimatePresence 直接子组件：读取 PresenceContext，退场帧追加 CSS 退场类，
 * 并用 safeToRemove 定时器确定性接管卸载时机。
 *
 * 背景（v1.0.6 实测）：framer v12 对 opacity 走 WAAPI 加速——
 * ① 入场有空窗闪黑（已由 .panel-rise CSS 承载解决）；
 * ② 退场动画会被中途取消且 finish 事件不来：exit 值只写 opacity 时甚至
 *    永远等不到完成 → 元素滞留 DOM（隐形但 pointer-events 仍在，挡点击）。
 * 因此：退场视觉一律由 CSS 类承载（.panel-sink / .dialog-sink / .overlay-sink /
 * .veil-out / .veil-out-slow / .view-exit，见 globals.css）——animation 的级联
 * 优先级高于内联值，WAAPI 取消与否都不影响表现；framer 的 exit 压成 0 时长
 * （立即"完成"），卸载时机改由本组件 duration 定时器触发 safeToRemove，
 * 与 CSS 时长严格对齐（+50ms 余量），完全绕开 WAAPI 完成事件。
 * ref 经 props 透传（React 19 ref-as-prop）。 */

import { useEffect } from "react";
import type { ComponentProps } from "react";
import { motion, usePresence } from "framer-motion";

export function PresenceClass({
  className,
  exitClass,
  duration = 0.22,
  children,
  ...motionProps
}: ComponentProps<typeof motion.div> & {
  exitClass: string;
  /** 退场动画时长（秒），与 globals.css 对应关键帧一致；卸载在 duration*1000+50ms 触发 */
  duration?: number;
}) {
  const [isPresent, safeToRemove] = usePresence();
  useEffect(() => {
    if (isPresent) return;
    const t = window.setTimeout(safeToRemove, Math.round(duration * 1000) + 50);
    return () => window.clearTimeout(t);
  }, [isPresent, safeToRemove, duration]);
  return (
    <motion.div
      {...motionProps}
      exit={{ opacity: 0, transition: { duration: 0 } }}
      className={`${className ?? ""}${isPresent ? "" : ` ${exitClass}`}`}
    >
      {children}
    </motion.div>
  );
}
