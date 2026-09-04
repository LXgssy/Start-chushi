import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = "/home/z/my-project/out";
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
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
await new Promise((r) => server.listen(4620, r));
const B = "http://localhost:4620";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(B + "/", { waitUntil: "networkidle" });
await page.waitForSelector(".search-input", { timeout: 15000 });
await page.locator(".cl-dock button[aria-label='设置']").click();
await page.waitForTimeout(700);
await page.locator("[role='radiogroup'][aria-label='背景'] button", { hasText: "掠影" }).click();
await page.waitForTimeout(700);

const audit = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "导入");
  return btns.map((b) => ({
    cls: b.className.slice(0, 60),
    inPanel: !!b.closest(".glass-card"),
    disabled: b.disabled,
    rect: JSON.parse(JSON.stringify(b.getBoundingClientRect())),
    parentChain: (() => { let e = b, c = []; for (let i = 0; i < 5 && e; i++) { c.push(e.tagName + (e.className ? "." + String(e.className).split(" ")[0] : "")); e = e.parentElement; } return c.join(" < "); })(),
  }));
});
console.log("两个导入按钮审计:", JSON.stringify(audit, null, 2));

await page.fill("input[aria-label='壁纸直链 URL']", `${B}/test-wall.png`);
await page.waitForTimeout(250);
const before = await page.evaluate(() => document.querySelector("input[aria-label='壁纸直链 URL']").value);
await page.locator("input[aria-label='壁纸直链 URL']").press("Enter");
await page.waitForTimeout(500);
const after = await page.evaluate(() => ({
  val: document.querySelector("input[aria-label='壁纸直链 URL']")?.value,
  settings: JSON.parse(localStorage.getItem("start:settings") ?? "{}"),
}));
console.log("input before:", before, "| after:", after.val, "| wallpaperUrl:", after.settings.wallpaperUrl, "| photoId:", after.settings.photoId);
await browser.close();
server.close();
