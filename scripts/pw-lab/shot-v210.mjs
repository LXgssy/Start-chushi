import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/* shot-v210.mjs — v2.1.0 视觉验收：
 *   panel-*      播放态（向下关闭箭头 + 双层 clip-path 逐字扫色）
 *   open-mid-*   开面板 ~100ms 中帧（v2.0.0 在此闪灰白——现应为实体暗卡模糊聚拢）
 *   drag-mid-*   进度条拖动中帧（预览跟手）
 *   switching-*  音乐→待办切换中帧（拉伸+模糊，无两段式空档）
 */
const ROOT = "/home/z/my-project/out";
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
let mockState = { ok: true, name: "chushi-smtc-bridge", version: "1.3.0-mock", track: null };
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
await new Promise((r) => server.listen(4635, r));

mockLyric = {
  rev: "shot-lyr", songId: 186016, title: "晴天", artist: "周杰伦",
  yrc:
    "[38000,4000](38000,1200,0)故(39200,1200,0)事(40400,1200,0)的(41600,1200,0)小(42800,1200,0)黄(44000,2000,0)花\n" +
    "[46000,5000](46000,1500,0)从(47500,1500,0)出(49000,1500,0)生(50500,1000,0)年(51500,1000,0)那(52500,1000,0)年(53500,1000,0)就(54500,1000,0)飘(55500,1000,0)着\n",
  ytlrc: "[38000,6000](38000,6000,0)The little yellow flower of the story\n[46000,5000](46000,5000,0)has been drifting since the year of birth",
  lrc: "", tlyric: "", source: "shot",
};
mockState = {
  ...mockState,
  track: { app: "网易云音乐", title: "晴天", artist: "周杰伦", album: "叶惠美", playing: true, position: 0, duration: 0, rate: 1, coverRev: "shot-cover" },
  ne: { songId: 186016, title: "晴天", artist: "周杰伦", album: "叶惠美", pic: "", positionMs: 47000, durationMs: 269300, playing: true, lyricRev: "shot-lyr" },
};

const browser = await chromium.launch();
mkdirSync("/home/z/my-project/scripts/pw-lab/shots/v210", { recursive: true });
const OUT = "/home/z/my-project/scripts/pw-lab/shots/v210";

for (const theme of ["dark", "light"]) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await page.route("**/mock-cover.test/**", (r) => r.fulfill({ body: PNG1PX, contentType: "image/png" }));
  await page.addInitScript((t) => { try { localStorage.clear(); localStorage.setItem("start:settings", JSON.stringify({ themeMode: t })); } catch (e) {} }, theme);
  await page.goto("http://localhost:4635/", { waitUntil: "networkidle" });
  await page.waitForSelector(".clock-text", { timeout: 15000 });
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(700);
  await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
  await page.waitForTimeout(500);
  await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
  await page.waitForTimeout(3600);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  /* 开面板中帧：v2.0.0 在 ~100ms 处壳体 opacity<1 透出壁纸（闪灰白） */
  await page.locator(".cl-dock button[aria-label='音乐']").click();
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${OUT}/open-mid-${theme}.png` });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/panel-${theme}.png` });
  /* 拖动中帧：按住进度条拖到 ~60% 采样（预览应跟手） */
  {
    const box = await page.frameLocator(".cl-dockwidget iframe").frameLocator("iframe[title='初始自定义小部件']").locator("#sk").boundingBox();
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 6 });
    await page.waitForTimeout(140);
    await page.screenshot({ path: `${OUT}/drag-mid-${theme}.png` });
    await page.mouse.up();
    await page.waitForTimeout(800);
  }
  /* 切换中帧 */
  await page.locator(".cl-dock button[aria-label='待办']").click();
  await page.waitForTimeout(140);
  await page.screenshot({ path: `${OUT}/switching-${theme}.png` });
  await page.waitForTimeout(1200);
  await page.close();
}
await browser.close(); mock.close(); server.close();
console.log("shots done ->", OUT);
