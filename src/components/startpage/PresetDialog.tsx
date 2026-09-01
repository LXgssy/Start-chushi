"use client";

/* 预设导入 / 管理对话框 — 声明式预设的用户入口。
 * 视觉与动效语言对齐指令面板（glass-card + 弹簧入场 + 加速退场），
 * 遮罩点击 / ESC 关闭；导入/管理两个视图的切换复用 dock 面板栏的
 * 「单动作形变」：旧内容原地淡出 + 卡片高度弹簧到新内容高度 + 新内容淡入，
 * 三者重叠为一个连续动作（无先关后开、无两次动画），结构与 PanelStage 同构。
 * 导入支持：粘贴 JSON / 本地文件（.json 预设、.cshz/.zip 预设包，见 pack.ts）。 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileUp, PackageOpen, Plus, Trash2 } from "lucide-react";
import { parsePreset, SAMPLE_PRESET, type InstalledPreset, type PresetPayload } from "@/lib/startpage/preset";
import { parsePack } from "@/lib/startpage/pack";

const SPRING = { type: "spring" as const, stiffness: 460, damping: 38 };
const EXIT_EASE = [0.4, 0, 1, 1] as const;

/** 视图退场：绝对定位钉回内容盒原位（inset 0），在高度形变期间与新视图重叠溶解。
 *  ⚠ 入场淡入不在 framer 内（移交 .panel-rise CSS 关键帧，见 globals.css）：
 *    framer v12 对 opacity 走 WAAPI 加速，内联停在初始 0、动画结束后才补写 1，
 *    空窗期真机整卡闪黑。退场保留 opacity：退场终点是卸载，补写空窗不可见 */
const TAB_EXIT = {
  opacity: 0,
  position: "absolute" as const,
  left: 0,
  right: 0,
  top: 0,
  pointerEvents: "none" as const,
  transition: { duration: 0.2, ease: EXIT_EASE },
};

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
  /* 对话框已开时 palette 再次请求另一视图（导入↔管理）：同步内部 tab */
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => taRef.current?.focus(), 30);
    return () => {
      clearTimeout(t);
      prev?.focus?.();
    };
  }, []);

  /* ---------- 视图内容真实高度：高度形变动画的驱动源（与 Dock PanelStage 同构） ----------
     首开路径（contentH 为 null）禁止在挂载帧回写：同步 setState 构成挂载后一帧内的
     二次渲染，真机上叠加 framer v12 投影重测会打断入场 —— 推迟到入场结束（≈0.5s）
     后武装测高，期间高度盒 auto 直就位（视觉无差异）；切换路径（contentH 已有值）
     立即测高，高度形变不受影响。ResizeObserver 同时兜底视图内部高度变化
     （错误列表出现/消失、管理列表增删），同样平滑跟随 */
  const [contentH, setContentH] = useState<number | null>(null);
  const contentHRef = useRef<number | null>(null);
  useEffect(() => {
    contentHRef.current = contentH;
  }, [contentH]);
  const roRef = useRef<ResizeObserver | null>(null);
  const armRef = useRef<number | null>(null);
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    /* 退场卸载（el=null）不清理：交叉溶解期共享 roRef 已指向新视图的观察器，
       此处误断会让新视图内部高度变化失察（错误列表增删不再跟随）。
       退场视图的 RO 随元素回收（ResizeObserver 对 target 为弱引用） */
    if (!el) return;
    roRef.current?.disconnect();
    roRef.current = null;
    if (armRef.current != null) {
      window.clearTimeout(armRef.current);
      armRef.current = null;
    }
    const attach = () => {
      const update = () => setContentH(el.offsetHeight);
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      roRef.current = ro;
    };
    if (contentHRef.current != null) {
      attach();
    } else {
      armRef.current = window.setTimeout(() => {
        armRef.current = null;
        if (!el.isConnected) return;
        attach();
      }, 500);
    }
  }, []);

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

        {/* 高度盒：视图切换 = 高度 px 弹簧 + 新旧内容重叠溶解（无 layout scale，
            内容全程零畸变）；溢出由卡片 overflow-hidden 裁剪；首开 contentH 为
            null → height auto 直接就位，不参与入场动画。contain:layout 把弹簧
            逐帧 reflow 圈在本盒内部 */}
        <motion.div
          className="relative"
          style={{ contain: "layout" }}
          initial={false}
          animate={{ height: contentH == null ? "auto" : contentH }}
          transition={SPRING}
        >
          <AnimatePresence initial={false}>
            <motion.div key={tab} ref={measureRef} exit={TAB_EXIT} className="flow-root panel-rise">
              {tab === "import" ? (
                <div className="p-4">
                  <p className="mb-2.5 px-1 text-xs font-light leading-relaxed text-zinc-500 dark:text-zinc-400">
                    粘贴预设 JSON 或导入本地文件（.json / .cshz 预设包）— 命令、磁贴与按钮均为声明式白名单动作；
                    scripts 与 pages 运行在隔离沙箱中（拿不到页面数据与扩展 API），可放心安装可信来源的预设。
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
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export default memo(PresetDialog);
