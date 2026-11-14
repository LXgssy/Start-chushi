// repro-scan-excel.mjs — 聚焦 scan2excel：状态轮询定位卡点
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.173/ChuShi-NewTab-v8.7.173.zip";
const STAGE = "/tmp/ext-scan";
const PROFILE = "/tmp/ext-scan-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";

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
const page = browser.pages()[0] || (await browser.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 150)));

await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1800);
await page.mouse.click(640, 320, { button: "right" });
await page.waitForTimeout(600);
await page.getByText("PDF 工具箱").first().click();
await page.waitForTimeout(900);
await page.locator("button", { hasText: "PDF 转 Excel" }).first().click({ timeout: 8000 });
await page.waitForTimeout(300);
await page.locator('input[type="file"]').setInputFiles("/tmp/pdf-samples-real/scanned.pdf");
await page.waitForTimeout(400);
const dlPromise = page.waitForEvent("download", { timeout: 150000 });
try {
  await page.locator("button", { hasText: "开始转换" }).first().click({ timeout: 6000 });
} catch { /* busy 已启动 */ }

// 状态轮询：每 5s 打一次状态条 + 内存
for (let t = 0; t < 28; t++) {
  await page.waitForTimeout(5000);
  const st = await page.evaluate(() => {
    const t2 = document.body.innerText;
    const status = t2.match(/(OCR 识别[^\n]*|解析[^\n]*|还原[^\n]*|生成[^\n]*|识别[^\n]*)/)?.[0] || "";
    const done = t2.match(/已生成[^\n]*/)?.[0] || "";
    const err = t2.match(/(质量过低|未在该 PDF|没有可提取)[^\n]*/)?.[0] || "";
    return { status: status.slice(0, 40), done: done.slice(0, 50), err: err.slice(0, 60) };
  });
  console.log(`t=${(t + 1) * 5}s`, JSON.stringify(st));
  if (st.done || st.err) break;
}
try {
  const dl = await Promise.race([dlPromise, Promise.resolve(null)]);
  if (dl) {
    await dl.saveAs("/tmp/pdf-out-real/scan2excel.xlsx");
    console.log("DOWNLOAD OK");
  } else {
    console.log("NO DOWNLOAD within window");
  }
} catch (e) {
  console.log("download wait err:", e.message.split("\n")[0]);
}
console.log("pageerrors:", errors.length, errors.slice(0, 3));
await browser.close();
