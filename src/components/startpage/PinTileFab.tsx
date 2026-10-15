"use client";

/* 「初始」— 待办/便签「常驻磁贴」全局浮窗开关（v8.7.105 引入，v8.7.106 固定化）。
 *
 * v8.7.106 用户澄清：可拖拽的是常驻磁贴本体（PinnedTiles），不是这个开关——
 * 开关回归网易云播放器全局浮窗的「预设」形态：固定锚定在面板关闭按钮左侧，
 * 不拖拽、不钉位、不回弹（拖拽/禁区回弹/钉位持久化整套逻辑移交常驻磁贴）。
 *
 * 形态：磨砂玻璃胶囊（图标 + 「待办/便签常驻」+ 状态点），fixed 全局浮窗：
 *   · 锚定：待办/便签面板玻璃卡（.cl-stage）右上角、关闭按钮左侧（视口
 *     坐标推导，note 实例向下错开一枚浮窗高度）；面板不在场（常驻球独立
 *     显示）→ 视口右下默认锚位，面板关闭后浮窗留在原位（家位）；
 *   · 窗口缩放：面板在场重锚，不在场把家位 clamp 回视口；
 *   · 点击 = 切换常驻磁贴显隐；
 *   · 显示 = 面板打开（随时可开）或常驻已开启（全局浮窗常驻控制球）。
 *
 * 磨砂存活：胶囊自身可带 opacity 动画（root 化只影响后代，胶囊后代
 * 无磨砂）；位移全程 transform，不碰采样链。
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckSquare, StickyNote } from "lucide-react";

const FAB_H = 36;

type FabPanel = "todo" | "note";

function PinTileFab({
  panel,
  active,
  enabled,
  onToggle,
}: {
  panel: FabPanel;
  active: boolean;
  enabled: boolean;
  onToggle: () => void;
}) {
  const fabRef = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  /* 家位：面板玻璃卡右上角、关闭按钮左侧（note 向下错开一枚浮窗高度）；
     面板不在场 → 视口右下默认锚位 */
  const anchor = useCallback(() => {
    const w = fabRef.current?.offsetWidth ?? 96;
    const stage = document.querySelector(".cl-stage") as HTMLElement | null;
    if (stage) {
      const r = stage.getBoundingClientRect();
      return {
        x: r.right - 14 - 28 - 8 - w,
        y: r.top + 10 + (panel === "note" ? FAB_H + 8 : 0),
      };
    }
    return { x: window.innerWidth - w - 24, y: window.innerHeight - 170 };
  }, [panel]);

  /* 首锚：面板宽度弹簧落定后测量（460ms）；常驻球独立显示时落在右下默认位 */
  useEffect(() => {
    const t = setTimeout(() => {
      setPos(anchor());
      setReady(true);
    }, 460);
    return () => clearTimeout(t);
  }, [anchor]);

  /* 面板（重新）打开：跟随重锚（面板几何可能变化）；面板关闭不重锚——
     浮窗留在关闭按钮左侧的家位（v8.7.106 固定化律） */
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setPos(anchor()), 460);
    return () => clearTimeout(t);
  }, [active, anchor]);

  /* 窗口缩放：面板在场重锚；不在场把家位 clamp 回视口 */
  useEffect(() => {
    const onResize = () => {
      if (document.querySelector(".cl-stage")) {
        setPos(anchor());
        return;
      }
      setPos((p) => {
        if (!p) return p;
        const w = fabRef.current?.offsetWidth ?? 96;
        return {
          x: Math.min(Math.max(8, p.x), Math.max(8, window.innerWidth - w - 8)),
          y: Math.min(Math.max(8, p.y), Math.max(8, window.innerHeight - FAB_H - 8)),
        };
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [anchor]);

  const Icon = panel === "todo" ? CheckSquare : StickyNote;
  const show = active || enabled;

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          ref={fabRef}
          type="button"
          aria-label={(panel === "todo" ? "待办" : "便签") + "常驻磁贴开关"}
          aria-pressed={enabled}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: ready ? 1 : 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="glass-card cl-fab fixed left-0 top-0 z-[49] flex h-9 cursor-pointer touch-none select-none items-center gap-1.5 rounded-full py-0 pl-3 pr-2.5 shadow-lg outline-none"
          style={pos ? { x: pos.x, y: pos.y } : undefined}
          onClick={onToggle}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.96 }}
        >
          <Icon
            className="h-3.5 w-3.5 shrink-0"
            strokeWidth={1.5}
            style={enabled ? { color: "var(--ui-accent, #8b5cf6)" } : undefined}
          />
          <span className="whitespace-nowrap text-[11px] font-light tracking-wide text-zinc-600 dark:text-zinc-300">
            {(panel === "todo" ? "待办" : "便签") + "常驻"}
          </span>
          <span
            aria-hidden
            className={
              "h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-300 " +
              (enabled ? "" : "bg-zinc-300 dark:bg-zinc-600")
            }
            style={enabled ? { background: "var(--ui-accent, #8b5cf6)" } : undefined}
          />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export default memo(PinTileFab);
