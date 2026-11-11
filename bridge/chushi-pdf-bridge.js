#!/usr/bin/env node
/* ============================================================================
 * 「初始」PDF 桥接服务（chushi-pdf-bridge）v1.0.0 —— 零 npm 依赖单文件
 * ============================================================================
 * 用途：配合 Chrome 扩展「初始」(Start-chushi) 的 PDF 工具箱 OCR 双轨制。
 *   用户在本机运行本服务后，扩展页自动探活 127.0.0.1:27001-27005 并优先调用
 *   本地原生 Tesseract 引擎（快、离线、零语言包下载）；未运行时扩展自动落
 *   浏览器内 WASM 引擎（tesseract.js），功能不缺席。
 *
 * 设计来源与致谢（依其非商用许可要求，显著标注原作者）：
 *   本服务的「本地 HTTP 桥 + 本地请求守卫 + OCR 置信度口径」设计取自
 *   开源项目「飞鼠格式转换」（FlyingMouse Format）的 server.js 与 ocr.js，
 *   原作者：牢蜂（LaoFeng），github.com/LaoFeng-mouse/flyingmouse-format，
 *   采用其《飞鼠格式非商用许可协议》（个人免费使用/二次开发须显著署名并
 *   同样非商用；禁止商用、套壳冒充、删改署名）。本服务为其设计思路的
 *   零依赖适配重写，非原代码复制；与扩展「初始」一样仅作开源非商用分发。
 *   OCR 引擎：Tesseract（Apache-2.0）；tessdata 语言包（Apache-2.0）。
 *
 * 端点：
 *   GET  /health → { ok, name, version, engine, langs, tessdata, uptime }
 *   POST /ocr    → body { image: <png/jpg/tiff 的 base64>, lang?, psm? }
 *                  → { text }  （原生 tesseract 子进程，一次一请求）
 *
 * 安全律（取自飞鼠 assertLocalWebRequest 收紧）：
 *   · 仅接受 127.0.0.1 / ::1 直连；
 *   · Origin/Referer 若存在，必须是 chrome-extension:// 或 localhost 系列，
 *     公网站点一律 403（防止任意网页把你的浏览器当免费 OCR 算力）；
 *   · 请求体上限 25MB；单请求 180s 超时。
 *
 * 引擎发现顺序（tesseract 可执行文件）：
 *   环境变量 CHUSHI_TESSERACT → ./tesseract/tesseract(.exe) → ./bin/ → PATH
 * 语言包目录（tessdata）：
 *   环境变量 CHUSHI_TESSDATA → ./tessdata → ./bin/tessdata（--tessdata-dir 传入）
 *   语言包放 chi_sim.traineddata(.gz) / eng.traineddata(.gz) 即可。
 *
 * 运行：node chushi-pdf-bridge.js   （或见 README 的 Windows exe 打包）
 * 端口：27001 起顺扫到 27005，占用自动换下一个，启动时打印实际端口。
 * ========================================================================== */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");

const VERSION = "1.0.0";
const NAME = "chushi-pdf-bridge";
const PORT_RANGE = [27001, 27002, 27003, 27004, 27005];
const MAX_BODY = 25 * 1024 * 1024; // 25MB
const OCR_TIMEOUT_MS = 180_000;
const ALLOWED_LANGS = new Set(["chi_sim+eng", "chi_sim", "eng", "chi_sim+eng+chi_tra"]);

/* ---------------- 引擎发现 ---------------- */

function isWin() {
  return process.platform === "win32";
}

function firstExisting(candidates) {
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return "";
}

function findTesseract() {
  const exe = isWin() ? "tesseract.exe" : "tesseract";
  const here = __dirname;
  return (
    process.env.CHUSHI_TESSERACT ||
    firstExisting([
      path.join(here, "tesseract", exe),
      path.join(here, "bin", exe),
      path.join(here, exe),
    ]) ||
    exe /* 最后交给 PATH */
  );
}

function findTessdata() {
  const here = __dirname;
  return process.env.CHUSHI_TESSDATA ||
    firstExisting([
      path.join(here, "tessdata"),
      path.join(here, "bin", "tessdata"),
    ]);
}

const TESSERACT = findTesseract();
const TESSDATA = findTessdata();

function engineReady() {
  if (TESSERACT === "tesseract" || TESSERACT === "tesseract.exe") {
    /* PATH 依赖：探测一次 */
    try {
      require("child_process").execFileSync(TESSERACT, ["--version"], { stdio: "ignore", timeout: 8000 });
      return true;
    } catch {
      return false;
    }
  }
  return fs.existsSync(TESSERACT);
}

function installedLangs() {
  const dir = TESSDATA;
  if (!dir) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".traineddata") || f.endsWith(".traineddata.gz"))
      .map((f) => f.replace(/\.traineddata(\.gz)?$/, ""))
      .filter((f) => f && f !== "osd");
  } catch {
    return [];
  }
}

/* ---------------- 本地请求守卫（致谢：飞鼠 server.js assertLocalWebRequest） ---------------- */

function isLoopbackHost(hostname) {
  if (!hostname) return false;
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" || hostname === "::1";
}

function isAllowedOrigin(v) {
  try {
    const u = new URL(v);
    if (u.protocol === "chrome-extension:") return true;
    return u.protocol === "http:" && isLoopbackHost(u.hostname);
  } catch {
    return false;
  }
}

function assertLocalRequest(req, res) {
  const addr = req.socket.remoteAddress || "";
  const loopback =
    addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
  if (!loopback) {
    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "仅允许本机访问" }));
    return false;
  }
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  if (origin && !isAllowedOrigin(origin)) {
    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "拒绝跨站请求" }));
    return false;
  }
  if (referer && !isAllowedOrigin(referer)) {
    res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "拒绝跨站请求" }));
    return false;
  }
  return true;
}

function corsHeaders(res) {
  /* Access-Control-Allow-Private-Network：Chrome PNA（公网页面调本机端口）必需 */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Max-Age", "600");
}

/* ---------------- OCR 子进程 ---------------- */

function runTesseract(imagePath, lang, psm) {
  return new Promise((resolve, reject) => {
    const args = [imagePath, "stdout", "-l", lang];
    if (TESSDATA) args.push("--tessdata-dir", TESSDATA);
    args.push("--dpi", "300");
    if (psm) args.push("--psm", String(psm));
    const child = spawn(TESSERACT, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("OCR 超时（180s）"));
    }, OCR_TIMEOUT_MS);
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`tesseract 启动失败：${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`tesseract 退出码 ${code}：${stderr.slice(-300)}`));
    });
  });
}

/* ---------------- HTTP 服务 ---------------- */

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("请求体超过 25MB 上限"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  corsHeaders(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (!assertLocalRequest(req, res)) return;

  const url = new URL(req.url || "/", "http://127.0.0.1");

  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/n")) {
    sendJson(res, 200, {
      ok: true,
      name: NAME,
      version: VERSION,
      engine: engineReady() ? `tesseract (${TESSERACT})` : "tesseract-missing",
      langs: installedLangs(),
      tessdata: TESSDATA || null,
      uptime: Math.round(process.uptime()),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/ocr") {
    if (!engineReady()) {
      sendJson(res, 503, {
        error: "未找到 tesseract 引擎。请把 tesseract.exe 放到本文件旁的 tesseract/ 目录，或设置 CHUSHI_TESSERACT 环境变量。",
      });
      return;
    }
    let body;
    try {
      const raw = await readBody(req, MAX_BODY);
      body = JSON.parse(raw.toString("utf8"));
    } catch (e) {
      sendJson(res, 400, { error: `请求体无效：${e.message}` });
      return;
    }
    const image = String(body?.image || "");
    const lang = ALLOWED_LANGS.has(String(body?.lang)) ? String(body?.lang) : "chi_sim+eng";
    const psm = Number(body?.psm) > 0 && Number(body?.psm) < 14 ? Number(body?.psm) : 0;
    if (!image) {
      sendJson(res, 400, { error: "缺少 image 字段（base64 图片）" });
      return;
    }
    let buf;
    try {
      buf = Buffer.from(image.replace(/^data:[^,]+,/, ""), "base64");
    } catch {
      sendJson(res, 400, { error: "image 不是合法 base64" });
      return;
    }
    if (!buf.length) {
      sendJson(res, 400, { error: "image 解码后为空" });
      return;
    }
    const tmp = path.join(os.tmpdir(), `chushi-pdf-bridge-${randomUUID()}.png`);
    try {
      fs.writeFileSync(tmp, buf);
      const text = await runTesseract(tmp, lang, psm);
      sendJson(res, 200, { text });
    } catch (e) {
      sendJson(res, 500, { error: e.message });
    } finally {
      fs.rm(tmp, { force: true }, () => {});
    }
    return;
  }

  sendJson(res, 404, { error: "not found" });
});

/* 端口顺扫 */
let idx = 0;
function listenNext() {
  if (idx >= PORT_RANGE.length) {
    console.error("[chushi-pdf-bridge] 端口 27001-27005 全部被占用，退出。");
    process.exit(1);
  }
  const port = PORT_RANGE[idx++];
  server.once("error", (e) => {
    if (e.code === "EADDRINUSE") listenNext();
    else {
      console.error("[chushi-pdf-bridge] 监听失败：", e.message);
      process.exit(1);
    }
  });
  server.listen(port, "127.0.0.1", () => {
    const langs = installedLangs();
    console.log(`[chushi-pdf-bridge] v${VERSION} 就绪：http://127.0.0.1:${port}`);
    console.log(`  引擎: ${TESSERACT}（${engineReady() ? "OK" : "缺失"}）`);
    console.log(`  语言包: ${TESSDATA || "未找到"}（${langs.join(", ") || "空"}）`);
    if (!engineReady()) {
      console.log("  ⚠ 未找到 tesseract——/ocr 会返回 503；扩展将自动走浏览器引擎。");
    }
  });
}
listenNext();
