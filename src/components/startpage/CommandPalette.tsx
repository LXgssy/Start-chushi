"use client";

import { memo, useEffect, useState } from "react";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckSquare,
  CloudSun,
  Compass,
  Download,
  Globe,
  Moon,
  NotebookPen,
  Package,
  PackagePlus,
  Plus,
  Settings2,
  Sparkles,
  Sun,
} from "lucide-react";
import { ENGINES, looksLikeUrl, toUrl } from "@/lib/startpage/engines";
import type { PresetAction } from "@/lib/startpage/preset";
import type { StartLink } from "@/lib/startpage/types";

const SPRING = { type: "spring" as const, stiffness: 460, damping: 38 };

/* 退出专用：入场用弹簧（有生命感），离场用加速曲线（干脆利落）。
   卡片 0.2s 先走，遮罩 0.28s 后散——backdrop-blur 随不透明度渐隐而非卸载瞬跳（生硬感根源） */
const EXIT_EASE = [0.4, 0, 1, 1] as const;

const ITEM_CLASS =
  "group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-light text-zinc-600 outline-none transition-colors duration-150 data-[selected=true]:bg-zinc-900/[0.06] data-[selected=true]:text-zinc-900 dark:text-zinc-300 dark:data-[selected=true]:bg-white/10 dark:data-[selected=true]:text-zinc-50";

function CommandPalette(props: {
  open: boolean;
  onClose: () => void;
  links: StartLink[];
  runSearch: (engineId: string, q: string) => void;
  toggleTheme: () => void;
  themeIsDark: boolean;
  setPanel: (p: "weather" | "todo" | "note" | "settings") => void;
  openAddLink: () => void;
  exportData: () => void;
  presetCommands: { title: string; action: PresetAction; key: string; presetName: string }[];
  runPresetAction: (a: PresetAction) => void;
  openPresetDialog: (tab: "import" | "manage") => void;
}) {
  return <AnimatePresence>{props.open && <PaletteInner key="palette" {...props} />}</AnimatePresence>;
}

function PaletteInner({
  onClose,
  links,
  runSearch,
  toggleTheme,
  themeIsDark,
  setPanel,
  openAddLink,
  exportData,
  presetCommands,
  runPresetAction,
  openPresetDialog,
}: {
  open: boolean;
  onClose: () => void;
  links: StartLink[];
  runSearch: (engineId: string, q: string) => void;
  toggleTheme: () => void;
  themeIsDark: boolean;
  setPanel: (p: "weather" | "todo" | "note" | "settings") => void;
  openAddLink: () => void;
  exportData: () => void;
  presetCommands: { title: string; action: PresetAction; key: string; presetName: string }[];
  runPresetAction: (a: PresetAction) => void;
  openPresetDialog: (tab: "import" | "manage") => void;
}) {
  const [inputValue, setInputValue] = useState("");

  /* 挂载时聚焦输入框；卸载时归还焦点（无 setState） */
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      document.querySelector<HTMLInputElement>("[cmdk-input]")?.focus();
    }, 30);
    return () => {
      clearTimeout(t);
      prev?.focus?.();
    };
  }, []);

  function exec(fn: () => void) {
    fn();
    onClose();
  }

  const q = inputValue.trim();

  /* PaletteInner 仅在 open 时由外层 AnimatePresence 挂载，退出动画经 PresenceContext
     传达给下方 motion 节点；不在此处再套 AnimatePresence（双层 presence 会让退出时机竞争） */
  return (
    <motion.div
      key="palette-overlay"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[16vh] backdrop-blur-[6px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.25, ease: "easeOut" } }}
      exit={{ opacity: 0, transition: { duration: 0.28, ease: "easeInOut" } }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="指令面板"
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
            <Command label="指令面板" loop shouldFilter>
              <div className="flex items-center gap-2 border-b border-zinc-900/5 px-4 dark:border-white/5">
                <Compass
                  className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500"
                  strokeWidth={1.5}
                />
                <Command.Input
                  value={inputValue}
                  onValueChange={setInputValue}
                  placeholder="输入指令、链接，或直接键入要搜索的内容…"
                  className="h-12 w-full bg-transparent text-sm font-light text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
                <kbd className="shrink-0 rounded-md border border-zinc-900/10 px-1.5 py-0.5 text-[10px] tracking-wider text-zinc-400 dark:border-white/10 dark:text-zinc-500">
                  ESC
                </kbd>
              </div>

              <Command.List className="slim-scroll max-h-[46vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-8 text-center text-xs font-light tracking-wide text-zinc-400 dark:text-zinc-500">
                  没有匹配的指令
                </Command.Empty>

                {/* 动态搜索引擎项（有输入时展示） */}
                {q && (
                  <CmdGroup heading={`用 “${q.slice(0, 12)}${q.length > 12 ? "…" : ""}” 搜索`}>
                    {ENGINES.map((e) => (
                      <Command.Item
                        key={e.id}
                        value={`search-${e.name}-${q}`}
                        onSelect={() =>
                          exec(() => {
                            onClose();
                            window.location.href = e.search(q);
                          })
                        }
                        className={ITEM_CLASS}
                      >
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-900/20 text-[9px] font-normal leading-none dark:border-white/25">
                          {e.name[0]}
                        </span>
                        用「{e.name}」搜索
                        <ArrowHint />
                      </Command.Item>
                    ))}
                    {looksLikeUrl(q) && (
                      <Command.Item
                        value={`open-url-${q}`}
                        onSelect={() =>
                          exec(() => {
                            window.location.href = toUrl(q);
                          })
                        }
                        className={ITEM_CLASS}
                      >
                        <Globe />
                        打开网址 {toUrl(q)}
                        <ArrowHint />
                      </Command.Item>
                    )}
                  </CmdGroup>
                )}

                <CmdGroup heading="打开">
                  <StaticItem icon={<CheckSquare />} label="待办清单" onSelect={() => exec(() => setPanel("todo"))} />
                  <StaticItem icon={<NotebookPen />} label="便签" onSelect={() => exec(() => setPanel("note"))} />
                  <StaticItem icon={<CloudSun />} label="天气" onSelect={() => exec(() => setPanel("weather"))} />
                  <StaticItem icon={<Settings2 />} label="设置" onSelect={() => exec(() => setPanel("settings"))} />
                </CmdGroup>

                <CmdGroup heading="操作">
                  <StaticItem
                    icon={themeIsDark ? <Sun /> : <Moon />}
                    label={themeIsDark ? "切换到浅色模式" : "切换到深色模式"}
                    onSelect={() => exec(toggleTheme)}
                  />
                  <StaticItem icon={<Plus />} label="添加快捷链接" onSelect={() => exec(openAddLink)} />
                  <StaticItem
                    icon={<PackagePlus />}
                    label="导入预设"
                    onSelect={() => exec(() => openPresetDialog("import"))}
                  />
                  <StaticItem
                    icon={<Package />}
                    label="管理预设"
                    onSelect={() => exec(() => openPresetDialog("manage"))}
                  />
                  <StaticItem icon={<Download />} label="导出数据备份" onSelect={() => exec(exportData)} />
                </CmdGroup>

                {/* 预设命令：来自已安装预设（声明式白名单 action） */}
                {presetCommands.length > 0 && (
                  <CmdGroup heading="预设命令">
                    {presetCommands.map((c) => (
                      <Command.Item
                        key={c.key}
                        value={`preset-${c.presetName}-${c.title}`}
                        onSelect={() => exec(() => runPresetAction(c.action))}
                        className={ITEM_CLASS}
                      >
                        <span className="text-[var(--ui-accent)]">
                          <Sparkles className="h-4 w-4" strokeWidth={1.5} />
                        </span>
                        {c.title}
                        <span className="ml-auto hidden max-w-[45%] truncate text-xs font-extralight text-zinc-400 dark:text-zinc-600 sm:inline">
                          {c.presetName}
                        </span>
                      </Command.Item>
                    ))}
                  </CmdGroup>
                )}

                {links.length > 0 && (
                  <CmdGroup heading="链接">
                    {links.map((l) => (
                      <Command.Item
                        key={l.id}
                        value={`link-${l.name}-${l.url}`}
                        onSelect={() =>
                          exec(() => {
                            window.location.href = l.url;
                          })
                        }
                        className={ITEM_CLASS}
                      >
                        <Globe />
                        {l.name}
                        <span className="ml-auto hidden max-w-[45%] truncate text-xs font-extralight text-zinc-400 dark:text-zinc-600 sm:inline">
                          {l.url.replace(/^https?:\/\//, "")}
                        </span>
                      </Command.Item>
                    ))}
                  </CmdGroup>
                )}
              </Command.List>
            </Command>
      </motion.div>
    </motion.div>
  );
}

function ArrowHint() {
  return (
    <span className="ml-auto hidden text-xs font-extralight text-zinc-400 group-data-[selected=true]:inline dark:text-zinc-500">
      ↩
    </span>
  );
}

function StaticItem({
  label,
  onSelect,
  icon,
}: {
  label: string;
  onSelect: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Command.Item value={label} onSelect={onSelect} className={ITEM_CLASS}>
      <span className="[&>svg]:h-4 [&>svg]:w-4 text-zinc-400 dark:text-zinc-500">{icon}</span>
      {label}
    </Command.Item>
  );
}

function CmdGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-light [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-zinc-400 dark:[&_[cmdk-group-heading]]:text-zinc-500"
    >
      {children}
    </Command.Group>
  );
}

export default memo(CommandPalette);
