import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

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
await new Promise((r) => server.listen(4637, r));

mockLyric = { rev: "l", songId: 1, title: "晴天", artist: "周杰伦", yrc: "[38000,4000](38000,4000,0)测试歌词一行", ytlrc: "", lrc: "", tlyric: "", source: "m" };
mockState = { ...mockState, track: { app: "网易云音乐", title: "晴天", artist: "周杰伦", album: "叶惠美", playing: true, position: 0, duration: 0, rate: 1, coverRev: "" }, ne: { songId: 1, title: "晴天", artist: "周杰伦", album: "叶惠美", pic: "", positionMs: 40000, durationMs: 269300, playing: true, lyricRev: "l" } };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" })); } catch (e) {} });
await page.goto("http://localhost:4637/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(500);
await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(3600);
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

const cdp = await page.context().newCDPSession(page);
await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
const frames = [];
let t0 = 0;
cdp.on("Page.screencastFrame", (ev) => {
  const t = t0 ? Date.now() - t0 : 0;
  frames.push({ t, data: ev.data });
  try { cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }); } catch (e) {}
});

/* 第一开（冷） */
mkdirSync("/home/z/my-project/scripts/pw-lab/shots/cast", { recursive: true });
t0 = Date.now();
await page.locator(".cl-dock button[aria-label='音乐']").click();
await page.waitForTimeout(2500);
console.log("first-open frames:", frames.length, frames.map((f) => f.t).join(","));
frames.forEach((f, i) => writeFileSync(`/home/z/my-project/scripts/pw-lab/shots/cast/cold_${String(i).padStart(2, "0")}_${f.t}ms.png`, Buffer.from(f.data, "base64")));

/* 关闭再重开（热） */
frames.length = 0;
await page.keyboard.press("Escape");
await page.waitForTimeout(1000);
t0 = Date.now();
await page.locator(".cl-dock button[aria-label='音乐']").click();
await page.waitForTimeout(2000);
console.log("reopen frames:", frames.length, frames.map((f) => f.t).join(","));
frames.forEach((f, i) => writeFileSync(`/home/z/my-project/scripts/pw-lab/shots/cast/hot_${String(i).padStart(2, "0")}_${f.t}ms.png`, Buffer.from(f.data, "base64")));

await browser.close(); mock.close(); server.close();
console.log("done");
