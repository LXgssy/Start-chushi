"use client";

import { memo, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import { ENGINES, getEngine, looksLikeUrl, toUrl } from "@/lib/startpage/engines";
import type { Settings } from "@/lib/startpage/types";

const EASE = [0.22, 1, 0.36, 1] as const;

function SearchBar({
  settings,
  onPatchSettings,
}: {
  settings: Settings;
  onPatchSettings: (patch: Partial<Settings>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const engine = getEngine(settings.engineId);

  /* 页面级快捷键通过事件请求聚焦搜索框；可携带欲直输的首字符 */
  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent).detail as { char?: string } | undefined;
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      const ch = detail?.char;
      if (ch) {
        const next = input.value + ch;
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        )?.set;
        setter?.call(input, next);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.setSelectionRange(next.length, next.length);
      } else {
        input.select();
      }
    };
    window.addEventListener("start:focus-search", onFocus);
    return () => window.removeEventListener("start:focus-search", onFocus);
  }, []);

  function navigate(url: string, newTab: boolean) {
    if (newTab) window.open(url, "_blank");
    else window.location.href = url;
  }

  function submit(newTab: boolean) {
    const q = query.trim();
    if (!q) return;
    if (looksLikeUrl(q)) navigate(toUrl(q), newTab);
    else navigate(engine.search(q), newTab);
  }

  return (
    <div className="relative w-[min(92vw,580px)]">
      <form
        ref={formRef}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
        onKeyDown={(e) => {
          /* Alt/⌘/Ctrl + Enter → 新标签页打开（SubmitEvent 不携带修饰键，改在键盘事件层判定） */
          if (e.key === "Enter" && (e.altKey || e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit(true);
          }
        }}
        className={`glass-pill backdrop-blur-2xl backdrop-saturate-150 search-pill group flex h-14 items-center gap-2 rounded-full px-3 transition-all duration-500 ${
          focused
            ? "scale-[1.015] shadow-[0_10px_50px_-8px_rgba(0,0,0,0.25)] ring-1 ring-zinc-900/15 dark:ring-white/25"
            : ""
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)" }}
      >
        {/* 引擎选择 */}
        <Popover.Root>
          <Popover.Trigger
            aria-label="切换搜索引擎"
            className="search-trigger flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-normal tracking-wide text-zinc-500 transition-colors duration-300 hover:bg-zinc-900/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
          >
            <span>{engine.name}</span>
            <ChevronDown className="h-3 w-3 opacity-60" strokeWidth={1.5} />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              sideOffset={10}
              align="start"
              className="z-50 w-44 overflow-hidden rounded-xl border border-zinc-200/70 bg-white/85 shadow-xl backdrop-blur-2xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 dark:border-white/10 dark:bg-[#17171c]/90"
            >
              <div className="p-1.5">
                {ENGINES.map((e) => (
                  <Popover.Close
                    key={e.id}
                    onClick={() => onPatchSettings({ engineId: e.id })}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-zinc-600 transition-colors duration-150 hover:bg-zinc-900/5 dark:text-zinc-300 dark:hover:bg-white/10"
                  >
                    <span className="font-light">{e.name}</span>
                    {e.id === settings.engineId && (
                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
                    )}
                  </Popover.Close>
                ))}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <span aria-hidden className="h-5 w-px shrink-0 bg-zinc-900/10 dark:bg-white/10" />

        {/* 输入区域 */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={engine.hint}
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="搜索或输入网址"
          className="search-input h-full min-w-0 flex-1 bg-transparent text-[15px] font-light text-zinc-900 outline-none placeholder:text-zinc-400/90 dark:text-zinc-50 dark:placeholder:text-zinc-500"
        />

        {/* 提交按钮 */}
        <button
          type="submit"
          aria-label="开始搜索"
          tabIndex={query.trim() ? 0 : -1}
          className={`search-submit flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
            query.trim()
              ? "bg-zinc-900 text-zinc-50 opacity-100 hover:opacity-80 dark:bg-zinc-100 dark:text-zinc-900"
              : "-mr-1 opacity-0"
          }`}
        >
          <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </form>

      {/* 操作提示 */}
      <div className="pointer-events-none mt-3 flex h-4 justify-center">
        <AnimatePresence>
          {query.trim() && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="search-hint text-[11px] font-light tracking-wider text-zinc-400 dark:text-zinc-500"
            >
              ↩ 直接前往{looksLikeUrl(query) ? "该网址" : ""}
              　·　Alt + ↩ 新标签页打开
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default memo(SearchBar);
