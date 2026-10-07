/* 诊断：PDF→图片在扩展页的运行时错误 */
import { chromium } from "playwright-core";
import fs from "node:fs";

const EXT = "/tmp/ext-stage";
const PROFILE = "/tmp/pw-diag-profile";
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run"],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
const extId = sw.url().split("/")[2];

const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") console.log("[console]", m.type(), m.text().slice(0, 200));
});
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

await page.goto(`chrome-extension://${extId}/index.html`);
await page.waitForSelector(".search-pill");
/* 直接调 PdfTools：右键 */
await page.mouse.click(640, 400, { button: "right" });
await page.waitForTimeout(400);
await page.locator('[role="menuitem"]', { hasText: "PDF 工具箱" }).first().click();
await page.waitForTimeout(500);

/* 生成测试 PDF */
const { PDFDocument } = await import("pdf-lib");
const d = await PDFDocument.create();
const p = d.addPage([300, 300]);
p.drawText("Hello", { x: 40, y: 150, size: 18 });
fs.writeFileSync("/tmp/sniffer-test/minimal.pdf", await d.save());

const panel = page.locator('[aria-label="PDF 工具箱"]');
await panel.locator('button:has-text("PDF 转图片")').click();
await page.waitForTimeout(300);
await panel.locator('input[type="file"]').setInputFiles("/tmp/sniffer-test/minimal.pdf");
await panel.locator('button:has-text("转换为图片")').click();
await page.waitForTimeout(8000);
const body = await panel.textContent();
console.log("PANEL-TEXT:", body?.replace(/\s+/g, " ").slice(0, 400));
/* 检查 worker 可达性 */
const workerOk = await page.evaluate(async () => {
  try {
    const r = await fetch("/pdf.worker.min.mjs", { method: "HEAD" });
    return r.status;
  } catch (e) {
    return "ERR " + String(e);
  }
});
console.log("worker fetch:", workerOk);
await ctx.close();
