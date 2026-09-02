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
 * 优先级高于内联值，WAAPI 取消与否都不影响表现；卸载时机由本组件 duration
 * 定时器触发 safeToRemove，与 CSS 时长严格对齐（+50ms 余量）。
 *
 * ⚠ v1.0.8（真机「一直闪」根因）：exit 严禁携带任何在可见窗口内生效的属性——
 *   v1.0.7 用 exit={{ opacity: 0, transition: { duration: 0 } }} 只是「压成 0 时长」，
 *   但 framer 仍会立即建一条 0 时长 WAAPI 动画：瞬时跑完 → 短暂持有 opacity:0 →
 *   取消/完成后效果消失 → 回跳 CSS 动画当前值。WAAPI 级联高于 CSS animation，
 *   这一压一跳在真机上就是关闭瞬间的黑闪；元素复用/重渲时反复创建即「一直闪」。
 *   也不能用 delay 甩出窗口：fill both 会在整个 delay 期把起始值 opacity:1 钉在
 *   WAAPI 层，压制 CSS 淡出，且未完成的 exit 会阻塞 safeToRemove 卸载（实测）。
 *   最终方案：x:0 哑动画——目标值=当前值，1ms 完成，无任何可见写入、无 WAAPI
 *   闪动，仅为 AnimatePresence 提供可完成的退出信号；卸载仍由 duration 定时器
 *   接管（duration*1000+150ms）。
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
    /* 余量 150ms：CSS 动画首帧晚于类应用（主线程繁忙/掉帧）时不截断视觉尾部 */
    const t = window.setTimeout(safeToRemove, Math.round(duration * 1000) + 150);
    return () => window.clearTimeout(t);
  }, [isPresent, safeToRemove, duration]);
  return (
    <motion.div
      {...motionProps}
      exit={{ x: 0, transition: { duration: 0.001 } }}
      className={`${className ?? ""}${isPresent ? "" : ` ${exitClass}`}`}
    >
      {children}
    </motion.div>
  );
}
