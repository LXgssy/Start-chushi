/* 壁纸区域感知亮度采样（禅模式提示词自适应墨色用）。
 * 思路：按 object-cover 映射，把屏幕上目标元素的区域换算成壁纸图上的对应
 * 区域，绘制到离屏 canvas 后做 WCAG 加权平均，得到 0~1 的线性光亮度。
 * 图片一律经 CORS-clean 的独立 Image 加载（官方缩略图/本地资产/自定义 blob
 * 均可安全 getImageData；跨域 CDN 拒绝头时返回 null，由调用方回退主题默认色）。 */

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** 加载可安全采样的图片（crossOrigin=anonymous；失败/被污染 resolve null） */
function loadSampleable(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 采样壁纸在视口 rect 区域的感知亮度（0~1，线性光加权）。
 * cover 映射：scale = max(vw/iw, vh/ih)、中心对齐，与 object-cover 一致；
 * kenburns ±12% 的缓慢缩放对区域均值影响可忽略。
 * 任何失败（图片未就绪/画布污染/上下文缺失）返回 null。
 */
export async function sampleCoverLuminance(
  src: string,
  rect: Rect,
  viewport: { w: number; h: number }
): Promise<number | null> {
  if (!src) return null;
  const img = await loadSampleable(src);
  if (!img) return null;
  try {
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.max(viewport.w / iw, viewport.h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const ox = (viewport.w - dw) / 2;
    const oy = (viewport.h - dh) / 2;
    /* 视口坐标 → 图片像素坐标，并 clamp 进图内（越界部分 drawImage 会画成透明拉低均值） */
    const sx = Math.min(Math.max((rect.x - ox) / scale, 0), iw - 1);
    const sy = Math.min(Math.max((rect.y - oy) / scale, 0), ih - 1);
    const sw = Math.max(rect.w / scale, 1);
    const sh = Math.max(rect.h / scale, 1);

    const CW = 64;
    const CH = 24;
    const canvas = document.createElement("canvas");
    canvas.width = CW;
    canvas.height = CH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, CW, CH);
    const data = ctx.getImageData(0, 0, CW, CH).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum +=
        0.2126 * srgbToLinear(data[i] / 255) +
        0.7152 * srgbToLinear(data[i + 1] / 255) +
        0.0722 * srgbToLinear(data[i + 2] / 255);
    }
    return sum / (data.length / 4);
  } catch {
    return null;
  }
}
