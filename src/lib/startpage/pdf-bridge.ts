/* 「初始」PDF 本地桥接客户端（v8.7.166）
 *
 * 架构（双轨制·浏览器层优先兜底，本地引擎加速）：
 *   轨道 A（人人可用，零安装）：浏览器内 tesseract.js WASM（ocr-engine.ts）；
 *   轨道 B（增强，可选拓展）：用户在本机运行「初始 PDF 桥接」——一个监听
 *   127.0.0.1 的微型服务（bridge/chushi-pdf-bridge.js，零 npm 依赖，原生
 *   tesseract.exe），本文件负责探活与调用。桥在走 B，桥不在退 A，用户无感。
 *
 * 端口约定：27001 起顺扫到 27005（与音乐枢纽 26901-26903/26911-26913 避让）。
 * 探活：GET /health → { ok, name: "chushi-pdf-bridge", version, langs[] }，
 * name 精确匹配防误认别的本地服务（同 music.ts /n 身份校验律）。
 * PNA（Private Network Access）：公开源页面调 127.0.0.1 时 Chrome 会发
 * 预检并要求响应头 Access-Control-Allow-Private-Network: true——桥已实现；
 * 扩展页自身有 host_permissions 通配直通（不挑端口），两者兼容。
 *
 * 安全律：桥侧只接受 127.0.0.1 直连 + chrome-extension:// 与 localhost 来源，
 * 公网站点来源一律 403（adapted from 飞鼠格式转换 assertLocalWebRequest）。
 */

export interface PdfBridgeInfo {
  /** 命中的端口（127.0.0.1:<port>） */
  base: string;
  version: string;
  langs: string[];
}

const PORTS = [27001, 27002, 27003, 27004, 27005];
const PROBE_TIMEOUT_MS = 900;
/** 探活结果粘滞期：命中后 60s 内不再重复扫端口 */
const STICKY_MS = 60_000;

let cached: { info: PdfBridgeInfo | null; at: number } | null = null;

function withTimeout(ms: number): AbortSignal {
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(), ms);
  return ctl.signal;
}

/** 探活本地 PDF 桥接：顺扫端口，name 精确校验，未命中返回 null（走浏览器轨道） */
export async function probePdfBridge(force = false): Promise<PdfBridgeInfo | null> {
  const now = Date.now();
  if (!force && cached && now - cached.at < STICKY_MS) return cached.info;
  let hit: PdfBridgeInfo | null = null;
  for (const port of PORTS) {
    const base = `http://127.0.0.1:${port}`;
    try {
      const r = await fetch(`${base}/health`, { signal: withTimeout(PROBE_TIMEOUT_MS) });
      if (!r.ok) continue;
      const j = (await r.json()) as { name?: string; version?: string; langs?: string[] };
      if (j?.name !== "chushi-pdf-bridge") continue;
      hit = { base, version: String(j.version || ""), langs: Array.isArray(j.langs) ? j.langs : [] };
      break;
    } catch {
      /* 端口空 / 超时 → 下一个 */
    }
  }
  cached = { info: hit, at: now };
  return hit;
}

/** 走本地桥接 OCR：POST /ocr { image: base64, lang } → { text }。
 *  image 为单页 PNG 的 base64（不带 data: 前缀）。 */
export async function bridgeOcr(
  base: string,
  imageBase64: string,
  lang: string,
): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 180_000);
  try {
    const r = await fetch(`${base}/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageBase64, lang }),
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`本地引擎返回 ${r.status}`);
    const j = (await r.json()) as { text?: string; error?: string };
    if (j?.error) throw new Error(j.error);
    return String(j?.text ?? "");
  } finally {
    clearTimeout(timer);
  }
}

export const PDF_BRIDGE_PORTS = PORTS;
