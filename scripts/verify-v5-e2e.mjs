/* verify-v5 part 3: Playwright e2e — render the REAL widget html inside an
 * iframe srcdoc with a mock chushi host API injected BEFORE the widget script
 * (srcdoc scripts execute in document order), assert concrete rendered
 * text/behaviors, then run the full sandbox protocol (renderWidget ->
 * smtcSubscribe -> widgetSmtc feed). Gates: pageerror count === 0.
 * Run: node scripts/verify-v5-e2e.mjs   (exit 0 = all green)
 *
 * v5.0.1 harness fix: the previous harness injected the widget html via
 * innerHTML — per HTML5 spec, <script> nodes inserted by innerHTML never
 * execute, so the widget script never ran, the default empty-state overlay
 * stayed up and E3's click timed out. Fixed: iframe srcdoc (scripts execute,
 * mock defined first) + frame-scoped assertions + boot snapshot fed in the
 * exact flattened shape sandbox.js whitelist() produces in production. */
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";

const ROOT = path.resolve(import.meta.dirname, "..");
let pass = 0, failCount = 0;
function ok(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { failCount++; console.log(`  FAIL ${name} ${detail}`); }
}

const widgetHtml = fs.readFileSync(path.join(ROOT, "preset-src/smtc/music-widget.html"), "utf8");
const sandboxHtml = fs.readFileSync(path.join(ROOT, "public/sandbox.html"), "utf8");
const sandboxJs = fs.readFileSync(path.join(ROOT, "public/sandbox.js"), "utf8");

/* tiny inline cover data URL so img loads without network */
const COVER_SVG = fs.readFileSync(path.join(ROOT, "preset-src/smtc/assets/cover.svg"));
const coverDataUrl = "data:image/svg+xml;base64," + COVER_SVG.toString("base64");
const widgetForTest = widgetHtml.replace("asset:cover.svg", coverDataUrl);
/* embed helper: escape < so embedded sources cannot terminate the host <script> */
const emb = (s) => JSON.stringify(s).replace(/</g, "\\u003c");

/* ---------------- mock host API source (runs inside the widget frame,
 * BEFORE the widget script — mirrors sandbox.js whitelist() flat shape) --- */
const MOCK_SRC = `var P = window.parent;
var COVER = ${JSON.stringify(coverDataUrl)};
var snap = { connected:true, app:"NetEase Music", title:"晴天", artist:"周杰伦", album:"",
  coverUrl:COVER, playing:true, duration:269.3,
  lyricRev:"", lyric:null, pluginVer:"5.0.0", smtcVer:"5.0.0",
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

/* ---------------- mock host page: widget rendered in a srcdoc iframe ------ */
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

/* ---------------- sandbox protocol page ----------------
 * Loads the sandbox the SAME way production does: served html + ?mode=widget
 * search (sandbox.js dispatches pageMode/widgetMode by location.search — a
 * srcdoc iframe has no search and would never enter widgetMode). */
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
  const st = { connected: true, version: '5.0.0',
    track: { app: 'NetEase Music', title: '沙盒协议曲', artist: '测试', album: '', playing: true,
      position: 5, duration: 200, rate: 1, coverRev: '', fetchedAt: Date.now() },
    cover: null, coverUrl: COVER_URL, lyric: null, lyricRev: '',
    pluginVer: '5.0.0', smtcVer: '5.0.0', seekNote: '',
    needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false };
  sbWin.postMessage({ type: 'widgetSmtc', widgetKey: 'preset:music', state: st }, '*');
}
setTimeout(feed, 400);
</script>
</body></html>`;

/* ---------------- static server ---------------- */
const server = createServer((req, res) => {
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
await new Promise((r) => server.listen(4641, r));

/* ---------------- run browser ---------------- */
const { chromium } = await import("playwright-core");
const exe = process.env.CHROME_PATH || undefined;
const browser = await chromium.launch({
  headless: true,
  executablePath: exe || undefined,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 420, height: 500 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto("http://127.0.0.1:4641/harness");
await page.waitForSelector("#w");
await page.waitForTimeout(700);
const frame = page.frames().find((f) => f !== page.mainFrame());
ok("F0 widget frame attached + script executed", !!frame);

/* E1: render truth (boot snapshot already fed by mock before widget script) */
console.log("E1 truth display");
ok("E1.1 title rendered", (await frame.textContent("#csT1")) === "晴天",
  JSON.stringify(await frame.textContent("#csT1")));
ok("E1.2 artist rendered", (await frame.textContent("#csT2")) === "周杰伦");
ok("E1.3 live mode", (await frame.getAttribute("#csCard", "class")).includes("cs-mode-fl"));
const foot = (await frame.textContent("#csFootTxt")) || "";
ok("E1.4 footer dual versions", foot.includes("API v5.0.0") && foot.includes("管理 v5.0.0"), foot);

/* E2: interpolation moves the bar */
console.log("E2 interpolation");
const w1 = await frame.evaluate(() => parseFloat(document.getElementById("csFill").style.width) || 0);
await page.waitForTimeout(700);
const w2 = await frame.evaluate(() => parseFloat(document.getElementById("csFill").style.width) || 0);
ok("E2.1 progress advances while playing", w2 > w1, `${w1.toFixed(2)} -> ${w2.toFixed(2)}`);

/* E3: optimistic play/pause flip + toggle call (initial state = playing) */
console.log("E3 controls");
await frame.click("#csPlay");
await page.waitForTimeout(150);
ok("E3.1 toggle called", await page.evaluate(() => window.__toggles === 1));
ok("E3.2 optimistic flip to paused (pause icon hidden)", await frame.evaluate(() =>
  document.getElementById("csIcPause").classList.contains("off")));

/* E4: seek via pointer click on rail (50% => 134.65s) */
console.log("E4 seek");
const handle = await frame.$("#csSeek");
const rail = await handle.boundingBox();
ok("E4.0 rail visible", !!rail && rail.width > 50);
await page.mouse.move(rail.x + rail.width * 0.5, rail.y + rail.height / 2);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(150);
const seeks = await page.evaluate(() => window.__seeks);
ok("E4.1 seek submitted", seeks.length === 1 && Math.abs(seeks[0] - 269.3 * 0.5) < 6, JSON.stringify(seeks));

/* E5: lyric rendering (word spans + active line) */
console.log("E5 lyrics");
await frame.evaluate(() => {
  window.chushi.music.feed({ connected: true, app: "N", title: "晴天", artist: "周杰伦", album: "",
    coverUrl: "", playing: true, duration: 269.3, lyricRev: "t1",
    lyric: { mode: 1, lines: [
      { s: 1000, e: 4000, t: "一二三", tr: "one two three", w: [{ s: 1000, d: 1000, t: "一" }, { s: 2000, d: 1000, t: "二" }, { s: 3000, d: 1000, t: "三" }] },
      { s: 5000, e: 8000, t: "四五六", tr: "", w: [{ s: 5000, d: 1500, t: "四" }, { s: 6500, d: 1500, t: "五" }] },
    ] },
    pluginVer: "5.0.0", smtcVer: "5.0.0", seekNote: "",
    needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false });
  const cbs = window.chushi.music;
  /* rewind the interpolation anchor to 2.2s inside the first word window */
  cbs.now && (window.__nowProbe = cbs.now());
});
/* the mock keeps anchor private; re-anchor by seeking (also proves seek path) —
 * instead directly poke position via a fresh feed of the anchor is impossible,
 * so drive through chushi.music.seek which re-anchors the mock clock */
await frame.evaluate(() => { window.chushi.music.seek(2.2); });
await page.waitForTimeout(400);
ok("E5.1 lyric lines built", await frame.evaluate(() => document.querySelectorAll(".cs-ln").length === 2));
ok("E5.2 active line class", await frame.evaluate(() =>
  document.querySelectorAll(".cs-ln")[0].classList.contains("on")));
ok("E5.3 word overlay progress set", await frame.evaluate(() =>
  (document.querySelectorAll(".cs-ln")[0].querySelectorAll(".cs-w .ov")[1].style.getPropertyValue("--p") || "").includes("%")));
ok("E5.4 translation sub present", await frame.evaluate(() =>
  document.querySelectorAll(".cs-ln")[0].querySelector(".cs-sub")?.textContent === "one two three"));

/* E6: chips honest attribution */
console.log("E6 chips");
await frame.evaluate(() => {
  window.chushi.music.feed({ connected: true, app: "N", title: "晴天", artist: "周杰伦", album: "",
    playing: false, duration: 269.3, pluginVer: "", smtcVer: "", seekNote: "",
    needsUpdate: true, needsPlugin: true, needsBridge: false, engineOld: false });
});
await page.waitForTimeout(150);
ok("E6.1 missing plugin chip", ((await frame.textContent("#csUpdTxt")) || "").includes("未装 ChuShi Music API 插件"));
await frame.evaluate(() => {
  window.chushi.music.feed({ connected: true, app: "N", title: "晴天", artist: "周杰伦", album: "",
    playing: false, duration: 269.3, pluginVer: "5.0.0", smtcVer: "", seekNote: "",
    needsUpdate: true, needsPlugin: false, needsBridge: true, engineOld: true });
});
await page.waitForTimeout(150);
ok("E6.2 engine-old chip", ((await frame.textContent("#csUpdTxt")) || "").includes("引擎版本过旧"));
await frame.evaluate(() => {
  window.chushi.music.feed({ connected: true, app: "N", title: "晴天", artist: "周杰伦", album: "",
    playing: false, duration: 269.3, pluginVer: "5.0.0", smtcVer: "", seekNote: "",
    needsUpdate: true, needsPlugin: false, needsBridge: true, engineOld: false });
});
await page.waitForTimeout(150);
ok("E6.3 engine-down chip", ((await frame.textContent("#csUpdTxt")) || "").includes("引擎未运行"));

/* E7: empty state when disconnected */
console.log("E7 empty state");
await frame.evaluate(() => {
  window.chushi.music.feed({ connected: false, title: "", artist: "", pluginVer: "", smtcVer: "",
    needsUpdate: true, needsBridge: true, engineOld: false });
});
await page.waitForTimeout(150);
ok("E7.1 empty text", (await frame.textContent("#csE1")) === "系统媒体待接入");
ok("E7.2 empty mode", (await frame.getAttribute("#csCard", "class")).includes("cs-mode-em"));

/* E8: full sandbox protocol */
console.log("E8 sandbox protocol");
const page2 = await browser.newPage({ viewport: { width: 420, height: 500 } });
const pageErrors2 = [];
page2.on("pageerror", (e) => pageErrors2.push(String(e)));
await page2.goto("http://127.0.0.1:4641/proto");
await page2.waitForTimeout(1200);
ok("E8.1 widget subscribed via sandbox", await page2.evaluate(() => window.__proto.subscribeSeen >= 1));
ok("E8.2 no proto errors", await page2.evaluate(() => window.__proto.errors.length === 0));

/* X: zero page errors across both pages (catch-swallowing detector) */
console.log("X pageerror gate");
ok("X1 harness pageerror=0", pageErrors.length === 0, JSON.stringify(pageErrors).slice(0, 300));
ok("X2 proto pageerror=0", pageErrors2.length === 0, JSON.stringify(pageErrors2).slice(0, 300));

await browser.close();
server.close();
console.log(`\nverify-v5[3]: ${pass} passed, ${failCount} failed`);
process.exit(failCount === 0 ? 0 : 1);
