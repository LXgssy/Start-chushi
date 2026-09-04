"use client";

/* 预设导入 / 管理面板体 — 从 PresetDialog 提取的复用组件。
 * 现宿主：指令面板（⌘K）的「预设系统」视图——用户在指令面板里选择
 * 导入/管理预设时，指令面板通过高度形变连续地「缩小成」本面板（同一张
 * glass-card 内做视图交叉溶解 + 高度弹簧，无先关后开）。
 *
 * 本组件不含高度盒与卡片外壳：宿主的形变舞台（height box + ResizeObserver）
 * 通过观察本组件根元素的高度来驱动弹簧，视图切换（导入↔管理）与内部
 * 高度变化（错误列表出现/消失、管理列表增删）都由宿主平滑跟随。
 * 导入支持：粘贴 JSON / 本地文件（.json 预设、.cshz/.zip 预设包，见 pack.ts）。 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PresenceClass } from "./PresenceClass";
import PresetDocs from "./PresetDocs";
import { ArrowLeft, BookOpen, FileUp, PackageOpen, Plus, Trash2, Wrench } from "lucide-react";
import { parsePreset, SAMPLE_PRESET, type InstalledPreset, type PresetPayload } from "@/lib/startpage/preset";
import { parsePack } from "@/lib/startpage/pack";

/** 静态资源 basePath（Pages 项目站子路径 / 扩展根路径两种形态） */
const base = (process.env.NEXT_PUBLIC_BASE_PATH as string | undefined) ?? "";

/* 高度形变曲线：与全局面板/视图动画同参（拖拽提示、错误列表出现/消失时
 *  下方按钮组被平滑推下/收回，不再瞬跳——v1.7.1） */
const EASE = [0.22, 1, 0.36, 1] as const;

/** 高度盒包裹器：0→auto 弹簧展开 / auto→0 折回（内边距放在子元素上，
 *  否则 height:0 时 padding 仍占位）。宿主形变舞台的 ResizeObserver 会跟随。 */
function Collapse({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
          transition={{ duration: 0.32, ease: EASE }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export type PresetTab = "import" | "manage";

export default function PresetPanel({
  tab: initialTab,
  presets,
  onInstall,
  onRemove,
  onClose,
  onBack,
}: {
  tab: PresetTab;
  presets: InstalledPreset[];
  onInstall: (p: PresetPayload, name: string) => void;
  onRemove: (id: string) => void;
  /** 关闭宿主浮层（指令面板 / 对话框） */
  onClose: () => void;
  /** 返回指令列表视图（⌘K 形变回指令面板；非 ⌘K 宿主可不传则不展示返回钮） */
  onBack?: () => void;
}) {
  const [tab, setTab] = useState<PresetTab>(initialTab);
  const [docsOpen, setDocsOpen] = useState(false);
  /* 宿主再次请求另一视图（导入↔管理）时同步内部 tab */
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /* 拖拽导入（v1.2.0）：文件悬停高亮 + 松手即导入；window 级拦住
     dragover/drop 默认行为（拖到面板外不再被浏览器当导航打开文件） */
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  /* 导入视图挂载时聚焦输入框（无焦点归还——归还由宿主浮层统一负责，
     视图级归还会在形变途中把焦点偷回触发按钮）；同时拦住窗口级拖拽默认行为 */
  useEffect(() => {
    if (tab !== "import") return;
    const t = setTimeout(() => taRef.current?.focus(), 30);
    const guard = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", guard);
    window.addEventListener("drop", guard);
    return () => {
      clearTimeout(t);
      window.removeEventListener("dragover", guard);
      window.removeEventListener("drop", guard);
    };
  }, [tab]);

  /* ---------- 导入 ---------- */

  function importText() {
    setErrors([]);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      setErrors([
        `JSON 解析失败：${e instanceof Error ? e.message : "格式不正确"}`,
      ]);
      return;
    }
    const r = parsePreset(raw);
    if (!r.ok) {
      setErrors(r.errors);
      return;
    }
    onInstall(r.preset, r.preset.name);
    onClose();
  }

  async function importFile(f: File) {
    setErrors([]);
    setBusy(true);
    try {
      if (/\.(cshz|zip)$/i.test(f.name)) {
        const r = await parsePack(f);
        if (!r.ok) {
          setErrors(r.errors);
          return;
        }
        onInstall(r.preset, r.preset.name);
        onClose();
      } else if (/\.json$/i.test(f.name) || f.type === "application/json") {
        let raw: unknown;
        try {
          raw = JSON.parse(await f.text());
        } catch (e) {
          setErrors([`JSON 解析失败：${e instanceof Error ? e.message : "格式不正确"}`]);
          return;
        }
        const r = parsePreset(raw);
        if (!r.ok) {
          setErrors(r.errors);
          return;
        }
        onInstall(r.preset, r.preset.name);
        onClose();
      } else {
        setErrors(["不支持的文件类型：请选择 .json 预设文件或 .cshz / .zip 预设包"]);
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /* 拖拽导入：与文件选择器同一 importFile 路径（.json / .cshz / .zip 同规） */
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    void importFile(f);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  return (
    <div>
      {/* 顶栏：标题 + 双 tab 切换 + 关闭宿主 */}
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
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="返回指令面板"
            title="返回指令面板"
            className="rounded-full p-1.5 text-zinc-400 opacity-70 transition-all duration-200 hover:bg-zinc-900/5 hover:opacity-100 dark:text-zinc-500 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* 视图交叉溶解：新视图 .content-focus 模糊聚拢，退场视图 .view-exit 钉位模糊散场，
          高度由宿主形变舞台跟随。initial={false}：首个 tab 不重复动画——宿主（指令面板）
          的视图包裹层已播 .content-focus，避免双重模糊 */}
      <div className="relative">
        <AnimatePresence initial={false}>
          <PresenceClass
            key={tab}
            exitClass="view-exit"
            duration={0.2}
            className="flow-root content-focus"
          >
            {tab === "import" ? (
              <div
                className="p-4"
                onDragOver={onDragOver}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
                }}
                onDrop={onDrop}
              >
                <p className="mb-2.5 px-1 text-xs font-light leading-relaxed text-zinc-500 dark:text-zinc-400">
                  粘贴预设 JSON、导入本地文件，或直接把文件拖进来（.json / .cshz 预设包）— 命令、磁贴与按钮均为声明式白名单动作；
                  scripts 与 pages 运行在隔离沙箱中（拿不到页面数据与扩展 API），可放心安装可信来源的预设。
                </p>
                <textarea
                  ref={taRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  spellCheck={false}
                  placeholder='以 { "chushi": 1, ... } 开头的预设 JSON，或拖入预设文件'
                  data-drag={dragOver ? "true" : undefined}
                  className="slim-scroll h-44 w-full resize-none rounded-xl border border-dashed border-zinc-900/10 bg-white/40 p-3 font-mono text-xs leading-relaxed text-zinc-800 outline-none transition-colors duration-200 placeholder:text-zinc-400 focus:border-solid focus:border-zinc-900/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-white/20 data-[drag=true]:border-[var(--ui-accent)] data-[drag=true]:bg-[var(--ui-accent)]/[0.06] data-[drag=true]:border-solid"
                />
                <Collapse show={dragOver}>
                  <p className="mt-1.5 px-1 text-[11px] font-light tracking-wide text-[var(--ui-accent)]">
                    松开即导入该预设文件
                  </p>
                </Collapse>
                <Collapse show={errors.length > 0}>
                  {errors.length > 0 && (
                    <ul className="mt-2.5 space-y-1 rounded-xl bg-red-500/[0.07] p-3 text-xs font-light leading-relaxed text-red-600 dark:text-red-400">
                      {errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                </Collapse>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={importText}
                    disabled={!text.trim()}
                    className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-normal text-zinc-50 transition-all duration-200 hover:opacity-85 disabled:opacity-30 dark:bg-zinc-50 dark:text-zinc-900"
                  >
                    导入
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="rounded-full px-3 py-1.5 text-xs font-light text-zinc-500 transition-colors duration-150 hover:bg-zinc-900/5 hover:text-zinc-800 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <FileUp className="h-3 w-3" strokeWidth={1.5} />
                      {busy ? "解析中…" : "导入文件…"}
                    </span>
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
                  <button
                    type="button"
                    onClick={() => setDocsOpen(true)}
                    className="ml-auto rounded-full px-3 py-1.5 text-xs font-light text-zinc-500 transition-colors duration-150 hover:bg-zinc-900/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <BookOpen className="h-3 w-3" strokeWidth={1.5} />
                      开发者文档
                    </span>
                  </button>
                  {/* 图形化预设开发工具（v1.7.0）：单文件离线应用内嵌在本应用静态资源里，
                      a[download] 同源直下——不依赖外部服务器，离线也能拿 */}
                  <a
                    href={`${base}/preset-studio.html`}
                    download="初始预设开发工具.html"
                    title="下载图形化预设开发工具（单文件离线应用）"
                    className="rounded-full px-3 py-1.5 text-xs font-light text-zinc-500 transition-colors duration-150 hover:bg-zinc-900/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Wrench className="h-3 w-3" strokeWidth={1.5} />
                      开发工具
                    </span>
                  </a>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".json,.cshz,.zip,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void importFile(f);
                    }}
                  />
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
                      在「导入预设」里粘贴 JSON、导入文件，或先填入示例试试
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
                        s.scripts && s.scripts.length > 0 ? `${s.scripts.length} 个脚本` : null,
                        s.animations && s.animations.length > 0 ? `${s.animations.length} 段样式` : null,
                        s.pages && s.pages.length > 0 ? `${s.pages.length} 个页面` : null,
                        s.widgets && s.widgets.length > 0 ? `${s.widgets.length} 个小部件` : null,
                        s.layout ? "布局覆写" : null,
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
          </PresenceClass>
        </AnimatePresence>
      </div>

      {/* 预设开发文档 overlay（全屏，高于宿主卡片；Esc 捕获拦截见组件内） */}
      <PresetDocs open={docsOpen} onClose={() => setDocsOpen(false)} />
    </div>
  );
}
