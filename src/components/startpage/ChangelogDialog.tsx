"use client";

/* 更新日志弹窗 · v8.4.6 时间线重设计（设置面板底部「更新日志」按钮打开）。
 *
 * 版式升级：左侧版本时间线轨道（最新版本强调色节点 + 呼吸光晕，其余为灰阶
 * 空心节点，轨道线由强调色向灰阶渐隐），右侧版本号大字 + 日期右齐 + 通道
 * 徽标 + 标题 + 要点列表；首条带「最新」徽标。入场按条目级联（stagger 35ms，
 * 弹簧上浮）。滚动区上下渐隐遮罩，顶部一条强调色渐变分隔线。
 * 骨架仍是同一套对话框语言：.veil-in 遮罩、.glass-card panel-rise 卡片、
 * .content-focus 聚拢、slim-scroll 细滚动条、zinc 刻度文字。只读展示，无副作用。 */

import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { PresenceClass } from "./PresenceClass";
import { CHANGELOG } from "@/lib/startpage/changelog";

const SPRING = { type: "spring" as const, stiffness: 460, damping: 38 };

/** 条目级联入场：容器统一调度，子项 35ms 错拍上浮 */
const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.8 },
  },
};

function ChangelogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  /* v8.4.9：portal 到 body —— 本弹窗原挂在 SettingsPanel（z-30 层叠上下文）内，
   * veil 自身的 z-50 只在该上下文内生效，整层被 dock（z-40）压住：弹窗底部
   * 「返回设置」按钮落进 dock 条区域，真鼠标点击被 dock 拦截（dbg-backbtn 取证：
   * elementFromPoint 命中 BUTTON.dock-btn）。沿 PresetDocs 同款解法 + Task 54 律
   * 「全屏浮层一律 portal 到 body」。SSR 惰性初始化，open=false 水合零差异。 */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  if (!mounted) return null;
  return createPortal(
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
            className="glass-card panel-rise w-full max-w-[500px] rounded-2xl p-6 shadow-2xl"
          >
            <div className="content-focus">
              {/* 页眉：英文 overline + 中文主标 + 强调色渐变分隔线 */}
              <header className="mb-4 text-center">
                <p className="text-[9px] font-normal uppercase tracking-[0.34em] text-zinc-400 dark:text-zinc-500">
                  Changelog
                </p>
                <h2 className="mt-1.5 text-sm font-light tracking-[0.24em] text-zinc-700 dark:text-zinc-200">
                  更新日志
                </h2>
                <div
                  aria-hidden
                  className="mx-auto mt-3.5 h-px w-28"
                  style={{
                    background:
                      "linear-gradient(to right, transparent, color-mix(in srgb, var(--ui-accent) 60%, transparent), transparent)",
                  }}
                />
              </header>

              {/* 时间线滚动区：上下 14px 渐隐遮罩，长列表滚动出入都柔和 */}
              <div
                className="slim-scroll max-h-[min(58vh,430px)] overflow-x-hidden overflow-y-auto pr-1.5"
                style={{
                  maskImage:
                    "linear-gradient(to bottom, transparent 0, black 14px, black calc(100% - 14px), transparent)",
                  WebkitMaskImage:
                    "linear-gradient(to bottom, transparent 0, black 14px, black calc(100% - 14px), transparent)",
                }}
              >
                <motion.div
                  variants={listVariants}
                  initial="hidden"
                  animate="show"
                  className="pt-1"
                >
                  {CHANGELOG.map((e, i) => {
                    const latest = i === 0;
                    return (
                      <motion.section
                        key={e.version + e.title}
                        variants={itemVariants}
                        className="relative flex gap-3.5 pb-5 last:pb-1"
                      >
                        {/* 时间线轨道：节点 + 向下渐隐的轨道线 */}
                        <div className="relative flex w-2.5 shrink-0 flex-col items-center">
                          {latest ? (
                            <span
                              className="mt-[5px] block h-2 w-2 rounded-full"
                              style={{
                                background: "var(--ui-accent)",
                                boxShadow:
                                  "0 0 8px color-mix(in srgb, var(--ui-accent) 55%, transparent)",
                              }}
                            />
                          ) : (
                            <span className="mt-[6px] block h-1.5 w-1.5 rounded-full border border-zinc-300 bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-700" />
                          )}
                          {i < CHANGELOG.length - 1 &&
                            (latest ? (
                              <span
                                aria-hidden
                                className="mt-1 w-px flex-1"
                                style={{ background: "var(--ui-accent)", opacity: 0.35 }}
                              />
                            ) : (
                              <span
                                aria-hidden
                                className="mt-1 w-px flex-1 bg-zinc-900/10 dark:bg-white/10"
                              />
                            ))}
                        </div>

                        {/* 内容列 */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium tabular-nums tracking-wide text-zinc-800 dark:text-zinc-100">
                              v{e.version}
                            </span>
                            {latest && (
                              <span
                                className="rounded-full px-1.5 py-px text-[9px] tracking-widest"
                                style={{
                                  background:
                                    "color-mix(in srgb, var(--ui-accent) 14%, transparent)",
                                  color: "var(--ui-accent)",
                                }}
                              >
                                最新
                              </span>
                            )}
                            <span
                              className={
                                "rounded-full px-1.5 py-px text-[9px] tracking-wide " +
                                (e.channel === "page"
                                  ? "accent-text"
                                  : "bg-zinc-900/5 text-zinc-400 dark:bg-white/10 dark:text-zinc-500")
                              }
                              style={
                                e.channel === "page"
                                  ? {
                                      background:
                                        "color-mix(in srgb, var(--ui-accent) 10%, transparent)",
                                    }
                                  : undefined
                              }
                            >
                              {e.channel === "page" ? "页面云端更新" : "扩展更新"}
                            </span>
                            {e.date && (
                              <span className="ml-auto text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
                                {e.date}
                              </span>
                            )}
                          </div>

                          <h3 className="mt-1.5 text-xs font-normal leading-relaxed text-zinc-700 dark:text-zinc-200">
                            {e.title}
                          </h3>

                          <ul className="mt-1.5 space-y-1">
                            {e.highlights.map((h, j) => (
                              <li
                                key={j}
                                className="flex gap-2 text-[11px] font-extralight leading-relaxed tracking-wide text-zinc-500 dark:text-zinc-400"
                              >
                                <span
                                  aria-hidden
                                  className="mt-[6px] h-1 w-1 shrink-0 rounded-full"
                                  style={{
                                    background:
                                      "color-mix(in srgb, var(--ui-accent) 42%, transparent)",
                                  }}
                                />
                                <span>{h}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </motion.section>
                    );
                  })}
                </motion.div>
              </div>

              <p className="mt-3 text-center text-[10px] tracking-[0.2em] text-zinc-300 dark:text-zinc-600">
                共 {CHANGELOG.length} 个版本
              </p>

              {/* v8.4.9 「返回设置」：显式回设置面板的入口（此前只有 ESC / 点遮罩，无可见按钮） */}
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={onClose}
                  className="group flex items-center gap-1.5 rounded-full border border-zinc-900/10 px-4 py-1.5 text-[11px] font-light tracking-[0.2em] text-zinc-600 transition-colors duration-300 hover:bg-zinc-900/5 hover:text-zinc-800 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                >
                  <ArrowLeft
                    className="h-3 w-3 transition-transform duration-300 group-hover:-translate-x-0.5"
                    strokeWidth={1.5}
                  />
                  返回设置
                </button>
              </div>
            </div>
          </motion.div>
        </PresenceClass>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default memo(ChangelogDialog);
