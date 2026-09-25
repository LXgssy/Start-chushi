// dbg-dl-tree.mjs — 诊断 dl closed shadow 的 CDP 树结构（shadowRoots 挂载形态）
import { chromium } from "playwright-core";
import crypto from "crypto";
import http from "http";
import { rmSync } from "fs";
import { execSync } from "child_process";

const ROOT = "/tmp/ext-beta";
const ZIP = "/tmp/beta-wt/download/v8.7.20/ChuShi-NewTab-v8.7.20.zip";
const PROFILE = "/tmp/v8720-dbg-profile";
const HUB_PORT = 26904;
const YRC = "[1000,3200](1000,800,0)第一(1800,1100,0)句歌(2900,1300,0)词哦";
let hubT0 = Date.now();
const hub = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") { res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "*"); res.end(""); return; }
  const url = req.url || "";
  if (url.startsWith("/api/ping")) res.end(JSON.stringify({ ok: true, name: "chushi-music-hub", version: "mock-v8720" }));
  else if (url.startsWith("/api/state")) {
    const pos = (Date.now() - hubT0) / 1000 + 0.3;
    res.end(JSON.stringify({ ne: { songId: 186016, title: "Mock Song", artist: "Tester", album: "VA", playing: true, position: pos, duration: 240, pic: "", ts: Date.now() } }));
  } else if (url.startsWith("/api/lyric")) res.end(JSON.stringify({ ok: true, lyric: { songId: "186016", lrc: "", yrc: YRC, tlyric: "", ytlrc: "" } }));
  else if (url.startsWith("/reset")) { hubT0 = Date.now(); res.end("ok"); }
  else { res.setHeader("Content-Type", "text/html"); res.end("<!DOCTYPE html><html><head><title>mock</title></head><body><h1>mock</h1></body></html>"); }
});
hub.listen(HUB_PORT, "127.0.0.1");
let hubReqCount = 0;
hub.on("request", (req) => { if (++hubReqCount % 3 === 1) console.log("HUB-REQ", req.method, (req.url || "").slice(0, 50)); });
hub.on("error", (e) => console.log("HUB-ERR", e.code || String(e).slice(0, 60)));
hub.on("close", () => console.log("HUB-CLOSED"));
hub.on("clientError", (e) => console.log("HUB-CLIENTERR", String(e).slice(0, 40)));
setInterval(() => { fetch(`http://127.0.0.1:${HUB_PORT}/api/ping`).then((r) => r.text()).then((t) => console.log("HUB-SELFCHK OK", t.slice(0, 20))).catch((e) => console.log("HUB-SELFCHK FAIL", String(e).slice(0, 40))); }, 4000).unref();
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
rmSync(PROFILE, { recursive: true, force: true });
rmSync(ROOT, { recursive: true, force: true });
execSync(`mkdir -p ${ROOT} && cd ${ROOT} && unzip -o -q ${ZIP}`);
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, "--no-first-run", "--no-sandbox", `--log-net-log=/tmp/netlog-v8720.json`],
});
process.on("exit", () => { try { ctx.close(); } catch { } try { hub.close(); } catch { } });
const page = await ctx.newPage({ viewport: { width: 1100, height: 700 } });
await page.goto(`chrome-extension://${EXT_ID}/shell.html`, { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 });
let af = null;
for (let i = 0; i < 20 && !af; i++) {
  af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
  if (!af) await sleep(500);
}
await sleep(4000);
await af.evaluate(() => chrome.storage.local.set({ cardDlyric: true }));
await sleep(400);
await fetch(`http://127.0.0.1:${HUB_PORT}/reset`);
const page2 = await ctx.newPage({ viewport: { width: 900, height: 600 } });
await page2.goto(`http://127.0.0.1:${HUB_PORT}/`, { waitUntil: "load", timeout: 15000 });
await sleep(4000);

const cdp = await ctx.newCDPSession(page2);
await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
const { root } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
let host = null;
(function walk(n) {
  if (host) return;
  const attrs = n.attributes || [];
  for (let k = 0; k + 1 < attrs.length; k += 2) if (attrs[k] === "id" && attrs[k + 1] === "chushi-dlyric-host") { host = n; return; }
  (n.children || []).forEach(walk);
  (n.shadowRoots || []).forEach(walk);
})(root);
if (!host) { console.log("HOST NOT FOUND"); process.exit(1); }
console.log("host keys:", Object.keys(host).join(","));
console.log("host children:", (host.children || []).length, "shadowRoots:", (host.shadowRoots || []).length);
function dump(n, depth, prefix) {
  const attrs = (n.attributes || []);
  let cls = "", id = "";
  for (let k = 0; k + 1 < attrs.length; k += 2) { if (attrs[k] === "class") cls = attrs[k + 1]; if (attrs[k] === "id") id = attrs[k + 1]; }
  const txt = n.nodeType === 3 ? JSON.stringify((n.nodeValue || "").slice(0, 22)) : "";
  console.log(`${prefix}${n.nodeName}${id ? "#" + id : ""}${cls ? "." + cls.split(" ").join(".") : ""} ${txt}`);
  if (depth <= 0) return;
  (n.children || []).forEach((c) => dump(c, depth - 1, prefix + "  "));
  (n.shadowRoots || []).forEach((sr) => { console.log(prefix + "  [shadowRoot]"); dump(sr, depth - 1, prefix + "    "); });
}
dump(host, 6, "");
/* SW 内部状态直查（Playwright Worker.evaluate）：hubPort/cards.size/state */
let sw = ctx.serviceWorkers().length ? ctx.serviceWorkers()[0] : null;
if (!sw) {
  sw = await Promise.race([
    new Promise((res) => ctx.once("serviceworker", res)),
    sleep(3000).then(() => null),
  ]);
}
if (sw) {
  const info = await sw.evaluate(() => ({
    hubPort: typeof hubPort !== "undefined" ? hubPort : null,
    hasState: !!state,
    title: state && state.ne ? state.ne.title : null,
    cards: typeof cards !== "undefined" ? cards.size : -1,
  })).catch((e) => ({ err: String(e).slice(0, 80) }));
  console.log("SW:", JSON.stringify(info));
  const probe = await sw.evaluate(async () => {
    const out = { pings: {} };
    for (const p of [26901, 26902, 26903]) {
      const j = await getJson(`http://127.0.0.1:${p}/api/ping`, 900);
      out.pings[p] = j ? JSON.stringify(j).slice(0, 70) : "NULL";
    }
    await pollState();
    out.hubPortAfter = hubPort;
    out.stateAfter = !!state;
    return out;
  }).catch((e) => ({ err: String(e).slice(0, 120) }));
  console.log("SW-probe:", JSON.stringify(probe));
  const rawErr = await sw.evaluate(async () => {
    try {
      const r = await fetch("http://127.0.0.1:26903/api/ping");
      return "OK " + (await r.text()).slice(0, 60);
    } catch (e) { return "ERR " + String(e && e.message || e).slice(0, 160); }
  }).catch((e) => "EVAL-ERR " + String(e).slice(0, 120));
  console.log("SW-rawfetch:", rawErr);
  /* 隔离实验：SW fetch 全新端口（27000）vs 页面 fetch hub（26903）vs SW fetch hub */
  const expSrv = http.createServer((q, s2) => { s2.setHeader("Access-Control-Allow-Origin", "*"); s2.end(JSON.stringify({ ok: true, name: "chushi-music-hub", fresh: true })); });
  await new Promise((r) => expSrv.listen(27000, "127.0.0.1", r));
  const exp = await sw.evaluate(async () => {
    const out = {};
    try { const r = await fetch("http://127.0.0.1:27000/api/ping"); out.swFresh = "OK " + (await r.text()).slice(0, 40); }
    catch (e) { out.swFresh = "ERR " + String(e && e.message || e).slice(0, 80); }
    try { const r = await fetch("http://127.0.0.1:26903/api/ping"); out.swHub = "OK " + (await r.text()).slice(0, 40); }
    catch (e) { out.swHub = "ERR " + String(e && e.message || e).slice(0, 80); }
    return out;
  }).catch((e) => ({ evalErr: String(e).slice(0, 100) }));
  console.log("EXP-SW:", JSON.stringify(exp));
  const pageExp = await page.evaluate(async () => {
    try { const r = await fetch("http://127.0.0.1:26903/api/ping"); return "OK " + (await r.text()).slice(0, 40); }
    catch (e) { return "ERR " + String(e && e.message || e).slice(0, 80); }
  }).catch((e) => "EVAL-ERR " + String(e).slice(0, 80));
  console.log("EXP-PAGE(shell ext page):", pageExp);
  const page2Exp = await page2.evaluate(async () => {
    try { const r = await fetch("http://127.0.0.1:26903/api/ping"); return "OK " + (await r.text()).slice(0, 40); }
    catch (e) { return "ERR " + String(e && e.message || e).slice(0, 80); }
  }).catch((e) => "EVAL-ERR " + String(e).slice(0, 80));
  console.log("EXP-PAGE2(web page):", page2Exp);
  /* 完整矩阵：page2/page × {26903, 27000} —— 区分「源特定」vs「全局 fetch 污染」 */
  const m1 = await page2.evaluate(async () => {
    const out = {};
    for (const p of [26903, 27000]) {
      try { const r = await fetch(`http://127.0.0.1:${p}/api/ping`); out[p] = "OK " + (await r.text()).slice(0, 24); }
      catch (e) { out[p] = "ERR " + String(e && e.message || e).slice(0, 50); }
    }
    return out;
  }).catch((e) => ({ evalErr: String(e).slice(0, 80) }));
  console.log("MATRIX-page2:", JSON.stringify(m1));
  const m2 = await page.evaluate(async () => {
    const out = {};
    for (const p of [26903, 27000]) {
      try { const r = await fetch(`http://127.0.0.1:${p}/api/ping`); out[p] = "OK " + (await r.text()).slice(0, 24); }
      catch (e) { out[p] = "ERR " + String(e && e.message || e).slice(0, 50); }
    }
    return out;
  }).catch((e) => ({ evalErr: String(e).slice(0, 80) }));
  console.log("MATRIX-page(shell):", JSON.stringify(m2));
  expSrv.close();
} else console.log("SW: not caught");
/* 时间轴采样：12s 内每 2s 打印 host display + dlL1 子节点数（对照 yrc 行界 1/4.2/5/9/10/13s） */
const cdp2 = cdp;
for (let i = 0; i < 6; i++) {
  await sleep(2000);
  const { root: r2 } = await cdp2.send("DOM.getDocument", { depth: 3, pierce: true });
  let st = null;
  (function w(n) {
    if (st) return;
    const a = n.attributes || [];
    for (let k = 0; k + 1 < a.length; k += 2) if (a[k] === "id" && a[k + 1] === "chushi-dlyric-host") { st = n; return; }
    (n.children || []).forEach(w); (n.shadowRoots || []).forEach(w);
  })(r2);
  const pos = ((Date.now() - hubT0) / 1000 + 0.3).toFixed(1);
  if (!st) { console.log(`t=${pos} host GONE`); continue; }
  const style = (st.attributes || []).filter((x, i, arr) => false).length; /* noop */
  const styleAttr = (() => { const a = st.attributes || []; for (let k = 0; k + 1 < a.length; k += 2) if (a[k] === "style") return a[k + 1]; return "?"; })();
  /* 深挖 dlL1 子节点数 */
  const { root: r3 } = await cdp2.send("DOM.getDocument", { depth: -1, pierce: true });
  let l1kids = -1, disp = "?";
  (function w2(n) {
    const a = n.attributes || [];
    let id = "";
    for (let k = 0; k + 1 < a.length; k += 2) { if (a[k] === "id" && a[k + 1] === "chushi-dlyric-host") disp = /display:\s*(\w+)/.exec(a[k + 1] || "")?.[1] || "none-set"; }
    if (n.nodeName === "DIV" && a.includes("dl1")) { l1kids = (n.children || []).length; }
    (n.children || []).forEach(w2); (n.shadowRoots || []).forEach(w2);
  })(r3);
  console.log(`t=${pos} display=${disp} dlL1.children=${l1kids} (行界 1-4.2/5-9/10-13s)`);
}
process.exit(0);
