/* 「初始」起始页 — 主页面编排 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AuroraBackground from "@/components/startpage/AuroraBackground";
import Clock from "@/components/startpage/Clock";
import SearchBar from "@/components/startpage/SearchBar";
import QuickLinks, { emitEditLink } from "@/components/startpage/QuickLinks";
import Dock from "@/components/startpage/Dock";
import CommandPalette from "@/components/startpage/CommandPalette";
import ZenPomodoro from "@/components/startpage/ZenPomodoro";
import LinkDialog, { type LinkEditorState } from "@/components/startpage/LinkDialog";
import { useMounted, useStored, uid } from "@/hooks/use-start";
import {
  DEFAULT_SETTINGS,
  DEFAULT_DURATIONS,
  INITIAL_WEATHER,
  type Place,
  type PanelId,
  type Settings,
  type StartLink,
  type TodoItem,
  type WeatherState,
} from "@/lib/startpage/types";
import { fetchForecast, readWeatherSnapshot, writeWeatherSnapshot } from "@/lib/startpage/weather";
import { getEngine } from "@/lib/startpage/engines";
import { sampleCoverLuminance } from "@/lib/startpage/luminance";
import { useToast } from "@/hooks/use-toast";

const KEYS = {
  settings: "start:settings",
  links: "start:links",
  todos: "start:todos",
  note: "start:note",
  place: "start:place",
};

const DEFAULT_LINKS: StartLink[] = [
  { id: "gh", name: "GitHub", url: "https://github.com" },
  { id: "bili", name: "哔哩哔哩", url: "https://www.bilibili.com" },
  { id: "zhihu", name: "知乎", url: "https://www.zhihu.com" },
  { id: "yt", name: "YouTube", url: "https://www.youtube.com" },
  { id: "weibo", name: "微博", url: "https://weibo.com" },
  { id: "163music", name: "网易云音乐", url: "https://music.163.com" },
];

const EASE = [0.22, 1, 0.36, 1] as const;

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (el as HTMLElement).isContentEditable === true
  );
}

export default function Home() {
  const mounted = useMounted();
  const { toast } = useToast();

  /* ---------- 持久化状态 ---------- */
  const [settings, setSettings] = useStored<Settings>(KEYS.settings, DEFAULT_SETTINGS);
  const [links, setLinks] = useStored<StartLink[]>(KEYS.links, DEFAULT_LINKS);
  const [todos, setTodos] = useStored<TodoItem[]>(KEYS.todos, []);
  const [note, setNote] = useStored<string>(KEYS.note, "");
  const [place, setPlace] = useStored<Place>(KEYS.place, {});

  /* ---------- 界面状态 ---------- */
  const [panel, setPanel] = useState<PanelId>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [editor, setEditor] = useState<LinkEditorState>({ open: false, editing: null });
  const [weather, setWeather] = useState<WeatherState>(INITIAL_WEATHER);
  const [isDark, setIsDark] = useState(true);
  const [zen, setZen] = useState(false);

  const patchSettings = useCallback(
    (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [setSettings]
  );

  /* ---------- 主题应用 ---------- */
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark =
        settings.themeMode === "dark" || (settings.themeMode === "system" && mq.matches);
      root.classList.toggle("dark", dark);
      root.style.colorScheme = dark ? "dark" : "light";
      setIsDark(dark);
    };
    apply();
    mq.addEventListener("change", apply);
    /* 移动端切后台换主题后回到页面时事件可能不触发，主动重评估 */
    const reapply = () => {
      if (settings.themeMode === "system") apply();
    };
    document.addEventListener("visibilitychange", reapply);
    window.addEventListener("pageshow", reapply);
    return () => {
      mq.removeEventListener("change", apply);
      document.removeEventListener("visibilitychange", reapply);
      window.removeEventListener("pageshow", reapply);
    };
  }, [mounted, settings.themeMode]);

  /* ---------- 强调色（CSS 变量驱动全局点缀色） ---------- */
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.style.setProperty("--ui-accent", settings.accent);
  }, [mounted, settings.accent]);

  /* ---------- 旧版本设置字段迁移（缺失字段补默认值） ---------- */
  useEffect(() => {
    setSettings((prev) => ({
      ...DEFAULT_SETTINGS,
      ...prev,
      pomodoro: { ...DEFAULT_DURATIONS, ...(prev.pomodoro ?? {}) },
    }));
  }, []);

  /* ---------- 天气获取（成功落快照，失败回退快照+自动重试） ---------- */
  useEffect(() => {
    if (!mounted) return;
    if (place.lat == null || place.lon == null) return;
    let cancelled = false;

    async function load() {
      setWeather((w) => ({ ...w, loading: true }));
      try {
        const r = await fetchForecast(place);
        if (!cancelled) {
          writeWeatherSnapshot(r);
          setWeather({
            ...r,
            loading: false,
            error: null,
            city: place.name ?? "",
            staleAt: null,
          });
        }
      } catch (e) {
        if (cancelled) return;
        /* 限流/断网回退：展示最近一次成功快照（面板标注缓存时间） */
        const snap = readWeatherSnapshot();
        if (snap) {
          setWeather({
            ...snap.data,
            loading: false,
            error: null,
            city: place.name ?? "",
            staleAt: snap.at,
          });
        } else {
          setWeather((w) => ({
            ...w,
            loading: false,
            error: e instanceof Error ? e.message : "天气获取失败，请检查网络后重试",
          }));
        }
      }
    }

    load();
    const t = setInterval(load, 30 * 60 * 1000);
    /* 网络恢复即刻重试（限流回退态最常见的恢复路径） */
    const onOnline = () => {
      if (!cancelled) load();
    };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener("online", onOnline);
    };
  }, [mounted, place]);

  /* ---------- 双击禅模式 + Edge 双击菜单抑制 ---------- */
  useEffect(() => {
    if (!mounted) return;
    const onDblClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      // 输入场景保留双击选词，其余场景阻止浏览器默认行为（Edge 菜单）
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      if (!t || typeof t.closest !== "function") return;
      // 交互元素上的双击不进入禅模式
      if (
        t.closest(
          "button, a, nav, [role='dialog'], [role='tablist'], [role='radiogroup']"
        ) ||
        panel != null ||
        editor.open ||
        paletteOpen
      )
        return;
      setZen((z) => !z);
    };
    window.addEventListener("dblclick", onDblClick);
    return () => window.removeEventListener("dblclick", onDblClick);
  }, [mounted, panel, editor.open, paletteOpen]);

  /* ---------- 进入禅模式时收起所有浮层 ---------- */
  useEffect(() => {
    if (zen) {
      setPanel(null);
      setPaletteOpen(false);
      setEditor({ open: false, editing: null });
    }
  }, [zen]);
  /* ---------- 禅模式挂 html.zen 类：雾化散场/聚拢由 CSS 各自承载（见 globals.css 磨砂玻璃存活原则） ---------- */
  useEffect(() => {
    document.documentElement.classList.toggle("zen", zen);
  }, [zen]);

  /* ---------- 禅模式提示词墨色：掠影下随壁纸明暗自适应（浅底深字 / 深底浅字） ----------
   * 从当前壁纸缩略图采样提示词所在区域的感知亮度，叠乘掠影压暗遮罩的
   * 合成衰减后判定：辉光/纯净底色恒定，不做采样，保持主题默认色。
   * 禅模式内无法换壁纸（面板已收起），进禅采样一次即稳定。 */
  const zenHintRef = useRef<HTMLParagraphElement | null>(null);
  const [zenHintTone, setZenHintTone] = useState<"auto" | "on-dark" | "on-light">("auto");

  useEffect(() => {
    if (!zen) {
      setZenHintTone("auto");
      return;
    }
    let alive = true;
    (async () => {
      if (!document.documentElement.classList.contains("photo-mode")) return;
      const img = document.querySelector<HTMLImageElement>("img[data-wallpaper]");
      const el = zenHintRef.current;
      if (!img || !el) return;
      const src = img.dataset.thumb || img.currentSrc || img.src;
      await new Promise<void>((r) => requestAnimationFrame(() => r())); // 等提示词布局就位
      if (!alive) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const lum = await sampleCoverLuminance(
        src,
        { x: r.left, y: r.top, w: r.width, h: r.height },
        { w: window.innerWidth, h: window.innerHeight }
      );
      if (!alive || lum == null) return;
      /* 压暗遮罩在屏幕中段的合成不透明度：平底 0.18 与渐变中段 0.12 叠乘
         ≈ 0.278；黑色遮罩下透亮率 L′ = L·(1−0.18)·(1−0.12) ≈ L·0.722。
         阈值 0.3：按深/浅墨最终混合色的对比交叉点推导 ≈ 0.294，取 0.3 */
      const shown = lum * (1 - 0.18) * (1 - 0.12);
      setZenHintTone(shown >= 0.3 ? "on-light" : "on-dark");
    })();
    return () => {
      alive = false;
    };
  }, [zen]);
  /* ---------- 链接编辑事件（来自磁贴的加号 / 编辑按钮 / 长按） ---------- */
  useEffect(() => {
    const onEdit = (e: Event) => {
      const detail = (e as CustomEvent).detail as StartLink | null;
      setEditor({ open: true, editing: detail });
      setPanel(null);
    };
    window.addEventListener("start:edit-link", onEdit);
    return () => window.removeEventListener("start:edit-link", onEdit);
  }, []);

  /* ---------- 全局快捷键 ---------- */
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      // 禅模式下仅响应 Esc 退出
      if (zen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setZen(false);
        }
        return;
      }
      // ⌘K / Ctrl+K 切换命令面板
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") {
        if (paletteOpen) {
          setPaletteOpen(false);
          return;
        }
        if (editor.open) {
          setEditor({ open: false, editing: null });
          return;
        }
        if (panel != null) {
          setPanel(null);
          return;
        }
        return;
      }
      // 「/」聚焦搜索；任意可打印字符直接开始搜索
      const locked = paletteOpen || editor.open || panel != null;
      if (locked || isTypingTarget(document.activeElement)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "/") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("start:focus-search"));
      } else if (e.key.length === 1 && e.key !== " ") {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("start:focus-search", { detail: { char: e.key } })
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, paletteOpen, editor.open, panel, zen]);

  /* ---------- 首次访问提示 ---------- */
  useEffect(() => {
    if (!mounted) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem("start:seen");
    } catch {
      return;
    }
    if (seen) return;
    try {
      localStorage.setItem("start:seen", "1");
    } catch {
      return;
    }
    toast({
      title: "欢迎使用「初始」",
      description: "直接输入即可搜索 · ⌘K 打开指令面板 · 底部栏常用工具",
      duration: 6500,
    });
  }, [mounted]);

  /* ---------- 数据管理 ---------- */
  const exportData = useCallback(() => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      links,
      todos,
      note,
      place,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `初始-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: "已导出备份文件" });
  }, [settings, links, todos, note, place, toast]);

  const importData = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const d = JSON.parse(String(reader.result));
          if (typeof d !== "object" || d == null) throw new Error("bad file");
          if (d.settings && typeof d.settings === "object") {
            setSettings({ ...DEFAULT_SETTINGS, ...d.settings });
          }
          if (Array.isArray(d.links)) setLinks(d.links as StartLink[]);
          if (Array.isArray(d.todos)) setTodos(d.todos as TodoItem[]);
          if (typeof d.note === "string") setNote(d.note);
          if (d.place && typeof d.place === "object") setPlace(d.place as Place);
          toast({ title: "导入完成", description: "数据已恢复" });
        } catch {
          toast({ title: "导入失败", description: "文件格式不正确" });
        }
      };
      reader.readAsText(file);
    },
    [setSettings, setLinks, setTodos, setNote, setPlace, toast]
  );

  const resetAll = useCallback(() => {
    for (const key of Object.values(KEYS)) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* noop */
      }
    }
    window.location.reload();
  }, []);

  /* ---------- 稳定引用回调：panel 切换时 memo 子树（时钟/搜索/链接/背景/面板）可整体跳过渲染 ---------- */
  const commitNote = useCallback((v: string) => setNote(v), [setNote]);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeEditor = useCallback(() => setEditor({ open: false, editing: null }), []);
  const gotoPanel = useCallback((p: PanelId) => setPanel(p), []);
  const openAddLink = useCallback(() => emitEditLink(null), []);
  const runSearch = useCallback((engineId: string, q: string) => {
    const engine = getEngine(engineId);
    window.location.href = engine.search(q);
  }, []);
  const toggleTheme = useCallback(
    () =>
      patchSettings({
        themeMode: isDark ? ("light" as const) : ("dark" as const),
      }),
    [isDark, patchSettings]
  );

  /* ---------- 链接保存 / 删除 ---------- */
  const saveLink = useCallback(
    (link: StartLink) => {
      setLinks((prev) =>
        link.id
          ? prev.map((l) => (l.id === link.id ? link : l))
          : [...prev, { ...link, id: uid() }]
      );
      setEditor({ open: false, editing: null });
      toast({ title: link.id ? "链接已更新" : "链接已添加" });
    },
    [setLinks, toast]
  );

  const deleteLink = useCallback(
    (id: string) => {
      setLinks((prev) => prev.filter((l) => l.id !== id));
      setEditor({ open: false, editing: null });
      toast({ title: "链接已删除" });
    },
    [setLinks, toast]
  );

  /* 未挂载前的优雅启动画面（配合 head 脚本预置主题，无闪烁） */
  if (!mounted) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#f6f5f2] dark:bg-[#0a0a0e]">
        <div className="pulse-dot h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600" />
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh">
      <AuroraBackground mode={settings.background} photoId={settings.photoId} />

      {/* 禅模式：内容雾化散场由 html.zen + .zen-fade/.search-pill/.zen-dock 各自承载。
          此包裹层绝不动画 opacity/filter——祖先 opacity<1 / filter≠none 会成为 backdrop root，
          令内部磨砂玻璃整体失效直至动画结束才瞬跳恢复（v21 前 reload/禅切换的病根） */}
      <div style={{ pointerEvents: zen ? ("none" as const) : undefined }}>
      {/* 主内容 */}
      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-4xl flex-col items-center justify-center px-6 pt-[max(2.5rem,8vh)] pb-44">
        <div className="flex flex-col items-center">
          <section
            className="intro-rise zen-fade"
            style={{ animationDelay: "0.1s" }}
            aria-label="时间与问候"
          >
            <Clock settings={settings} />
          </section>

          {/* 搜索：入场上浮移至 .search-pill 自身（玻璃元素祖先禁止 opacity/filter 动画） */}
          <section className="mt-[clamp(1.8rem,6vh,3.5rem)] w-full" aria-label="搜索">
            <div className="flex justify-center">
              <SearchBar settings={settings} onPatchSettings={patchSettings} />
            </div>
          </section>

          <section
            className="intro-rise zen-fade mt-[clamp(2rem,8vh,4.5rem)] w-full"
            style={{ animationDelay: "0.38s" }}
            aria-label="快捷链接"
          >
            <QuickLinks links={links} setLinks={setLinks} iconStyle={settings.iconStyle} />
          </section>
        </div>
      </main>

      {/* 底部 Dock：入场上浮移至 nav.dock-intro 自身，禅雾化走 .zen-dock
          （原 framer 包裹层 opacity 动画会隔死 dock 磨砂，已移除） */}
      <Dock
        panel={panel}
        setPanel={setPanel}
        weather={weather}
        place={place}
        onPlaceChange={setPlace}
        todos={todos}
        setTodos={setTodos}
        note={note}
        commitNote={commitNote}
        settings={settings}
        patchSettings={patchSettings}
        openPalette={openPalette}
        exportData={exportData}
        importData={importData}
        resetAll={resetAll}
      />
      </div>

      {/* 禅模式迷你时钟 */}
      <AnimatePresence>
        {zen && (
          <motion.div
            key="zen-clock"
            className="fixed inset-0 z-20 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <Clock settings={settings} mini />
            {/* 迷你番茄钟：仅在计时运行时浮现（暂停/静止不显示），墨色随采样 tone 同步 */}
            <ZenPomodoro settings={settings} tone={zenHintTone} />
            <p
              ref={zenHintRef}
              data-tone={zenHintTone}
              className="zen-hint mt-10 text-[11px] font-extralight tracking-[0.42em]"
            >
              双击任意处或按 ESC 退出
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 命令面板 */}
      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
        links={links}
        runSearch={runSearch}
        toggleTheme={toggleTheme}
        themeIsDark={isDark}
        setPanel={gotoPanel}
        openAddLink={openAddLink}
        exportData={exportData}
      />

      {/* 链接编辑对话框 */}
      <LinkDialog
        state={editor}
        onClose={closeEditor}
        onSave={saveLink}
        onDelete={deleteLink}
      />

      {/* 右下角落款 */}
      <footer
        aria-hidden
        className={`pointer-events-none fixed bottom-5 right-6 z-10 hidden select-none text-[10px] font-extralight tracking-[0.5em] text-zinc-400/70 transition-opacity duration-500 sm:block dark:text-zinc-500/70 ${
          zen ? "opacity-0" : ""
        }`}
      >
        初 始
      </footer>
    </div>
  );
}
