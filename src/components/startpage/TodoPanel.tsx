"use client";

import { memo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { TodoItem } from "@/lib/startpage/types";
import { uid } from "@/hooks/use-start";

const EASE = [0.22, 1, 0.36, 1] as const;

function TodoPanel({
  todos,
  setTodos,
}: {
  todos: TodoItem[];
  setTodos: (updater: (prev: TodoItem[]) => TodoItem[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function add() {
    const text = draft.trim();
    if (!text) return;
    setTodos((prev) => [
      ...prev,
      { id: uid(), text, done: false, createdAt: Date.now() },
    ]);
    setDraft("");
    inputRef.current?.focus();
  }

  const doneCount = todos.filter((t) => t.done).length;

  return (
    <div className="flex h-full flex-col">
      {/* 输入 */}
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") add();
        }}
        placeholder="添加待办，回车确认"
        aria-label="添加待办"
        className="mb-3 h-10 w-full rounded-xl border border-transparent bg-zinc-900/[0.04] px-3.5 text-sm font-light text-zinc-800 outline-none transition-all duration-300 placeholder:text-zinc-400 accent-focus focus:bg-transparent dark:bg-white/5 dark:text-zinc-100 dark:placeholder:text-zinc-500"
      />

      {/* 列表 */}
      <div className="slim-scroll -mr-2 max-h-[320px] flex-1 overflow-y-auto pr-2">
        {todos.length === 0 && (
          <p className="py-8 text-center text-xs font-light tracking-wide text-zinc-400 dark:text-zinc-500">
            今日无事，从容一些
          </p>
        )}
        <ul className="space-y-1">
          <AnimatePresence initial={false}>
            {todos.map((t) => (
              <motion.li
                key={t.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 24, transition: { duration: 0.25 } }}
                transition={{ duration: 0.35, ease: EASE }}
                className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-200 hover:bg-zinc-900/[0.04] dark:hover:bg-white/5"
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={t.done}
                  aria-label={`完成 ${t.text}`}
                  onClick={() =>
                    setTodos((prev) =>
                      prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x))
                    )
                  }
                  className={`accent-hover flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                    t.done ? "text-white" : "text-zinc-400 dark:text-zinc-600"
                  }`}
                  style={
                    t.done
                      ? { background: "var(--ui-accent, #8b5cf6)", borderColor: "var(--ui-accent, #8b5cf6)" }
                      : undefined
                  }
                >
                  {t.done && (
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path
                        d="M2 6.5 4.8 9 10 3.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>

                <span
                  className={`relative min-w-0 flex-1 truncate text-sm font-light transition-colors duration-300 ${
                    t.done ? "text-zinc-400 dark:text-zinc-600" : "text-zinc-700 dark:text-zinc-200"
                  }`}
                >
                  {/* 划线动画 */}
                  <span aria-hidden className="strike absolute left-0 top-1/2 h-px w-full origin-left bg-zinc-400 dark:bg-zinc-500" style={{ transform: t.done ? "scaleX(1)" : "scaleX(0)" }} />
                  {t.text}
                </span>

                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`删除 ${t.text}`}
                  onClick={() => setTodos((prev) => prev.filter((x) => x.id !== t.id))}
                  className="shrink-0 rounded-full p-1 text-zinc-300 opacity-0 transition-opacity duration-200 hover:text-zinc-500 group-hover:opacity-100 dark:text-zinc-600 dark:hover:text-zinc-400"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>

      {/* 底部统计 */}
      {doneCount > 0 && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setTodos((prev) => prev.filter((t) => !t.done))}
            className="rounded-full px-3 py-1 text-[11px] font-light tracking-wide text-zinc-400 transition-colors duration-200 hover:bg-zinc-900/5 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-300"
          >
            清除已完成（{doneCount}）
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(TodoPanel);
