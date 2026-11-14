import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
const ZIP = "/home/z/beta-wt/download/v8.7.173/ChuShi-NewTab-v8.7.173.zip";
const STAGE = "/tmp/ext-inv"; const PROFILE = "/tmp/ext-inv-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";
fs.rmSync(STAGE, { recursive: true, force: true }); fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`); fs.rmSync(PROFILE, { recursive: true, force: true });
const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
  viewport: { width: 1280, height: 900 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
const page = browser.pages()[0] || (await browser.newPage());
page.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 120)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1800);
await page.mouse.click(640, 320, { button: "right" });
await page.waitForTimeout(600);
await page.getByText("PDF 工具箱").first().click();
await page.waitForTimeout(900);
await page.locator("button", { hasText: "PDF 转 Word" }).first().click({ timeout: 8000 });
await page.waitForTimeout(300);
await page.locator('input[type="file"]').setInputFiles("/tmp/pdf-samples-real/invoice.pdf");
await page.waitForTimeout(400);
const dlPromise = page.waitForEvent("download", { timeout: 60000 });
await page.locator("button", { hasText: "开始转换" }).first().click({ timeout: 6000 });
const dl = await dlPromise;
await dl.saveAs("/tmp/pdf-out-real/invoice2word.docx");
console.log("DOWNLOAD OK");
await browser.close();
