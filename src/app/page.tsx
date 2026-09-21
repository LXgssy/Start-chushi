/* 「初始」起始页 — 主页面（beta 重写架构）
 *
 * 结构：StartPageProvider（状态域组装，见 startpage-context.tsx）
 *     + StartPageView（纯编排：页面级事件接线 + 布局树）。
 * 页面级 effect 只保留「跨域接线」类：快捷键、右键菜单拦截、链接编辑事件、
 * 外链提升兜底、弹窗意图消费、首次访问提示——域内 effect 一律在各域 hook。
 */

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import AuroraBackground from "@/components/startpage/AuroraBackground";
import Clock from "@/components/startpage/Clock";
import SearchBar from "@/components/startpage/SearchBar";
import QuickLinks from "@/components/startpage/QuickLinks";
import Dock from "@/components/startpage/Dock";
import CommandPalette from "@/components/startpage/CommandPalette";
import ContextMenu, { CM_ICONS, type ContextMenuAction } from "@/components/startpage/ContextMenu";
import PresetDocs from "@/components/startpage/PresetDocs";
import ZenPomodoro from "@/components/startpage/ZenPomodoro";
import LinkDialog from "@/components/startpage/LinkDialog";
import PresetWidgets from "@/components/startpage/PresetWidgets";
import SandboxPage from "@/components/startpage/SandboxPage";
import { inExtIframe, openExternalUrl } from "@/lib/startpage/nav";
import { useMounted, uid } from "@/hooks/use-start";
import { useToast } from "@/hooks/use-toast";
import { StartPageProvider, useStartPage } from "./startpage/startpage-context";
import { INTENT_KEY, SEEN_KEY } from "./startpage/keys";
import type { StartLink } from "@/lib/startpage/types";

/** 判定按键事件是否发生在输入场景（输入框/可编辑区不抢全局快捷键） */
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
  return (
    <StartPageProvider>
      <StartPageView />
    </StartPageProvider>
  );
}

function StartPageView() {
  const sp = useStartPage();
  const mounted = sp.mounted;
  const { toast } = useToast();

  /* ---------- 弹窗快捷面板「打开完整设置」意图消费 ----------
     popup 写一次性标志后新开标签页；挂载时读后即焚（30s 时效防陈旧触发），
     命中则直接打开设置面板。仅在新标签页启动路径消费。 */
  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = localStorage.getItem(INTENT_KEY);
      if (!raw) return;
      localStorage.removeItem(INTENT_KEY);
      const j = JSON.parse(raw) as { panel?: string; ts?: number };
      if (j?.panel && Date.now() - (j.ts || 0) < 30000) {
        sp.gotoPanel(j.panel as Parameters<typeof sp.gotoPanel>[0]);
      }
    } catch {
      /* 残缺标志静默清理失败也无害 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  /* ---------- 「初始」专属右键菜单：拦截浏览器默认菜单 ----------
     触发判定与 ContextMenu 组件内换位判定同律：输入区/文字选区让路给
     浏览器（复制/翻译/拼写检查是系统级能力），沙箱自定义页让路（页面自己
     决定）；磁贴/添加位自带右键语义（右键即编辑该磁贴），整块让位；
     其余一律 preventDefault 弹「初始」菜单。浮层打开时照常弹出：
     菜单 z-[70] 高于浮层 z-50，glass-card 同源材质不破相。 */
  useEffect(() => {
    if (!mounted) return;
    const onCtx = (e: MouseEvent) => {
      if (sp.activePage != null) return;
      const t = e.target as Element | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (t && typeof t.closest === "function" && t.closest("[data-cl-tile]")) return;
      if (
        t &&
        typeof t.closest === "function" &&
        window.getSelection()?.toString() &&
        t.closest("p, span, h1, h2, h3, a")
      )
        return;
      e.preventDefault();
      sp.setCtxPos({ x: e.clientX, y: e.clientY });
      sp.setCtxMenu(true);
    };
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, [mounted, sp.activePage, sp.setCtxPos, sp.setCtxMenu]);

  /* ---------- 链接编辑事件（来自磁贴的加号 / 编辑按钮 / 长按） ---------- */
  useEffect(() => {
    const onEdit = (e: Event) => {
      const detail = (e as CustomEvent).detail as StartLink | null;
      sp.setEditor({ open: true, editing: detail });
      sp.setPanel(null);
    };
    window.addEventListener("start:edit-link", onEdit);
    return () => window.removeEventListener("start:edit-link", onEdit);
  }, [sp.setEditor, sp.setPanel]);

  /* ---------- 全局快捷键 ----------
     禅模式只认 Esc；⌘K/Ctrl+K 切换命令面板；Esc 按优先级关浮层
     （自定义页自带 Esc，全局避让防双关；右键菜单后开先关）；
     「/」聚焦搜索，任意可打印字符直接开始搜索。 */
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (sp.zen) {
        if (e.key === "Escape") {
          e.preventDefault();
          sp.defrostGlass();
          sp.setZen(false);
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        sp.setCtxMenu(false);
        sp.setDevDocs(false);
        sp.setPaletteOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") {
        if (sp.activePage != null) return;
        if (sp.ctxMenu) {
          sp.setCtxMenu(false);
          return;
        }
        if (sp.devDocs) {
          sp.setDevDocs(false);
          return;
        }
        if (sp.paletteOpen) {
          sp.setPaletteOpen(false);
          return;
        }
        if (sp.editor.open) {
          sp.setEditor({ open: false, editing: null });
          return;
        }
        if (sp.panel != null) {
          sp.setPanel(null);
          return;
        }
        if (sp.dockWidget != null) {
          sp.setDockWidget(null);
          return;
        }
        return;
      }
      /* 快捷服务抽屉打开时同样锁定（打字进搜索会聚焦到已雾化的输入框） */
      const locked =
        sp.paletteOpen ||
        sp.editor.open ||
        sp.panel != null ||
        sp.ctxMenu ||
        sp.devDocs ||
        document.documentElement.classList.contains("cs-drawer");
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
  }, [mounted, sp]);

  /* ---------- v8.4.8 外链提升兜底（扩展壳 iframe「拒绝连接」修复） ----------
     应用跑在壳（shell.html）的全屏 iframe 里：不带 target 的 <a href> 默认
     只在 iframe 内导航，主流站点的 X-Frame-Options 会让整页「拒绝连接」。
     捕获阶段统一拦截普通左键点击的 http(s) 锚点，提升到顶层框架整页打开；
     QuickLinks 磁贴自带同款逻辑（data-cl-tile 标记跳过）；修饰键/中键/
     _blank 均不拦，维持浏览器原生行为。 */
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const t = e.target as Element | null;
      const a = t && typeof t.closest === "function" ? t.closest("a[href]") : null;
      if (!a || a.hasAttribute("data-cl-tile")) return;
      const anchor = a as HTMLAnchorElement;
      if (anchor.target && anchor.target !== "_self") return;
      const href = a.getAttribute("href") || "";
      if (!/^https?:\/\//i.test(href)) return;
      if (!inExtIframe()) return;
      e.preventDefault();
      openExternalUrl(href);
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, []);

  /* ---------- 首次访问提示 ---------- */
  useEffect(() => {
    if (!mounted) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
    } catch {
      return;
    }
    if (seen) return;
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      return;
    }
    toast({
      title: "欢迎使用「初始」",
      description: "直接输入即可搜索 · ⌘K 打开指令面板 · 底部栏常用工具",
      duration: 6500,
    });
  }, [mounted, toast]);

  /* ---------- 动作回调 ---------- */
  const toggleTheme = useCallback(
    () => sp.patchSettings({ themeMode: sp.isDark ? "light" : "dark" }),
    [sp.isDark, sp.patchSettings]
  );

  /* 批量管理磁贴（v1.7.1）：进入磁贴编辑模式（连点/连删/拖拽排序），
     模式内点击空白处退出；与触屏长按进入的同一模式 */
  const manageLinks = useCallback(() => {
    window.dispatchEvent(new CustomEvent("start:links-manage"));
    toast({
      title: "已进入磁贴批量管理",
      description: "点 × 删除 · 点磁贴编辑 · 拖拽排序 · 点击空白处退出",
      duration: 5000,
    });
  }, [toast]);

  const openZen = useCallback(() => sp.setZen(true), [sp.setZen]);
  const openSettings = useCallback(() => sp.gotoPanel("settings"), [sp.gotoPanel]);
  const openDevDocs = useCallback(() => sp.setDevDocs(true), [sp.setDevDocs]);

  /* ---------- 右键菜单动作清单（与 CM_ICONS 同源；run 后菜单自动关闭） ---------- */
  const ctxActions = useMemo<ContextMenuAction[]>(
    () => [
      { id: "palette", label: "指令面板", icon: CM_ICONS.palette, run: sp.openPalette },
      { id: "add-link", label: "添加链接", icon: CM_ICONS.addLink, run: sp.openAddLink },
      { id: "manage-links", label: "批量管理磁贴", icon: CM_ICONS.manageLinks, run: manageLinks },
      { id: "theme", label: "明暗切换", icon: CM_ICONS.theme, run: toggleTheme, sep: true },
      { id: "zen", label: "禅模式", icon: CM_ICONS.zen, run: openZen },
      { id: "settings", label: "设置", icon: CM_ICONS.settings, run: openSettings, sep: true },
      { id: "dev-docs", label: "开发者文档", icon: CM_ICONS.docs, run: openDevDocs },
      { id: "export", label: "导出备份", icon: CM_ICONS.export, run: sp.exportData },
    ],
    [sp.openPalette, sp.openAddLink, manageLinks, toggleTheme, openZen, openSettings, openDevDocs, sp.exportData]
  );

  /* ---------- 沙箱自定义页 overlay 稳定回调 ---------- */
  const notifyFromPage = useCallback(
    (title: string, description?: string) => toast({ title, description }),
    [toast]
  );
  const openUrlFromPage = useCallback((url: string) => {
    openExternalUrl(url);
  }, []);

  /* ---------- 链接保存 / 删除 ---------- */
  const saveLink = useCallback(
    (link: StartLink) => {
      sp.setLinks((prev) =>
        link.id
          ? prev.map((l) => (l.id === link.id ? link : l))
          : [...prev, { ...link, id: uid() }]
      );
      sp.setEditor({ open: false, editing: null });
      toast({ title: link.id ? "链接已更新" : "链接已添加" });
    },
    [sp.setLinks, sp.setEditor, toast]
  );

  const deleteLink = useCallback(
    (id: string) => {
      sp.setLinks((prev) => prev.filter((l) => l.id !== id));
      sp.setEditor({ open: false, editing: null });
      toast({ title: "链接已删除" });
    },
    [sp.setLinks, sp.setEditor, toast]
  );

  /* ---------- 未挂载前的优雅启动画面（配合 head 脚本预置主题，无闪烁） ---------- */
  if (!mounted) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#f6f5f9] dark:bg-[#0a0a0e]">
        <div className="pulse-dot h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-600" />
      </div>
    );
  }

  /* 主列垂直重心（v1.7.2/v1.7.4）：磁贴行数按「常驻添加位」计入估算
     （links+1 槽位），两排时整组上移；pb 换挡配合同帧 padding 过渡不瞬跳 */
  const PB_NORMAL = "pb-[clamp(8rem,22vh,11rem)]";
  const PB_LIFTED = "pb-[clamp(8rem,22vh,11rem)] min-[720px]:pb-[clamp(8rem,30vh,15rem)]";
  const linkRows = Math.ceil((sp.links.length + 1) / (sp.layout.linksColumns ?? 6));
  const mainPb = linkRows === 1 ? PB_LIFTED : PB_NORMAL;
  const linksForm = sp.settings.linksForm ?? "drawer";

  return (
    <div className="relative min-h-dvh">
      <AuroraBackground
        mode={sp.settings.background}
        photoId={sp.settings.photoId}
        wallpaperUrl={sp.settings.wallpaperUrl}
        wallpaperRev={sp.settings.wallpaperRev}
      />

      {/* 禅模式：内容雾化散场由 html.zen + .zen-fade/.search-pill/.zen-dock 各自承载。
          此包裹层绝不动画 opacity/filter——祖先 opacity<1 / filter≠none 会成为
          backdrop root，令内部磨砂玻璃整体失效（磨砂存活原则） */}
      <div style={{ pointerEvents: sp.zen ? ("none" as const) : undefined }}>
        {/* 主内容：布局覆写（layout）在此生效——隐藏区块 / 垂直对齐 / 时钟缩放 /
            磁贴列数；zoom 用于时钟整体缩放（影响布局不重叠） */}
        <main
          className={`relative z-10 mx-auto flex min-h-dvh w-full max-w-4xl flex-col items-center ${
            sp.layout.verticalAlign === "top" ? "justify-start" : "justify-center"
          } px-6 pt-[max(2.5rem,8vh)] transition-[padding] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${mainPb}`}
        >
          <div className="flex flex-col items-center">
            {!sp.layout.hideClock && (
              <section
                className="intro-rise zen-fade"
                style={{ animationDelay: "0.1s", zoom: sp.layout.clockScale ?? 1 }}
                aria-label="时间与问候"
              >
                <Clock settings={sp.settings} preset={sp.presetClock} />
              </section>
            )}

            {/* 搜索：入场上浮移至 .search-pill 自身（玻璃元素祖先禁止 opacity/filter
                动画）；抽屉让位感由纱罩整页高斯模糊承担，搜索栏磨砂恒定在线 */}
            {!sp.layout.hideSearch && (
              <section className="mt-[clamp(1.8rem,6vh,3.5rem)] w-full" aria-label="搜索">
                <div className="flex justify-center">
                  <SearchBar settings={sp.settings} onPatchSettings={sp.patchSettings} />
                </div>
              </section>
            )}

            {/* 快捷服务·常驻形态（settings.linksForm = docked）：磁贴墙一直铺在搜索区
                下方（56px 磁贴）。磁贴墙是玻璃载体（.tile-frost），禅退场挂 .zen-gone
                （visibility+transform 零毒通道），入场交给磁贴自身 */}
            {!sp.layout.hideLinks && linksForm === "docked" && (
              <section
                className="zen-gone mt-[clamp(2rem,8vh,4.5rem)] w-full"
                aria-label="快捷链接"
              >
                <QuickLinks
                  links={sp.links}
                  setLinks={sp.setLinks}
                  iconStyle={sp.settings.iconStyle}
                  columns={sp.layout.linksColumns}
                  form="docked"
                />
              </section>
            )}

            {/* 抽屉形态布局占位（隐形克隆）：抽屉形态磁贴 portal 到 body 不占主列 →
                居中列变矮，时钟/搜索整体下移。invisible 克隆常驻补回同高，两种形态
                时钟/搜索严格同位（切换零位移）。探针以 .cl-layout-ghost 豁免克隆 */}
            {!sp.layout.hideLinks && linksForm === "drawer" && (
              <section
                aria-hidden
                className="cl-layout-ghost invisible mt-[clamp(2rem,8vh,4.5rem)] w-full"
              >
                <QuickLinks
                  links={sp.links}
                  setLinks={sp.setLinks}
                  iconStyle={sp.settings.iconStyle}
                  columns={sp.layout.linksColumns}
                  form="docked"
                />
              </section>
            )}
          </div>
        </main>

        {/* 快捷服务·抽屉形态（默认）：页面空白处中键单击唤出，自 portal 到 body
            （纱罩整页高斯模糊，Dock 点击自动收起）；hideLinks 时整体停用 */}
        {!sp.layout.hideLinks && linksForm === "drawer" && (
          <QuickLinks
            links={sp.links}
            setLinks={sp.setLinks}
            iconStyle={sp.settings.iconStyle}
            columns={sp.layout.linksColumns}
            form="drawer"
          />
        )}

        {/* 底部 Dock：入场上浮移至 nav.dock-intro 自身，禅雾化走 .zen-dock */}
        <Dock />
      </div>

      {/* 禅模式迷你时钟覆盖层：常驻 DOM + .zen-overlay CSS 过渡（visibility 离散
          插值：进禅即时可见/退禅末帧隐没）。「CSS 常驻 + visibility 离散插值」
          是条件渲染浮层的结构免疫形态——exit 卸载链路的滞留幽灵与卸载元素合成
          层缓存两类病灶从结构上不存在。迷你时钟常驻：时间热状态，进禅零延迟。
          ZenPomodoro 保持 zen 条件挂载：到点结算/chime/toast 仅禅内生效（与
          PomodoroPanel 互斥写者语义不变，常驻会改变写者拓扑）。 */}
      <div
        className="zen-overlay fixed inset-0 z-20 flex flex-col items-center justify-center"
        aria-hidden={!sp.zen}
      >
        <Clock settings={sp.settings} preset={sp.presetClock} mini />
        {sp.zen && <ZenPomodoro settings={sp.settings} tone={sp.zenHintTone} />}
        <p
          ref={sp.zenHintRef}
          data-tone={sp.zenHintTone}
          className="zen-hint mt-10 text-[11px] font-extralight tracking-[0.42em]"
        >
          双击任意处或按 ESC 退出
        </p>
      </div>

      {/* 命令面板（内嵌预设系统视图） */}
      <CommandPalette
        open={sp.paletteOpen}
        onClose={sp.closePalette}
        links={sp.links}
        runSearch={sp.runSearch}
        toggleTheme={toggleTheme}
        themeIsDark={sp.isDark}
        setPanel={sp.gotoPanel}
        openAddLink={sp.openAddLink}
        exportData={sp.exportData}
        presetCommands={sp.presetCommandsAll}
        runPresetAction={sp.runPresetAction}
        presets={sp.presets}
        onInstall={sp.installPreset}
        onRemove={sp.removePreset}
        onInstallOfficial={sp.installOfficialPreset}
      />

      {/* 自定义页面 overlay（沙箱隔离） */}
      <SandboxPage
        page={sp.activePage}
        onClose={sp.closePage}
        onNotify={notifyFromPage}
        onOpenUrl={openUrlFromPage}
      />

      {/* 预设小部件层（角落磁贴 + API 路由；dock 部件渲染在 Dock 统一舞台） */}
      <PresetWidgets
        widgets={sp.presetWidgets}
        isDark={sp.isDark}
        accent={sp.settings.accent}
        onNotify={notifyFromPage}
        onOpenUrl={openUrlFromPage}
        dockPanelKey={sp.dockWidget}
        onCloseDockPanel={sp.closeDockWidget}
        heights={sp.widgetHeights}
        onResize={sp.onWidgetResize}
      />

      {/* 链接编辑对话框 */}
      <LinkDialog
        state={sp.editor}
        onClose={sp.closeEditor}
        onSave={saveLink}
        onDelete={deleteLink}
      />

      {/* 「初始」专属右键菜单（拦截浏览器默认菜单） */}
      <ContextMenu
        open={sp.ctxMenu}
        pos={sp.ctxPos}
        actions={ctxActions}
        onClose={sp.closeCtxMenu}
      />

      {/* 开发者文档（右键菜单直达；portal 到 body，与 ⌘K 内入口同一组件） */}
      <PresetDocs open={sp.devDocs} onClose={() => sp.setDevDocs(false)} />

      {/* 右下角落款 */}
      <footer
        aria-hidden
        className={`pointer-events-none fixed bottom-5 right-6 z-10 hidden select-none text-[10px] font-extralight tracking-[0.5em] text-zinc-400/70 transition-opacity duration-500 sm:block dark:text-zinc-500/70 ${
          sp.zen ? "opacity-0" : ""
        }`}
      >
        初 始
      </footer>
    </div>
  );
}
