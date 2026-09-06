import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/z/my-project/out";
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
let mockState = { ok: true, name: "chushi-smtc-bridge", version: "mock", track: null };
let mockLyric = null;
const PNG1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
function cors(res) { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Private-Network", "true"); }
const mock = createServer((req, res) => {
  cors(res);
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/state") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(mockState)); return; }
  if (u.pathname === "/api/cover") { res.writeHead(200, { "content-type": "image/png" }); res.end(PNG1PX); return; }
  if (u.pathname === "/api/lyric") { res.writeHead(200, { "content-type": "application/json" }); if (mockLyric) res.end(JSON.stringify({ ok: true, rev: mockLyric.rev, lyric: mockLyric })); else res.end(JSON.stringify({ ok: false })); return; }
  res.writeHead(404); res.end();
});
await new Promise((r) => mock.listen(20754, "127.0.0.1", r));
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  p = p.replace(/^\/Start-chushi/, "") || "/";
  if (p.endsWith("/")) p += "index.html";
  let f = join(ROOT, p);
  if (!existsSync(f)) f = join(ROOT, "index.html");
  try { const body = readFileSync(f); res.writeHead(200, { "content-type": MIME[f.slice(f.lastIndexOf("."))] ?? "application/octet-stream" }); res.end(body); } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(4638, r));

mockLyric = { rev: "l", songId: 1, title: "晴天", artist: "周杰伦", yrc: "[38000,4000](38000,4000,0)测试", ytlrc: "", lrc: "", tlyric: "", source: "m" };
mockState = { ...mockState, track: { app: "云", title: "晴天", artist: "周杰伦", album: "叶惠美", playing: true, position: 0, duration: 0, rate: 1, coverRev: "" }, ne: { songId: 1, title: "晴天", artist: "周杰伦", album: "叶", pic: "", positionMs: 40000, durationMs: 269300, playing: true, lyricRev: "l" } };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" })); } catch (e) {} });
await page.goto("http://localhost:4638/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(500);
await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(3600);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

/* 页内 rAF 逐帧记录：stage/view/iframe 尺寸、::after 状态、类 */
await page.evaluate(() => {
  window.__frames = [];
  const stage = document.querySelector(".cl-stage");
  const view = document.querySelector(".cl-dockwidget");
  const t0 = performance.now();
  function loop() {
    const cs = getComputedStyle(view);
    const aft = getComputedStyle(view, "::after");
    const stageCS = getComputedStyle(stage);
    window.__frames.push({
      t: Math.round(performance.now() - t0),
      stageH: Math.round(stage.getBoundingClientRect().height),
      viewOp: cs.opacity,
      aftOp: aft.opacity,
      aftBg: aft.backgroundColor,
      cls: view.className.replace("content-focus-solid", "cfs").slice(0, 80),
    });
    if (performance.now() - t0 < 1500) requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
});
await page.locator(".cl-dock button[aria-label='音乐']").click();
await page.waitForTimeout(1600);
const frames = await page.evaluate(() => window.__frames);
for (let i = 0; i < frames.length; i += 2) {
  console.log(JSON.stringify(frames[i]));
}
await browser.close(); mock.close(); server.close();
