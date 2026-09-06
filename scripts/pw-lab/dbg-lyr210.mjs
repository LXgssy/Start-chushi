import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* dbg-lyr210.mjs — 观察 LR 窗口内 /api/lyric 请求序列与歌词落地时机 */
const ROOT = "/home/z/my-project/out";
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon" };

let mockState = { ok: true, name: "chushi-smtc-bridge", version: "1.5.0-mock", track: null };
const mockLyrics = {};
const mockLyricDelay = {};
const lyricLog = []; // {t, v}
const PNG1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}
const T0 = Date.now();
const mock = createServer((req, res) => {
  cors(res);
  const u = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (u.pathname === "/api/state") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(mockState));
    return;
  }
  if (u.pathname === "/api/cover") { res.writeHead(200, { "content-type": "image/png" }); res.end(PNG1PX); return; }
  if (u.pathname === "/api/lyric") {
    const want = u.searchParams.get("v") || "";
    lyricLog.push({ t: ((Date.now() - T0) / 1000).toFixed(2), v: want });
    const lyr = mockLyrics[want];
    const delay = mockLyricDelay[want] || 0;
    const serve = () => {
      res.writeHead(200, { "content-type": "application/json" });
      if (lyr) res.end(JSON.stringify({ ok: true, rev: lyr.rev, lyric: lyr }));
      else res.end(JSON.stringify({ ok: false, reason: "no-lyric" }));
    };
    if (delay > 0) setTimeout(serve, delay); else serve();
    return;
  }
  res.writeHead(404); res.end();
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
await new Promise((r) => server.listen(4633, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 915 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try { localStorage.clear(); localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" })); } catch (e) {}
});
await page.goto("http://localhost:4633/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });

// 导入预设 + 打开面板（极简路径）
await page.keyboard.press("Control+k");
await page.waitForTimeout(800);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(600);
await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(2600);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

const wFrame = () => page.frameLocator(".cl-dockwidget iframe").frameLocator("iframe[title='初始自定义小部件']");
const lyricText = async () => { try { return await wFrame().locator("#ly").textContent(); } catch { return "(nf)"; } };
const snapInfo = async () => { try {
  const fr = page.frames().find((f) => f.url() === "about:srcdoc" && f.parentFrame() && (f.parentFrame().url() || "").includes("mode=widget"));
  if (!fr) return "(frame-not-found)";
  return await fr.evaluate(() => { const s = window.chushi && window.chushi.music ? window.chushi.music.snapshot() : null; return s ? { rev: s.lyricRev, n: s.lyric && s.lyric.lines ? s.lyric.lines.length : 0, t: s.title } : null; });
} catch (e) { return "err:" + e.message.split("\n")[0]; } };

// 基础播放态（晴天 + mock-lyr-1）——直接沿用 verify 的 LY 段参数
mockLyrics["mock-lyr-1"] = { rev: "mock-lyr-1", songId: 186016, title: "晴天", artist: "周杰伦", yrc: "[41000,12000](41000,3000,0)刮(44000,3000,0)风(47000,3000,0)这(50000,3000,0)天\n[53000,12000](53000,3000,0)等(56000,3000,0)一(59000,3000,0)等(62000,3000,0)天", ytlrc: "", lrc: "", tlyric: "", source: "mock" };
mockState = { ...mockState, track: { app: "网易云音乐", title: "晴天", artist: "周杰伦", album: "叶惠美", playing: true, position: 42.5, duration: 200, rate: 1, coverRev: "" }, ne: { songId: 186016, title: "晴天", artist: "周杰伦", album: "叶惠美", pic: "", positionMs: 42500, durationMs: 200000, playing: true, lyricRev: "mock-lyr-1" } };
const dockMusicBtn = page.locator(".cl-dock button[aria-label='音乐']");
await page.waitForTimeout(2200);
await dockMusicBtn.click();
await page.waitForTimeout(2600);
console.log("BASE lyric:", (await lyricText()).slice(0, 24));

// LR 序列
mockLyrics["lrp-a"] = { rev: "lrp-a", songId: 1, title: "竞A", artist: "T", yrc: "[1000,3000](1000,3000,0)甲\n[5000,3000](5000,3000,0)乙", lrc: "", tlyric: "", ytlrc: "", source: "mock" };
mockLyrics["lrp-b"] = { rev: "lrp-b", songId: 2, title: "竞B", artist: "T", yrc: "[1000,3000](1000,3000,0)丙\n[5000,3000](5000,3000,0)丁\n[9000,3000](9000,3000,0)戊", lrc: "", tlyric: "", ytlrc: "", source: "mock" };
mockLyricDelay["lrp-a"] = 1400;
console.log("\n-- 切 A (slow 1.4s) --");
mockState = { ...mockState, track: { ...mockState.track, title: "竞A" }, ne: { ...mockState.ne, songId: 1, title: "竞A", lyricRev: "lrp-a", positionMs: 1500 } };
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(500);
  console.log(`t+${(i + 1) * 0.5}s lyric:`, (await lyricText()).slice(0, 20), "| reqs:", JSON.stringify(lyricLog.slice(-3)));
  const fr = page.frames().find((f) => f.url() === "about:srcdoc" && f.parentFrame() && (f.parentFrame().url() || "").includes("mode=widget"));
  const t1v = fr ? await fr.evaluate(() => document.getElementById("t1") ? document.getElementById("t1").textContent : "(no-t1)").catch((e) => "err") : "(nf)";
  const lyCls = fr ? await fr.evaluate(() => { const l = document.getElementById("ly"); return l ? l.className + "|" + l.querySelectorAll(".lyline").length : "(no-ly)"; }).catch((e) => "err") : "(nf)";
  console.log("   snap:", JSON.stringify(await snapInfo()), "| t1:", t1v, "| ly:", lyCls);
  if (i === 0) {
    console.log("-- 切 B (inflight 窗口内) --");
    mockState = { ...mockState, track: { ...mockState.track, title: "竞B" }, ne: { ...mockState.ne, songId: 2, title: "竞B", lyricRev: "lrp-b", positionMs: 1500 } };
  }
}
console.log("\nlyricLog:", JSON.stringify(lyricLog));
await browser.close();
mock.close();
server.close();
