"use client";

/* 「初始」— 待办/便签常驻磁贴（v8.7.105 引入，v8.7.106 拖拽化）。
 *
 * 用户指令：把待办/便签的内容变成磁贴常驻在「初始」页面里，出现/消失
 * 动画要高雅，刷新页面时要有入场动画。
 * v8.7.106 用户澄清：支持自由拖拽的是【常驻磁贴本体】（浮窗开关固定在
 * 面板关闭按钮左侧，见 PinTileFab）——磁贴位置自由拖拽，但不能拖进
 * 快捷服务磁贴区域（常驻模式开启时）、搜索框、时间等区域；拖进禁区
 * 就回弹到拖拽前位置（动画与快捷服务磁贴的拖拽动画一致）。
 *
 * 默认位置：视口左下（待办）/ 右下（便签），Dock 上方两侧的空白带——
 * 不占快捷服务磁贴墙、不碰搜索框/时钟；合法拖拽落点钉位持久化
 * （localStorage start:pintile-todo / start:pintile-note），刷新后仍在。
 *
 * 动画（磨砂存活律三层拆分，与磁贴墙 intro 同语言）：
 *   · 外层 motion.div 只动 transform（y/scale）——升起/落座，绝不携带
 *     opacity/filter（祖先 opacity<1 / filter≠none 会成为 backdrop root，
 *     令 .glass-card 的磨砂整体失效，v8.6.1 用户实测律）；
 *   · 拖拽层（v8.7.106）同样是 transform-only 包裹（x/y motion value
 *     直写）——拖拽全程磨砂在线；
 *   · 内容层单独动 opacity + blur（模糊聚拢/散场）——内容层内无任何
 *     backdrop-filter 后代，零毒；
 *   · 出现 = 磁贴上浮 16px + 缩放 0.92 + 内容 8px 模糊聚拢（0.5s 减速曲线）；
 *     消失 = 反向散场（0.32s）；刷新入场 = 同出现动画 + 0.55s 错拍延迟
 *     （等磁贴墙入场过半，整页动效一气呵成）。
 * 禅模式：外层挂 .zen-gone（visibility+transform 零毒通道，globals.css）。
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue } from "framer-motion";
import { CheckSquare, StickyNote } from "lucide-react";
import type { PanelId, TodoItem } from "@/lib/startpage/types";

const EASE = [0.22, 1, 0.36, 1] as const;

/** 外层升降弹簧/补间：transform-only（磨砂存活律） */
const RISE = { duration: 0.5, ease: EASE };
const SINK = { duration: 0.32, ease: [0.5, 0, 0.3, 1] as const };
/** 内容层模糊聚拢（opacity+filter，无磨砂后代零毒） */
const FOCUS = { duration: 0.55, ease: EASE };

/** 快捷服务磁贴拖拽让位同款弹簧（用户指令：回弹动画一致） */
const LAYOUT_SPRING = { type: "spring" as const, stiffness: 420, damping: 41, mass: 0.9 };
/** 拖拽判定容差（px）：4px 内仍是点击（浮窗开关同律） */
const DRAG_SLOP = 4;

const POS_KEY = { todo: "start:pintile-todo", note: "start:pintile-note" } as const;
type PinKey = keyof typeof POS_KEY;

function readSavedPos(k: PinKey): { x: number; y: number } | null {
  try {
    const raw = window.localStorage.getItem(POS_KEY[k]);
    if (!raw) return null;
    const j = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof j?.x === "number" && typeof j?.y === "number") return { x: j.x, y: j.y };
  } catch {
    /* noop */
  }
  return null;
}

function savePos(k: PinKey, p: { x: number; y: number }) {
  try {
    window.localStorage.setItem(POS_KEY[k], JSON.stringify(p));
  } catch {
    /* 隐私模式：钉位不持久，会话内仍有效 */
  }
}

/* 禁区矩形（浮窗开关同表，v8.7.106 随拖拽一并移交磁贴，4px 容差）：
   时钟（[aria-label="时间与问候"]）、搜索框（.search-pill）、Dock
   （.cl-dock）、快捷服务磁贴墙（[aria-label="快捷链接"]——该标记只在
   常驻形态渲染，抽屉形态磁贴不占页面，磁贴不受限，与用户指令一致）。 */
function forbiddenRects(): DOMRect[] {
  const sels = [
    '[aria-label="时间与问候"]',
    ".search-pill",
    ".cl-dock",
    '[aria-label="快捷链接"]',
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

/**
 * 常驻磁贴自由拖拽（v8.7.106）：
 *   · 拖拽层 transform-only（x/y motion value 直写，磨砂存活律零毒）；
 *   · pointer capture 全程 1:1 跟手 + 4px 容差区分点击（点击仍开面板）；
 *   · 松手落点与禁区相交 → LAYOUT_SPRING 弹簧回弹拖拽前位（快捷服务
 *     磁贴拖拽同款手感）；合法落点 → 以当前视觉位重钉并持久化；
 *   · 拖后 300ms 吞 click；拖拽中 body.cl-fab-dragging 全局防选中
 *     （类名沿用浮窗时代的全局防选中通道，globals.css 同一条规则）。
 * 返回：x/y 位移、钉位（null=默认锚位）、宿主 ref、pointer 处理器。
 */
function usePinDrag(key: PinKey) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [saved, setSaved] = useState<{ x: number; y: number } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  /* 拖拽前视觉左上角（基准位）：回弹目标 = 基准位 = 位移 (0,0) */
  const base = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef({ on: false, moved: false, px: 0, py: 0, upAt: 0 });

  useEffect(() => {
    const p = readSavedPos(key);
    if (p) setSaved(p);
  }, [key]);

  const setBodyDragging = (on: boolean) => {
    try {
      document.body.classList.toggle("cl-fab-dragging", on);
    } catch {
      /* noop */
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = hostRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    base.current = { x: r.left, y: r.top };
    const d = drag.current;
    d.on = true;
    d.moved = false;
    d.px = e.clientX;
    d.py = e.clientY;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.on || !base.current) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) <= DRAG_SLOP) return;
    if (!d.moved) setBodyDragging(true);
    d.moved = true;
    const el = hostRef.current;
    const w = el?.offsetWidth ?? 224;
    const h = el?.offsetHeight ?? 120;
    const nx = Math.min(Math.max(8, base.current.x + dx), Math.max(8, window.innerWidth - w - 8));
    const ny = Math.min(Math.max(8, base.current.y + dy), Math.max(8, window.innerHeight - h - 8));
    x.set(nx - base.current.x);
    y.set(ny - base.current.y);
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (!d.on) return;
    d.on = false;
    if (!d.moved) return;
    d.moved = false;
    d.upAt = Date.now();
    setBodyDragging(false);
    const el = hostRef.current;
    if (!el || !base.current) return;
    const fr = el.getBoundingClientRect();
    const hit = forbiddenRects().some(
      (z) =>
        fr.left < z.right - 4 && fr.right > z.left + 4 && fr.top < z.bottom - 4 && fr.bottom > z.top + 4,
    );
    if (hit) {
      /* 禁区回弹：弹簧回到拖拽前位置（快捷服务磁贴拖拽同款手感） */
      animate(x, 0, LAYOUT_SPRING);
      animate(y, 0, LAYOUT_SPRING);
    } else {
      /* 合法落点：以当前视觉位重钉（left/top 改写 + 位移归零，同帧无缝），
         持久化 start:pintile-todo/note */
      const p = { x: Math.round(fr.left), y: Math.round(fr.top) };
      x.set(0);
      y.set(0);
      setSaved(p);
      savePos(key, p);
    }
  };

  /* 窗口缩放：钉位 clamp 回视口（拖拽中不干预） */
  useEffect(() => {
    const onResize = () => {
      if (drag.current.on) return;
      x.set(0);
      y.set(0);
      setSaved((p) => {
        if (!p) return p;
        const el = hostRef.current;
        const w = el?.offsetWidth ?? 224;
        const h = el?.offsetHeight ?? 120;
        const np = {
          x: Math.min(Math.max(8, p.x), Math.max(8, window.innerWidth - w - 8)),
          y: Math.min(Math.max(8, p.y), Math.max(8, window.innerHeight - h - 8)),
        };
        if (np.x !== p.x || np.y !== p.y) savePos(key, np);
        return np;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [key, x, y]);

  const afterDragClick = useCallback(() => Date.now() - drag.current.upAt < 300, []);

  return { x, y, saved, hostRef, onPointerDown, onPointerMove, onPointerUp, afterDragClick };
}

function PinnedTiles({
  todos,
  note,
  todoTile,
  noteTile,
  onOpenPanel,
}: {
  todos: TodoItem[];
  note: string;
  todoTile: boolean;
  noteTile: boolean;
  onOpenPanel: (p: PanelId) => void;
}) {
  const pending = todos.filter((t) => !t.done);
  const preview = pending.slice(0, 4);

  return (
    <AnimatePresence>
      {todoTile && <TodoTile key="pintile-todo" todos={todos} pending={pending} preview={preview} onOpenPanel={onOpenPanel} />}
      {noteTile && <NoteTile key="pintile-note" note={note} onOpenPanel={onOpenPanel} />}
    </AnimatePresence>
  );
}

/** 待办常驻磁贴（左下默认锚位；v8.7.106 自由拖拽+禁区回弹+钉位持久化） */
function TodoTile({
  pending,
  preview,
  onOpenPanel,
}: {
  todos: TodoItem[];
  pending: TodoItem[];
  preview: TodoItem[];
  onOpenPanel: (p: PanelId) => void;
}) {
  const pin = usePinDrag("todo");
  return (
    <motion.div
      className={
        "zen-gone fixed z-30 hidden w-56 sm:block " +
        (pin.saved
          ? ""
          : "bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+84px)] left-6")
      }
      style={pin.saved ? { left: pin.saved.x, top: pin.saved.y } : undefined}
      initial={{ y: 16, scale: 0.92 }}
      animate={{ y: 0, scale: 1 }}
      exit={{ y: 12, scale: 0.94, transition: SINK }}
      transition={{ ...RISE, delay: 0.55 }}
    >
      {/* 拖拽层：transform-only（x/y 位移直写），磨砂存活律零毒 */}
      <motion.div
        ref={pin.hostRef}
        className="cursor-grab touch-none active:cursor-grabbing"
        style={{ x: pin.x, y: pin.y }}
        onPointerDown={pin.onPointerDown}
        onPointerMove={pin.onPointerMove}
        onPointerUp={pin.onPointerUp}
        onPointerCancel={pin.onPointerUp}
      >
        <button
          type="button"
          aria-label="打开待办面板"
          onClick={() => {
            if (pin.afterDragClick()) return;
            onOpenPanel("todo");
          }}
          className="glass-card block w-full cursor-pointer rounded-2xl p-3.5 text-left shadow-xl outline-none transition-shadow duration-300 hover:shadow-2xl focus-visible:ring-2 accent-ring"
        >
          <motion.span
            className="block"
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(8px)", transition: { duration: 0.22 } }}
            transition={{ ...FOCUS, delay: 0.62 }}
          >
            <span className="mb-2 flex items-center gap-1.5">
              <CheckSquare className="h-3.5 w-3.5" strokeWidth={1.5} style={{ color: "var(--ui-accent, #8b5cf6)" }} />
              <span className="text-[11px] font-normal tracking-[0.18em] text-zinc-500 dark:text-zinc-400">待办</span>
              <span className="ml-auto rounded-full bg-zinc-900/5 px-1.5 text-[10px] tabular-nums font-light text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
                {pending.length}
              </span>
            </span>
            {preview.length === 0 ? (
              <span className="block py-1 text-xs font-extralight tracking-wide text-zinc-400 dark:text-zinc-500">
                今日无事，从容一些
              </span>
            ) : (
              <span className="block space-y-1.5">
                {preview.map((t) => (
                  <span key={t.id} className="flex items-center gap-2 text-xs font-light text-zinc-600 dark:text-zinc-300">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: "var(--ui-accent, #8b5cf6)", opacity: 0.55 }}
                    />
                    <span className="truncate">{t.text}</span>
                  </span>
                ))}
                {pending.length > preview.length && (
                  <span className="block pl-3.5 text-[10px] font-extralight text-zinc-400 dark:text-zinc-500">
                    还有 {pending.length - preview.length} 项…
                  </span>
                )}
              </span>
            )}
          </motion.span>
        </button>
      </motion.div>
    </motion.div>
  );
}

/** 便签常驻磁贴（右下默认锚位；v8.7.106 自由拖拽+禁区回弹+钉位持久化） */
function NoteTile({ note, onOpenPanel }: { note: string; onOpenPanel: (p: PanelId) => void }) {
  const pin = usePinDrag("note");
  return (
    <motion.div
      className={
        "zen-gone fixed z-30 hidden w-56 sm:block " +
        (pin.saved
          ? ""
          : "bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+84px)] right-6")
      }
      style={pin.saved ? { left: pin.saved.x, top: pin.saved.y } : undefined}
      initial={{ y: 16, scale: 0.92 }}
      animate={{ y: 0, scale: 1 }}
      exit={{ y: 12, scale: 0.94, transition: SINK }}
      transition={{ ...RISE, delay: 0.62 }}
    >
      <motion.div
        ref={pin.hostRef}
        className="cursor-grab touch-none active:cursor-grabbing"
        style={{ x: pin.x, y: pin.y }}
        onPointerDown={pin.onPointerDown}
        onPointerMove={pin.onPointerMove}
        onPointerUp={pin.onPointerUp}
        onPointerCancel={pin.onPointerUp}
      >
        <button
          type="button"
          aria-label="打开便签面板"
          onClick={() => {
            if (pin.afterDragClick()) return;
            onOpenPanel("note");
          }}
          className="glass-card block w-full cursor-pointer rounded-2xl p-3.5 text-left shadow-xl outline-none transition-shadow duration-300 hover:shadow-2xl focus-visible:ring-2 accent-ring"
        >
          <motion.span
            className="block"
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(8px)", transition: { duration: 0.22 } }}
            transition={{ ...FOCUS, delay: 0.69 }}
          >
            <span className="mb-2 flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5" strokeWidth={1.5} style={{ color: "var(--ui-accent, #8b5cf6)" }} />
              <span className="text-[11px] font-normal tracking-[0.18em] text-zinc-500 dark:text-zinc-400">便签</span>
            </span>
            <span className="pintile-label block max-h-[6.25rem] overflow-hidden whitespace-pre-wrap break-all text-xs font-extralight leading-relaxed text-zinc-600 dark:text-zinc-300 [-webkit-box-orient:vertical] [-webkit-line-clamp:5] [display:-webkit-box]">
              {note.trim() || "随手记点什么…"}
            </span>
          </motion.span>
        </button>
      </motion.div>
    </motion.div>
  );
}

export default memo(PinnedTiles);
