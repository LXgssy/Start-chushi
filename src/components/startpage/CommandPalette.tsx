"use client";

/* 指令面板（⌘K）— 双视图单卡片：
 *   指令列表 ⇄ 预设系统（导入/管理，PresetPanel）
 * 用户在指令列表选择「导入预设 / 管理预设」时不再先关后开，而是同一张
 * glass-card 内做视图交叉溶解 + 高度弹簧——指令面板连续地「缩小成」预设
 * 系统面板（与 dock 面板切换同一套形变语言，见 use-morph-height）。
 * 动效与 dock PanelStage 同律：淡入淡出全走 CSS 关键帧（framer v12 对 opacity
 * 的 WAAPI 加速在真机上闪黑/退场回跳），高度弹簧走 framer 逐帧样式；
 * 卡片与遮罩均不携带 backdrop-filter（玻璃 + opacity 动画 = Chromium 闪烁
 * 经典组合，且逐帧 backdrop 重采样是掉帧主力；卡片底色 92% 不透明，
 * 磨砂本就不可见）。 */

import { memo, useEffect, useState } from "react";
import { Command } from "cmdk";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { PresenceClass } from "./PresenceClass";
import { useMorphHeight } from "./use-morph-height";
import PresetPanel, { type PresetTab } from "./PresetPanel";
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
import type { InstalledPreset, PresetAction, PresetPayload } from "@/lib/startpage/preset";
import type { StartLink } from "@/lib/startpage/types";

const SPRING = { type: "spring" as const, stiffness: 460, damping: 38 };

/* 退场加速曲线（与 globals.css 的 .dialog-sink/.veil-out-slow 同参） */
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
  presets: InstalledPreset[];
  onInstall: (p: PresetPayload, name: string) => void;
  onRemove: (id: string) => void;
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
  presets,
  onInstall,
  onRemove,
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
  presets: InstalledPreset[];
  onInstall: (p: PresetPayload, name: string) => void;
  onRemove: (id: string) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  /* null = 指令列表视图；否则为预设系统视图（导入/管理），指令面板形变为 PresetPanel */
  const [presetView, setPresetView] = useState<PresetTab | null>(null);
  /* 高度形变舞台（与 dock PanelStage 同构）：260ms 武装——指令列表过滤后的
     高度弹簧尽早生效，同时避开挂载帧 setState */
  const { contentH, measureRef } = useMorphHeight(260);
  const reduceMotion = useReducedMotion();

  /* 挂载时聚焦输入框；卸载时归还焦点（无 setState） */
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      document.querySelector<HTMLInputElement>("[cmdk-input]")?.focus();
    }, 30);
    return () => {
      clearTimeout(t);
      /* 归还焦点给打开前的元素（通常是 tab 栏 ⌘K 按钮）。键盘路径（ESC / ⌘K 关闭）
         之后的程序化 focus 会被 Chrome 判定为键盘聚焦而命中 :focus-visible，
         tab 栏 ⌘K 上出现蓝色聚焦框——检测到即主动移出焦点（焦点回 body，
         不影响 Tab 焦点序；鼠标路径的 refocus 不命中 :focus-visible，保持原状） */
      if (prev && prev.isConnected) {
        prev.focus?.();
        try {
          if (prev.matches(":focus-visible")) prev.blur();
        } catch {
          /* 老内核不支持 :focus-visible 匹配：忽略 */
        }
      }
    };
  }, []);

  function exec(fn: () => void) {
    fn();
    onClose();
  }

  const q = inputValue.trim();

  /* PaletteInner 仅在 open 时由外层 AnimatePresence 挂载，退出动画经 PresenceContext
     传达给下方 PresenceClass 节点；不在此处再套 AnimatePresence（双层 presence 会让退出时机竞争） */
  return (
    <PresenceClass
      key="palette-overlay"
      exitClass="veil-out-slow"
      duration={0.28}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[16vh]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.25, ease: "easeOut" } }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="指令面板"
    >
      <PresenceClass
        exitClass="dialog-sink"
        duration={0.2}
        className="glass-card panel-rise w-full max-w-[560px] overflow-hidden rounded-2xl shadow-2xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        {/* 高度盒：打开从 0 展开 / 视图切换（指令列表⇄预设系统）px 弹簧 / 关闭折回 0 */}
        <motion.div
          className="relative"
          style={{ contain: "layout" }}
          initial={reduceMotion ? false : { height: 0 }}
          animate={{ height: contentH == null ? "auto" : contentH }}
          exit={{ height: 0, transition: { duration: 0.2, ease: EXIT_EASE } }}
          transition={SPRING}
        >
          <AnimatePresence initial={false}>
            {presetView == null ? (
              <PresenceClass
                key="cmds"
                ref={measureRef}
                exitClass="view-exit"
                duration={0.2}
                className="flow-root panel-rise"
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
                      {/* 预设系统：不关面板，指令面板原地形变为预设系统面板（同一张卡片连续形变） */}
                      <StaticItem
                        icon={<PackagePlus />}
                        label="导入预设"
                        onSelect={() => setPresetView("import")}
                      />
                      <StaticItem
                        icon={<Package />}
                        label="管理预设"
                        onSelect={() => setPresetView("manage")}
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
              </PresenceClass>
            ) : (
              <PresenceClass
                key="preset"
                ref={measureRef}
                exitClass="view-exit"
                duration={0.2}
                className="flow-root panel-rise"
              >
                <PresetPanel
                  tab={presetView}
                  presets={presets}
                  onInstall={onInstall}
                  onRemove={onRemove}
                  onClose={onClose}
                />
              </PresenceClass>
            )}
          </AnimatePresence>
        </motion.div>
      </PresenceClass>
    </PresenceClass>
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
