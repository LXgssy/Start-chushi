"use client";

/* ============================================================
 * FxIcon（v1.3.0）— 图标替换作用面的渲染点
 *
 * 预设脚本经 chushi.icons.override({ slot: url }) 声明图标覆写（宿主
 * 白名单校验 https/data:image），page.tsx 合并后经 IconOverrideContext
 * 下发；本组件按槽位名查覆写表——命中则渲染 <img>（不执行 SVG 内脚本，
 * 与声明式 icon 字段同安全律），未命中回落内置 lucide 图标。
 *
 * 槽位清单是产品契约（与 docs/PRESET_DEV.md「图标槽位表」同步维护）：
 *   dock-weather / dock-todo / dock-note / dock-pomodoro / dock-cmdk /
 *   dock-settings / dock-close / searchbar / panel-close
 * 后续版本按需扩充；未覆盖的渲染点不受影响。
 * ============================================================ */

import { createContext, useContext, type ComponentType, type SVGProps } from "react";

export type IconOverrides = Record<string, string>;

export const IconOverrideContext = createContext<IconOverrides>({});

type LucideIcon = ComponentType<SVGProps<SVGSVGElement> & { strokeWidth?: number }>;

export function FxIcon({
  slot,
  fallback: Icon,
  className,
  strokeWidth,
}: {
  slot: string;
  fallback: LucideIcon;
  className?: string;
  strokeWidth?: number;
}) {
  const map = useContext(IconOverrideContext);
  const url = map[slot];
  if (url) {
    return <img src={url} alt="" className={className} draggable={false} />;
  }
  return <Icon className={className} strokeWidth={strokeWidth} />;
}
