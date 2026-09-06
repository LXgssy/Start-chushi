import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/z/my-project/out";
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
let mockState = { ok: true, name: "chushi-smtc-bridge", version: "1.3.0-mock", track: null };
let mockLyric = null;
const PNG1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
function cors(res) { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Private-Network", "true"); }
const mock = createServer((req, res) => {
  cors(res);
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/ping") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, name: "chushi-smtc-bridge", version: "1.3.0-mock" })); return; }
  if (u.pathname === "/api/state") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(mockState)); return; }
  if (u.pathname === "/api/cover") { res.writeHead(200, { "content-type": "image/png" }); res.end(PNG1PX); return; }
  if (u.pathname === "/api/lyric") { res.writeHead(200, { "content-type": "application/json" }); if (mockLyric) res.end(JSON.stringify({ ok: true, rev: mockLyric.rev, lyric: mockLyric })); else res.end(JSON.stringify({ ok: false, reason: "no-lyric" })); return; }
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
await new Promise((r) => server.listen(4633, r));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 915 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" })); } catch (e) {} });
await page.goto("http://localhost:4633/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });

await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(500);
await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(2400);

mockState = {
  ...mockState,
  track: { app: "网易云音乐", title: "晴天", artist: "周杰伦", album: "叶惠美", playing: true, position: 0, duration: 0, rate: 1, coverRev: "" },
  ne: { songId: 186016, title: "晴天", artist: "周杰伦", album: "叶惠美", pic: "", positionMs: 42500, durationMs: 200000, playing: true, lyricRev: "mock-lyr-1" },
};
mockLyric = {
  rev: "mock-lyr-1", songId: 186016, title: "晴天", artist: "周杰伦",
  yrc: "[41000,12000](41000,3000,0)刮(44000,3000,0)风(47000,3000,0)这(50000,3000,0)天\n[53000,12000](53000,3000,0)等(56000,3000,0)一(59000,3000,0)等(62000,3000,0)天\n",
  ytlrc: "[41000,12000](41000,12000,0)The wind blows today", lrc: "", tlyric: "", source: "mock-yrc",
};
await page.waitForTimeout(4000);

const wFrame = () => page.frameLocator(".cl-dockwidget iframe").frameLocator("iframe[title='初始自定义小部件']");
const info = await wFrame().locator("body").evaluate(() => {
  const s = window.chushi?.music?.snapshot?.();
  const ly = window.chushi?.music?.lyrics?.();
  return {
    hasApi: !!window.chushi?.music,
    connected: s?.connected,
    title: s?.title,
    lyricRev: s?.lyricRev,
    snapHasLyric: !!s?.lyric,
    snapLyricMode: s?.lyric?.mode,
    coreLyrics: ly ? ly.lines.length : null,
    coreMode: ly?.mode,
    domLines: document.querySelectorAll(".lyline").length,
    lyHidden: document.getElementById("ly")?.classList.contains("hd"),
    now: window.chushi?.music?.now?.(),
  };
});
console.log(JSON.stringify(info, null, 2));
console.log("pageerrors:", errors.length ? errors.join(" | ") : "none");
await browser.close(); mock.close(); server.close();
