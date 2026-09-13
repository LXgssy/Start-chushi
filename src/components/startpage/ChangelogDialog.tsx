"use client";

/* 更新日志弹窗（设置面板底部「更新日志」按钮打开）。
 *
 * 风格完全对齐现有对话框（LinkDialog）：同一套遮罩轻雾化 .veil-in、
 * 同一张 .glass-card panel-rise 卡片、同一套内容模糊聚拢 .content-focus、
 * 同一款圆角胶囊与 zinc 刻度文字。只读展示 CHANGELOG 数据，无副作用。 */

import { memo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PresenceClass } from "./PresenceClass";
import { CHANGELOG } from "@/lib/startpage/changelog";

const SPRING = { type: "spring" as const, stiffness: 460, damping: 38 };

function ChangelogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  /* 打开时接管 ESC（捕获阶段拦下并阻止冒泡）：先关本弹窗，不要顺手把设置面板也关了 */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <PresenceClass
          key="changelog-overlay"
          exitClass="veil-out"
          duration={0.25}
          className="veil-in fixed inset-0 z-50 flex items-center justify-center bg-white/10 px-4 backdrop-blur-md backdrop-saturate-150 dark:bg-black/10"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="更新日志"
        >
          <motion.div
            initial={{ scale: 0.96, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            transition={SPRING}
            className="glass-card panel-rise w-full max-w-[460px] rounded-2xl p-5 shadow-2xl"
          >
            <div className="content-focus">
              <h2 className="mb-4 text-center text-xs font-normal tracking-[0.25em] text-zinc-500 dark:text-zinc-400">
                更新日志
              </h2>

              <div className="slim-scroll max-h-[380px] space-y-5 overflow-x-hidden overflow-y-auto pr-1">
                {CHANGELOG.map((e) => (
                  <section key={e.version + e.title}>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-zinc-900/10 px-2 py-0.5 text-[10px] tracking-wide tabular-nums text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                        v{e.version}
                      </span>
                      <span
                        className={
                          e.channel === "page"
                            ? "accent-bg accent-text rounded-full px-2 py-0.5 text-[10px] tracking-wide"
                            : "rounded-full bg-zinc-900/5 px-2 py-0.5 text-[10px] tracking-wide text-zinc-400 dark:bg-white/10 dark:text-zinc-500"
                        }
                      >
                        {e.channel === "page" ? "页面云端更新" : "扩展更新"}
                      </span>
                    </div>

                    <h3 className="mt-1.5 text-xs font-normal leading-relaxed text-zinc-700 dark:text-zinc-200">
                      {e.title}
                    </h3>

                    <ul className="mt-1 space-y-1">
                      {e.highlights.map((h, i) => (
                        <li
                          key={i}
                          className="flex gap-1.5 text-[11px] font-extralight leading-relaxed tracking-wide text-zinc-400 dark:text-zinc-500"
                        >
                          <span
                            aria-hidden
                            className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600"
                          />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          </motion.div>
        </PresenceClass>
      )}
    </AnimatePresence>
  );
}

export default memo(ChangelogDialog);
