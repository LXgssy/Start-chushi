"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, X } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import type { IconStyle, StartLink } from "@/lib/startpage/types";
import { hostOf } from "@/lib/startpage/link-utils";
import { clearIconSource, orderedIconSources, saveIconSource } from "@/lib/startpage/favicon";
import { useMorphHeight } from "./use-morph-height";

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

/* ---------- 站点图标（v8.4.0 免梯子多源回退）----------
 * 原实现只有一个源（icons.duckduckgo.com），国内直连不到就恒落字母。
 * 现按 orderedIconSources 逐个试：站点自身 /favicon.ico → 国内可直连 API → DuckDuckGo；
 * 任一成功即记住这个 host 用哪个源（下次直接用它），全失败才回字母。 */
function TileIcon({
  link,
  iconStyle,
  jiggle = false,
}: {
  link: StartLink;
  iconStyle: IconStyle;
  jiggle?: boolean;
}) {
  const host = hostOf(link.url);
  const sources = useMemo(() => (host ? orderedIconSources(host) : []), [host]);
  const [idx, setIdx] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  /* 链接换了（host 变）→ 回到第一个源重新试 */
  useEffect(() => {
    setIdx(0);
    setExhausted(false);
  }, [host]);

  const hue = hueOf(host || link.name);
  const ch =
    [...(host || link.name)].find((c) => /[a-z0-9]/i.test(c))?.toUpperCase() ??
    link.name.slice(0, 1);
  const src = sources[idx];
  const showFavicon = iconStyle === "favicon" && !!host && !exhausted && !!src;

  return (
    <span
      aria-hidden
      className={
        "relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-[18px] border shadow-sm " +
        (jiggle ? "jiggle" : "")
      }
      style={{
        background:
          "linear-gradient(135deg, hsl(" +
          hue +
          " 42% 62% / .22), hsl(" +
          ((hue + 40) % 360) +
          " 46% 50% / .14))",
        borderColor: "hsl(" + hue + " 44% 60% / .28)",
      }}
    >
      {showFavicon ? (
        <img
          key={src}
          src={src}
          alt=""
          width={28}
          height={28}
          loading="lazy"
          draggable={false}
          referrerPolicy="no-referrer"
          onLoad={() => {
            if (host) saveIconSource(host, src);
          }}
          onError={() => {
            if (host) clearIconSource(host);
            if (idx + 1 < sources.length) setIdx(idx + 1);
            else setExhausted(true);
          }}
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

/** 磁贴视觉（图标 + 名称）：正常磁贴与拖拽浮层共用，保证「拖起来的就是原来那个」 */
function TileVisual({
  link,
  iconStyle,
  jiggle = false,
  lifted = false,
}: {
  link: StartLink;
  iconStyle: IconStyle;
  jiggle?: boolean;
  lifted?: boolean;
}) {
  return (
    <>
      <motion.span
        whileHover={jiggle || lifted ? undefined : { y: -4, scale: 1.06 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="block cursor-grab active:cursor-grabbing"
      >
        <TileIcon link={link} iconStyle={iconStyle} jiggle={jiggle} />
      </motion.span>
      <span className="tile-label w-full truncate text-center text-xs font-light tracking-wide text-zinc-600 dark:text-zinc-300">
        {link.name}
      </span>
    </>
  );
}

/** 拖起后原位留下的空位：虚线 + 中心点 + 名称占位，尺寸与磁贴一致（不发生重排） */
function TilePlaceholder() {
  return (
    <div className="flex w-20 flex-col items-center gap-2" aria-hidden>
      <span className="relative flex h-14 w-14 items-center justify-center rounded-[18px] border border-dashed border-zinc-400/60 bg-zinc-900/[0.04] dark:border-zinc-500/50 dark:bg-white/[0.05]">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400/50 dark:bg-zinc-500/50" />
      </span>
      <span className="h-4 w-10 rounded-full bg-zinc-900/5 dark:bg-white/5" />
    </div>
  );
}

interface TileProps {
  link: StartLink;
  iconStyle: IconStyle;
  editing: boolean;
  onEnterEdit: () => void;
  onDelete: (id: string) => void;
}

function Tile({ link, iconStyle, editing, onEnterEdit, onDelete }: TileProps) {
  /* dnd-kit 只用来「跟踪指针 + 判定落点」：重排仍走数组 splice，
     位置动画仍由 framer 的 layout 承载（两层各管一段，transform 不打架）。
     故此处刻意不套用 sortable 的 transform/transition。 */
  const { setNodeRef, listeners, isDragging } = useSortable({ id: link.id });

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
      ref={setNodeRef}
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.86, transition: { duration: 0.22 } }}
      transition={LAYOUT_SPRING}
      className="group relative select-none"
      {...listeners}
    >
      {isDragging ? (
        <TilePlaceholder />
      ) : (
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
          aria-label={editing ? "编辑 " + link.name : link.name}
          className="flex w-20 touch-pan-y flex-col items-center gap-2 rounded-xl outline-none focus-visible:ring-2 accent-ring"
        >
          <TileVisual link={link} iconStyle={iconStyle} jiggle={editing} />
        </a>
      )}

      {editing ? (
        /* 编辑态：右上角删除键（短按磁贴即编辑，无需铅笔角标） */
        <button
          type="button"
          aria-label={"删除 " + link.name}
          tabIndex={-1}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
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
          aria-label={"编辑 " + link.name}
          tabIndex={-1}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
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
  const [editing, setEditing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  /* 网格高度形变盒（v1.7.4）：删/增磁贴跨排界时网格行数变化，容器高度此前瞬跳
     → justify-center 的整列内容（时钟/搜索）随之瞬移——「删除抖动」的第二根因。
     现由 ResizeObserver 测高 + 弹簧高度盒承接（与 Dock 面板同套 morph 律），
     换排时高度滑移，配合 main 的 padding 过渡整列连续无跳变 */
  const { contentH, measureRef } = useMorphHeight(500);
  /* DragOverlay 必须挂到 document.body —— 它内部是 position: fixed，
     而任意祖先只要带 contain: layout / transform / filter / will-change，
     就会成为 fixed 后代的「包含块」：dnd-kit 用视口坐标算出的位移会被
     叠加到那个祖先自身的坐标上，越拖越远，表现就是「一拖就飞出屏幕」。
     本组件的高度盒带 contain: layout（v1.7.4 为高度形变加的），就是元凶。
     浏览器端才 portal，SSR 阶段 document 不存在。 */
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    setPortalReady(true);
  }, []);

  /* 拖拽排序（v8.4.0）：6px 位移阈值起拖——阈值内仍是普通点击（打开链接/编辑），
     越过阈值才把磁贴「抬起」。触摸端保持原有「长按 420ms 进编辑」不变
     （HTML5 时代触摸本来就不能拖，这里不引入回归）。 */
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }));

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

  const activeLink = activeId ? links.find((l) => l.id === activeId) ?? null : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  /* 越过邻居即就地重排：数组换了顺序 → framer layout 把其余磁贴弹开让位 */
  function handleDragOver(e: DragOverEvent) {
    const from = String(e.active.id);
    const to = e.over ? String(e.over.id) : null;
    if (!to || from === to) return;
    setLinks((prev) => {
      const fi = prev.findIndex((l) => l.id === from);
      const ti = prev.findIndex((l) => l.id === to);
      if (fi < 0 || ti < 0 || fi === ti) return prev;
      const next = [...prev];
      const [moved] = next.splice(fi, 1);
      next.splice(ti, 0, moved);
      return next;
    });
  }

  function handleDragEnd(_e: DragEndEvent) {
    setActiveId(null);
  }

  function handleDelete(id: string) {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragEnd}
    >
    <div ref={rootRef} className="cl-links flex flex-col items-center">
      {/* 高度盒：px 弹簧跟随网格自然高度；relative 让 popLayout 退场磁贴的
          absolute 钉位落在本盒内；不裁剪溢出——退场磁贴/阴影/悬浮态不可被切 */}
      <motion.div
        className="relative w-full"
        style={{ contain: "layout" }}
        initial={false}
        animate={{ height: contentH == null ? "auto" : contentH }}
        transition={LAYOUT_SPRING}
      >
          <div
            ref={measureRef}
            className="mx-auto flex max-w-[680px] flex-wrap items-start justify-center gap-x-4 gap-y-6 px-4"
            style={columns ? { maxWidth: 6 * columns + 1 + "rem" } : undefined}
          >
            <SortableContext items={links.map((l) => l.id)} strategy={rectSortingStrategy}>
              <AnimatePresence mode="popLayout">
                {links.map((l) => (
                  <Tile
                    key={l.id}
                    link={l}
                    iconStyle={iconStyle}
                    editing={editing}
                    onEnterEdit={() => setEditing(true)}
                    onDelete={handleDelete}
                  />
                ))}
              </AnimatePresence>
            </SortableContext>

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
                  className={
                    "flex h-14 w-14 items-center justify-center rounded-[18px] border border-dashed text-xl font-extralight transition-all duration-300 " +
                    (editing
                      ? "jiggle border-zinc-400/70 text-zinc-500 dark:border-zinc-500 dark:text-zinc-400"
                      : "border-zinc-300 text-zinc-400 group-hover:-translate-y-1 group-hover:border-zinc-400/70 group-hover:text-zinc-600 dark:border-zinc-700 dark:text-zinc-600 dark:group-hover:border-zinc-500 dark:group-hover:text-zinc-300")
                  }
                >
                  +
                </span>
                <span
                  className={
                    "text-center text-xs font-light tracking-wide transition-colors duration-300 " +
                    (editing
                      ? "text-zinc-500 dark:text-zinc-400"
                      : "text-transparent group-hover:text-zinc-500 dark:group-hover:text-zinc-400")
                  }
                >
                  添加
                </span>
              </button>
            </motion.div>
          </div>

        </motion.div>
      </div>

      {/* 拖拽浮层：portal 到 body（原因见 portalReady 处注释——contain/transform 祖先会把它顶飞）。
          抬起的磁贴带强调色晕 + 轻微倾斜，落回由 dropAnimation 弹回原位。 */}
      {portalReady
        ? createPortal(
            <DragOverlay dropAnimation={{ duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
              {activeLink ? (
                <motion.div
                  initial={{ scale: 0.9, rotate: 0 }}
                  animate={{ scale: 1.1, rotate: -3 }}
                  transition={{ type: "spring", stiffness: 520, damping: 30 }}
                  className="flex w-20 flex-col items-center gap-2 rounded-xl"
                >
                  <span className="relative block" style={{ filter: "drop-shadow(0 16px 24px rgba(0,0,0,0.34))" }}>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -inset-2 rounded-[24px] opacity-[0.32] blur-md"
                      style={{ background: "radial-gradient(closest-side, var(--ui-accent), transparent 72%)" }}
                    />
                    <span className="relative block">
                      <TileIcon link={activeLink} iconStyle={iconStyle} />
                    </span>
                  </span>
                  <span className="tile-label w-full truncate text-center text-xs font-light tracking-wide text-zinc-600 dark:text-zinc-300">
                    {activeLink.name}
                  </span>
                </motion.div>
              ) : null}
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  );
}

export default memo(QuickLinks);
