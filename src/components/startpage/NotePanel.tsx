"use client";

import { memo, useEffect, useRef, useState } from "react";

function NotePanel({
  note,
  onCommit,
}: {
  note: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(note);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  /* 防抖自动保存到持久层 */
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onCommit(local);
      setSavedAt(Date.now());
    }, 450);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [local]);

  return (
    <div className="flex h-full flex-col">
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="随手记点什么… 自动保存"
        aria-label="便签"
        rows={7}
        className="slim-scroll w-full flex-1 resize-none rounded-xl border border-transparent bg-zinc-900/[0.03] p-3.5 text-sm font-extralight leading-relaxed text-zinc-700 outline-none transition-all duration-300 placeholder:text-zinc-400 accent-focus focus:bg-transparent dark:bg-white/[0.04] dark:text-zinc-200 dark:placeholder:text-zinc-500"
        style={{ minHeight: "170px" }}
      />
      <div className="mt-1.5 flex h-4 justify-end">
        <span
          aria-live="polite"
          className={`text-[11px] font-light tracking-wide text-emerald-600/70 transition-opacity duration-700 dark:text-emerald-400/70 ${
            savedAt ? "opacity-100" : "opacity-0"
          }`}
        >
          已保存
        </span>
      </div>
    </div>
  );
}

export default memo(NotePanel);
