/* 「初始」浏览器层 OCR 引擎（v8.7.166）——tesseract.js WASM 轨道
 *
 * 双轨制轨道 A（人人可用，零安装）：语言包（Apache-2.0 的 tessdata）首次
 * 使用时从 CDN 拉取并由 tesseract.js 缓存进 IndexedDB，之后离线可用；
 * 引擎代码（tesseract.js + core WASM）随扩展离线分发于 /ocr/，不违反
 * MV3「禁远程代码」——远程拉取的只有语言数据文件，不是代码。
 * 轨道 B（本地加速）见 pdf-bridge.ts。
 *
 * 资产布局（public/ocr/，随包根分发）：
 *   tesseract-worker.min.js   —— tesseract.js worker 脚本（同源加载，CSP 兼容）
 *   tesseract-core-simd.wasm.js/.wasm、tesseract-core.wasm.js/.wasm
 *                             —— tesseract.js-core WASM（需 manifest CSP
 *                                extension_pages 增配 'wasm-unsafe-eval'）
 *
 * 预处理取经（致谢：飞鼠格式转换 ocr.js，作者 牢蜂 LaoFeng，
 * github.com/LaoFeng-mouse/flyingmouse-format，非商用许可）：灰度化 +
 * min/max 归一化对比度拉伸能显著改善扫描件识别率；其 300dpi 口径同样沿用。
 */

type Lang = "chi_sim+eng" | "chi_sim" | "eng";

function basePath(): string {
  return (process.env.NEXT_PUBLIC_BASE_PATH as string) || "";
}

function assetUrl(p: string): string {
  return `${basePath()}${p}`;
}

/** 画布预处理：灰度 + min/max 对比度归一化（飞鼠口径的纯 JS 平替）。
 *  就地修改像素，返回同画布。 */
export function preprocessCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  /* 灰度（Rec.601 加权） */
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  /* min/max 归一化：把最暗拉到 0、最亮拉到 255（比直方图均衡便宜得多） */
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi > lo && (lo > 24 || hi < 231)) {
    const span = hi - lo;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = d[i + 1] = d[i + 2] = ((d[i] - lo) * 255) / span;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export interface BrowserOcrProgress {
  /** tesseract.js 状态串：loading tesseract core / initializing / recognizing text */
  status: string;
  progress: number;
}

/** 浏览器引擎识别一张画布。每次独立建 worker、用毕即焚（省内存，免并发坑）。
 *  onProgress 可选，progress ∈ [0,1]。 */
export async function browserOcrCanvas(
  canvas: HTMLCanvasElement,
  lang: Lang,
  onProgress?: (p: BrowserOcrProgress) => void,
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(lang, 1, {
    workerPath: assetUrl("/ocr/tesseract-worker.min.js"),
    corePath: assetUrl("/ocr"),
    langPath: "https://tessdata.projectnaptha.com/4.0.0_fast",
    /* MV3 关键律：workerBlobURL 必须显式关——tesseract.js 默认把 workerPath
     * 包进 blob 再 importScripts（跨域 worker 兜底），blob worker 是 opaque
     * origin，extension_pages CSP 的 'self' 不匹配 chrome-extension:// 脚本，
     * importScripts 直接 NetworkError。关掉后走 new Worker(同源路径) 直连，
     * 'self' 匹配，WASM 由 'wasm-unsafe-eval' 放行（真扩展冒烟实锤）。 */
    workerBlobURL: false,
    logger: (m: { status: string; progress: number }) => {
      try {
        onProgress?.({ status: String(m.status || ""), progress: Number(m.progress) || 0 });
      } catch {
        /* 进度回调异常不影响主流程 */
      }
    },
  });
  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    const { data } = await worker.recognize(canvas);
    return String(data?.text ?? "");
  } finally {
    await worker.terminate().catch(() => {});
  }
}
