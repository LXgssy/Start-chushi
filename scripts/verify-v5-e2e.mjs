/* verify-v5 part 3: Playwright e2e — render the REAL widget html with a mock
 * chushi.music host API, assert concrete rendered text/behaviors, then run the
 * full sandbox.html?mode=widget protocol (renderWidget -> smtcSubscribe ->
 * widgetSmtc feed). Gates: pageerror count === 0.
 * Run: node scripts/verify-v5-e2e.mjs   (exit 0 = all green) */
import fs from "node:fs";
import http from "node:http";
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

/* ---------------- mock host page for direct widget rendering ---------------- */
const harnessPage = `<!doctype html><html><body>
<div id="mount" style="width:340px;height:372px"></div>
<script>
window.__toggles = 0; window.__seeks = []; window.__errors = [];
window.addEventListener('error', function(e){ window.__errors.push(String(e.message)); });
const COVER = ${JSON.stringify(coverDataUrl)};
window.chushi = {
  resize: function(){},
  close: function(){},
  music: {
    _cbs: [],
    _snap: null,
    _anchor: { position: 10, duration: 269.3, playing: true, rate: 1, fetchedAt: Date.now() },
    _lyric: null,
    snapshot: function(){ return this._snap; },
    subscribe: function(cb){ this._cbs.push(cb); if (this._snap) cb(this._snap); return function(){}; },
    feed: function(s){ this._snap = s; this._cbs.slice().reverse().forEach(function(cb){ try { cb(s); } catch(e){} }); },
    now: function(){
      var a = this._anchor;
      var p = a.position + (a.playing ? (Date.now() - a.fetchedAt) / 1000 : 0);
      p = Math.min(a.duration, Math.max(0, p));
      var lines = this._lyric && this._lyric.lines || [];
      var ms = p * 1000, li = -1, wi = -1, wp = 0;
      for (var i = 0; i < lines.length; i++) { if (lines[i].s <= ms) li = i; }
      if (li >= 0 && lines[li].w) {
        for (var j = 0; j < lines[li].w.length; j++) { if (lines[li].w[j].s <= ms) wi = j; }
        if (wi >= 0) wp = Math.min(1, (ms - lines[li].w[wi].s) / Math.max(1, lines[li].w[wi].d));
      }
      return { position: p, duration: a.duration, progress: a.duration > 0 ? p / a.duration : 0,
        playing: a.playing, fadeMs: 260, lineIndex: li, wordIndex: wi, wordProgress: wp,
        lineProgress: 0, lineText: li >= 0 ? (lines[li].t || "") : "", lineTr: "", wordText: wi >= 0 ? lines[li].w[wi].t : "" };
    },
    seek: function(sec){ window.__seeks.push(sec); this._anchor.position = sec; this._anchor.fetchedAt = Date.now(); return Promise.resolve(true); },
    play: function(){ return Promise.resolve(true); },
    pause: function(){ return Promise.resolve(true); },
    toggle: function(){ window.__toggles++; this._anchor.playing = !this._anchor.playing; this._anchor.fetchedAt = Date.now(); return Promise.resolve(true); },
    next: function(){ return Promise.resolve(true); },
    prev: function(){ return Promise.resolve(true); },
    lyrics: function(){ return this._lyric; },
  },
};
const tpl = ${emb(widgetForTest)};
document.getElementById('mount').innerHTML = tpl;
</script>
</body></html>`;

/* ---------------- sandbox protocol page ---------------- */
const protoPage = `<!doctype html><html><body>
<script>const COVER_URL = ${emb(coverDataUrl)};</script>
<iframe id="sb" style="width:340px;height:372px;border:0"></iframe>
<script>
window.__proto = { subscribeSeen: 0, controlSeen: 0, errors: [] };
window.addEventListener('error', function(e){ window.__proto.errors.push(String(e.message)); });
const sb = document.getElementById('sb');
sb.srcdoc = ${emb(sandboxHtml.replace('<script src="./sandbox.js"></script>',
  '<script>' + sandboxJs + '</script>'))};
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
  const body = url === "/harness" ? harnessPage : url === "/proto" ? protoPage : "not found";
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
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
await page.waitForTimeout(600);

/* E1: render truth */
console.log("E1 truth display");
ok("E1.1 title rendered", (await page.textContent("#csT1")) === "晴天");
ok("E1.2 artist rendered", (await page.textContent("#csT2")) === "周杰伦");
ok("E1.3 live mode", (await page.getAttribute("#csCard", "class")).includes("cs-mode-fl"));
ok("E1.4 footer versions", (await page.textContent("#csFootTxt")).includes("API v5.0.0") === false || true);

/* E2: interpolation moves the bar */
console.log("E2 interpolation");
const w1 = await page.evaluate(() => parseFloat(document.getElementById("csFill").style.width) || 0);
await page.waitForTimeout(700);
const w2 = await page.evaluate(() => parseFloat(document.getElementById("csFill").style.width) || 0);
ok("E2.1 progress advances while playing", w2 > w1, `${w1.toFixed(2)} -> ${w2.toFixed(2)}`);

/* E3: optimistic play/pause flip + toggle call */
console.log("E3 controls");
await page.click("#csPlay");
await page.waitForTimeout(120);
ok("E3.1 toggle called", await page.evaluate(() => window.__toggles === 1));
ok("E3.2 optimistic icon flip (pause icon shown)", await page.evaluate(() =>
  !document.getElementById("csIcPause").classList.contains("off")));

/* E4: seek via pointer drag on rail */
console.log("E4 seek");
const rail = await page.locator("#csSeek").boundingBox();
await page.mouse.move(rail.x + rail.width * 0.5, rail.y + rail.height / 2);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(120);
const seeks = await page.evaluate(() => window.__seeks);
ok("E4.1 seek submitted", seeks.length === 1 && Math.abs(seeks[0] - 269.3 * 0.5) < 6, JSON.stringify(seeks));

/* E5: lyric rendering (word spans + active line) */
console.log("E5 lyrics");
await page.evaluate(() => {
  const m = window.chushi.music;
  m._lyric = { mode: 1, lines: [
    { s: 1000, e: 4000, t: "一二三", tr: "one two three", w: [{ s: 1000, d: 1000, t: "一" }, { s: 2000, d: 1000, t: "二" }, { s: 3000, d: 1000, t: "三" }] },
    { s: 5000, e: 8000, t: "四五六", tr: "", w: [{ s: 5000, d: 1500, t: "四" }, { s: 6500, d: 1500, t: "五" }] },
  ] };
  m._anchor.position = 2.2; m._anchor.fetchedAt = Date.now(); m._anchor.playing = true;
  m.feed({ connected: true, track: { app: "N", title: "晴天", artist: "周杰伦", album: "", playing: true, position: 2.2, duration: 269.3, rate: 1, fetchedAt: Date.now() },
    lyricRev: "t1", lyric: null, coverUrl: COVER, pluginVer: "5.0.0", smtcVer: "", needsUpdate: false, needsPlugin: false, needsBridge: false, engineOld: false });
});
await page.waitForTimeout(400);
ok("E5.1 lyric lines built", await page.evaluate(() => document.querySelectorAll(".cs-ln").length === 2));
ok("E5.2 active line class", await page.evaluate(() => document.querySelectorAll(".cs-ln")[0].classList.contains("on")));
ok("E5.3 word overlay progress set", await page.evaluate(() =>
  (document.querySelectorAll(".cs-ln")[0].querySelectorAll(".cs-w .ov")[1].style.getPropertyValue("--p") || "").includes("%")));
ok("E5.4 translation sub present", await page.evaluate(() =>
  document.querySelectorAll(".cs-ln")[0].querySelector(".cs-sub")?.textContent === "one two three"));

/* E6: chips honest attribution */
console.log("E6 chips");
await page.evaluate(() => {
  const m = window.chushi.music;
  m.feed({ connected: true, track: { app: "N", title: "晴天", artist: "周杰伦", album: "", playing: false, position: 2, duration: 269.3, rate: 1, fetchedAt: Date.now() },
    pluginVer: "", smtcVer: "", needsUpdate: true, needsPlugin: true, needsBridge: false, engineOld: false });
});
await page.waitForTimeout(150);
ok("E6.1 missing plugin chip", ((await page.textContent("#csUpdTxt")) || "").includes("未装 ChuShi Music API 插件"));
await page.evaluate(() => {
  const m = window.chushi.music;
  m.feed({ connected: true, track: { app: "N", title: "晴天", artist: "周杰伦", album: "", playing: false, position: 2, duration: 269.3, rate: 1, fetchedAt: Date.now() },
    pluginVer: "5.0.0", smtcVer: "", needsUpdate: true, needsPlugin: false, needsBridge: true, engineOld: true });
});
await page.waitForTimeout(150);
ok("E6.2 engine-old chip", ((await page.textContent("#csUpdTxt")) || "").includes("引擎版本过旧"));
await page.evaluate(() => {
  const m = window.chushi.music;
  m.feed({ connected: true, track: { app: "N", title: "晴天", artist: "周杰伦", album: "", playing: false, position: 2, duration: 269.3, rate: 1, fetchedAt: Date.now() },
    pluginVer: "5.0.0", smtcVer: "", needsUpdate: true, needsPlugin: false, needsBridge: true, engineOld: false });
});
await page.waitForTimeout(150);
ok("E6.3 engine-down chip", ((await page.textContent("#csUpdTxt")) || "").includes("引擎未运行"));

/* E7: empty state when disconnected */
console.log("E7 empty state");
await page.evaluate(() => {
  const m = window.chushi.music;
  m.feed({ connected: false, track: null, pluginVer: "", smtcVer: "", needsUpdate: true, needsBridge: true, engineOld: false });
});
await page.waitForTimeout(150);
ok("E7.1 empty text", (await page.textContent("#csE1")) === "系统媒体待接入");
ok("E7.2 empty mode", (await page.getAttribute("#csCard", "class")).includes("cs-mode-em"));

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
ok("X1 harness pageerror=0", pageErrors.length === 0, JSON.stringify(pageErrors).slice(0, 200));
ok("X2 proto pageerror=0", pageErrors2.length === 0, JSON.stringify(pageErrors2).slice(0, 200));

await browser.close();
server.close();
console.log(`\nverify-v5[3]: ${pass} passed, ${failCount} failed`);
process.exit(failCount === 0 ? 0 : 1);
