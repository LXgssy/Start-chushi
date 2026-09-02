/* 「初始」液态玻璃引擎（宿主内建，v1.1.0）
 *
 * 原理（Chromium 专属，降级安全）：
 *   backdrop-filter: url(#svg-filter) 可对元素背景应用 SVG 滤镜。
 *   引擎为每个玻璃容器生成一张「位移贴图」（canvas，R=X 位移 / G=Y 位移）：
 *   圆角矩形 SDF → 越靠近边缘位移越大、方向指向中心 → feDisplacementMap
 *   实时折射背景，形成 Apple Liquid Glass 的透镜边缘弯曲。
 *   贴图与颜色无关（深浅色共用），尺寸变化经 ResizeObserver 重生成。
 *
 * 安全边界（与预设系统设计原则一致）：
 *   - 预设只声明参数（effects.glass，白名单夹紧），本引擎是宿主代码，
 *     不执行预设携带的任何脚本；
 *   - 目标元素只来自白名单选择器（磨砂玻璃容器），不 touching 其它节点；
 *   - 删除预设（声明消失）即整体还原：移除滤镜、清内联样式、断开观察器。
 *
 * 已知律（globals.css 磨砂玻璃存活原则）：
 *   引擎不给任何祖先添加 opacity/filter；高光层走 ::before/::after
 *   （box-shadow/radial-gradient，非 backdrop root 影响源）。
 */

/** 液态玻璃渲染参数（解析后全部就位，缺省值见 GLASS_DEFAULTS） */
export interface LiquidGlassOpts {
  refraction: number;
  bezel: number;
  blur: number;
  saturation: number;
}

export const GLASS_DEFAULTS: Required<LiquidGlassOpts> = {
  refraction: 0.6,
  bezel: 0.5,
  blur: 6,
  saturation: 170,
};

/** 玻璃容器白名单：搜索栏 / dock / dock 面板卡片 / 各 glass-card（⌘K 卡、链接对话框卡、
 *  面板卡） / ⌘K 与链接对话框的全屏磨砂遮罩。选择器是产品契约的一部分，
 *  新增玻璃容器必须同步此处（见 README「自定义动画与面板样式」元素钩子表） */
const TARGET_SELECTOR = [
  ".search-pill",
  ".cl-dock",
  ".cl-panel",
  ".glass-card",
  '[aria-label="指令面板"]',
  '[aria-label="添加链接"]',
  '[aria-label="编辑链接"]',
].join(", ");

/** 注册上限保护：白名单选择器在正常布局下的元素数远小于此（防病态 DOM 放大） */
const MAX_TARGETS = 32;

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const smoothStep = (a: number, b: number, t: number) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};

/** 圆角矩形有符号距离场：内部为负、边界为 0、外部为正 */
function roundedRectSDF(x: number, y: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(x) - hw + r;
  const qy = Math.abs(y) - hh + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

/** 生成位移贴图 dataURL 与 feDisplacementMap scale（R=X / G=Y，0.5 灰 = 零位移） */
function buildDisplacementMap(
  w: number,
  h: number,
  radius: number,
  bezelPx: number,
  refraction: number
): { url: string; scale: number } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { url: "", scale: 0 };
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const hw = w / 2;
  const hh = h / 2;
  const k = refraction; // 边缘位移上限系数（px 级，随 bezelPx 缩放）

  // 一遍计算原始位移，记录最大幅值用于归一化
  let maxD = 0.0001;
  const dxs = new Float32Array(w * h);
  const dys = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = x + 0.5 - hw;
      const cy = y + 0.5 - hh;
      const d = roundedRectSDF(cx, cy, hw, hh, radius);
      // 0 = 玻璃深处（无位移）→ 1 = 边缘（最大位移）；平方平滑，中心几乎无形变
      let m = smoothStep(-bezelPx, 0, d);
      m = m * m;
      const len = Math.hypot(cx, cy) || 1;
      // 折射方向指向中心（透镜边缘压缩背景）
      const dx = -(cx / len) * m * k * bezelPx;
      const dy = -(cy / len) * m * k * bezelPx;
      const i = y * w + x;
      dxs[i] = dx;
      dys[i] = dy;
      const ad = Math.abs(dx) > Math.abs(dy) ? Math.abs(dx) : Math.abs(dy);
      if (ad > maxD) maxD = ad;
    }
  }
  const scale = maxD * 2;
  for (let i = 0, p = 0; i < dxs.length; i++, p += 4) {
    data[p] = clamp(dxs[i] / scale + 0.5, 0, 1) * 255; // R → X
    data[p + 1] = clamp(dys[i] / scale + 0.5, 0, 1) * 255; // G → Y
    data[p + 2] = 128;
    data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { url: canvas.toDataURL(), scale };
}

interface GlassEntry {
  el: HTMLElement;
  filter: SVGFilterElement;
  feImage: SVGFEImageElement;
  feDisp: SVGFEDisplacementMapElement;
  /** 同尺寸贴图命中缓存，跳过重建（ResizeObserver 抖动防线） */
  lastW: number;
  lastH: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** 引擎单例状态（activate 幂等：重复调用先按新参数重算全部贴图） */
let defsHost: SVGSVGElement | null = null;
let entries: GlassEntry[] = [];
let ro: ResizeObserver | null = null;
let mo: MutationObserver | null = null;
let opts: Required<LiquidGlassOpts> = GLASS_DEFAULTS;
let uid = 0;
let rafPending = 0;

/** 镜面高光：document 级事件委托（非逐元素监听），命中白名单才写 CSS 变量 */
function onPointerMove(e: PointerEvent) {
  let node = e.target as Element | null;
  // pointer 事件目标是玻璃内部内容时向上找玻璃宿主（白名单交集）
  while (node && node !== document.body) {
    if (node.classList.contains("lg-on")) break;
    node = node.parentElement;
  }
  if (!node || !(node instanceof HTMLElement) || !node.classList.contains("lg-on")) return;
  const r = node.getBoundingClientRect();
  node.style.setProperty("--lg-mx", `${((e.clientX - r.left) / r.width) * 100}%`);
  node.style.setProperty("--lg-my", `${((e.clientY - r.top) / r.height) * 100}%`);
}

/** 检测当前浏览器是否支持 backdrop-filter 引用 SVG 滤镜（仅 Chromium 系） */
export function supportsLiquidGlass(): boolean {
  try {
    return (
      CSS.supports("backdrop-filter", "url(#x)") ||
      CSS.supports("-webkit-backdrop-filter", "url(#x)")
    );
  } catch {
    return false;
  }
}

function scheduleUpdateAll() {
  if (rafPending) return;
  rafPending = requestAnimationFrame(() => {
    rafPending = 0;
    updateAll();
  });
}

function updateEntry(g: GlassEntry) {
  const el = g.el;
  const w = Math.round(el.offsetWidth);
  const h = Math.round(el.offsetHeight);
  if (!w || !h) return; // 隐藏中（浮层未开）：保持现有滤镜，待展开时 RO 再触发
  if (w === g.lastW && h === g.lastH && g.feImage.getAttribute("href")) return;
  g.lastW = w;
  g.lastH = h;
  const cs = getComputedStyle(el);
  let radius = parseFloat(cs.borderRadius) || 0;
  radius = Math.min(radius, w / 2, h / 2);
  // 全屏遮罩（w/h ≈ viewport）无边角，bezel 取短边比例
  const bezelPx = Math.min(w, h) / 2 * opts.bezel;
  const { url, scale } = buildDisplacementMap(w, h, radius, bezelPx, opts.refraction);
  if (!url) return;
  g.filter.setAttribute("width", String(w));
  g.filter.setAttribute("height", String(h));
  g.filter.setAttribute("x", "0");
  g.filter.setAttribute("y", "0");
  g.feImage.setAttribute("width", String(w));
  g.feImage.setAttribute("height", String(h));
  g.feImage.setAttribute("href", url);
  g.feImage.setAttribute("xlink:href", url);
  g.feDisp.setAttribute("scale", scale.toFixed(2));
}

function updateAll() {
  for (const g of entries) updateEntry(g);
}

function applyBackdrop(el: HTMLElement, id: string) {
  const v = `url(#${id}) blur(${opts.blur}px) saturate(${opts.saturation}%)`;
  el.style.backdropFilter = v;
  el.style.setProperty("-webkit-backdrop-filter", v);
  el.classList.add("lg-on");
}

function register(el: HTMLElement) {
  if (entries.some((g) => g.el === el)) return;
  if (entries.length >= MAX_TARGETS) return;
  const id = `chushi-lg-${uid++}`;
  const filter = document.createElementNS(SVG_NS, "filter") as SVGFilterElement;
  filter.setAttribute("id", id);
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("color-interpolation-filters", "sRGB");
  const feImage = document.createElementNS(SVG_NS, "feImage") as SVGFEImageElement;
  feImage.setAttribute("result", "map");
  feImage.setAttribute("preserveAspectRatio", "none");
  const feDisp = document.createElementNS(SVG_NS, "feDisplacementMap") as SVGFEDisplacementMapElement;
  feDisp.setAttribute("in", "SourceGraphic");
  feDisp.setAttribute("in2", "map");
  feDisp.setAttribute("xChannelSelector", "R");
  feDisp.setAttribute("yChannelSelector", "G");
  filter.append(feImage, feDisp);
  defsHost?.appendChild(filter);

  const g: GlassEntry = { el, filter, feImage, feDisp, lastW: 0, lastH: 0 };
  entries.push(g);
  applyBackdrop(el, id);
  updateEntry(g);
  ro?.observe(el);
}

function unregister(el: Element) {
  const idx = entries.findIndex((g) => g.el === el);
  if (idx < 0) return;
  const g = entries[idx];
  entries.splice(idx, 1);
  ro?.unobserve(g.el);
  g.filter.remove();
  g.el.style.removeProperty("backdrop-filter");
  g.el.style.removeProperty("-webkit-backdrop-filter");
  g.el.classList.remove("lg-on");
}

function scanAll() {
  if (!defsHost) return;
  document.querySelectorAll<HTMLElement>(TARGET_SELECTOR).forEach((el) => {
    if (!el.isConnected) return;
    register(el);
  });
  // 清理已断连元素（浮层卸载后 filter 残留防线）
  for (const g of [...entries]) {
    if (!g.el.isConnected) unregister(g.el);
  }
}

function onMutation() {
  // 浮层（⌘K/对话框/面板）挂载/卸载频繁，直接 rAF 合并全量扫描：
  // 白名单选择器 querySelectorAll 在正常 DOM 规模下开销可忽略
  scheduleScan();
}

let scanRaf = 0;
function scheduleScan() {
  if (scanRaf) return;
  scanRaf = requestAnimationFrame(() => {
    scanRaf = 0;
    scanAll();
    updateAll();
  });
}

/**
 * 激活液态玻璃（幂等）。参数变化时按新参数重算全部贴图。
 * 返回 false 表示当前浏览器不支持（调用方保持磨砂现状即可，无需降级处理）。
 */
export function activateLiquidGlass(partial?: Partial<LiquidGlassOpts>): boolean {
  if (!supportsLiquidGlass()) return false;
  opts = { ...GLASS_DEFAULTS, ...partial };

  if (!defsHost) {
    defsHost = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    defsHost.id = "chushi-liquid-defs";
    defsHost.setAttribute("width", "0");
    defsHost.setAttribute("height", "0");
    defsHost.setAttribute("aria-hidden", "true");
    defsHost.style.position = "absolute";
    const defs = document.createElementNS(SVG_NS, "defs");
    defsHost.appendChild(defs);
    document.body.appendChild(defsHost);

    ro = new ResizeObserver(scheduleUpdateAll);
    mo = new MutationObserver(onMutation);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleUpdateAll, { passive: true });
    document.addEventListener("pointermove", onPointerMove, { passive: true });
  }

  scanAll();
  // 参数变化（或首次）：强制重建全部贴图
  for (const g of entries) {
    g.lastW = 0;
    g.lastH = 0;
    applyBackdrop(g.el, g.filter.id);
  }
  scheduleUpdateAll();
  document.documentElement.classList.add("liquid-glass");
  return true;
}

/** 停用液态玻璃并完整还原（删除预设 / 参数撤除时调用） */
export function deactivateLiquidGlass(): void {
  document.documentElement.classList.remove("liquid-glass");
  for (const g of [...entries]) unregister(g.el);
  entries = [];
  mo?.disconnect();
  mo = null;
  ro?.disconnect();
  ro = null;
  window.removeEventListener("resize", scheduleUpdateAll);
  document.removeEventListener("pointermove", onPointerMove);
  if (rafPending) {
    cancelAnimationFrame(rafPending);
    rafPending = 0;
  }
  if (scanRaf) {
    cancelAnimationFrame(scanRaf);
    scanRaf = 0;
  }
  defsHost?.remove();
  defsHost = null;
  uid = 0;
}
