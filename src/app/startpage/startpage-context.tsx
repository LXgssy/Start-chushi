"use client";

/* 「初始」起始页 — 全局上下文（beta 重写架构）
 *
 * 架构律：
 *  · 状态按职责分五个域 hook（settings/data/overlays/presets/zen），
 *    Provider 只做组装，不再有任何业务状态；
 *  · 所有动作回调必须 useCallback 稳定（消费方 PanelStage/Dock 依赖引用
 *    稳定性做 memo 跳渲染——番茄钟每秒滴答在 Dock 内部
 *    useSyncExternalStore，不惊动 Provider）；
 *  · 域 hook 调用序即 effect 注册序：settings（强调色）必须先于
 *    presets（主题令牌）——同键 --ui-accent 时预设令牌胜（焕新语义）。
 */

import { createContext, useContext } from "react";
import { useMounted } from "@/hooks/use-start";
import { useToast } from "@/hooks/use-toast";
import { useStartSettings } from "./use-start-settings";
import { useStartData } from "./use-start-data";
import { useStartOverlays } from "./use-start-overlays";
import { useStartPresets } from "./use-start-presets";
import { useStartZen } from "./use-start-zen";

export interface StartPageValue
  extends ReturnType<typeof useStartSettings>,
    ReturnType<typeof useStartData>,
    ReturnType<typeof useStartOverlays>,
    ReturnType<typeof useStartPresets>,
    ReturnType<typeof useStartZen> {}

const StartPageCtx = createContext<StartPageValue | null>(null);

/** 消费全局上下文（仅 StartPageProvider 子树内可用） */
export function useStartPage(): StartPageValue {
  const v = useContext(StartPageCtx);
  if (!v) throw new Error("useStartPage 必须在 StartPageProvider 内使用");
  return v;
}

export function StartPageProvider({ children }: { children: React.ReactNode }) {
  const mounted = useMounted();
  const { toast } = useToast();

  /* 域组装（顺序即 effect 注册序，勿调整） */
  const settingsDomain = useStartSettings(mounted);
  const overlays = useStartOverlays();
  const data = useStartData(
    mounted,
    toast,
    settingsDomain.setSettings,
    settingsDomain.settings
  );
  const zen = useStartZen({
    mounted,
    panelOpen: overlays.panel != null,
    editorOpen: overlays.editor.open,
    paletteOpen: overlays.paletteOpen,
    ctxMenuOpen: overlays.ctxMenu,
    closeAllOverlays: overlays.closeAllOverlays,
  });
  const presetsDomain = useStartPresets({
    mounted,
    accent: settingsDomain.settings.accent,
    patchSettings: settingsDomain.patchSettings,
    setLinks: data.setLinks,
    setDockWidget: overlays.setDockWidget,
    gotoPanel: overlays.gotoPanel,
    setActivePage: overlays.setActivePage,
    toast,
  });

  const value: StartPageValue = {
    ...settingsDomain,
    ...data,
    ...overlays,
    ...presetsDomain,
    ...zen,
  };

  return <StartPageCtx.Provider value={value}>{children}</StartPageCtx.Provider>;
}
