/* 「初始」— Dock/面板共用动效常量（beta 重写架构：数值即手感契约，勿轻改）
 *
 * 这些参数是历代调校的定案（面板高度弹簧 / 选框滑动 / 退场曲线 /
 * 关闭卸载时序），与 globals.css 的 .panel-sink 等关键帧严格同参。
 */

import type { PanelId } from "@/lib/startpage/types";

/** 面板标题（壳体 aria-label 与卡片头共用） */
export const PANEL_TITLES: Record<Exclude<PanelId, null>, string> = {
  weather: "天气",
  todo: "待办",
  note: "便签",
  pomodoro: "番茄钟",
  settings: "设置",
};

/* ---------- 动效语言（v1.7.0 预设 motion.profile）----------
 * 面板高度弹簧与选框滑动共用同一参数组；standard 为产品默认手感，
 * playful 即用户可选的 Q 弹档，instant 用于无动效偏好场景 */
export type MotionProfile = "standard" | "playful" | "calm" | "instant";

export type MotionSpring = { type: "spring"; stiffness: number; damping: number; mass?: number };

export const MOTION_PROFILES: Record<MotionProfile, MotionSpring> = {
  standard: { type: "spring", stiffness: 420, damping: 34 },
  playful: { type: "spring", stiffness: 500, damping: 22, mass: 0.9 },
  calm: { type: "spring", stiffness: 240, damping: 30 },
  instant: { type: "spring", stiffness: 700, damping: 42 },
};

/** 选框出场/滑移 Q 弹（backOut 型过冲回弹，非玻璃材质）。
 *  出场（开面板时首次出现）固定用它；切换滑移仅 playful 档采用
 *  （示例预设的动效语言），其余档位恢复基线手感 */
export const POPPING: MotionSpring = { type: "spring", stiffness: 520, damping: 20, mass: 0.9 };

/** 通用缓动（与 globals.css cubic-bezier(0.22,1,0.36,1) 同参） */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** 退场加速曲线（与 globals.css 的 .panel-sink 同参） */
export const EXIT_EASE = [0.4, 0, 1, 1] as const;

/** 收起退场时长（与 .panel-sink 同参，+余量后转入 closed） */
export const SINK_MS = 240;

/** 部件视图最小高度 */
export const WIDGET_H_MIN = 40;

/** 互切底锚律：玻璃卡上下各 1px border（globals.css .glass-card），
 *  窗口目标高须补齐这 2px，落定态卡=壳精确贴合（border 底线不被壳体裁掉） */
export const PANEL_CARD_BORDER = 2;

/** 关闭退场的「切换窗口」：选框退场 0.16s + 面板沉没 0.22s，取 450ms 覆盖双击节奏 */
export const PILL_SWITCH_WINDOW_MS = 450;
