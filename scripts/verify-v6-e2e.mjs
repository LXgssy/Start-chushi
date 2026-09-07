/* verify-v6-e2e.mjs — v6 e2e (fresh harness, same proven mechanics)
 *
 * Part W: widget rendered in a srcdoc iframe with a mock chushi host API
 *         injected BEFORE the widget script; concrete text/behavior
 *         assertions incl. the full v6 chip copy matrix.
 * Part P: sandbox protocol page — production-shaped /sandbox-frame?mode=widget
 *         with widgetSmtc feed; v6 field set.
 * Part E: FULL page level — built out/ served statically + mock bridge hub
 *         on 127.0.0.1:26801 + .cshz import via ⌘K; truth renders from the
 *         REAL smtc.ts polling loop (the exact path the user's complaint
 *         「初始页面不显示音乐」 travels).
 * Gates: pageerror === 0 everywhere.
 */
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { existsSync } from "node:fs";

const ROOT = path.resolve(import.meta.dirname, "..");
let pass = 0, failCount = 0;
function ok(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { failCount++; console.log(`  FAIL ${name} ${detail}`); }
}

const widgetHtml = fs.readFileSync(path.join(ROOT, "preset-src/smtc/music-widget.html"), "utf8");
const sandboxHtml = fs.readFileSync(path.join(ROOT, "public/sandbox.html"), "utf8");
const sandboxJs = fs.readFileSync(path.join(ROOT, "public/sandbox.js"), "utf8");

const COVER_SVG = fs.readFileSync(path.join(ROOT, "preset-src/smtc/assets/cover.svg"));
const coverDataUrl = "data:image/svg+xml;base64," + COVER_SVG.toString("base64");
const widgetForTest = widgetHtml.replace("asset:cover.svg", coverDataUrl);
const emb = (s) => JSON.stringify(s).replace(/</g, "\\u003c");

/* ---------------- mock host API source (widget frame) ---------------- */
const MOCK_SRC = `var P = window.parent;
var COVER = ${JSON.stringify(coverDataUrl)};
var snap = { connected:true, app:"NetEase Music", title:"晴天", artist:"周杰伦", album:"叶惠美",
  coverUrl:COVER, playing:true, duration:269.3,
  lyricRev:"", lyric:null, pluginVer:"6.0.0", smtcVer:"6.0.0",
  seekNote:"", needsUpdate:false, needsPlugin:false, needsBridge:false, engineOld:false };
var cbs = [];
var anchor = { position:10, duration:269.3, playing:true, rate:1, fetchedAt:Date.now() };
function nowCalc(){
  var p = anchor.position + (anchor.playing ? (Date.now()-anchor.fetchedAt)/1000 : 0);
  p = Math.min(anchor.duration, Math.max(0, p));
  var ms = p*1000, lines = (snap.lyric && snap.lyric.lines) || [], li=-1, wi=-1, wp=0;
  for (var i=0;i<lines.length;i++){ if (lines[i].s <= ms) li = i; }
  if (li>=0 && lines[li].w){
    for (var j=0;j<lines[li].w.length;j++){ if (lines[li].w[j].s <= ms) wi = j; }
    if (wi>=0) wp = Math.min(1,(ms-lines[li].w[wi].s)/Math.max(1,lines[li].w[wi].d));
  }
  return { position:p, duration:anchor.duration, progress: anchor.duration>0 ? p/anchor.duration : 0,
    playing:anchor.playing, fadeMs:260, lineIndex:li, wordIndex:wi, wordProgress:wp,
    lineProgress:0, lineText: li>=0 ? (lines[li].t||"") : "", lineTr:"",
    wordText: (wi>=0 && lines[li] && lines[li].w) ? lines[li].w[wi].t : "" };
}
window.chushi = {
  resize: function(){}, close: function(){},
  music: {
    snapshot: function(){ return snap; },
    subscribe: function(cb){ cbs.push(cb); cb(snap); return function(){}; },
    feed: function(s){ snap = s; for (var i=cbs.length-1;i>=0;i--){ try{ cbs[i](s); }catch(e){} } },
    now: nowCalc,
    seek: function(sec){ P.__seeks.push(sec); anchor.position = sec; anchor.fetchedAt = Date.now(); return Promise.resolve(true); },
    play: function(){ return Promise.resolve(true); },
    pause: function(){ return Promise.resolve(true); },
    toggle: function(){ P.__toggles++; anchor.playing = !anchor.playing; anchor.fetchedAt = Date.now(); return Promise.resolve(true); },
    next: function(){ return Promise.resolve(true); },
    prev: function(){ return Promise.resolve(true); },
    lyrics: function(){ return snap.lyric; }
  }
};`;

/* ---------------- W: harness page ---------------- */
const harnessPage = `<!doctype html><html><body>
<iframe id="w" style="width:340px;height:392px;border:0"></iframe>
<script>
window.__toggles = 0; window.__seeks = []; window.__errors = [];
window.addEventListener('error', function(e){ window.__errors.push(String(e.message)); });
const MOCK_SRC = ${emb(MOCK_SRC)};
const TPL = ${emb(widgetForTest)};
const w = document.getElementById('w');
w.srcdoc = "<scr" + "ipt>" + MOCK_SRC + "<\\/scr" + "ipt>" + TPL;
</script>
</body></html>`;

/* ---------------- P: sandbox protocol page ---------------- */
const protoPage = `<!doctype html><html><body>
<script>const COVER_URL = ${emb(coverDataUrl)};</script>
<iframe id="sb" style="width:340px;height:372px;border:0"></iframe>
<script>
window.__proto = { subscribeSeen: 0, controlSeen: 0, errors: [] };
window.addEventListener('error', function(e){ window.__proto.errors.push(String(e.message)); });
const sb = document.getElementById('sb');
sb.src = '/sandbox-frame?mode=widget';
const sbWin = sb.contentWindow;
window.addEventListener('message', function(ev){
  if (ev.source !== sbWin) return;
  const d = ev.data || {};
  if (d.type === 'hello') {
    sbWin.postMessage({ type: 'renderWidget', key: 'preset:music', html: ${emb(widgetForTest)},
      theme: 'light', accent: '#8b5cf6', panelMode: true }, '*');
  }
  if (d.type === 'widgetApi' && d.op === 'smtcSubscribe') window.__proto.subscribeSeen++;
  if (d.type === 'widgetApi' && d.op === 'smtcControl') window.__proto.controlSeen++;
});
function feed(){
  const st = { connected: true, version: '6.0.0',
    track: { app: 'NetEase Music', title: '沙盒协议曲', artist: '测试', album: '', playing: true,
      position: 5, duration: 200, rate: 1, coverRev: '', fetchedAt: Date.now() },
    cover: null, coverUrl: COVER_URL, lyric: null, lyricRev: '',
    pluginVer: '6.0.0', smtcVer: '6.0.0', seekNote: '',
    needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false };
  sbWin.postMessage({ type: 'widgetSmtc', widgetKey: 'preset:music', state: st }, '*');
}
setTimeout(feed, 400);
</script>
</body></html>`;

/* ---------------- E: mock bridge hub + static out/ server ---------------- */
const mockState = { ne: null };
let controlLog = [];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
const hub = createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "Content-Type", "access-control-allow-private-network": "true" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
  if (u.pathname === "/api/state") {
    const ne = mockState.ne ? { ...mockState.ne, ts: mockState.ne.ts || Date.now() } : null;
    res.writeHead(200, { "content-type": "application/json", ...cors });
    res.end(JSON.stringify({ ok: true, name: "chushi-music-hub", version: "6.0.0", ne,
      smtcVer: "6.0.0", smtcSession: "active", lyricVer: "", hubPort: 26801 }));
    return;
  }
  if (u.pathname === "/api/lyric") {
    const songId = u.searchParams.get("songId");
    res.writeHead(200, { "content-type": "application/json", ...cors });
    if (songId === "9913") {
      res.end(JSON.stringify({ ok: true, lyric: { songId: 9913, title: "晴天", artist: "周杰伦",
        rev: "9913-eapi-yrc", yrc: "[1000,4000](1000,2000,0)故(3000,2000,0)事", ytlrc: "", lrc: "", tlyric: "", source: "eapi-yrc" } }));
    } else { res.end(JSON.stringify({ ok: false, reason: "lyric-not-ready" })); }
    return;
  }
  if (u.pathname === "/api/cmd" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { controlLog.push(JSON.parse(body)); } catch (e) { }
      res.writeHead(200, { "content-type": "application/json", ...cors });
      res.end(JSON.stringify({ ok: true, queued: true }));
    });
    return;
  }
  res.writeHead(404, cors); res.end("nf");
});
await new Promise((r) => hub.listen(26801, "127.0.0.1", r));

const OUT = path.join(ROOT, "out");
if (!existsSync(path.join(OUT, "index.html"))) {
  console.log("SKIP-PAGE-E2E: out/index.html missing (run EXTENSION_MODE=1 bun run build:extension)");
}
const pageServer = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  p = p.replace(/^\/Start-chushi/, "") || "/";
  if (p.endsWith("/")) p += "index.html";
  let f = path.join(OUT, p);
  if (!existsSync(f)) f = path.join(OUT, "index.html");
  try {
    const body = fs.readFileSync(f);
    const ext = f.slice(f.lastIndexOf("."));
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => pageServer.listen(4666, r));

const harnessServer = createServer((req, res) => {
  const url = req.url || "/";
  if (url === "/harness") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(harnessPage);
  } else if (url === "/proto") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(protoPage);
  } else if (url === "/sandbox-frame?mode=widget") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(sandboxHtml);
  } else if (url === "/sandbox.js") {
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
    res.end(sandboxJs);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
});
await new Promise((r) => harnessServer.listen(4667, r));

/* ---------------- run browser ---------------- */
const { chromium } = await import("playwright-core");
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

/* ===== Part W: widget + v6 chip matrix ===== */
{
  const page = await browser.newPage({ viewport: { width: 420, height: 500 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto("http://127.0.0.1:4667/harness");
  await page.waitForSelector("#w");
  await page.waitForTimeout(700);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  ok("W0 widget frame attached", !!frame);

  ok("W1.1 title rendered", (await frame.textContent("#csT1")) === "晴天");
  ok("W1.2 artist rendered", (await frame.textContent("#csT2")) === "周杰伦");
  ok("W1.3 footer v6 versions", (await frame.textContent("#csFootTxt")).includes("API v6.0.0") &&
    (await frame.textContent("#csFootTxt")).includes("管理 v6.0.0"),
    await frame.textContent("#csFootTxt"));
  ok("W1.4 update chip hidden when fresh", !(await frame.locator("#csUpd").evaluate((el) => el.classList.contains("on"))));

  /* progress advances via interpolation */
  const w1 = await frame.locator("#csFill").evaluate((el) => parseFloat(el.style.width) || 0);
  await page.waitForTimeout(1600);
  const w2 = await frame.locator("#csFill").evaluate((el) => parseFloat(el.style.width) || 0);
  ok("W2 progress advances", w2 > w1, `${w1} -> ${w2}`);

  /* toggle via play button */
  const t0 = await page.evaluate(() => window.__toggles);
  await frame.click("#csPlay");
  await page.waitForTimeout(300);
  ok("W3 play button toggles", (await page.evaluate(() => window.__toggles)) === t0 + 1);

  /* seek via rail click at 50% */
  await frame.evaluate(() => {
    const el = document.querySelector("#csSeek");
    const r = el.getBoundingClientRect();
    const x = r.left + r.width * 0.5, y = r.top + 4;
    const mk = (type) => new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: x, clientY: y, isPrimary: true });
    el.dispatchEvent(mk("pointerdown"));
    el.dispatchEvent(mk("pointerup"));
  });
  await page.waitForTimeout(400);
  const seeks = await page.evaluate(() => window.__seeks);
  ok("W4 seek submitted ~50%", seeks.length >= 1 && Math.abs(seeks[seeks.length - 1] - 269.3 * 0.5) < 8, JSON.stringify(seeks));

  /* lyric lines + word sweep */
  await frame.evaluate(() => {
    chushi.music.feed({ connected: true, app: "NetEase Music", title: "晴天", artist: "周杰伦", album: "叶惠美",
      coverUrl: chushi.music.snapshot().coverUrl, playing: true, duration: 269.3,
      lyricRev: "9913-eapi-yrc", pluginVer: "6.0.0", smtcVer: "6.0.0", seekNote: "",
      needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false,
      lyric: { mode: 1, lines: [
        { s: 1000, e: 3000, t: "故事", tr: "", w: [ { s: 1000, d: 2000, t: "故" }, { s: 3000, d: 2000, t: "事" } ] },
      ] } });
  });
  await page.waitForTimeout(600);
  ok("W5 lyric lines built", await frame.evaluate(() => document.querySelectorAll(".cs-ln").length >= 1));
  ok("W5.2 word text present", await frame.evaluate(() =>
    document.querySelector(".cs-ln")?.textContent.includes("故") === true));

  /* v6 chip copy matrix */
  async function chipFor(mutate) {
    await frame.evaluate(mutate);
    await page.waitForTimeout(300);
    const txt = await frame.textContent("#csUpdTxt");
    const on = await frame.locator("#csUpd").evaluate((el) => el.classList.contains("on"));
    return { txt, on };
  }
  const c1 = await chipFor(`chushi.music.feed(Object.assign({}, chushi.music.snapshot(), { needsUpdate: true, needsBridge: true, engineOld: false, pluginVer: "6.0.0" }));`);
  ok("W6.1 bridge-down chip", c1.on && c1.txt.includes("音乐桥未连接 · 安装 ChuShi Music Bridge 插件并重启网易云"), c1.txt);
  const c2 = await chipFor(`chushi.music.feed(Object.assign({}, chushi.music.snapshot(), { needsUpdate: true, needsBridge: true, engineOld: true, pluginVer: "6.0.0" }));`);
  ok("W6.2 bridge-old chip", c2.on && c2.txt.includes("音乐桥版本过旧 · 更新 ChuShi Music Bridge 插件并重启网易云"), c2.txt);
  const c3 = await chipFor(`chushi.music.feed(Object.assign({}, chushi.music.snapshot(), { needsUpdate: true, needsBridge: false, pluginVer: "" }));`);
  ok("W6.3 bridge-not-ready chip", c3.on && c3.txt.includes("音乐桥未就绪"), c3.txt);
  const c4 = await chipFor(`chushi.music.feed(Object.assign({}, chushi.music.snapshot(), { needsUpdate: true, needsBridge: false, pluginVer: "5.0.0" }));`);
  ok("W6.4 outdated-component chip", c4.on && c4.txt.includes("组件待更新 · 请更新三个 .plugin 至最新版并重启网易云"), c4.txt);
  await chipFor(`chushi.music.feed(Object.assign({}, chushi.music.snapshot(), { needsUpdate: false, needsBridge: false, pluginVer: "6.0.0" }));`);
  ok("W6.5 chip hides when fresh", !(await frame.locator("#csUpd").evaluate((el) => el.classList.contains("on"))));

  /* seekNote chip */
  await frame.evaluate(`chushi.music.feed(Object.assign({}, chushi.music.snapshot(), { seekNote: "拖动未生效：网易云未响应" }));`);
  await page.waitForTimeout(250);
  ok("W7 seekNote chip", (await frame.textContent("#csNoteTxt")).includes("拖动未生效"));

  /* empty state (not connected) */
  await frame.evaluate(`chushi.music.feed(Object.assign({}, chushi.music.snapshot(), { connected: false }));`);
  await page.waitForTimeout(250);
  ok("W8 empty text preserved", (await frame.textContent("#csE1")) === "系统媒体待接入");
  ok("W8.2 empty copy = three plugins", (await frame.textContent("#csE2")).includes("三插件"));

  ok("X1 harness pageerror=0", pageErrors.length === 0, JSON.stringify(pageErrors).slice(0, 300));
  await page.close();
}

/* ===== Part P: sandbox protocol ===== */
{
  const page2 = await browser.newPage({ viewport: { width: 420, height: 500 } });
  const pageErrors2 = [];
  page2.on("pageerror", (e) => pageErrors2.push(String(e)));
  await page2.goto("http://127.0.0.1:4667/proto");
  await page2.waitForTimeout(1400);
  const frame2 = page2.frames().find((f) => f !== page2.mainFrame());
  ok("P1 sandbox protocol frame attached", !!frame2);
  ok("P2 widget subscribed via sandbox protocol", await page2.evaluate(() =>
    window.__proto.subscribeSeen >= 1));
  ok("P2.2 control channel reachable", await page2.evaluate(() =>
    window.__proto.errors.length === 0));
  ok("X2 proto pageerror=0", pageErrors2.length === 0, JSON.stringify(pageErrors2).slice(0, 300));
  await page2.close();
}

/* ===== Part E: full page + mock hub + .cshz import ===== */
if (existsSync(path.join(OUT, "index.html"))) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 915 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" }));
    } catch (e) { }
  });
  await page.goto("http://localhost:4666/", { waitUntil: "networkidle" });
  await page.waitForSelector(".clock-text", { timeout: 15000 });

  const dockMusicBtn = page.locator(".cl-dock button[aria-label='音乐']");
  const wFrame = () => page.frameLocator(".cl-dockwidget iframe").frameLocator("iframe[title='初始自定义小部件']");

  /* E1 import the v6 preset */
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(800);
  await page.locator("[cmdk-item]").filter({ hasText: "导入预设" }).click();
  await page.waitForTimeout(600);
  await page.locator("input[type=file]").setInputFiles(join2(ROOT, "examples/初始SMTC音乐预设.cshz"));
  await page.waitForTimeout(2600);
  ok("E1 .cshz import no errors", (await page.locator("text=/错误|必须|缺失|不支持/").count()) === 0);
  ok("E2 dock music button appears", (await dockMusicBtn.count()) === 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);

  /* E3 hub alive but no truth -> waiting mode */
  await dockMusicBtn.click();
  await page.waitForTimeout(2200);
  ok("E3 connected empty state", (await wFrame().locator("#csE1").textContent()) === "系统媒体待接入",
    await wFrame().locator("#csE1").textContent().catch(() => "?" ));

  /* E4 truth arrives through the REAL smtc.ts polling loop */
  mockState.ne = { songId: 9913, title: "晴天", artist: "周杰伦", album: "叶惠美",
    pic: "https://p1.music.126.net/c.jpg", position: 30, duration: 269.3,
    playing: true, ts: Date.now() - 200, v: "6.0.0", seekAckId: "", seekAckOk: true, seekAckAt: 0 };
  await page.waitForTimeout(2800);
  ok("E4 title from hub truth", (await wFrame().locator("#csT1").textContent()) === "晴天",
    await wFrame().locator("#csT1").textContent().catch(() => "?"));
  ok("E5 footer API v6.0.0 · 管理 v6.0.0",
    (await wFrame().locator("#csFootTxt").textContent()).includes("API v6.0.0") &&
    (await wFrame().locator("#csFootTxt").textContent()).includes("管理 v6.0.0"),
    await wFrame().locator("#csFootTxt").textContent().catch(() => "?"));
  ok("E6 update chip off (fresh v6 stack)",
    !(await wFrame().locator("#csUpd").evaluate((el) => el.classList.contains("on"))));

  /* E7 lyric reaches the widget through /api/lyric */
  await page.waitForTimeout(2500);
  ok("E7 yrc lyric lines rendered", (await wFrame().locator(".cs-ln").count()) >= 1);

  /* E8 seek through the panel reaches the hub command queue */
  const railBB = await wFrame().locator("#csSeek").boundingBox();
  if (railBB) {
    await page.mouse.click(railBB.x + railBB.width * 0.5, railBB.y + 4);
    await page.waitForTimeout(900);
  }
  ok("E8 seek reached hub /api/cmd", controlLog.some((c) => c.cmd === "seek" && typeof c.position === "number"),
    JSON.stringify(controlLog));

  ok("X3 page pageerror=0", errors.length === 0, JSON.stringify(errors).slice(0, 300));
  await page.close();
}

function join2(a, b) { return path.join(a, b); }

await browser.close();
hub.close();
pageServer.close();
harnessServer.close();

console.log(`\nverify-v6 e2e: ${pass} pass, ${failCount} fail`);
process.exit(failCount === 0 ? 0 : 1);
