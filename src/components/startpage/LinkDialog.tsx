"use client";

import { memo, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { PresenceClass } from "./PresenceClass";
import { normalizeUrl } from "@/lib/startpage/link-utils";
import type { StartLink } from "@/lib/startpage/types";

export interface LinkEditorState {
  open: boolean;
  editing: StartLink | null;
}

const SPRING = { type: "spring" as const, stiffness: 460, damping: 38 };

function LinkDialog({
  state,
  onClose,
  onSave,
  onDelete,
}: {
  state: LinkEditorState;
  onClose: () => void;
  onSave: (link: StartLink) => void;
  onDelete: (id: string) => void;
}) {
  /* 打开时才挂载表单，编辑目标变化时重建（状态自然重置） */
  return (
    <AnimatePresence>
      {state.open && (
        <DialogForm
          key={state.editing?.id ?? "__add__"}
          editing={state.editing}
          onClose={onClose}
          onSave={onSave}
          onDelete={onDelete}
        />
      )}
    </AnimatePresence>
  );
}

function DialogForm({
  editing,
  onClose,
  onSave,
  onDelete,
}: {
  editing: StartLink | null;
  onClose: () => void;
  onSave: (link: StartLink) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState(() => editing?.name ?? "");
  const [url, setUrl] = useState(() => editing?.url ?? "");
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  /* 挂载时聚焦对应输入框；卸载时有条件归还焦点（同指令面板 v1.0.8 合并修复：
     焦点已被其它视图接管时不抢回；归还命中 :focus-visible 时主动 blur） */
  useEffect(() => {
    const overlayEl = overlayRef.current;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      (editing ? urlRef : nameRef).current?.focus();
    }, 60);
    return () => {
      clearTimeout(t);
      const stolen =
        overlayEl && document.activeElement && overlayEl.contains(document.activeElement);
      if (stolen || !document.activeElement || document.activeElement === document.body) {
        if (prev && prev.isConnected) {
          prev.focus?.();
          try {
            if (prev.matches(":focus-visible")) prev.blur();
          } catch {
            /* 老内核不支持 :focus-visible 匹配：忽略 */
          }
        }
      }
    };
  }, []);

  function save() {
    const u = normalizeUrl(url);
    if (!u) {
      setError("请输入有效的网址，如 github.com");
      return;
    }
    onSave({
      id: editing?.id ?? "",
      name:
        name.trim() ||
        new URL(u).hostname.replace(/^www\./, "").replace(/\.(com|cn|net|org|io|co)(\.|$).*$/, "$1"),
      url: u,
    });
  }

  return (
    <PresenceClass
      key="link-overlay"
      ref={overlayRef}
      /* 入场淡入 .veil-in / 退场淡出 .veil-out 全走 CSS（framer WAAPI opacity 空窗/取消回跳律，
         与指令面板同律）；卸载由 PresenceClass 定时器接管 */
      exitClass="veil-out"
      duration={0.25}
      className="veil-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "编辑链接" : "添加链接"}
    >
      <motion.div
        /* 卡片只保留 transform 弹簧（淡入淡出由遮罩/卡片 CSS 承载，无 exit prop——
           整体随遮罩淡出） */
        initial={{ scale: 0.96, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        transition={SPRING}
        className="glass-card panel-rise w-full max-w-[400px] rounded-2xl p-5 shadow-2xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
          if (e.key === "Enter" && !e.shiftKey && (e.target as HTMLElement).tagName === "INPUT") {
            e.preventDefault();
            save();
          }
        }}
      >
            <h2 className="mb-4 text-center text-xs font-normal tracking-[0.25em] text-zinc-500 dark:text-zinc-400">
              {editing ? "编辑链接" : "添加链接"}
            </h2>

            <div className="space-y-3">
              <input
                ref={nameRef}
                type="text"
                value={name}
                maxLength={16}
                onChange={(e) => setName(e.target.value)}
                placeholder="名称（可选）"
                aria-label="链接名称"
                className="h-10 w-full rounded-xl border border-transparent bg-zinc-900/[0.04] px-3.5 text-sm font-light text-zinc-800 outline-none transition-all duration-300 placeholder:text-zinc-400 accent-focus focus:bg-transparent dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              <input
                ref={urlRef}
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="网址，如 github.com"
                aria-label="链接网址"
                inputMode="url"
                autoCapitalize="off"
                spellCheck={false}
                className="h-10 w-full rounded-xl border border-transparent bg-zinc-900/[0.04] px-3.5 text-sm font-light text-zinc-800 outline-none transition-all duration-300 placeholder:text-zinc-400 accent-focus focus:bg-transparent dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-1 text-xs font-light text-red-400/90"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              {editing ? (
                <button
                  type="button"
                  onClick={() => onDelete(editing.id)}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-light tracking-wide text-red-400 transition-colors duration-200 hover:bg-red-400/10 dark:text-red-400/90"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  删除
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full px-4 py-1.5 text-[11px] font-light tracking-wide text-zinc-500 transition-colors duration-200 hover:bg-zinc-900/5 dark:text-zinc-400 dark:hover:bg-white/10"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={save}
                  className="rounded-full bg-zinc-900 px-4 py-1.5 text-[11px] font-normal tracking-wider text-zinc-50 transition-opacity duration-200 hover:opacity-80 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  完成
                </button>
              </div>
            </div>
          </motion.div>
    </PresenceClass>
  );
}

export default memo(LinkDialog);
