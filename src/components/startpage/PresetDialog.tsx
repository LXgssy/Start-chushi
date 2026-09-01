"use client";

/* 预设导入 / 管理对话框 — 声明式预设的用户入口。
   视觉与动效语言对齐指令面板（glass-card + 弹簧入场 + 加速退场），
   遮罩点击 / ESC 关闭，textarea 粘贴 JSON 导入。 */

import { memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PackageOpen, Plus, Trash2 } from "lucide-react";
import { parsePreset, SAMPLE_PRESET, type InstalledPreset, type PresetPayload } from "@/lib/startpage/preset";

const SPRING = { type: "spring" as const, stiffness: 460, damping: 38 };
const EXIT_EASE = [0.4, 0, 1, 1] as const;

export interface PresetDialogState {
  open: boolean;
  tab: "import" | "manage";
}

const NO_PRESETS: InstalledPreset[] = [];

function PresetDialog(props: {
  state: PresetDialogState;
  onClose: () => void;
  presets: InstalledPreset[];
  onInstall: (p: PresetPayload, name: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <AnimatePresence>
      {props.state.open && (
        <DialogInner
          key="preset-dialog"
          tab={props.state.tab}
          presets={props.presets.length > 0 ? props.presets : NO_PRESETS}
          onClose={props.onClose}
          onInstall={props.onInstall}
          onRemove={props.onRemove}
        />
      )}
    </AnimatePresence>
  );
}

function DialogInner({
  tab: initialTab,
  presets,
  onClose,
  onInstall,
  onRemove,
}: {
  tab: "import" | "manage";
  presets: InstalledPreset[];
  onClose: () => void;
  onInstall: (p: PresetPayload, name: string) => void;
  onRemove: (id: string) => void;
}) {
  const [tab, setTab] = useState<"import" | "manage">(initialTab);
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => taRef.current?.focus(), 30);
    return () => {
      clearTimeout(t);
      prev?.focus?.();
    };
  }, []);

  function importNow() {
    setErrors([]);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      setErrors([
        `JSON 解析失败：${e instanceof Error ? e.message.replace(/^Unexpected token.*$/, (m) => m) : "格式不正确"}`,
      ]);
      return;
    }
    const r = parsePreset(raw);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    onInstall(r.preset, r.preset.name);
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[16vh] backdrop-blur-[6px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.25, ease: "easeOut" } }}
      exit={{ opacity: 0, transition: { duration: 0.28, ease: "easeInOut" } }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="预设管理"
    >
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: SPRING }}
        exit={{
          opacity: 0,
          y: -12,
          scale: 0.97,
          transition: { duration: 0.2, ease: EXIT_EASE },
        }}
        transition={SPRING}
        className="glass-card backdrop-blur-2xl backdrop-saturate-150 w-full max-w-[560px] overflow-hidden rounded-2xl shadow-2xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        {/* 顶栏：标题 + 双 tab 切换 */}
        <div className="flex items-center gap-1 border-b border-zinc-900/5 px-4 py-2.5 dark:border-white/5">
          {(
            [
              ["import", "导入预设"],
              ["manage", `管理预设${presets.length > 0 ? ` · ${presets.length}` : ""}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              data-active={tab === id ? "true" : undefined}
              className="rounded-lg px-3 py-1.5 text-xs font-light tracking-wide text-zinc-500 transition-colors duration-150 data-[active=true]:bg-zinc-900/[0.06] data-[active=true]:text-zinc-900 hover:text-zinc-800 dark:text-zinc-400 dark:data-[active=true]:bg-white/10 dark:data-[active=true]:text-zinc-50 dark:hover:text-zinc-200"
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="ml-auto rounded-full p-1.5 text-zinc-400 opacity-70 transition-all duration-200 hover:bg-zinc-900/5 hover:opacity-100 dark:text-zinc-500 dark:hover:bg-white/10"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {tab === "import" ? (
          <div className="p-4">
            <p className="mb-2.5 px-1 text-xs font-light leading-relaxed text-zinc-500 dark:text-zinc-400">
              粘贴预设 JSON — 预设是纯声明式的（不执行代码），可包含指令面板命令、磁贴与 tab 栏按钮。
            </p>
            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              placeholder='以 { "chushi": 1, ... } 开头的预设 JSON'
              className="slim-scroll h-44 w-full resize-none rounded-xl border border-zinc-900/10 bg-white/40 p-3 font-mono text-xs leading-relaxed text-zinc-800 outline-none transition-colors duration-200 placeholder:text-zinc-400 focus:border-zinc-900/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-white/20"
            />
            {errors.length > 0 && (
              <ul className="mt-2.5 space-y-1 rounded-xl bg-red-500/[0.07] p-3 text-xs font-light leading-relaxed text-red-600 dark:text-red-400">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={importNow}
                disabled={!text.trim()}
                className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-normal text-zinc-50 transition-all duration-200 hover:opacity-85 disabled:opacity-30 dark:bg-zinc-50 dark:text-zinc-900"
              >
                导入
              </button>
              <button
                type="button"
                onClick={() => {
                  setText(SAMPLE_PRESET);
                  setErrors([]);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-light text-zinc-500 transition-colors duration-150 hover:bg-zinc-900/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Plus className="h-3 w-3" strokeWidth={1.5} />
                  填入示例
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="slim-scroll max-h-[46vh] overflow-y-auto p-3">
            {presets.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                <PackageOpen className="h-5 w-5 text-zinc-300 dark:text-zinc-600" strokeWidth={1.5} />
                <p className="text-xs font-light leading-relaxed text-zinc-400 dark:text-zinc-500">
                  还没有安装任何预设
                  <br />
                  在「导入预设」里粘贴一段 JSON，或先填入示例试试
                </p>
              </div>
            ) : (
              <ul className="space-y-1">
                {presets.map((p) => {
                  const s = p.raw;
                  const parts = [
                    s.commands.length > 0 ? `${s.commands.length} 条命令` : null,
                    s.links.length > 0 ? `${s.links.length} 个磁贴` : null,
                    s.dock.length > 0 ? `${s.dock.length} 个栏按钮` : null,
                  ].filter(Boolean);
                  return (
                    <li
                      key={p.id}
                      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-zinc-900/[0.04] dark:hover:bg-white/[0.06]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-light text-zinc-800 dark:text-zinc-100">
                          {s.name}
                          {s.author && (
                            <span className="ml-2 text-[11px] font-extralight text-zinc-400 dark:text-zinc-500">
                              {s.author}
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[11px] font-extralight text-zinc-400 dark:text-zinc-500">
                          {parts.length > 0 ? parts.join(" · ") : "无内容项"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemove(p.id)}
                        aria-label={`删除预设 ${s.name}`}
                        className="rounded-lg p-2 text-zinc-400 opacity-0 transition-all duration-150 hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100 dark:text-zinc-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default memo(PresetDialog);
