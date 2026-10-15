"use client";

/* 「初始」— 待办/便签常驻磁贴（v8.7.105）。
 *
 * 用户指令：把待办/便签的内容变成磁贴常驻在「初始」页面里，出现/消失
 * 动画要高雅，刷新页面时要有入场动画。
 *
 * 位置：视口左下（待办）/ 右下（便签），Dock 上方两侧的空白带——不占
 * 快捷服务磁贴墙、不碰搜索框/时钟。
 *
 * 动画（磨砂存活律三层拆分，与磁贴墙 intro 同语言）：
 *   · 外层 motion.div 只动 transform（y/scale）——升起/落座，绝不携带
 *     opacity/filter（祖先 opacity<1 / filter≠none 会成为 backdrop root，
 *     令 .glass-card 的磨砂整体失效，v8.6.1 用户实测律）；
 *   · 内容层单独动 opacity + blur（模糊聚拢/散场）——内容层内无任何
 *     backdrop-filter 后代，零毒；
 *   · 出现 = 磁贴上浮 16px + 缩放 0.92 + 内容 8px 模糊聚拢（0.5s 减速曲线）；
 *     消失 = 反向散场（0.32s）；刷新入场 = 同出现动画 + 0.55s 错拍延迟
 *     （等磁贴墙入场过半，整页动效一气呵成）。
 * 禅模式：外层挂 .zen-gone（visibility+transform 零毒通道，globals.css）。
 */

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckSquare, StickyNote } from "lucide-react";
import type { PanelId, TodoItem } from "@/lib/startpage/types";

const EASE = [0.22, 1, 0.36, 1] as const;

/** 外层升降弹簧/补间：transform-only（磨砂存活律） */
const RISE = { duration: 0.5, ease: EASE };
const SINK = { duration: 0.32, ease: [0.5, 0, 0.3, 1] as const };
/** 内容层模糊聚拢（opacity+filter，无磨砂后代零毒） */
const FOCUS = { duration: 0.55, ease: EASE };

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
      {todoTile && (
        <motion.div
          key="pintile-todo"
          className="zen-gone fixed bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+84px)] left-6 z-30 hidden w-56 sm:block"
          initial={{ y: 16, scale: 0.92 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: 12, scale: 0.94, transition: SINK }}
          transition={{ ...RISE, delay: 0.55 }}
        >
          <button
            type="button"
            aria-label="打开待办面板"
            onClick={() => onOpenPanel("todo")}
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
      )}

      {noteTile && (
        <motion.div
          key="pintile-note"
          className="zen-gone fixed bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+84px)] right-6 z-30 hidden w-56 sm:block"
          initial={{ y: 16, scale: 0.92 }}
          animate={{ y: 0, scale: 1 }}
          exit={{ y: 12, scale: 0.94, transition: SINK }}
          transition={{ ...RISE, delay: 0.62 }}
        >
          <button
            type="button"
            aria-label="打开便签面板"
            onClick={() => onOpenPanel("note")}
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
      )}
    </AnimatePresence>
  );
}

export default memo(PinnedTiles);
