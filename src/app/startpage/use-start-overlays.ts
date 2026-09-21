"use client";

/* 「初始」— 浮层域：功能面板 / dock 弹出面板 / ⌘K / 链接编辑器 / 右键菜单 /
 *           开发者文档 / 沙箱自定义页
 *
 * 互斥律：同一时刻至多一个浮层开启（遮罩/动画语义成立的前提）。
 *  · 打开内建面板 → 同帧收起 dock 弹出面板（gotoPanel 单帧批量，v2.0.1 律：
 *    两帧间隙里选框/舞台双活会让互切走两段式开/关）；
 *  · 打开 dock 弹出面板 → 同帧收起内建面板（toggleDockWidget）。
 */

import { useCallback, useEffect, useState } from "react";
import { emitEditLink } from "@/components/startpage/QuickLinks";
import type { LinkEditorState } from "@/components/startpage/LinkDialog";
import type { ActivePage } from "@/components/startpage/SandboxPage";
import type { PanelId } from "@/lib/startpage/types";

export function useStartOverlays() {
  /** 当前打开的功能面板（null = 全关） */
  const [panel, setPanel] = useState<PanelId>(null);
  /** dock 表面小部件弹出面板（v1.8.2）：widget 运行时复合键，null = 关闭 */
  const [dockWidget, setDockWidget] = useState<string | null>(null);
  /** ⌘K 指令面板 */
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** 链接编辑器（磁贴加号 / 编辑按钮 / 长按唤起） */
  const [editor, setEditor] = useState<LinkEditorState>({ open: false, editing: null });
  /** 「初始」专属右键菜单（contextmenu 事件里记录坐标后置 open） */
  const [ctxMenu, setCtxMenu] = useState(false);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  /** 开发者文档（右键菜单直达入口；组件内部 portal 到 body） */
  const [devDocs, setDevDocs] = useState(false);
  /** 正在展示的预设自定义页面（沙箱 overlay） */
  const [activePage, setActivePage] = useState<ActivePage | null>(null);

  /* 面板与 dock 弹出面板互斥（反向互斥在 toggleDockWidget 内） */
  useEffect(() => {
    if (panel != null) setDockWidget(null);
  }, [panel]);

  /** 打开/切换功能面板：与 dock 弹出面板单帧批量互斥 */
  const gotoPanel = useCallback((p: PanelId) => {
    setPanel(p);
    setDockWidget(null);
  }, []);

  /** 打开/关闭 dock 弹出面板：与内建面板单帧批量互斥 */
  const toggleDockWidget = useCallback((key: string) => {
    setPanel(null);
    setDockWidget((k) => (k === key ? null : key));
  }, []);

  const closeDockWidget = useCallback(() => setDockWidget(null), []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeEditor = useCallback(() => setEditor({ open: false, editing: null }), []);
  /** 磁贴加号 → 链接编辑器（磁贴侧经 start:edit-link 事件唤起，见 page 接线） */
  const openAddLink = useCallback(() => emitEditLink(null), []);
  const closeCtxMenu = useCallback(() => setCtxMenu(false), []);
  const closePage = useCallback(() => setActivePage(null), []);

  /** 进禅模式时收起所有浮层（设置器全部稳定，回调恒定） */
  const closeAllOverlays = useCallback(() => {
    setPanel(null);
    setDockWidget(null);
    setPaletteOpen(false);
    setEditor({ open: false, editing: null });
    setCtxMenu(false);
    setDevDocs(false);
  }, []);

  return {
    panel,
    setPanel,
    dockWidget,
    setDockWidget,
    paletteOpen,
    setPaletteOpen,
    editor,
    setEditor,
    ctxMenu,
    setCtxMenu,
    ctxPos,
    setCtxPos,
    devDocs,
    setDevDocs,
    activePage,
    setActivePage,
    gotoPanel,
    toggleDockWidget,
    closeDockWidget,
    openPalette,
    closePalette,
    closeEditor,
    openAddLink,
    closeCtxMenu,
    closePage,
    closeAllOverlays,
  };
}
