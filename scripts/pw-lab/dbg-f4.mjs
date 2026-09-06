import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/z/my-project/out";
const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain" };
let mockState = { ok: true, name: "chushi-smtc-bridge", version: "1.3.0-mock", track: null };
const reqLog = [];
function cors(res) { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); res.setHeader("Access-Control-Allow-Private-Network", "true"); }
const mock = createServer((req, res) => {
  cors(res);
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/state") {
    reqLog.push({ t: Date.now(), playing: mockState.track?.playing, pos: mockState.track?.position });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(mockState));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false }));
});
await new Promise((r) => mock.listen(20754, "127.0.0.1", r));
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  p = p.replace(/^\/Start-chushi/, "") || "/";
  if (p.endsWith("/")) p += "index.html";
  let f = join(ROOT, p);
  if (!existsSync(f)) f = join(ROOT, "index.html");
  try { const body = readFileSync(f); const ext = f.slice(f.lastIndexOf(".")); res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" }); res.end(body); } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(4634, r));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 915 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  try { localStorage.clear(); localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" })); } catch (e) {}
});
await page.goto("http://localhost:4634/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });

// import preset
await page.keyboard.press("Control+k");
await page.waitForTimeout(800);
await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
await page.waitForTimeout(600);
await page.locator("input[type=file]").setInputFiles("/home/z/my-project/examples/初始SMTC音乐预设.cshz");
await page.waitForTimeout(2600);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// playing @50 const
mockState = { ...mockState, track: { app: "网易云音乐", title: "晴天 (Live)", artist: "周杰伦", album: "叶惠美", playing: true, position: 50, duration: 269.3, rate: 1, coverRev: "" }, ne: null };
await page.waitForTimeout(2400);
const dockMusicBtn = page.locator(".cl-dock button[aria-label='音乐']");
await dockMusicBtn.click();
await page.waitForTimeout(2400);
const wFrame = () => page.frameLocator(".cl-dockwidget iframe").frameLocator("iframe[title='初始自定义小部件']");
const tC = () => wFrame().locator("#tC").textContent();
const barW = () => wFrame().locator("#bar").evaluate((el) => parseFloat(el.style.width) || 0);
console.log("baseline tC=", await tC(), "bar=", await barW());

// PAUSE artifact
mockState = { ...mockState, track: { ...mockState.track, playing: false, position: 0 } };
for (let i = 0; i < 6; i++) { await page.waitForTimeout(450); console.log("pause t=", (i + 1) * 450, "tC=", await tC(), "bar=", (await barW()).toFixed(2)); }

// RESUME artifact
mockState = { ...mockState, track: { ...mockState.track, playing: true, position: 0 } };
for (let i = 0; i < 8; i++) { await page.waitForTimeout(450); console.log("resume t=", (i + 1) * 450, "tC=", await tC(), "bar=", (await barW()).toFixed(2)); }

console.log("---state reqs (playing,pos) last 12---");
console.log(reqLog.slice(-12).map((r) => `${r.playing ? "P" : "s"}@${r.pos}`).join(" "));
console.log("errors:", errors.length, errors.slice(0, 3));
await browser.close(); mock.close(); server.close();
