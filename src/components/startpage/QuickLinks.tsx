"use client";

import { memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, X } from "lucide-react";
import type { IconStyle, StartLink } from "@/lib/startpage/types";
import { hostOf } from "@/lib/startpage/link-utils";

const EASE = [0.22, 1, 0.36, 1] as const;

/** 磁贴 layout 动画：弹簧驱动，增删/重排/退出编辑均平滑归位 */
const LAYOUT_SPRING = { type: "spring" as const, stiffness: 420, damping: 36 };

/** 长按位移容差（px）：真机手指静置也有 1-3px 抖动，此前任何 pointermove 都清计时器，
    420ms 永远走不满——长按在真机上失效而合成触摸验证通过的根因；超出容差才算滚动意图 */
const LONG_PRESS_SLOP_PX = 10;

export function emitEditLink(link: StartLink | null) {
  window.dispatchEvent(new CustomEvent("start:edit-link", { detail: link }));
}

/** 由域名生成稳定色相 */
function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function TileIcon({
  link,
  iconStyle,
  jiggle = false,
}: {
  link: StartLink;
  iconStyle: IconStyle;
  jiggle?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const host = hostOf(link.url);
  const showFavicon = iconStyle === "favicon" && !!host && !failed;
  const hue = hueOf(host || link.name);
  const ch =
    [...(host || link.name)].find((c) => /[a-z0-9]/i.test(c))?.toUpperCase() ??
    link.name.slice(0, 1);

  return (
    <span
      aria-hidden
      className={`relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-[18px] border shadow-sm ${
        jiggle ? "jiggle" : ""
      }`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 42% 62% / .22), hsl(${(hue + 40) % 360} 46% 50% / .14))`,
        borderColor: `hsl(${hue} 44% 60% / .28)`,
      }}
    >
      {showFavicon ? (
        <img
          src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
          alt=""
          width={28}
          height={28}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-7 w-7 rounded-md object-contain"
        />
      ) : (
        <span className="tile-letter text-lg font-light tracking-wide text-zinc-700 dark:text-zinc-100">
          {ch}
        </span>
      )}
    </span>
  );
}

interface TileProps {
  link: StartLink;
  iconStyle: IconStyle;
  index: number;
  dragging: boolean;
  editing: boolean;
  onEnterEdit: () => void;
  onDragStartTile: (e: React.DragEvent, index: number) => void;
  onDragOverTile: (e: React.DragEvent, index: number) => void;
  onDragEndTile: () => void;
  onDelete: (id: string) => void;
}

function Tile({
  link,
  iconStyle,
  index,
  dragging,
  editing,
  onEnterEdit,
  onDragStartTile,
  onDragOverTile,
  onDragEndTile,
  onDelete,
}: TileProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 按下位置：位移容差判定基准 */
  const downXY = useRef<{ x: number; y: number } | null>(null);
  /** 本次手势是否为「长按进入编辑」（其后的 pointerup 不应再触发编辑器） */
  const justEntered = useRef(false);
  /** 长按计时期间置位，用于拦截随后的 click */
  const longPressed = useRef(false);

  function clearTimer() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  /* 触屏长按：进入专项编辑模式（带触感反馈） */
  function armLongPress(e: React.PointerEvent) {
    if (e.pointerType !== "touch" || editing) return;
    justEntered.current = false;
    longPressed.current = false;
    downXY.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => {
      longPressed.current = true;
      justEntered.current = true;
      try {
        navigator.vibrate?.(15);
      } catch {
        /* noop */
      }
      onEnterEdit();
    }, 420);
  }

  /* 静置微动不取消长按，位移超容差（滚动/拖动意图）才取消 */
  function guardMove(e: React.PointerEvent) {
    if (!timer.current || !downXY.current) return;
    const dx = e.clientX - downXY.current.x;
    const dy = e.clientY - downXY.current.y;
    if (dx * dx + dy * dy > LONG_PRESS_SLOP_PX * LONG_PRESS_SLOP_PX) {
      downXY.current = null;
      clearTimer();
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: dragging ? 0.35 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.86, transition: { duration: 0.22 } }}
      transition={LAYOUT_SPRING}
      className="group relative select-none"
      draggable
      onDragStart={(e) => onDragStartTile(e as unknown as React.DragEvent, index)}
      onDragOver={(e) => onDragOverTile(e as unknown as React.DragEvent, index)}
      onDragEnd={onDragEndTile}
      onDrop={(e) => e.preventDefault()}
    >
      <a
        href={link.url}
        onClick={(e) => {
          if (justEntered.current) {
            // 长按进入编辑的那次松手：只退出点击，不打开编辑器
            justEntered.current = false;
            e.preventDefault();
            return;
          }
          if (timer.current || longPressed.current || editing) {
            e.preventDefault();
            longPressed.current = false;
            if (editing) emitEditLink(link); // 编辑态短按 = 编辑该快捷服务
            return;
          }
          // 非编辑态短按 = 正常打开链接
        }}
        onContextMenu={(e) => {
          // 触屏长按进入编辑时阻止系统菜单（桌面右键不受影响）
          if (timer.current || longPressed.current) e.preventDefault();
        }}
        onPointerDown={armLongPress}
        onPointerUp={clearTimer}
        onPointerMove={guardMove}
        onPointerCancel={clearTimer}
        aria-label={editing ? `编辑 ${link.name}` : link.name}
        className="flex w-20 touch-pan-y flex-col items-center gap-2 rounded-xl outline-none focus-visible:ring-2 accent-ring"
      >
        <motion.span
          whileHover={editing ? undefined : { y: -4, scale: 1.06 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="block cursor-grab active:cursor-grabbing"
        >
          <TileIcon link={link} iconStyle={iconStyle} jiggle={editing} />
        </motion.span>
        <span className="tile-label w-full truncate text-center text-xs font-light tracking-wide text-zinc-600 dark:text-zinc-300">
          {link.name}
        </span>
      </a>

      {editing ? (
        /* 编辑态：右上角删除键（短按磁贴即编辑，无需铅笔角标） */
        <button
          type="button"
          aria-label={`删除 ${link.name}`}
          tabIndex={-1}
          onClick={(e) => {
            e.preventDefault();
            onDelete(link.id);
          }}
          className="absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-500/90 text-white shadow-md transition-transform duration-200 hover:scale-110"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : (
        /* 桌面悬浮编辑按钮（触屏设备隐藏，长按磁贴进入编辑） */
        <button
          type="button"
          aria-label={`编辑 ${link.name}`}
          tabIndex={-1}
          onClick={(e) => {
            e.preventDefault();
            clearTimer();
            emitEditLink(link);
          }}
          className="hover-only pointer-events-none absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 scale-75 items-center justify-center rounded-full bg-zinc-900/80 text-zinc-200 opacity-0 shadow backdrop-blur transition-all duration-300 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 dark:bg-white/90 dark:text-zinc-900"
        >
          <Pencil className="h-3 w-3" strokeWidth={1.5} />
        </button>
      )}
    </motion.div>
  );
}

function QuickLinks({
  links,
  setLinks,
  iconStyle,
  columns,
}: {
  links: StartLink[];
  setLinks: (updater: (prev: StartLink[]) => StartLink[]) => void;
  iconStyle: IconStyle;
  /** 预设 layout.linksColumns：限制每行磁贴数（磁贴 5rem + 间距 1rem + 容器内边距 2rem
   *  → max-width = 6N+1 rem，border-box 下正好容纳 N 列；未设时保持默认宽度） */
  columns?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  /* 批量管理入口（v1.7.1）：右键菜单「批量管理磁贴」派发全局事件进入本模式——
     PC 端此前只能逐个悬浮编辑，无批量删除/连续编辑路径（触屏长按同款模式） */
  useEffect(() => {
    const onManage = () => setEditing(true);
    window.addEventListener("start:links-manage", onManage);
    return () => window.removeEventListener("start:links-manage", onManage);
  }, []);

  /* 编辑模式：点击磁贴区域外的任意空白处退出（与移动端系统直觉一致） */
  useEffect(() => {
    if (!editing) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || typeof t.closest !== "function") return;
      if (rootRef.current?.contains(t)) return;
      // 链接编辑对话框内点击不退出
      if (t.closest("[role='dialog']")) return;
      setEditing(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [editing]);

  function handleDragStart(e: React.DragEvent, index: number) {
    dragFrom.current = index;
    setDraggingId(links[index]?.id ?? null);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", links[index].id);
      } catch {
        /* noop */
      }
    }
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    const from = dragFrom.current;
    if (from == null || from === index) return;
    setLinks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
    dragFrom.current = index;
  }

  function handleDragEnd() {
    dragFrom.current = null;
    setDraggingId(null);
  }

  function handleDelete(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

  return (
    <div ref={rootRef} className="cl-links flex flex-col items-center">
      <div
        className="flex max-w-[680px] flex-wrap items-start justify-center gap-x-4 gap-y-6 px-4"
        style={columns ? { maxWidth: `${6 * columns + 1}rem` } : undefined}
      >
        <AnimatePresence mode="popLayout">
          {links.map((l, i) => (
            <Tile
              key={l.id}
              link={l}
              iconStyle={iconStyle}
              index={i}
              dragging={draggingId === l.id}
              editing={editing}
              onEnterEdit={() => setEditing(true)}
              onDragStartTile={(e, idx) => handleDragStart(e, idx)}
              onDragOverTile={handleDragOver}
              onDragEndTile={handleDragEnd}
              onDelete={handleDelete}
            />
          ))}
        </AnimatePresence>

        {/* 添加磁贴 */}
        <motion.div
          layout
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={LAYOUT_SPRING}
        >
          <button
            type="button"
            onClick={() => emitEditLink(null)}
            aria-label="添加快捷链接"
            className="group flex w-20 flex-col items-center gap-2 rounded-xl outline-none focus-visible:ring-2 accent-ring"
          >
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-[18px] border border-dashed text-xl font-extralight transition-all duration-300 ${
                editing
                  ? "jiggle border-zinc-400/70 text-zinc-500 dark:border-zinc-500 dark:text-zinc-400"
                  : "border-zinc-300 text-zinc-400 group-hover:-translate-y-1 group-hover:border-zinc-400/70 group-hover:text-zinc-600 dark:border-zinc-700 dark:text-zinc-600 dark:group-hover:border-zinc-500 dark:group-hover:text-zinc-300"
              }`}
            >
              +
            </span>
            <span
              className={`text-center text-xs font-light tracking-wide transition-colors duration-300 ${
                editing
                  ? "text-zinc-500 dark:text-zinc-400"
                  : "text-transparent group-hover:text-zinc-500 dark:group-hover:text-zinc-400"
              }`}
            >
              添加
            </span>
          </button>
        </motion.div>
      </div>
    </div>
  );
}

export default memo(QuickLinks);
