import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/* shot-v190.mjs — v1.9.0 视觉验收截图：空态/播放态(默认唱片)/真封面/逐字歌词态 双主题 */
const ROOT = "/home/z/my-project/out";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
};
let mockState = { ok: true, name: "chushi-smtc-bridge", version: "1.2.0-mock", track: null };
let mockLyric = null;
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}
const mock = createServer((req, res) => {
  cors(res);
  const u = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (u.pathname === "/api/state") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(mockState));
    return;
  }
  if (u.pathname === "/api/cover") { res.writeHead(200, { "content-type": "image/png" }); res.end(PNG); return; }
  if (u.pathname === "/api/lyric") {
    res.writeHead(200, { "content-type": "application/json" });
    if (mockLyric) res.end(JSON.stringify({ ok: true, rev: mockLyric.rev, lyric: mockLyric }));
    else res.end(JSON.stringify({ ok: false }));
    return;
  }
  if (u.pathname === "/api/control") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true })); return; }
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
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(4633, r));

const YRC =
  "[41000,12000](41000,3000,0)刮(44000,3000,0)风(47000,3000,0)这(50000,3000,0)天\n" +
  "[53000,12000](53000,3000,0)等(56000,3000,0)一(59000,3000,0)等(62000,3000,0)天\n" +
  "[65000,14000](65000,3500,0)故(68500,3500,0)事(72000,3500,0)的(75500,3500,0)小(79000,3500,0)黄(82500,3500,0)花\n";
mockLyric = { rev: "mock-lyr-1", songId: 186016, title: "晴天", artist: "周杰伦", yrc: YRC, ytlrc: "", lrc: "", tlyric: "", source: "mock" };

const browser = await chromium.launch();
mkdirSync("/home/z/my-project/scripts/pw-lab/shots", { recursive: true });

for (const theme of ["dark", "light"]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 915 } });
  const page = await ctx.newPage();
  await page.addInitScript((t) => {
    try {
      localStorage.clear();
      localStorage.setItem("start:settings", JSON.stringify({ themeMode: t }));
    } catch (e) {}
  }, theme);
  await page.goto("http://localhost:4633/", { waitUntil: "networkidle" });
  await page.waitForSelector(".clock-text", { timeout: 15000 });
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(700);
  await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
  await page.waitForTimeout(500);
  await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
  await page.waitForTimeout(2500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const btn = page.locator(".cl-dock button[aria-label='音乐']");
  const popup = page.locator(".cl-dockwidget");

  // 1 空态
  await btn.click();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `/home/z/my-project/scripts/pw-lab/shots/v190-${theme}-1-empty.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);

  // 2 播放态（真封面 + 逐字歌词，SMTC 时间轴缺失走插件兜底）
  mockState = {
    ok: true, name: "chushi-smtc-bridge", version: "1.2.0-mock",
    track: { app: "网易云音乐", title: "晴天", artist: "周杰伦", album: "叶惠美", playing: true, position: 42.9, duration: 0, rate: 1, coverRev: "rev-1" },
    ne: { songId: 186016, title: "晴天", artist: "周杰伦", album: "叶惠美", pic: "https://mock-cover.test/pic.jpg", positionMs: 42900, durationMs: 269300, playing: true, lyricRev: "mock-lyr-1" },
  };
  await page.waitForTimeout(3400);
  await btn.click();
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `/home/z/my-project/scripts/pw-lab/shots/v190-${theme}-2-lyrics.png` });
  // 3 面板特写
  const box = await popup.boundingBox();
  if (box) {
    await page.screenshot({
      path: `/home/z/my-project/scripts/pw-lab/shots/v190-${theme}-3-closeup.png`,
      clip: { x: box.x - 14, y: box.y - 14, width: box.width + 28, height: box.height + 28 },
    });
  }
  await ctx.close();
}
await browser.close();
mock.close();
server.close();
console.log("shots done");
