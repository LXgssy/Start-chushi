import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = "/home/z/my-project/out";
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/Start-chushi/, "") || "/";
  if (p.endsWith("/")) p += "index.html";
  if (p === "/test-wall.png") { res.writeHead(200, { "content-type": "image/png" }); res.end(PNG_1PX); return; }
  let f = join(ROOT, p);
  if (!existsSync(f)) f = join(ROOT, "index.html");
  res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(4619, r));
const B = "http://localhost:4619";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 120)); });
await page.goto(B + "/", { waitUntil: "networkidle" });
await page.waitForSelector(".search-input", { timeout: 15000 });

/* dock 里的按钮清单（找设置入口） */
const dockBtns = await page.evaluate(() =>
  [...document.querySelectorAll(".cl-dock button")].map((b) => b.getAttribute("aria-label"))
);
console.log("dock buttons:", JSON.stringify(dockBtns));

const settingsBtn = page.locator(".cl-dock button[aria-label*='设置']");
console.log("settings btn count:", await settingsBtn.count());
await settingsBtn.first().click();
await page.waitForTimeout(700);

/* 设置面板可见？ */
const panelText = await page.evaluate(() => document.body.innerText.slice(0, 100).replace(/\n/g, "|"));
console.log("panel visible text:", panelText);

const bgGroup = await page.locator("[role='radiogroup'][aria-label='背景']").count();
console.log("bg radiogroup count:", bgGroup);
if (bgGroup) {
  await page.locator("[role='radiogroup'][aria-label='背景'] button", { hasText: "掠影" }).click();
  await page.waitForTimeout(700);
}
const urlInputCount = await page.locator("input[aria-label='壁纸直链 URL']").count();
console.log("url input count:", urlInputCount);
const importBtns = await page.evaluate(() =>
  [...document.querySelectorAll("button")].filter((b) => b.textContent?.includes("导入")).map((b) => b.textContent?.trim())
);
console.log("'导入' buttons:", JSON.stringify(importBtns));

await page.fill("input[aria-label='壁纸直链 URL']", `${B}/test-wall.png`);
await page.waitForTimeout(200);
const disabled = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "导入");
  return btns.map((b) => ({ disabled: b.disabled }));
});
console.log("导入按钮 disabled 状态:", JSON.stringify(disabled));
/* 点击真正的「导入」（文本精确等于） */
const exact = page.locator("button", { hasText: /^导入$/ }).last();
console.log("exact 导入 count:", await exact.count());
await exact.click();
await page.waitForTimeout(500);
const s = await page.evaluate(() => localStorage.getItem("start:settings"));
console.log("settings:", s);
const hint = await page.evaluate(() => {
  const ps = [...document.querySelectorAll("p")].map((p) => p.textContent ?? "");
  return ps.find((t) => t.includes("http") || t.includes("仅支持") || t.includes("直链"));
});
console.log("hint:", hint);
await browser.close();
server.close();
