// smoke-pdf-ocr-v87166.mjs — v8.7.166 OCR 双轨真扩展冒烟
// 门 O1: OCR 磁贴在位 + 语言选择器在位
// 门 O2: 浏览器轨道（无桥）：tesseract.js WASM 在扩展页跑通（验证 extension_pages
//        CSP wasm-unsafe-eval 根修）→ 扫描件 PDF 识别出文字 + txt 下载
// 门 O3: 本地桥轨道：node 桥（PATH tesseract 5.5.0）探活命中 → doneMsg 本地引擎
// 门 O4: 桥 /health 从扩展页 fetch 可达（CORS + PNA 头齐备）
// 门 O5: pageerror === 0
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync, spawn } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.166/ChuShi-NewTab-v8.7.166.zip";
const STAGE = "/tmp/ext-smoke-ocr166";
const PROFILE = "/tmp/ext-profile-ocr166";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";
const SCAN = "/tmp/pdftest/scan.pdf";
// 测试素材自包含：无 scan.pdf 时用 PIL 现生成（scripts/gen-scanned-pdf.py 随库）
execSync(`mkdir -p /tmp/pdftest`);
if (!fs.existsSync(SCAN)) execSync(`python3 ${"/home/z/beta-wt/scripts/gen-scanned-pdf.py"}`);
const BRIDGE = "/home/z/beta-wt/bridge/chushi-pdf-bridge.js";

let pass = 0;
const bad = [];
const T = (name, cond) => {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { bad.push(name); console.log(`  [FAIL] ${name}`); }
};

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`);
fs.rmSync(PROFILE, { recursive: true, force: true });

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
  viewport: { width: 1280, height: 900 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
console.log("extension id:", extId);

const page = browser.pages()[0] || (await browser.newPage());
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 180)));
const downloads = [];
page.on("download", (d) => downloads.push(d.suggestedFilename?.() || ""));

await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1500);

// 打开 PDF 工具箱
await page.click("body", { button: "right", position: { x: 900, y: 650 } });
await page.waitForTimeout(400);
await page.locator("text=PDF 工具箱").first().click();
await page.waitForTimeout(700);

// ---------- 门 O1：磁贴 + 语言选择器 ----------
const tile = await page.locator('button:has-text("OCR 文字识别")').count();
T("O1a OCR 磁贴在位", tile >= 1);
await page.locator('button:has-text("OCR 文字识别")').first().click();
await page.waitForTimeout(300);
T("O1b 语言选择器在位（中英文混合默认）", await page.locator('#pdf-ocr-lang').count() === 1);

// 选扫描件 PDF
await page.evaluate(() => { const i = document.querySelector('input[type="file"]'); i.value = ""; });
await page.locator('input[type="file"]').setInputFiles([SCAN]);
await page.waitForTimeout(300);

// 切英文（沙箱无 chi_sim 语言包依赖，eng 语言包最小最快）
await page.locator('#pdf-ocr-lang').selectOption("eng");
await page.waitForTimeout(200);

// ---------- 门 O2：浏览器轨道 ----------
const eCnt = pageErrors.length, dCnt = downloads.length;
await page.locator('button:has-text("开始识别")').first().click({ timeout: 5000 });
let done2 = "", err2 = "", sawBrowserEngine = false;
for (let i = 0; i < 240; i++) { // 最长 96s
  await page.waitForTimeout(400);
  const panel = '[aria-label="PDF 工具箱"]';
  done2 = await page.locator(`${panel} p:has-text("OCR 完成")`).first().textContent({ timeout: 300 }).catch(() => "");
  err2 = await page.locator(`${panel} .text-red-500, ${panel} .text-red-400`).first().textContent({ timeout: 300 }).catch(() => "");
  const sts = await page.locator(`${panel} button`).allTextContents();
  if (sts.some((t) => t.includes("浏览器引擎"))) sawBrowserEngine = true;
  if (done2 || err2) break;
}
console.log(`  浏览器轨 done=${done2.trim() || "-"} err=${err2.trim() || "-"}`);
T("O2a 浏览器轨道跑通（tesseract.js WASM + CSP wasm-unsafe-eval）", done2.includes("浏览器引擎"));
T("O2b 状态栏出现过浏览器引擎字样", sawBrowserEngine);
T("O2c OCR txt 下载事件", downloads.length > dCnt);
const preview = await page.locator('[aria-label="PDF 工具箱"] pre').textContent().catch(() => "");
T(`O2d 识别出文本（预览含 OCR 关键词：${preview.slice(0, 60).replace(/\n/g, " ")}）`,
  /hello/i.test(preview) && /ocr|chushi|fox|dog/i.test(preview));
if (err2) console.log("  err:", err2);

// 关桥状态清场：重开面板（selectTool 重置），保证下一轮干净
await page.locator('[aria-label="PDF 工具箱"] button[aria-label="关闭 PDF 工具箱"]').click();
await page.waitForTimeout(400);

// ---------- 起本地桥（node 零依赖，PATH tesseract 5.5.0） ----------
console.log("starting bridge…");
const bridgeProc = spawn("node", [BRIDGE], { stdio: ["ignore", "pipe", "pipe"] });
let bridgeLog = "";
bridgeProc.stdout.on("d", (x) => (bridgeLog += x));
bridgeProc.stderr.on("d", (x) => (bridgeLog += x));
let bridgeUp = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const j = JSON.parse(execSync("curl -s -m 2 http://127.0.0.1:27001/health").toString());
    if (j?.name === "chushi-pdf-bridge") { bridgeUp = true; break; }
  } catch {}
}
console.log("bridge:", bridgeUp ? bridgeLog.split("\n").slice(0, 3).join(" | ") : "FAILED\n" + bridgeLog);
T("O3a 桥进程就绪（/health name 精确校验）", bridgeUp);

// 重载页面（清 60s 探活粘滞缓存）→ 重开工具箱 → 再跑 OCR（应走本地轨）
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(1800);
await page.click("body", { button: "right", position: { x: 900, y: 650 } });
await page.waitForTimeout(400);
await page.locator("text=PDF 工具箱").first().click();
await page.waitForTimeout(700);
await page.locator('button:has-text("OCR 文字识别")').first().click();
await page.waitForTimeout(300);
await page.evaluate(() => { const i = document.querySelector('input[type="file"]'); i.value = ""; });
await page.locator('input[type="file"]').setInputFiles([SCAN]);
await page.waitForTimeout(300);
await page.locator('#pdf-ocr-lang').selectOption("eng");
await page.waitForTimeout(200);

// ---------- 门 O4：扩展页 fetch 桥 /health（CORS/PNA 链路） ----------
const health = await page.evaluate(async () => {
  try {
    const r = await fetch("http://127.0.0.1:27001/health");
    const j = await r.json();
    return { ok: true, name: j.name, engine: j.engine };
  } catch (e) { return { ok: false, err: String(e).slice(0, 120) }; }
});
T(`O4 扩展页 fetch /health 可达（${health.ok ? `${health.name} / ${health.engine}` : health.err}）`,
  health.ok && health.name === "chushi-pdf-bridge");

// ---------- 门 O3：本地桥轨道 ----------
const dCnt3 = downloads.length;
await page.locator('button:has-text("开始识别")').first().click({ timeout: 5000 });
let done3 = "", err3 = "", sawLocalEngine = false;
for (let i = 0; i < 120; i++) { // 本地引擎应当更快，60s 上限
  await page.waitForTimeout(500);
  const panel = '[aria-label="PDF 工具箱"]';
  done3 = await page.locator(`${panel} p:has-text("OCR 完成")`).first().textContent().catch(() => "");
  err3 = await page.locator(`${panel} .text-red-500, ${panel} .text-red-400`).first().textContent().catch(() => "");
  if (/本地引擎/.test(done3 + err3)) { sawLocalEngine = true; }
  const sts3 = await page.locator(`${panel} button`).allTextContents();
  if (sts3.some((t) => t.includes("本地引擎"))) sawLocalEngine = true;
  if (done3 || err3) break;
}
console.log(`  本地轨 done=${done3.trim() || "-"} err=${err3.trim() || "-"}`);
T("O3b 本地桥轨道跑通（探活命中 → 原生 tesseract）", done3.includes("本地引擎"));
T("O3c 状态栏出现过本地引擎字样", sawLocalEngine);
T("O3d 本地轨 txt 下载事件", downloads.length > dCnt3);
const preview3 = await page.locator('[aria-label="PDF 工具箱"] pre').textContent().catch(() => "");
T("O3e 本地轨识别出文本", /hello/i.test(preview3));

// ---------- 门 O5 ----------
T("O5 pageerror === 0", pageErrors.length === 0);
if (pageErrors.length) console.log("  pageerrors:", pageErrors.slice(0, 4));

bridgeProc.kill("SIGTERM");
await browser.close();

console.log(`\nSMOKE-PDF-OCR-v87166: ${pass} PASS / ${bad.length} FAIL`);
if (bad.length) { console.log("FAILED:", ...bad); process.exit(1); }
