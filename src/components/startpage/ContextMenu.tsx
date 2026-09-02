"use client";

/* 「初始」专属右键菜单（v1.1.1）— 替代浏览器默认右键，把起始页最常用的动作
 * 放到指尖最近处。设计律：
 *  - 菜单是一块小 glass-card（会随液态玻璃引擎折射，视觉与全 app 同源）；
 *  - 触发：window contextmenu 委托；输入场景（输入框/可编辑区）与文字选区
 *    保留浏览器原生菜单（复制/翻译/拼写检查是系统级能力，不抢）；
 *  - 边界翻转：右/下缘放不下时向左/上展开；
 *  - 关闭：外点 / 点击菜单项 / Esc / 再按右键换位；开启时阻断 dblclick 禅模式
 *    （由 page.tsx 把 contextMenu 状态并入双击守卫）；
 *  - 焦点：不程序化 focus（避免 focus-visible 蓝框律），Esc 由 page.tsx 全局链关闭；
 *  - 无点击穿透：开启时铺一层透明捕获层（fixed inset-0）吃掉一切指针事件。
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { PresenceClass } from "./PresenceClass";
import {
  BookOpen,
  Command,
  Download,
  Images,
  Leaf,
  Plus,
  Settings2,
  SunMoon,
} from "lucide-react";

export interface ContextMenuAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  run: () => void;
  /** 分组分隔线：渲染在该项之前 */
  sep?: boolean;
}

export default function ContextMenu({
  open,
  pos: initialPos,
  actions,
  onClose,
}: {
  open: boolean;
  /** 打开坐标（宿主在 contextmenu 事件里记录传入）；open 期间再次右键由组件内换位 */
  pos: { x: number; y: number };
  /** 打开期间由宿主注入动作清单（label/run 均为稳定回调） */
  actions: ContextMenuAction[];
  onClose: () => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number }>(initialPos);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /* 宿主每次请求打开都同步最新坐标——React 官方「渲染期间调整 state」模式
   * （不用 effect：effect 内同步 setState 会级联渲染，react-hooks 律） */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPos(initialPos);
  }

  /* contextmenu 委托（开菜单后的再次右键 = 换位）：只记录原始坐标，
   * 边界 clamp/翻转统一在渲染期做（打开与换位共享同一份定位逻辑） */
  useEffect(() => {
    if (!open) return;
    const onCtx = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (t && typeof t.closest === "function" && window.getSelection()?.toString() && t.closest("p, span, h1, h2, h3, a")) {
        return; // 文字选区上保留原生复制/搜索菜单
      }
      e.preventDefault();
      setPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, [open]);

  /* 打开瞬间聚焦容器以便 blur 外点？不——用捕获层处理外点，容器不抢焦点 */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  /* 边界翻转：右/下缘放不下时向左/上展开（预留估宽 176px、估高按动作数，
   * clamp 到 8px 边距）。渲染期计算——宿主打开与组件内换位两路都经此收敛。
   * 翻转方向同时决定弹出动画的 transformOrigin（v1.1.2）：菜单总是
   * 「从鼠标点长出来」——向下展开用 top 原点、向上展开用 bottom、
   * 向右展开用 left、向左展开用 right。 */
  const estW = 176;
  const estH = actions.length * 34 + 12;
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const flipX = pos.x + estW > vw - 8;
  const flipY = pos.y + estH > vh - 8;
  const left = flipX ? Math.max(8, pos.x - estW) : pos.x;
  const top = flipY ? Math.max(8, pos.y - estH) : pos.y;
  const origin = `${flipY ? "bottom" : "top"} ${flipX ? "right" : "left"}`;

  return (
    <AnimatePresence>
      {open && (
        <PresenceClass
          key="ctx-overlay"
          exitClass="veil-out"
          duration={0.14}
          className="fixed inset-0 z-[70]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onClose();
          }}
        >
          <PresenceClass
            ref={menuRef}
            exitClass="ctx-out"
            duration={0.12}
            className="ctx-in glass-card fixed z-[71] w-44 rounded-xl p-1 shadow-xl"
            style={{ left, top, transformOrigin: origin }}
            role="menu"
            aria-label="初始快捷菜单"
          >
            {actions.map((a) => (
              <div key={a.id}>
                {a.sep && <div className="mx-2 my-1 h-px bg-zinc-900/[0.06] dark:bg-white/[0.06]" />}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    a.run();
                    onClose();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-xs font-light text-zinc-600 transition-colors duration-150 hover:bg-zinc-900/[0.06] hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-zinc-50"
                >
                  <span className="text-zinc-400 dark:text-zinc-500 [&>svg]:h-3.5 [&>svg]:w-3.5">
                    {a.icon}
                  </span>
                  {a.label}
                </button>
              </div>
            ))}
          </PresenceClass>
        </PresenceClass>
      )}
    </AnimatePresence>
  );
}

/* ---------- 动作图标集中导出（page.tsx 组装 actions 用） ---------- */
export const CM_ICONS = {
  palette: <Command strokeWidth={1.5} />,
  addLink: <Plus strokeWidth={1.5} />,
  theme: <SunMoon strokeWidth={1.5} />,
  zen: <Leaf strokeWidth={1.5} />,
  wallpaper: <Images strokeWidth={1.5} />,
  settings: <Settings2 strokeWidth={1.5} />,
  export: <Download strokeWidth={1.5} />,
  docs: <BookOpen strokeWidth={1.5} />,
};
