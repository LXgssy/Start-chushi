"use client";

/* 「初始」— 禅模式域：双击进出 / Esc 退出 / 退禅磨砂复原双保险 / 提示词墨色采样
 *
 * 退禅磨砂复原双保险（v8.6.34）：三玻璃载体（搜索药丸/dock/磁贴墙）禅态挂
 * opacity+blur 雾化（用户指令「改回模糊过渡」），玻璃祖先毒物令磨砂采样在
 * 禅窗内失效；Chrome 层缓存可能令退禅移除毒物后磨砂常数帧乃至持续不复原
 * （v8.6.22/32/33 三案实证）。defrostGlass 在 html.zen 移除前同步执行：
 * display:none 往返 + 双 reflow 强制销毁毒物层缓存历史，磨砂参与者随新层
 * 重建百分百复原；getAnimations({subtree}) cancel 抑制 display 重置引发的
 * 入场动画重播（显影由 opacity/filter 过渡独占承载，与时钟段同语言）。
 * 重挂全程元素处于 visibility:hidden 禅态——用户无感。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { sampleCoverLuminance } from "@/lib/startpage/luminance";

export type ZenHintTone = "auto" | "on-dark" | "on-light";

/** 禅模式提示词墨色判定的亮度阈值（按深/浅墨最终混合色的对比交叉点推导 ≈0.294，取 0.3） */
const HINT_TONE_THRESHOLD = 0.3;

export function useStartZen({
  mounted,
  panelOpen,
  editorOpen,
  paletteOpen,
  ctxMenuOpen,
  closeAllOverlays,
}: {
  mounted: boolean;
  /** 双击进禅的排除条件：功能面板开启 */
  panelOpen: boolean;
  /** 排除条件：链接编辑器开启 */
  editorOpen: boolean;
  /** 排除条件：⌘K 开启 */
  paletteOpen: boolean;
  /** 排除条件：右键菜单开启 */
  ctxMenuOpen: boolean;
  /** 进禅瞬间收起全部浮层（稳定回调） */
  closeAllOverlays: () => void;
}) {
  const [zen, setZen] = useState(false);
  /* zenRef：dblclick 切换 effect 的依赖不含 zen（闭包陈旧规避），退禅分支经由此镜像判断 */
  const zenRef = useRef(false);
  useEffect(() => {
    zenRef.current = zen;
  }, [zen]);

  const defrostGlass = useCallback(() => {
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>(".search-pill, .zen-dock, .zen-gone")
    )) {
      el.style.display = "none";
      void document.body.offsetWidth;
      el.style.display = "";
      void document.body.offsetWidth;
      for (const a of el.getAnimations({ subtree: true })) a.cancel();
    }
  }, []);

  /* ---------- 双击禅模式 + Edge 双击菜单抑制 ----------
     输入场景保留双击选词；交互元素（按钮/链接/nav/对话框）上的双击不进禅。 */
  useEffect(() => {
    if (!mounted) return;
    const onDblClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      if (!t || typeof t.closest !== "function") return;
      if (
        t.closest("button, a, nav, [role='dialog'], [role='tablist'], [role='radiogroup']") ||
        /* v8.7.21 抽屉磁贴墙守卫：链接抽屉（中键唤出的全屏磁贴墙）开着时，
           墙面空白处双击不进禅——墙内空白区不是交互元素，closest 链拦不住；
           html.cs-drawer 由 QuickLinks 挂载态同步 effect 维护（挂载即挂类），
           是最可靠的归属面。禅与抽屉本互斥：进禅收浮层，抽屉开着不进禅。 */
        document.documentElement.classList.contains("cs-drawer") ||
        panelOpen ||
        editorOpen ||
        paletteOpen ||
        ctxMenuOpen
      )
        return;
      if (zenRef.current) defrostGlass();
      setZen((z) => !z);
    };
    window.addEventListener("dblclick", onDblClick);
    return () => window.removeEventListener("dblclick", onDblClick);
  }, [mounted, panelOpen, editorOpen, paletteOpen, ctxMenuOpen, defrostGlass]);

  /* ---------- 进入禅模式时收起所有浮层 ---------- */
  useEffect(() => {
    if (zen) closeAllOverlays();
  }, [zen, closeAllOverlays]);

  /* ---------- 禅模式挂 html.zen 类：雾化散场/聚拢由 CSS 各自承载 ---------- */
  useEffect(() => {
    document.documentElement.classList.toggle("zen", zen);
  }, [zen]);

  /* ---------- 提示词墨色：掠影下随壁纸明暗自适应（浅底深字 / 深底浅字） ----------
     从当前壁纸缩略图采样提示词所在区域的感知亮度，叠乘掠影压暗遮罩的
     合成衰减后判定：辉光/纯净底色恒定，不做采样，保持主题默认色。
     禅模式内无法换壁纸（面板已收起），进禅采样一次即稳定。
     浅色主题的掠影是白纱遮罩，合成背景亮度 ≥ 遮罩 α（最坏纯黑壁纸仍浅底）
     → 墨色恒取深字，直接短路不采样。 */
  const zenHintRef = useRef<HTMLParagraphElement | null>(null);
  const [zenHintTone, setZenHintTone] = useState<ZenHintTone>("auto");

  useEffect(() => {
    if (!zen) {
      setZenHintTone("auto");
      return;
    }
    let alive = true;
    (async () => {
      if (!document.documentElement.classList.contains("photo-mode")) return;
      if (!document.documentElement.classList.contains("dark")) {
        setZenHintTone("on-light");
        return;
      }
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
      /* 压暗遮罩在屏幕中段的合成不透明度：平底 0.18 与渐变中段 0.12 叠乘 ≈ 0.278；
         黑色遮罩下透亮率 L′ = L·(1−0.18)·(1−0.12) ≈ L·0.722 */
      const shown = lum * (1 - 0.18) * (1 - 0.12);
      setZenHintTone(shown >= HINT_TONE_THRESHOLD ? "on-light" : "on-dark");
    })();
    return () => {
      alive = false;
    };
  }, [zen]);

  return { zen, setZen, defrostGlass, zenHintRef, zenHintTone };
}
