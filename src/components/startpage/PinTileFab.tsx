"use client";

/* 「初始」— 待办/便签「常驻磁贴」全局浮窗开关（v8.7.105）。
 *
 * 用户指令：开关用网易云播放器全局浮窗的样式，默认放在面板关闭弹窗按钮
 * 的左边，位置支持自由拖拽；拖进快捷服务磁贴区域（常驻模式时）、搜索框、
 * 时间等区域就回弹到拖拽前的位置（动画与快捷服务磁贴的拖拽动画一致）。
 *
 * 形态：磨砂玻璃胶囊（图标 + 「待办/便签常驻」+ 状态点），fixed 全局浮窗：
 *   · 默认锚定：待办/便签面板玻璃卡右上角、关闭按钮左侧（视口坐标推导）；
 *   · 拖拽：pointer capture 全程 1:1 跟手（useMotionValue 直写），位移
 *     容差 4px 区分点击/拖拽（sniffer-float 同律）；
 *   · 松手：落点与禁区矩形相交 → 弹簧回弹到拖拽前位置（LAYOUT_SPRING
 *     420/41/0.9，与磁贴拖拽让位同参）；合法落点 → 钉位并持久化
 *     （localStorage start:fab-todo / start:fab-note），刷新后仍在；
 *   · 点击（非拖拽）= 切换常驻磁贴显隐；
 *   · 显示 = 面板打开（随时可开）或常驻已开启（全局浮窗常驻控制球）。
 *
 * 禁区（getBoundingClientRect 相交判定，4px 容差）：
 *   时钟（[aria-label="时间与问候"]）、搜索框（.search-pill）、Dock
 *   （.cl-dock）、快捷服务磁贴墙（[aria-label="快捷链接"]——该标记只在
 *   常驻形态渲染，抽屉形态磁贴不占页面，浮窗不受限，与用户指令一致）。
 *
 * 磨砂存活：胶囊自身可带 opacity 动画（root 化只影响后代，胶囊后代
 * 无磨砂）；位移全程 transform（x/y motion value），不碰采样链。
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue } from "framer-motion";
import { CheckSquare, StickyNote } from "lucide-react";

/** 快捷服务磁贴拖拽让位同款弹簧（用户指令：回弹动画一致） */
const LAYOUT_SPRING = { type: "spring" as const, stiffness: 420, damping: 41, mass: 0.9 };
const FAB_H = 36;
/** 拖拽判定容差（px）：4px 内仍是点击（sniffer-float 同律） */
const DRAG_SLOP = 4;

const LS_KEY = { todo: "start:fab-todo", note: "start:fab-note" } as const;

type FabPanel = keyof typeof LS_KEY;

function readSavedPos(k: FabPanel): { x: number; y: number } | null {
  try {
    const raw = window.localStorage.getItem(LS_KEY[k]);
    if (!raw) return null;
    const j = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof j?.x === "number" && typeof j?.y === "number") return { x: j.x, y: j.y };
  } catch {
    /* noop */
  }
  return null;
}

function forbiddenRects(): DOMRect[] {
  const sels = [
    '[aria-label="时间与问候"]',
    ".search-pill",
    ".cl-dock",
    '[aria-label="快捷链接"]', /* 仅常驻形态渲染（page.tsx docked section） */
  ];
  const out: DOMRect[] = [];
  for (const s of sels) {
    try {
      const el = document.querySelector(s);
      if (el) out.push(el.getBoundingClientRect());
    } catch {
      /* noop */
    }
  }
  return out;
}

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
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [ready, setReady] = useState(false);
  const posRef = useRef({ x: 0, y: 0 });
  const drag = useRef({ on: false, moved: false, px: 0, py: 0, ox: 0, oy: 0, upAt: 0 });

  const place = useCallback(
    (p: { x: number; y: number }) => {
      posRef.current = p;
      x.set(p.x);
      y.set(p.y);
      setReady(true);
    },
    [x, y],
  );

  /* 定位：有钉位记忆 → 记忆位（clamp 进视口）；无记忆 → 跟随面板玻璃卡
     （关闭按钮左侧，note 实例向下错开一枚浮窗高度）；面板不在场（常驻
     球独立显示）→ 视口右下默认锚位。面板宽度弹簧落定后测量（460ms）。 */
  useEffect(() => {
    const saved = readSavedPos(panel);
    if (saved) {
      const w = fabRef.current?.offsetWidth ?? 96;
      place({
        x: Math.min(Math.max(8, saved.x), Math.max(8, window.innerWidth - w - 8)),
        y: Math.min(Math.max(8, saved.y), Math.max(8, window.innerHeight - FAB_H - 8)),
      });
      return;
    }
    const t = setTimeout(() => {
      const w = fabRef.current?.offsetWidth ?? 96;
      const stage = document.querySelector(".cl-stage") as HTMLElement | null;
      if (stage) {
        const r = stage.getBoundingClientRect();
        place({
          x: r.right - 14 - 28 - 8 - w,
          y: r.top + 10 + (panel === "note" ? FAB_H + 8 : 0),
        });
      } else {
        place({ x: window.innerWidth - w - 24, y: window.innerHeight - 170 });
      }
    }, 460);
    return () => clearTimeout(t);
  }, [panel, place, active]);

  /* 窗口缩放：钉位跟随 clamp，未钉位且面板在场 → 重推锚位 */
  useEffect(() => {
    const onResize = () => {
      if (readSavedPos(panel)) {
        const w = fabRef.current?.offsetWidth ?? 96;
        const p = posRef.current;
        place({
          x: Math.min(Math.max(8, p.x), Math.max(8, window.innerWidth - w - 8)),
          y: Math.min(Math.max(8, p.y), Math.max(8, window.innerHeight - FAB_H - 8)),
        });
        return;
      }
      if (!active) return;
      const w = fabRef.current?.offsetWidth ?? 96;
      const stage = document.querySelector(".cl-stage") as HTMLElement | null;
      if (stage) {
        const r = stage.getBoundingClientRect();
        place({
          x: r.right - 14 - 28 - 8 - w,
          y: r.top + 10 + (panel === "note" ? FAB_H + 8 : 0),
        });
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [panel, active, place]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const d = drag.current;
    d.on = true;
    d.moved = false;
    d.px = e.clientX;
    d.py = e.clientY;
    d.ox = posRef.current.x;
    d.oy = posRef.current.y;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const setBodyDragging = (on: boolean) => {
    try {
      document.body.classList.toggle("cl-fab-dragging", on);
    } catch {
      /* noop */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.on) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) <= DRAG_SLOP) return;
    if (!d.moved) setBodyDragging(true);
    d.moved = true;
    const w = fabRef.current?.offsetWidth ?? 96;
    const nx = Math.min(Math.max(8, d.ox + dx), Math.max(8, window.innerWidth - w - 8));
    const ny = Math.min(Math.max(8, d.oy + dy), Math.max(8, window.innerHeight - FAB_H - 8));
    posRef.current = { x: nx, y: ny };
    x.set(nx);
    y.set(ny);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.on) return;
    d.on = false;
    if (!d.moved) return;
    d.moved = false;
    d.upAt = Date.now();
    setBodyDragging(false);
    const el = fabRef.current;
    if (!el) return;
    const fr = el.getBoundingClientRect();
    const hit = forbiddenRects().some(
      (z) =>
        fr.left < z.right - 4 && fr.right > z.left + 4 && fr.top < z.bottom - 4 && fr.bottom > z.top + 4,
    );
    if (hit) {
      /* 禁区回弹：弹簧回到拖拽前位置（磁贴拖拽同款手感） */
      animate(x, d.ox, LAYOUT_SPRING);
      animate(y, d.oy, LAYOUT_SPRING);
      posRef.current = { x: d.ox, y: d.oy };
    } else {
      try {
        window.localStorage.setItem(LS_KEY[panel], JSON.stringify(posRef.current));
      } catch {
        /* 隐私模式：钉位不持久，会话内仍有效 */
      }
    }
  };

  const onClick = (e: React.MouseEvent) => {
    /* 拖后 300ms 内吞 click（位移判定已放行拖拽，点击不重复触发） */
    if (Date.now() - drag.current.upAt < 300) {
      e.preventDefault();
      return;
    }
    onToggle();
  };

  const Icon = panel === "todo" ? CheckSquare : StickyNote;
  const show = active || enabled;

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          ref={fabRef}
          type="button"
          aria-label={(panel === "todo" ? "待办" : "便签") + "常驻磁贴开关（可拖拽）"}
          aria-pressed={enabled}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: ready ? 1 : 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="glass-card cl-fab fixed left-0 top-0 z-[49] flex h-9 cursor-grab touch-none select-none items-center gap-1.5 rounded-full py-0 pl-3 pr-2.5 shadow-lg outline-none active:cursor-grabbing"
          style={{ x, y }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={onClick}
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
