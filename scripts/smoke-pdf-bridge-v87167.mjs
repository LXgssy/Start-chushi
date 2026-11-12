// smoke-pdf-bridge-v87167.mjs — v8.7.167 本地引擎下载入口真扩展冒烟
// 门 B1: 无桥态：选 OCR → 探测行「未检测到本地引擎」+ 下载链接（href 直达
//        Releases 官方 zip）+ 引导文案
// 门 B2: 起本地桥 → reload → 选 OCR → 探测行「本地引擎已就绪（127.0.0.1:27001）」
// 门 B3: 下载链接属性断言（target=_blank / rel=noreferrer / 官方域名）
// 门 B4: UI 状态与实际轨道一致：起桥态跑 OCR → doneMsg 本地引擎 + txt 下载
// 门 P:  pageerror === 0
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync, spawn } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.167/ChuShi-NewTab-v8.7.167.zip";
const STAGE = "/tmp/ext-smoke-bridge167";
const PROFILE = "/tmp/ext-profile-bridge167";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";
const SCAN = "/tmp/pdftest/scan.pdf";
const BRIDGE = "/home/z/beta-wt/bridge/chushi-pdf-bridge.js";
const WANT_URL =
  "https://github.com/LXgssy/Start-chushi/releases/download/pdf-bridge-v1.0.0/chushi-pdf-bridge-win64-v1.0.0.zip";

execSync(`mkdir -p /tmp/pdftest`);
if (!fs.existsSync(SCAN)) execSync(`python3 /home/z/beta-wt/scripts/gen-scanned-pdf.py`);

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

async function openOcrPanel() {
  await page.click("body", { button: "right", position: { x: 900, y: 650 } });
  await page.waitForTimeout(400);
  await page.locator("text=PDF 工具箱").first().click();
  await page.waitForTimeout(700);
  await page.locator('button:has-text("OCR 文字识别")').first().click();
  await page.waitForTimeout(300);
}

// ---------- 门 B1：无桥态 ----------
console.log("--- B1 无桥态 ---");
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1500);
await openOcrPanel();
// 探测行出现（先「正在探测」或直接终态）
await page.locator('p:has-text("正在探测本地 OCR 引擎")').first().waitFor({ timeout: 3000 }).catch(() => {});
const offRow = await page
  .locator('p:has-text("未检测到本地引擎")')
  .first()
  .waitFor({ timeout: 9000 })
  .then(() => true)
  .catch(() => false);
T("B1a 未检测态提示在位", offRow);
const link = page.locator('a:has-text("下载 Windows 本地引擎")').first();
const href = await link.getAttribute("href").catch(() => "");
T("B1b 下载链接 href=官方 Releases 直链", href === WANT_URL);
T("B1c 引导文案在位（解压双击）",
  (await page.locator('span:has-text("解压后双击 chushi-pdf-bridge.exe")').count()) === 1);

// ---------- 门 B3：链接属性（无桥态断言——就绪态不渲染下载入口，属设计） ----------
const attrs = await page.evaluate(() => {
  const a = [...document.querySelectorAll("a")].find((x) =>
    (x.textContent || "").includes("下载 Windows 本地引擎"));
  return a ? { target: a.target, rel: a.rel, href: a.href } : null;
});
T("B3a 下载链接 target=_blank", attrs?.target === "_blank");
T("B3b 下载链接 rel 含 noreferrer", (attrs?.rel || "").includes("noreferrer"));
T("B3c 下载链接指向 github.com 官方域", (attrs?.href || "").startsWith("https://github.com/LXgssy/Start-chushi/releases/"));

// ---------- 起本地桥 ----------
console.log("--- 起本地桥 ---");
const bridgeProc = spawn("node", [BRIDGE], { stdio: ["ignore", "pipe", "pipe"] });
let bridgeLog = "";
bridgeProc.stdout.on("data", (x) => (bridgeLog += x));
bridgeProc.stderr.on("data", (x) => (bridgeLog += x));
let bridgeUp = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  try {
    const j = JSON.parse(execSync("curl -s -m 2 http://127.0.0.1:27001/health").toString());
    if (j?.name === "chushi-pdf-bridge") { bridgeUp = true; break; }
  } catch {}
}
console.log("bridge:", bridgeUp ? bridgeLog.split("\n").slice(0, 2).join(" | ") : "FAILED\n" + bridgeLog);
T("B2a 桥进程就绪（/health name 精确校验）", bridgeUp);

// reload 清探活粘滞缓存 → 重开 OCR → 探测行「已就绪」
console.log("--- B2 有桥态 ---");
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(1800);
await openOcrPanel();
const onRow = await page
  .locator('p:has-text("本地引擎已就绪")')
  .first()
  .waitFor({ timeout: 9000 })
  .then(() => true)
  .catch(() => false);
T("B2b 探测行显示本地引擎已就绪", onRow);
const readyText = onRow
  ? await page.locator('p:has-text("本地引擎已就绪")').first().textContent().catch(() => "")
  : "";
T(`B2c 就绪文案含端口（${readyText.trim().slice(0, 48)}…）`, readyText.includes("127.0.0.1:27001"));

// ---------- 门 B4：UI 态与实际轨道一致（起桥跑 OCR） ----------
await page.evaluate(() => { const i = document.querySelector('input[type="file"]'); i.value = ""; });
await page.locator('input[type="file"]').setInputFiles([SCAN]);
await page.waitForTimeout(300);
await page.locator('#pdf-ocr-lang').selectOption("eng");
await page.waitForTimeout(200);
const dCnt = downloads.length;
await page.locator('button:has-text("开始识别")').first().click({ timeout: 5000 });
let done = "", err = "", sawLocal = false;
for (let i = 0; i < 120; i++) { // 60s 上限
  await page.waitForTimeout(500);
  const panel = '[aria-label="PDF 工具箱"]';
  done = await page.locator(`${panel} p:has-text("OCR 完成")`).first().textContent().catch(() => "");
  err = await page.locator(`${panel} .text-red-500, ${panel} .text-red-400`).first().textContent().catch(() => "");
  if (/本地引擎/.test(done + err)) sawLocal = true;
  const sts = await page.locator(`${panel} button`).allTextContents();
  if (sts.some((t) => t.includes("本地引擎"))) sawLocal = true;
  if (done || err) break;
}
console.log(`  本地轨 done=${done.trim() || "-"} err=${err.trim() || "-"}`);
T("B4a 起桥态 OCR 走本地引擎（doneMsg）", done.includes("本地引擎"));
T("B4b 状态栏出现过本地引擎字样", sawLocal);
T("B4c txt 下载事件", downloads.length > dCnt);
const preview = await page.locator('[aria-label="PDF 工具箱"] pre').textContent().catch(() => "");
T("B4d 识别出文本", /hello/i.test(preview));
if (err) console.log("  err:", err);

// ---------- 门 P ----------
T("P pageerror === 0", pageErrors.length === 0);
if (pageErrors.length) console.log("  pageerrors:", pageErrors.slice(0, 4));

bridgeProc.kill("SIGTERM");
await browser.close();

console.log(`\nSMOKE-PDF-BRIDGE-v87167: ${pass} PASS / ${bad.length} FAIL`);
if (bad.length) { console.log("FAILED:", ...bad); process.exit(1); }
