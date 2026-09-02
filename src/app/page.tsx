/* 「初始」起始页 — 主页面编排 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AuroraBackground from "@/components/startpage/AuroraBackground";
import Clock from "@/components/startpage/Clock";
import SearchBar from "@/components/startpage/SearchBar";
import QuickLinks, { emitEditLink } from "@/components/startpage/QuickLinks";
import Dock from "@/components/startpage/Dock";
import CommandPalette from "@/components/startpage/CommandPalette";
import ContextMenu, { CM_ICONS, type ContextMenuAction } from "@/components/startpage/ContextMenu";
import PresetDocs from "@/components/startpage/PresetDocs";
import ZenPomodoro from "@/components/startpage/ZenPomodoro";
import LinkDialog, { type LinkEditorState } from "@/components/startpage/LinkDialog";
import PresetWidgets, { type ActiveWidget } from "@/components/startpage/PresetWidgets";
import SandboxPage, { type ActivePage } from "@/components/startpage/SandboxPage";
import {
  dockIcon,
  type InstalledPreset,
  type PresetAction,
  type PresetEffects,
  type PresetLayout,
  type PresetPayload,
} from "@/lib/startpage/preset";
import { activateLiquidGlass, deactivateLiquidGlass } from "@/lib/startpage/liquid-glass";
import {
  sandboxBridge,
  type SandboxCommandInfo,
  type SandboxScript,
} from "@/lib/startpage/sandbox";
import { useMounted, useStored, readLS, writeLS, uid } from "@/hooks/use-start";
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
  presets: "start:presets",
  sandboxFrozen: "start:sandbox-frozen",
};

/** 预设 action 中 script / page 类型的 id 展开为本预设内复合键（运行时再由桥/overlay 路由） */
function resolvePresetAction(a: PresetAction, presetId: string): PresetAction {
  if (a.type === "script" || a.type === "page") {
    return { type: a.type, id: `${presetId}:${a.id}` } as PresetAction;
  }
  return a;
}

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
  const [presets, setPresets] = useStored<InstalledPreset[]>(KEYS.presets, []);

  /* ---------- 界面状态 ---------- */
  const [panel, setPanel] = useState<PanelId>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [editor, setEditor] = useState<LinkEditorState>({ open: false, editing: null });
  const [weather, setWeather] = useState<WeatherState>(INITIAL_WEATHER);
  const [isDark, setIsDark] = useState(true);
  const [zen, setZen] = useState(false);
  /** 「初始」专属右键菜单（见 ContextMenu；contextmenu 事件里记录坐标后置 open） */
  const [ctxMenu, setCtxMenu] = useState(false);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  /** 开发者文档（右键菜单直达入口；组件内部 portal 到 body，不在 ⌘K 宿主内） */
  const [devDocs, setDevDocs] = useState(false);
  /** 正在展示的预设自定义页面（沙箱 overlay） */
  const [activePage, setActivePage] = useState<ActivePage | null>(null);

  /* ---------- 沙箱 JS（高阶模式）状态：冻结标记持久化 + 运行时注册的命令 */
  const [frozenScripts, setFrozenScripts] = useState<Record<string, boolean>>(() =>
    readLS<Record<string, boolean>>(KEYS.sandboxFrozen, {})
  );
  const [scriptCmds, setScriptCmds] = useState<SandboxCommandInfo[]>([]);

  const patchSettings = useCallback(
    (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [setSettings]
  );

  const markFrozen = useCallback((key: string) => {
    setFrozenScripts((prev) => {
      const next = { ...prev, [key]: true };
      writeLS(KEYS.sandboxFrozen, next);
      return next;
    });
  }, []);

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

  /* ---------- 预设自定义 CSS（animations 字段，导入时已净化）----------
     单一 <style> 承载全部已装预设的样式，安装顺序即优先级；
     删除预设即整体重算，无残留 */
  const presetCss = useMemo(
    () =>
      presets
        .flatMap((p) => (p.raw.animations ?? []).map((a) => `/* ${p.name} · ${a.name ?? a.id} */\n${a.css}`))
        .join("\n"),
    [presets]
  );
  useEffect(() => {
    if (!mounted) return;
    let el = document.getElementById("chushi-preset-css") as HTMLStyleElement | null;
    if (!presetCss) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = "chushi-preset-css";
      document.head.appendChild(el);
    }
    el.textContent = presetCss;
  }, [mounted, presetCss]);

  /* ---------- 预设布局覆写派生：安装顺序后者胜，删除预设即还原 ---------- */
  const layout = useMemo<PresetLayout>(() => {
    const merged: PresetLayout = {};
    for (const p of presets) {
      const l = p.raw.layout;
      if (l) Object.assign(merged, l);
    }
    return merged;
  }, [presets]);

  /* ---------- 预设视觉效果派生（effects）：与 layout 同律，安装顺序后者胜 ---------- */
  const effects = useMemo<PresetEffects>(() => {
    const merged: PresetEffects = {};
    for (const p of presets) {
      const e = p.raw.effects;
      if (e) Object.assign(merged, e);
    }
    return merged;
  }, [presets]);

  /* ---------- 液态玻璃引擎：声明式激活，参数变化即重算，删除预设即还原。
     引擎为宿主内建（不执行预设代码）；不支持 backdrop-filter: url() 的
     浏览器返回 false，保持磨砂现状（降级安全） ---------- */
  useEffect(() => {
    if (!mounted) return;
    if (effects.glass) {
      activateLiquidGlass(effects.glass);
    } else {
      deactivateLiquidGlass();
    }
    return () => {
      /* 严格模式双挂载防线：卸载时彻底还原，重挂载时 effect 重新激活 */
      deactivateLiquidGlass();
    };
  }, [mounted, effects]);

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
        paletteOpen ||
        ctxMenu
      )
        return;
      setZen((z) => !z);
    };
    window.addEventListener("dblclick", onDblClick);
    return () => window.removeEventListener("dblclick", onDblClick);
  }, [mounted, panel, editor.open, paletteOpen, ctxMenu]);

  /* ---------- 进入禅模式时收起所有浮层 ---------- */
  useEffect(() => {
    if (zen) {
      setPanel(null);
      setPaletteOpen(false);
      setEditor({ open: false, editing: null });
      setCtxMenu(false);
      setDevDocs(false);
    }
  }, [zen]);

  /* ---------- 「初始」专属右键菜单：拦截浏览器默认菜单 ----------
   * 触发判定与 ContextMenu 组件内换位判定同律：输入区/文字选区让路给
   * 浏览器（复制/翻译/拼写检查是系统级能力），沙箱自定义页让路
   * （页面自己决定）；其余一律 preventDefault 弹「初始」菜单。
   * 浮层（⌘K/面板/对话框）打开时照常弹出：菜单 z-[70] 高于浮层 z-50，
   * glass-card 同源材质不破相。 */
  useEffect(() => {
    if (!mounted) return;
    const onCtx = (e: MouseEvent) => {
      if (activePage != null) return;
      const t = e.target as Element | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (
        t &&
        typeof t.closest === "function" &&
        window.getSelection()?.toString() &&
        t.closest("p, span, h1, h2, h3, a")
      )
        return;
      e.preventDefault();
      setCtxPos({ x: e.clientX, y: e.clientY });
      setCtxMenu(true);
    };
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, [mounted, activePage]);
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
        setCtxMenu(false);
        setDevDocs(false);
        setPaletteOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") {
        /* 自定义页面 overlay 自带 Esc 关闭，全局避让防双关；
           右键菜单后开先关（z 最高），开发者文档自带捕获拦截（通常
           到不了这里，此处兜底）；之后依次 ⌘K → 链接编辑器 → 面板 */
        if (activePage != null) return;
        if (ctxMenu) {
          setCtxMenu(false);
          return;
        }
        if (devDocs) {
          setDevDocs(false);
          return;
        }
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
      const locked = paletteOpen || editor.open || panel != null || ctxMenu || devDocs;
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
  }, [mounted, paletteOpen, editor.open, panel, zen, activePage, ctxMenu, devDocs]);

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

  /* ---------- 右键菜单动作清单（与 CM_ICONS 同源；run 后菜单自动关闭） ---------- */
  const closeCtxMenu = useCallback(() => setCtxMenu(false), []);
  const openZen = useCallback(() => setZen(true), []);
  const openSettings = useCallback(() => gotoPanel("settings"), [gotoPanel]);
  const openDevDocs = useCallback(() => setDevDocs(true), []);
  const ctxActions = useMemo<ContextMenuAction[]>(
    () => [
      { id: "palette", label: "指令面板", icon: CM_ICONS.palette, run: openPalette },
      { id: "add-link", label: "添加链接", icon: CM_ICONS.addLink, run: openAddLink },
      { id: "theme", label: "明暗切换", icon: CM_ICONS.theme, run: toggleTheme, sep: true },
      { id: "zen", label: "禅模式", icon: CM_ICONS.zen, run: openZen },
      { id: "settings", label: "设置", icon: CM_ICONS.settings, run: openSettings, sep: true },
      { id: "dev-docs", label: "开发者文档", icon: CM_ICONS.docs, run: openDevDocs },
      { id: "export", label: "导出备份", icon: CM_ICONS.export, run: exportData },
    ],
    [openPalette, openAddLink, toggleTheme, openZen, openSettings, openDevDocs, exportData]
  );

  /* ---------- 预设系统（声明式，白名单 action，零代码执行） ----------
     置于 runSearch/toggleTheme 等稳定回调之后：依赖数组在定义时求值，
     放早了会 TDZ 崩页 */
  const installPreset = useCallback(
    (payload: PresetPayload) => {
      setPresets((prev) => [
        ...prev,
        {
          id: uid(),
          name: payload.name,
          author: payload.author,
          installedAt: Date.now(),
          raw: payload,
        },
      ]);
      /* 磁贴一次性合入（url 去重，重复导入不产生副本） */
      if (payload.links.length > 0) {
        setLinks((prev) => {
          const seen = new Set(prev.map((l) => l.url.replace(/\/+$/, "")));
          const add = payload.links
            .filter((l) => !seen.has(l.url.replace(/\/+$/, "")))
            .map((l) => ({ id: uid(), name: l.name, url: l.url }));
          return add.length > 0 ? [...prev, ...add] : prev;
        });
      }
      /* 设置白名单字段一次性合并（用户可再改） */
      if (payload.settings) patchSettings(payload.settings);
      const extras = [
        payload.scripts?.length ? `${payload.scripts.length} 个脚本` : null,
        payload.animations?.length ? `${payload.animations.length} 段样式` : null,
        payload.pages?.length ? `${payload.pages.length} 个页面` : null,
        payload.widgets?.length ? `${payload.widgets.length} 个小部件` : null,
        payload.layout ? "布局覆写" : null,
        payload.effects?.glass ? "液态玻璃" : null,
      ].filter(Boolean);
      toast({
        title: `预设「${payload.name}」已安装`,
        description: [
          `新增 ${payload.commands.length} 条命令、${payload.dock.length} 个栏按钮、${payload.links.length} 个磁贴`,
          extras.length > 0 ? extras.join(" · ") : null,
        ]
          .filter(Boolean)
          .join("；"),
      });
    },
    [setPresets, setLinks, patchSettings, toast]
  );

  const removePreset = useCallback(
    (id: string) => {
      setPresets((prev) => {
        const target = prev.find((p) => p.id === id);
        if (target) toast({ title: `预设「${target.name}」已移除` });
        return prev.filter((p) => p.id !== id);
      });
      /* 顺手清理该预设脚本的冻结标记（重新导入即全新实例，自动解冻） */
      setFrozenScripts((prev) => {
        const next: Record<string, boolean> = {};
        for (const k of Object.keys(prev)) if (!k.startsWith(`${id}:`)) next[k] = prev[k];
        if (Object.keys(next).length !== Object.keys(prev).length) {
          writeLS(KEYS.sandboxFrozen, next);
          return next;
        }
        return prev;
      });
    },
    [setPresets, toast]
  );

  /* ---------- 沙箱 JS（高阶模式）：脚本派生 ----------
     置于 presetCommands/presetDock 之前：依赖数组定义时求值（TDZ 律） */
  const sandboxScripts = useMemo<SandboxScript[]>(
    () =>
      presets.flatMap((p) =>
        (p.raw.scripts ?? []).map((sc) => ({
          key: `${p.id}:${sc.id}`,
          presetName: p.name,
          name: sc.name ?? sc.id,
          code: sc.code,
        }))
      ),
    [presets]
  );
  const activeSandboxScripts = useMemo(
    () => sandboxScripts.filter((sc) => !frozenScripts[sc.key]),
    [sandboxScripts, frozenScripts]
  );
  /** 激活脚本键集：声明式 script 命令/按钮只在此集合内的脚本上展示（冻结即隐藏） */
  const activeScriptKeys = useMemo(
    () => new Set(activeSandboxScripts.map((sc) => sc.key)),
    [activeSandboxScripts]
  );

  /* 预设命令/dock 项派生：装了即生效，删除即失效（无隐藏状态）。
     script action 在此展开为 `${presetId}:${scriptId}` 复合键；
     引用未激活（冻结/无沙箱）脚本的项在此隐藏，避免幽灵命令 */
  const presetCommands = useMemo(
    () =>
      presets.flatMap((p) =>
        p.raw.commands.flatMap((c, i) => {
          if (c.action.type === "script" && !activeScriptKeys.has(`${p.id}:${c.action.id}`)) {
            return [];
          }
          return [
            {
              title: c.title,
              action: resolvePresetAction(c.action, p.id),
              key: `${p.id}:${i}`,
              presetName: p.name,
            },
          ];
        })
      ),
    [presets, activeScriptKeys]
  );
  const presetDock = useMemo(
    () =>
      presets.flatMap((p) =>
        p.raw.dock.flatMap((d, i) => {
          if (d.action.type === "script" && !activeScriptKeys.has(`${p.id}:${d.action.id}`)) {
            return [];
          }
          return [
            {
              title: d.title,
              icon: d.icon,
              action: resolvePresetAction(d.action, p.id),
              key: `${p.id}:d${i}`,
            },
          ];
        })
      ),
    [presets, activeScriptKeys]
  );

  /* 预设角落小部件派生：装了即生效，删除即失效（与命令/dock 同律） */
  const presetWidgets = useMemo<ActiveWidget[]>(
    () =>
      presets.flatMap((p) =>
        (p.raw.widgets ?? []).map((w) => ({
          key: `${p.id}:${w.id}`,
          presetName: p.name,
          name: w.name ?? w.id,
          corner: w.corner ?? ("top-left" as const),
          width: w.width ?? 216,
          height: w.height ?? 88,
          html: w.html,
        }))
      ),
    [presets]
  );

  /* ---------- 沙箱桥事件与同步生命周期 ---------- */
  useEffect(() => {
    sandboxBridge.onEvent = (ev) => {
      switch (ev.kind) {
        case "commands":
          setScriptCmds((prev) => [
            ...prev.filter((c) => c.scriptKey !== ev.scriptKey),
            ...ev.commands,
          ]);
          break;
        case "notify":
          toast({ title: ev.title, description: ev.description || undefined });
          break;
        case "open":
          if (/^https:\/\//i.test(ev.url)) window.location.href = ev.url;
          break;
        case "copy":
          navigator.clipboard
            .writeText(ev.text)
            .then(() => toast({ title: "已复制", description: ev.text.slice(0, 30) + (ev.text.length > 30 ? "…" : "") }))
            .catch(() => toast({ title: "复制失败", description: "浏览器未授权剪贴板" }));
          break;
        case "error":
          toast({ title: "沙箱脚本", description: ev.message });
          break;
        case "frozen":
          markFrozen(ev.key);
          toast({
            title: `脚本「${ev.name}」已自动停用`,
            description: "启动超时（疑似死循环）；删除并重新导入该预设可恢复",
            duration: 8000,
          });
          break;
      }
    };
    return () => {
      sandboxBridge.onEvent = null;
    };
  }, [toast, markFrozen]);

  useEffect(() => {
    sandboxBridge.sync(activeSandboxScripts);
  }, [activeSandboxScripts]);

  /* 预设变更后同步清理失主脚本（删除/冻结）的运行时命令条目 */
  useEffect(() => {
    setScriptCmds((prev) => {
      const next = prev.filter((c) => activeScriptKeys.has(c.scriptKey));
      return next.length === prev.length ? prev : next;
    });
  }, [activeScriptKeys]);

  /* 沙箱脚本运行时注册的命令 → ⌘K 派生项（与声明式命令同组展示） */
  const sandboxDerivedCommands = useMemo(
    () =>
      scriptCmds.map((c) => ({
        title: c.title,
        action: { type: "script", id: `${c.scriptKey}:${c.id}` } as PresetAction,
        key: `sc:${c.scriptKey}:${c.id}`,
        presetName: c.presetName,
      })),
    [scriptCmds]
  );
  const allPresetCommands = useMemo(
    () => [...presetCommands, ...sandboxDerivedCommands],
    [presetCommands, sandboxDerivedCommands]
  );

  const runPresetAction = useCallback(
    (a: PresetAction) => {
      switch (a.type) {
        case "open":
          window.location.href = a.url;
          break;
        case "search":
          runSearch(a.engine, a.q);
          break;
        case "panel":
          setPanel(a.id);
          break;
        case "theme":
          patchSettings({ themeMode: a.mode });
          break;
        case "copy":
          navigator.clipboard
            .writeText(a.text)
            .then(() => toast({ title: "已复制", description: a.text.slice(0, 30) + (a.text.length > 30 ? "…" : "") }))
            .catch(() => toast({ title: "复制失败", description: "浏览器未授权剪贴板" }));
          break;
        case "script": {
          /* id = `${presetId}:${scriptId}`（入口）或 `${presetId}:${scriptId}:${cmdId}`（命令），
             由沙箱内统一路由（命令表优先，其次脚本入口 chushi.run） */
          const ok = sandboxBridge.invoke(a.id);
          if (!ok) {
            toast({
              title: "沙箱未运行",
              description: "脚本已停用或初始化失败；删除并重新导入预设可恢复",
            });
          }
          break;
        }
        case "page": {
          /* id = `${presetId}:${pageId}`，从已装预设找回页面 HTML */
          const sep = a.id.indexOf(":");
          const presetId = sep > 0 ? a.id.slice(0, sep) : "";
          const pageId = sep > 0 ? a.id.slice(sep + 1) : "";
          const pg = presets
            .find((p) => p.id === presetId)
            ?.raw.pages?.find((x) => x.id === pageId);
          if (!pg) {
            toast({ title: "页面不存在", description: "预设可能已更新或删除，重新导入可恢复" });
            break;
          }
          setActivePage({ key: a.id, name: pg.name ?? pageId, html: pg.html });
          break;
        }
      }
    },
    [runSearch, patchSettings, toast, presets]
  );

  /* 预设导入/管理入口 = 指令面板内嵌视图（PresetPanel）：指令面板原地形变为
     预设系统面板，无独立对话框 */

  /* ---------- 自定义页面 overlay 稳定回调 ---------- */
  const closePage = useCallback(() => setActivePage(null), []);
  const notifyFromPage = useCallback(
    (title: string, description?: string) => toast({ title, description }),
    [toast]
  );
  const openUrlFromPage = useCallback((url: string) => {
    window.location.href = url;
  }, []);

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
      {/* 主内容：布局覆写（layout）在此生效——隐藏区块 / 垂直对齐 / 时钟缩放 / 磁贴列数；
          zoom 用于时钟整体缩放（影响布局不重叠，Firefox 126+/Chromium/WebKit 均已标准化） */}
      <main
        className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-4xl flex-col items-center ${
          layout.verticalAlign === "top" ? "justify-start" : "justify-center"
        } px-6 pt-[max(2.5rem,8vh)] pb-44`}
      >
        <div className="flex flex-col items-center">
          {!layout.hideClock && (
            <section
              className="intro-rise zen-fade"
              style={{ animationDelay: "0.1s", zoom: layout.clockScale ?? 1 }}
              aria-label="时间与问候"
            >
              <Clock settings={settings} />
            </section>
          )}

          {/* 搜索：入场上浮移至 .search-pill 自身（玻璃元素祖先禁止 opacity/filter 动画） */}
          {!layout.hideSearch && (
            <section className="mt-[clamp(1.8rem,6vh,3.5rem)] w-full" aria-label="搜索">
              <div className="flex justify-center">
                <SearchBar settings={settings} onPatchSettings={patchSettings} />
              </div>
            </section>
          )}

          {!layout.hideLinks && (
            <section
              className="intro-rise zen-fade mt-[clamp(2rem,8vh,4.5rem)] w-full"
              style={{ animationDelay: "0.38s" }}
              aria-label="快捷链接"
            >
              <QuickLinks links={links} setLinks={setLinks} iconStyle={settings.iconStyle} columns={layout.linksColumns} />
            </section>
          )}
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
        presetDock={presetDock}
        onRunAction={runPresetAction}
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

      {/* 命令面板（内嵌预设系统视图，见 PresetPanel） */}
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
        presetCommands={allPresetCommands}
        runPresetAction={runPresetAction}
        presets={presets}
        onInstall={installPreset}
        onRemove={removePreset}
      />

      {/* 自定义页面 overlay（沙箱隔离，见 SandboxPage / sandbox.js pageMode） */}
      <SandboxPage
        page={activePage}
        onClose={closePage}
        onNotify={notifyFromPage}
        onOpenUrl={openUrlFromPage}
      />

      {/* 预设角落小部件层（沙箱隔离，见 PresetWidgets / sandbox.js widgetMode） */}
      <PresetWidgets
        widgets={presetWidgets}
        isDark={isDark}
        accent={settings.accent}
        onNotify={notifyFromPage}
        onOpenUrl={openUrlFromPage}
 />

      {/* 链接编辑对话框 */}
      <LinkDialog
        state={editor}
        onClose={closeEditor}
        onSave={saveLink}
        onDelete={deleteLink}
      />

      {/* 「初始」专属右键菜单（拦截浏览器默认菜单，见 ContextMenu） */}
      <ContextMenu
        open={ctxMenu}
        pos={ctxPos}
        actions={ctxActions}
        onClose={closeCtxMenu}
      />

      {/* 开发者文档（右键菜单直达；portal 到 body，与 ⌘K 内入口同一组件） */}
      <PresetDocs open={devDocs} onClose={() => setDevDocs(false)} />

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
