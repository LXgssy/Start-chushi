import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* shot-v181.mjs — dock 风格磁贴视觉验收截图 */
const ROOT = "/home/z/my-project/out";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon",
};

/* 2×2 紫色渐变封面 96px */
const COVER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAGAAAABhCAYAAABY7WvfAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAh0lEQVR4nO3BMQEAAADCoPVPbQ0PoAAA4EwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgwYMGDAgAEDBgyYB0QbAAG9dKmnAAAAAElFTkSuQmCC",
  "base64"
);
let mockState = { ok: true, name: "chushi-smtc-bridge", version: "1.1.0", track: null };
const mock = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/state") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(mockState)); return; }
  if (u.pathname === "/api/ping") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, name: "chushi-smtc-bridge", version: "1.1.0" })); return; }
  if (u.pathname === "/api/cover") { res.writeHead(200, { "content-type": "image/png" }); res.end(COVER); return; }
  res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true }));
});
await new Promise((r) => mock.listen(20754, "127.0.0.1", r));

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  p = p.replace(/^\/Start-chushi/, "") || "/";
  if (p.endsWith("/")) p += "index.html";
  let f = join(ROOT, p);
  if (!existsSync(f)) f = join(ROOT, "index.html");
  try {
    const body = readFileSync(f);
    res.writeHead(200, { "content-type": MIME[f.slice(f.lastIndexOf("."))] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(4632, r));

const browser = await chromium.launch();
for (const theme of ["dark", "light"]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 915 } });
  const page = await ctx.newPage();
  await page.addInitScript((t) => {
    try {
      localStorage.clear();
      localStorage.setItem("start:settings", JSON.stringify({ themeMode: t, accent: "#8b5cf6" }));
    } catch (e) {}
  }, theme);
  await page.goto("http://localhost:4632/", { waitUntil: "networkidle" });
  await page.waitForSelector(".clock-text", { timeout: 15000 });

  // 导入 .cshz
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(700);
  await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
  await page.waitForTimeout(600);
  await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  const wFrame = page.frameLocator(".cl-widget iframe").frameLocator("iframe[title='初始自定义小部件']");

  // 1) 空态
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `shots/v181-${theme}-1-empty.png`, clip: { x: 880, y: 620, width: 400, height: 295 } });

  // 2) 紧凑条播放态
  mockState = { ...mockState, track: { app: "网易云音乐", title: "晴天", artist: "周杰伦", album: "叶惠美", playing: true, position: 42.5, duration: 269.3, rate: 1, coverRev: "r1" } };
  await page.waitForTimeout(2800);
  await page.screenshot({ path: `shots/v181-${theme}-2-compact.png`, clip: { x: 880, y: 780, width: 400, height: 135 } });

  // 3) 展开卡
  await wFrame.locator("#cp").click({ position: { x: 170, y: 34 } });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `shots/v181-${theme}-3-expanded.png`, clip: { x: 880, y: 600, width: 400, height: 315 } });

  await ctx.close();
}
await browser.close();
mock.close();
server.close();
console.log("shots done");
