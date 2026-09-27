"use client";

/* 命令面板式部件弹窗（v8.7.27 palette 展示面）——用户：「把网易云播放器整体
 * 重写改成命令面板这种弹窗样式，而不是从dock栏弹出的样式」。
 *
 * 开合语言与 CommandPalette（⌘K）同源：雾化遮罩（bg-white/10 + backdrop-blur-md，
 * 非黑色遮罩）+ 居中玻璃卡（glass-card max-w-[560px] rounded-2xl shadow-2xl）+
 * Q 弹弹簧入场（y/scale 过冲）。与 dock 统一舞台（PanelStage 底锚弹出）并存：
 * display:"palette" 的 dock 部件由此组件承载，其余部件照走舞台，按钮注册/
 * 面板互斥/chushi.close() 关闭链路两态完全一致。
 *
 * 架构律：iframe 随页面常驻预热（与舞台同律——挂载即 renderWidget，开合只切
 * 显隐，零白屏零重载，部件状态跨开合存活）；帧经 widgetFrameSet 注册进共享
 * 注册表 → PresetWidgets 的 API 消息路由/主题广播/SMTC/beat 通道零改动复用。
 * 关键坑：backdrop-filter 元素收起态不能只靠 opacity:0——层仍在合成树，遮罩
 * 语义必须 visibility 联动（延迟到退场淡出播完再隐藏）；收起态全程
 * pointer-events:none 防隐形层吞点击。
 *
 * z 层序：遮罩 z-30（与 dock 关闭遮罩同层）——dock nav（z-40）恒在其上，
 * 弹窗开着仍可点 dock 换功能/再点播放器按钮收起（dock 舞台时代行为不变）。
 */

import { memo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { sandboxWidgetSrc } from "@/lib/startpage/sandbox";
import { postToWidget, widgetFrameSet } from "@/lib/startpage/widget-frames";
import type { ActiveWidget } from "./PresetWidgets";

/* ⌘K 同源 Q 弹（SPRING_CARD 同参）：过冲回弹一次，收起走短促淡出 */
const SPRING_CARD = { type: "spring" as const, stiffness: 480, damping: 22, mass: 0.9 };

function WidgetPalette(props: {
  /** display==="palette" 的 dock 部件清单（Dock 过滤后传入） */
  widgets: ActiveWidget[];
  /** 当前打开的 dock 部件键（null = 全收） */
  openKey: string | null;
  /** 部件自报高度（chushi.resize → 页面 widgetHeights，与舞台同一信号源） */
  heights: Record<string, number>;
  isDark: boolean;
  accent: string;
  /** 收起（遮罩点击 / dock 再点 / 沙箱 chushi.close() 同一入口） */
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  if (props.widgets.length === 0) return null;
  return (
    <>
      {props.widgets.map((w) => {
        const open = props.openKey === w.key;
        const h = Math.max(320, Math.round(props.heights[w.key] ?? w.height));
        return (
          <div
            key={w.key}
            data-widget={w.key}
            aria-hidden={!open}
            className="fixed inset-0 z-30 flex items-center justify-center px-4 bg-white/10 backdrop-blur-md backdrop-saturate-150 dark:bg-black/10"
            style={{
              /* 收起：opacity 0 + visibility 延迟隐藏（等 0.18s 淡出播完）——
                 backdrop-filter 层若只靠 opacity:0 仍在合成树，visibility 才
                 真正摘除；展开态立即恢复可见（入场淡入无延迟） */
              visibility: open ? "visible" : "hidden",
              transition: `visibility 0s linear ${open ? "0s" : "0.18s"}`,
              opacity: open ? 1 : 0,
              transitionProperty: "visibility, opacity",
              transitionDuration: open ? "0s, 0.22s" : "0s, 0.18s",
              transitionTimingFunction: "ease",
              pointerEvents: open ? "auto" : "none",
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && open) props.onClose();
            }}
          >
            <motion.div
              initial={false}
              animate={open ? { y: 0, scale: 1 } : { y: 18, scale: 0.94 }}
              transition={
                reduceMotion
                  ? { duration: 0.12 }
                  : open
                    ? SPRING_CARD
                    : { duration: 0.18, ease: "easeIn" }
              }
              style={{ transformOrigin: "center center", willChange: "transform" }}
              role={open ? "dialog" : undefined}
              aria-modal={open ? "true" : undefined}
              aria-label={w.name}
              className="glass-card relative w-full max-w-[560px] overflow-hidden rounded-2xl shadow-2xl"
            >
              <iframe
                ref={(el) => {
                  widgetFrameSet(w.key, el);
                }}
                src={sandboxWidgetSrc()}
                onLoad={() => {
                  /* 常驻预热：挂载即渲染（与舞台同律）；panelMode 同 dock——
                     部件直开展开态且 chushi.close() 映射 closePanel */
                  postToWidget(w.key, {
                    type: "renderWidget",
                    key: w.key,
                    html: w.html,
                    theme: props.isDark ? "dark" : "light",
                    accent: props.accent,
                    panelMode: true,
                  });
                }}
                title={`初始弹窗：${w.name}`}
                className="block w-full border-0 bg-transparent"
                style={{ height: `${h}px` }}
                sandbox="allow-scripts"
              />
            </motion.div>
          </div>
        );
      })}
    </>
  );
}

export default memo(WidgetPalette);
