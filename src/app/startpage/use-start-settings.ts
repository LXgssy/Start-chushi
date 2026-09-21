"use client";

/* 「初始」— 设置状态域：主题 / 强调色 / 流畅模式 / 焦点归位
 *
 * 职责边界：只持有 settings 与它的四个全局落地 effect。
 * 预设令牌对同一 CSS 变量的覆写在 useStartPresets 中（声明序在其后，
 * 同键时预设胜——焕新语义，见该文件令牌注入节）。
 */

import { useCallback, useEffect, useState } from "react";
import { useStored } from "@/hooks/use-start";
import { DEFAULT_DURATIONS, DEFAULT_SETTINGS, type Settings } from "@/lib/startpage/types";
import { KEYS } from "./keys";

export function useStartSettings(mounted: boolean) {
  const [settings, setSettings] = useStored<Settings>(KEYS.settings, DEFAULT_SETTINGS);
  const [isDark, setIsDark] = useState(true);

  const patchSettings = useCallback(
    (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [setSettings]
  );

  /* ---------- 旧版本设置字段迁移：缺失字段补默认值（含番茄钟时长嵌套合并） ---------- */
  useEffect(() => {
    setSettings((prev) => ({
      ...DEFAULT_SETTINGS,
      ...prev,
      pomodoro: { ...DEFAULT_DURATIONS, ...(prev.pomodoro ?? {}) },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- 主题应用 ----------
     跟随系统 / 手动档双模式；移动端切后台换主题后回来事件可能不触发，
     visibilitychange / pageshow 主动重评估。 */
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

  /* ---------- 强调色（CSS 变量驱动全局点缀色） ----------
     v8.2.3 浮窗主题色跟随：镜像到 chrome.storage.local.cardAcc，悬浮音乐卡
     内容脚本在任意网页读取 + onChanged 热跟随（网页 / gh-pages 环境无
     chrome，安全跳过 = 恒默认紫）。 */
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.style.setProperty("--ui-accent", settings.accent);
    try {
      const ext = (window as unknown as {
        chrome?: { storage?: { local?: { set?: (o: Record<string, string>) => void } } };
      }).chrome;
      if (ext?.storage?.local && typeof ext.storage.local.set === "function") {
        ext.storage.local.set({ cardAcc: settings.accent });
      }
    } catch {
      /* 非 extension 环境 */
    }
  }, [mounted, settings.accent]);

  /* ---------- 流畅模式（低配电脑优化） ----------
     html.cs-lite 全局降级类：globals.css 据此把磨砂玻璃换成纯色底、停装饰
     动画与长驻合成层。入口两处：扩展弹窗快捷面板（popup.js 直改同一
     localStorage 键）与设置面板；跨文档实时跟随靠 storage 事件（同文档
     修改不触发 storage 事件，自身路径走 settings.perfLite 依赖）。 */
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.classList.toggle("cs-lite", !!settings.perfLite);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEYS.settings || e.newValue == null) return;
      try {
        const next = JSON.parse(e.newValue) as { perfLite?: boolean };
        root.classList.toggle("cs-lite", !!next.perfLite);
      } catch {
        /* 残缺 JSON 忽略 */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [mounted, settings.perfLite]);

  /* ---------- 新标签页焦点归位（settings.noOmniboxFocus 门控） ----------
     Chrome 打开新标签页时焦点在地址栏（omnibox）——开关打开时在挂载后
     短窗内把焦点偷回页面：body 设 tabIndex=-1 后 focus()，敲键自然落入
     全局 type-to-search（body 聚焦不挡 window 键事件）。只在前 ~1.2s 抢
     （多次重试赢 Chrome 的焦点竞速），页面内已有具体焦点元素一律不碰，
     之后绝不和用户抢。真正让出地址栏焦点是壳层的自发导航（shell-bridge
     focusRouting），页面内只补一次抢焦点。 */
  useEffect(() => {
    document.documentElement.dataset.csFocusGate = settings.noOmniboxFocus ? "page" : "omnibox";
    if (!mounted || !settings.noOmniboxFocus) return;
    const body = document.body;
    body.dataset.csFocusSteal = "1"; /* tabIndex 未设时 body 默认即 -1，不可作证据 */
    if (body.tabIndex !== -1) body.tabIndex = -1;
    const t0 = Date.now();
    const steal = () => {
      const ae = document.activeElement;
      if (ae === body || ae === document.documentElement) {
        body.focus({ preventScroll: true });
      }
    };
    const timers = [30, 120, 260, 450, 700, 1000].map((d) => window.setTimeout(steal, d));
    const onFocus = () => {
      if (Date.now() - t0 < 1200) steal();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      timers.forEach((t) => clearTimeout(t));
      window.removeEventListener("focus", onFocus);
    };
  }, [mounted, settings.noOmniboxFocus]);

  return { mounted, settings, setSettings, isDark, patchSettings };
}
