"use client";

/* 「初始」— 磁贴站点图标主色提取（v8.7.67）：favicon 铺满磁贴的打底色。
 *
 * 背景（v8.7.67 用户指令）：「站点图标」风格与自绘风格里未被自绘册收录的
 * 站点，不再走小图居中 + 域名色相渐变，改为与自绘命中同款观感——图标铺满
 * 磁贴 + 站点图标主色打底。自绘册的 dom 是构建期人工锁定的主色；favicon
 * 没有这层数据，只能在端上从图标位图里提取。
 *
 * 为什么端上能取色（favicon.ts 时代结论的解除）：那条「跨源图片 canvas 被
 * 污染取不到 Blob」成立于 web 页面语境；扩展页（chrome-extension://）在
 * manifest host_permissions 含 http/https 通配时，fetch 任意 http(s) 源免
 * CORS（MV3 扩展页保留 host 权限豁免，只有 content script 失去了它）。
 * fetch 到的 blob 再走同源 objectURL <img> 解码，canvas 零污染。web 版
 * （云端热更 / Vercel）没有 host 权限，fetch 被 CORS 拒 → 走 catch 落
 * null → 磁贴回落域名色相渐变，与现行为一致，纯增强不回归。
 *
 * 提取管线：fetch(src) → blob → objectURL <img> 解码（ico/png/jpg/webp/svg
 * 全兼容——createImageBitmap 不认 SVG blob 故不用）→ 24×24 离屏 canvas →
 * 像素级色相直方图（24 桶，饱和度加权）→ 最大桶成员 RGB 均值 → 饱和/明度
 * 钳进瓷釉框架（v8.7.34 磁贴配色律：色相忠于图标本体，饱和/明度锁框架）
 * → #RRGGBB，接口与自绘 dom 完全同族（hexHue 直接可解）。
 *
 * 降级链（与自绘册「增强而非依赖」同纪律）：
 *   灰阶 logo（无色度像素）/ CORS 拒 / 解码失败 / 任一环超时（8s 兜底）
 *   → null → 磁贴保持原域名色相渐变 + 图标仍铺满，观感只少一层实底。
 *
 * 缓存：localStorage favicon-dom:<src> → hex（跨会话零重算）；模块级
 * Promise Map 去重并发（抽屉 64px + 常驻 56px + 编辑弹窗预览同 src 磁贴
 * 并发渲染只提取一次）。
 */

import { useEffect, useState } from "react";

const KEY_PREFIX = "favicon-dom:";

/* 饱和/明度钳制区间：色相交给图标，质感交给磁贴系统（瓷釉框架定调） */
const S_MIN = 0.4,
  S_MAX = 0.86;
const L_MIN = 0.34,
  L_MAX = 0.66;

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** HSL → #RRGGBB（标准公式，与 hexHue 互为逆运算） */
function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c =
      l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return "#" + f(0) + f(8) + f(4);
}

/* RGB → 色相（0-360）；与 selfdraw-icons.ts hexHue 的推导同源 */
function rgbHue(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  if (d < 1e-6) return 0;
  let h: number;
  if (mx === r) h = ((g - b) / d + 6) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** 已解码 <img> → 主色 hex；无色度像素（灰阶 logo）返回 null */
function extractDom(img: HTMLImageElement): string | null {
  const N = 24;
  const cv = document.createElement("canvas");
  cv.width = N;
  cv.height = N;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, N, N);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, N, N).data;
  } catch {
    return null; /* 理论上不可达（同源 objectURL）；防御 web 版奇异路径 */
  }
  /* 24 桶 × [权重和, r 加权和, g 加权和, b 加权和]，权重 = 饱和度 */
  const buckets: number[][] = Array.from({ length: 24 }, () => [0, 0, 0, 0]);
  let colored = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 125) continue; /* 全透明像素不参与 */
    const r = data[i] / 255,
      g = data[i + 1] / 255,
      b = data[i + 2] / 255;
    const mx = Math.max(r, g, b),
      mn = Math.min(r, g, b),
      d = mx - mn;
    const l = (mx + mn) / 2;
    const s = d < 1e-6 ? 0 : d / (1 - Math.abs(2 * l - 1));
    /* 近白/近黑/低饱和全部视为无色度噪声（logo 反锯齿边、白色底板） */
    if (s < 0.16 || l > 0.92 || l < 0.1) continue;
    const bi = Math.min(23, Math.floor(rgbHue(r, g, b) / 15));
    const bk = buckets[bi];
    bk[0] += s;
    bk[1] += r * s;
    bk[2] += g * s;
    bk[3] += b * s;
    colored++;
  }
  if (!colored) return null;
  let best = 0;
  for (let i = 1; i < 24; i++) if (buckets[i][0] > buckets[best][0]) best = i;
  const bk = buckets[best];
  if (bk[0] <= 0) return null;
  const r = bk[1] / bk[0],
    g = bk[2] / bk[0],
    b = bk[3] / bk[0];
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  const s = d < 1e-6 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return hslToHex(
    rgbHue(r, g, b),
    clamp(s, S_MIN, S_MAX),
    clamp(l, L_MIN, L_MAX)
  );
}

/** 单个源 URL → 主色 hex；任一环失败/超时（8s）落 null，永不 reject */
function extractFromUrl(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => done(null), 8000);
    const done = (v: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    /* 扩展页凭 host 权限免 CORS；web 版被 CORS 拒 → catch 落 null 降级 */
    fetch(src, { mode: "cors", credentials: "omit" })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          try {
            done(extractDom(img));
          } catch {
            done(null);
          }
          URL.revokeObjectURL(url);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          done(null);
        };
        img.src = url;
      })
      .catch(() => done(null));
  });
}

function readCache(src: string): string | null {
  try {
    return window.localStorage.getItem(KEY_PREFIX + src);
  } catch {
    return null;
  }
}

function writeCache(src: string, hex: string) {
  try {
    window.localStorage.setItem(KEY_PREFIX + src, hex);
  } catch {
    /* 隐私模式 / 配额满：只退缓存，本会话内仍有模块级 Map */
  }
}

/* 模块级并发去重：同 src 磁贴（抽屉/常驻/编辑预览）只提取一次 */
const inflight = new Map<string, Promise<string | null>>();

/** 站点图标主色：src 有效时返回 #RRGGBB（缓存命中同步返回）或 null（提取中/失败）。
 *  消费方（TileIcon）以 null 回落域名色相渐变，永不阻塞磁贴渲染。 */
export function useFaviconDom(src: string | null | undefined): string | null {
  const [dom, setDom] = useState<string | null>(() =>
    src ? readCache(src) : null
  );

  useEffect(() => {
    if (!src) {
      setDom(null);
      return;
    }
    const cached = readCache(src);
    if (cached) {
      setDom(cached);
      return;
    }
    let alive = true;
    let p = inflight.get(src);
    if (!p) {
      p = extractFromUrl(src).then((hex) => {
        if (hex) writeCache(src, hex);
        return hex;
      });
      inflight.set(src, p);
    }
    p.then((hex) => {
      if (alive) setDom(hex);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [src]);

  return dom;
}
