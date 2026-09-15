"use client";

/* ============================================================
 * cs-icons（v8.4.9）— 「初始」自绘图标套件（Dock / 指令面板 / 右键菜单）
 *
 * 缘起：用户反馈「图标的笔画重叠」。对全套在用图标逐根笔画审计后，
 * 仅以下三处存在真交叉 / 视觉撞笔，其余图标（Timer/Command/Settings2 及
 * 面板内 lucide 工具件）均为干净的端点相接（T 触）或留白，维持原样。
 *
 * 审计表（24 网格 / lucide 同款语言：currentColor 描边、圆帽圆角）：
 *   CsCloudSun    原 lucide cloud-sun：太阳弧右端贴着云谷，小尺寸糊成一团
 *                 → 弧半径 4→3.4 并整体上收，弧端与云轮廓净距 ≥ 2.5 格；
 *                   四根光芒线原位保留（本就无接触）。
 *   CsCheckSquare 原 lucide square-check-big：对勾长臂戳出框外，视觉上
 *                 与断开的框角打架 → 改为完整圆角方框 + 对勾完全收进
 *                 框内（勾尾距框边 ≥ 4 格）。
 *   CsNotebookPen 原 lucide notebook-pen：四根装订环横穿左边框（X 交叉
 *                 ×4）→ 环改为止于边框中线的 T 触短须，视觉不变、零穿透；
 *                   本体轮廓（含笔位让位缺口）与笔原样保留（本就干净）。
 *   CsTimer / CsCommand / CsSettings2
 *                 原件无交叉，几何逐字保留（设计零漂移），收入本套件统一管理。
 *
 * strokeWidth 默认 2（与 lucide 默认一致，避免静默变细）；Dock / 右键菜单
 * 按原用法显式传 1.5。Props 与 lucide 组件同签名，可原位替换。
 * ============================================================ */

import type { SVGProps } from "react";

type CsIconProps = SVGProps<SVGSVGElement> & { strokeWidth?: number };

function CsIcon({ strokeWidth = 2, className, children, ...rest }: CsIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/** 天气（设计：云 + 探出半轮太阳 + 四光芒线；弧端与云净距 ≥ 2.5 格） */
export function CsCloudSun(props: CsIconProps) {
  return (
    <CsIcon {...props}>
      <path d="M12 2v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="M20 12h2" />
      <path d="m19.07 4.93-1.41 1.41" />
      <path d="M14.98 12.08a3.4 3.4 0 0 0-4.16-4.16" />
      <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z" />
    </CsIcon>
  );
}

/** 待办（设计：方框 + 对勾；对勾完全收进框内） */
export function CsCheckSquare(props: CsIconProps) {
  return (
    <CsIcon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="m8 12.2 2.7 2.7 5.4-5.8" />
    </CsIcon>
  );
}

/** 便签（设计：装订本 + 笔；装订环改 T 触短须，不再刺穿边框） */
export function CsNotebookPen(props: CsIconProps) {
  return (
    <CsIcon {...props}>
      <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" />
      <path d="M2 6h1.9" />
      <path d="M2 10h1.9" />
      <path d="M2 14h1.9" />
      <path d="M2 18h1.9" />
      <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />
    </CsIcon>
  );
}

/** 番茄钟（几何与 lucide timer 逐字一致，无交叉） */
export function CsTimer(props: CsIconProps) {
  return (
    <CsIcon {...props}>
      <line x1="10" x2="14" y1="2" y2="2" />
      <line x1="12" x2="15" y1="14" y2="11" />
      <circle cx="12" cy="14" r="8" />
    </CsIcon>
  );
}

/** 指令 ⌘（几何与 lucide command 逐字一致，单笔连续无自交） */
export function CsCommand(props: CsIconProps) {
  return (
    <CsIcon {...props}>
      <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
    </CsIcon>
  );
}

/** 设置（几何与 lucide settings-2 逐字一致，滑杆线止于旋钮圆缘为 T 触） */
export function CsSettings2(props: CsIconProps) {
  return (
    <CsIcon {...props}>
      <path d="M14 17H5" />
      <path d="M19 7h-9" />
      <circle cx="17" cy="17" r="3" />
      <circle cx="7" cy="7" r="3" />
    </CsIcon>
  );
}
