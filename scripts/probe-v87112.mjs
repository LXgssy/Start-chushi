// v8.7.112 运行时终验探针——用户三项指令：
// ①资源嗅探+缓存抓取（能力对齐猫抓 cat-catch）：MSE 分段截留端到端——
//   浮窗面板「开始捕获」→ data-chushi-catch 属性在位 → 测试页 MediaSource
//   addSourceBuffer/appendBuffer → 探针拷贝转交 → 桥攒块 → info().total>0
//   →「下载数据」→ Blob 合成 a[download] 触发浏览器下载（文件名/字节数对账）
//   → endOfStream → done；「从头捕获」→ 视频回 0 + 清块；「停止捕获」→ 属性摘除。
// ②免责声明门：首次开启必弹（不同意→关态保持；同意→snifferOn+Agreed 双写；
//   再开不再弹；关闭无门）。
// ③避免抓取名单门 + 普通嗅探 webRequest 通道回归（fake.mp4 入列表）。
import { chromium } from "playwright-core";
import crypto from "crypto";
import http from "http";
import { execSync } from "child_process";
import { mkdirSync, rmSync } from "fs";

const ROOT = "/tmp/ext-v87112";
const ZIP = "/home/z/beta-wt/download/v8.7.112/ChuShi-NewTab-v8.7.112.zip";
const SHOTS = "/tmp/probe-v87112-shots";
const PROFILE = "/tmp/ext-v87112-profile";
const PORT = 26993;

const FAKE = Buffer.alloc(300 * 1024, 7);
const TEST_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>嗅探测试页 v87112</title></head>
<body><video id="tv" style="width:320px" muted></video>
<script>
window.runMSE = async function (chunkSize, nChunks) {
  const video = document.getElementById("tv");
  const ms = new MediaSource();
  video.src = URL.createObjectURL(ms);
  await new Promise((res) => ms.addEventListener("sourceopen", res, { once: true }));
  const sb = ms.addSourceBuffer('video/mp4; codecs="avc1.42E01E"');
  let done = 0;
  for (let i = 0; i < nChunks; i++) {
    const buf = new Uint8Array(chunkSize);
    for (let o = 0; o < chunkSize; o += 65536) {
      crypto.getRandomValues(buf.subarray(o, Math.min(o + 65536, chunkSize)));
    }
    try {
      sb.appendBuffer(buf);
      await new Promise((res) => {
        const t = setTimeout(res, 1500);
        sb.addEventListener("updateend", () => { clearTimeout(t); res(); }, { once: true });
      });
      done++;
    } catch (e) { break; }
  }
  try { ms.endOfStream(); } catch (e) {}
  return "mse-done chunks=" + done;
};
window.fetchFake = function () {
  return fetch("/fake.mp4?r=" + Date.now()).then((r) => r.arrayBuffer()).then(() => "fetch-ok");
};
window.seekTo = function (t) { document.getElementById("tv").currentTime = t; return document.getElementById("tv").currentTime; };
</script></body></html>`;

rmSync(ROOT, { recursive: true, force: true });
rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);
console.log("stage: 扩展解包 ->", ROOT);

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/test.html")) { res.writeHead(200, { "content-type": "text/html" }); res.end(TEST_HTML); return; }
  if (req.url.startsWith("/fake.mp4")) { res.writeHead(200, { "content-type": "video/mp4", "content-length": String(FAKE.length) }); res.end(FAKE); return; }
  res.writeHead(404); res.end("no");
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
console.log("stage: 测试页服务器 :" + PORT);

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, tag) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${tag}`)), ms))]);

const browser = await withTimeout(
  chromium.launchPersistentContext(PROFILE, {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
      "--no-first-run", "--no-sandbox"],
  }), 30000, "launch");
console.log("stage: chromium 启动（EXT_ID=" + EXT_ID.slice(0, 8) + "…）");

let ok = 0; const bad = [];
function gate(name, cond, detail = "") {
  if (cond) { ok++; console.log(`  [OK] ${name}${detail ? " | " + detail : ""}`); }
  else { bad.push(name + (detail ? " | " + detail : "")); console.log(`  [FAIL] ${name}${detail ? " | " + detail : ""}`); }
}
const poll = async (fn, ms, step = 250) => {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { try { last = await fn(); } catch (e) { last = null; } if (last) return last; await sleep(step); }
  return last;
};

const ctx = browser;   /* launchPersistentContext 直接返回 BrowserContext */
const popup = await ctx.newPage();
await popup.goto(EXT_URL("popup.html"));
await popup.waitForTimeout(400);

const extGet = (page, key) => page.evaluate((k) => new Promise((r) => chrome.storage.local.get(k, (o) => r(o && o[k]))), key);
const extSet = (page, obj) => page.evaluate((o) => new Promise((r) => chrome.storage.local.set(o, r)), obj);

/* ---------------- A. 免责声明门 ---------------- */
console.log("—— A. 免责声明门（popup） ——");
gate("A0 初始 snifferOn 未开", (await extGet(popup, "snifferOn")) !== true);
await popup.click("#sw-sniffer");            // 开启 → 必弹门
await popup.waitForTimeout(250);
gate("A1 首开弹免责声明", await popup.evaluate(() => { const g = document.getElementById("sniff-gate"); return !!g && !g.hidden; }));
await popup.screenshot({ path: SHOTS + "/gate.png" });
await popup.click("#sniff-gate-no");         // 不同意 → 关态保持
await popup.waitForTimeout(250);
gate("A2 不同意后开关回弹", (await popup.getAttribute("#sw-sniffer", "aria-checked")) !== "true");
gate("A2b 不同意后 snifferOn 仍关", (await extGet(popup, "snifferOn")) !== true);
gate("A2c 不同意不写同意态", (await extGet(popup, "snifferDisclaimerAgreed")) !== true);
await popup.click("#sw-sniffer");            // 再开 → 门仍在（未同意）
await popup.waitForTimeout(250);
gate("A3 未同意再次弹门", await popup.evaluate(() => { const g = document.getElementById("sniff-gate"); return !!g && !g.hidden; }));
await popup.click("#sniff-gate-yes");        // 同意并开启
await popup.waitForTimeout(350);
gate("A4 同意后门收起", await popup.evaluate(() => { const g = document.getElementById("sniff-gate"); return !!g && g.hidden; }));
gate("A4b 同意后开关亮", (await popup.getAttribute("#sw-sniffer", "aria-checked")) === "true");
gate("A4c snifferOn=true", (await extGet(popup, "snifferOn")) === true);
gate("A4d snifferDisclaimerAgreed=true", (await extGet(popup, "snifferDisclaimerAgreed")) === true);
await popup.click("#sw-sniffer");            // 关（无门）
await popup.waitForTimeout(200);
gate("A5 关闭无门直落", (await extGet(popup, "snifferOn")) === false);
await popup.click("#sw-sniffer");            // 已同意再开 → 不弹门
await popup.waitForTimeout(250);
gate("A6 已同意再开不弹门", await popup.evaluate(() => { const g = document.getElementById("sniff-gate"); return !!g && g.hidden; }));
gate("A6b 已同意直开 snifferOn=true", (await extGet(popup, "snifferOn")) === true);

/* ---------------- B. 缓存抓取端到端 ---------------- */
console.log("—— B. 缓存抓取端到端（MSE 测试页） ——");
const testPage = await ctx.newPage();
await testPage.goto(`http://127.0.0.1:${PORT}/test.html`);
await testPage.waitForTimeout(800);
gate("B0 桥武装 data-chushi-sniff", await testPage.evaluate(() => document.documentElement.hasAttribute("data-chushi-sniff")));
const tabId = await popup.evaluate(() => new Promise((r) => chrome.tabs.query({ url: "http://127.0.0.1:*/*" }, (t) => r(t[0] && t[0].id))));
gate("B0b 拿到测试页 tabId", typeof tabId === "number");
const isoInfo = () => popup.evaluate((tid) => chrome.scripting.executeScript({
  target: { tabId: tid },
  func: () => { const api = window.__chushiCatchApi; return api && api.info ? api.info() : null; },
}).then((r) => r[0] && r[0].result).catch(() => null), tabId);
const isoSeek = (t) => popup.evaluate(([tid, tt]) => chrome.scripting.executeScript({
  target: { tabId: tid },
  func: (v) => { document.querySelectorAll("video").forEach((x) => { try { x.currentTime = v; } catch (e) {} }); },
  args: [tt],
}).then(() => true).catch(() => false), [tabId, t]);

const panelBtn = (act) => testPage.evaluate((a) => {
  const host = document.getElementById("chushi-sniffer-host");
  const root = host && host.shadowRoot;
  if (!root) return "no-root";
  const ball = root.querySelector(".ball");
  if (ball && getComputedStyle(ball).display === "none") return "ball-hidden";
  return true;
});
const ballReady = await poll(panelBtn, 8000);
gate("B1 浮球在位（嗅探开+页载入）", ballReady === true, String(ballReady));

const clickAct = (act) => testPage.evaluate((a) => {
  const host = document.getElementById("chushi-sniffer-host");
  const btn = host.shadowRoot.querySelector('[data-act="' + a + '"]:not([disabled])');
  if (!btn) return false;
  btn.click();
  return true;
}, act);

const openPanel = async () => {
  await testPage.evaluate(() => {
    const host = document.getElementById("chushi-sniffer-host");
    const ball = host.shadowRoot.querySelector(".ball");
    if (!host.shadowRoot.querySelector(".panel.open") && ball) {
      /* 浮球展开逻辑在 pointerup（拖拽判定）：element.click() 不触发 pointer
         序列，手动派发同坐标 pointerdown/pointerup（距离<4px = 点按展开） */
      const opts = { bubbles: true, pointerId: 1, isPrimary: true, clientX: 30, clientY: 30 };
      ball.dispatchEvent(new PointerEvent("pointerdown", opts));
      ball.dispatchEvent(new PointerEvent("pointerup", opts));
    }
  });
  await testPage.waitForTimeout(400);
};
await openPanel();
gate("B2 面板含缓存抓取区块", await testPage.evaluate(() => {
  const host = document.getElementById("chushi-sniffer-host");
  return !!host.shadowRoot.querySelector(".catch") && host.shadowRoot.querySelector(".catch-t").textContent === "缓存抓取";
}));
gate("B2b 初始态「开始捕获」+下载禁用", await testPage.evaluate(() => {
  const host = document.getElementById("chushi-sniffer-host");
  const btns = [...host.shadowRoot.querySelectorAll(".catch-btns button")];
  const t = btns[0] && btns[0].textContent;
  const dl = btns[2];
  return t === "开始捕获" && dl && dl.disabled;
}));

await clickAct("catch-toggle");              // 开始捕获
await testPage.waitForTimeout(300);
gate("B3 捕获态属性 data-chushi-catch", await testPage.evaluate(() => document.documentElement.hasAttribute("data-chushi-catch")));
gate("B3b info().on=true", (await isoInfo())?.on === true);

const mseResult = await withTimeout(testPage.evaluate(() => window.runMSE(128 * 1024, 4)), 15000, "runMSE");
console.log("  runMSE:", mseResult);
await testPage.waitForTimeout(700);
const info1 = await isoInfo();
gate("B4 分段入账 total>0", !!info1 && info1.total > 0, info1 ? `${info1.total}B tracks=${info1.tracks}` : "null");
gate("B4b 轨道登记 mime", !!info1 && info1.tracks >= 1);
gate("B4c endOfStream 后 done=true", !!info1 && info1.done === true);

await openPanel();
gate("B5 面板实时尺寸展示", await testPage.evaluate(() => {
  const host = document.getElementById("chushi-sniffer-host");
  const s = host.shadowRoot.querySelector(".catch-s");
  return !!s && /捕获中/.test(s.textContent) && /\d+(\.\d+)?\s*(B|KB|MB)/.test(s.textContent);
}));
await testPage.screenshot({ path: SHOTS + "/panel-catching.png" });   /* 面板目检：捕获中态 */

let dl = null;
testPage.on("download", (d) => { dl = d; });
await openPanel();
await clickAct("catch-dl");
await poll(() => dl, 8000);
await testPage.waitForTimeout(600);
gate("B6 下载数据触发浏览器下载", !!dl);
if (dl) {
  const name = dl.suggestedFilename();
  const path = await dl.path();
  const { statSync } = await import("fs");
  const size = statSync(path).size;
  gate("B6b 文件名=标题.mp4", name === "嗅探测试页 v87112.mp4", name);
  gate("B6c 字节数=捕获总量", size === info1.total, `${size} vs ${info1.total}`);
}

await isoSeek(10);                            // 视频跳到 10s
await openPanel();
await clickAct("catch-restart");              // 从头捕获
await testPage.waitForTimeout(400);
const info2 = await isoInfo();
gate("B7 从头捕获清块", !!info2 && info2.total === 0 && info2.on === true, info2 ? JSON.stringify(info2) : "null");
gate("B7b 视频回跳 0", await testPage.evaluate(() => document.getElementById("tv").currentTime) < 0.5);

await clickAct("catch-toggle");               // 停止捕获
await testPage.waitForTimeout(300);
gate("B8 停止后属性摘除", await testPage.evaluate(() => !document.documentElement.hasAttribute("data-chushi-catch")));
gate("B8b info().on=false", (await isoInfo())?.on === false);

/* ---------------- C. 普通嗅探回归 + 名单门 ---------------- */
console.log("—— C. 普通嗅探回归 + 避免抓取名单门 ——");
await testPage.evaluate(() => window.fetchFake());
const listed = await poll(() => testPage.evaluate(() => {
  const host = document.getElementById("chushi-sniffer-host");
  const list = host && host.shadowRoot && host.shadowRoot.querySelector(".list");
  return list ? list.textContent : "";
}), 8000);
gate("C1 webRequest 通道 fake.mp4 入列", /fake\.mp4/.test(listed || ""), (listed || "").slice(0, 60));

await extSet(popup, { snifferOn: false });    // 总关
await testPage.waitForTimeout(600);
gate("C2 总关后 data-chushi-sniff 摘除", await testPage.evaluate(() => !document.documentElement.hasAttribute("data-chushi-sniff")));
gate("C2b 捕获态一并拆除", await testPage.evaluate(() => !document.documentElement.hasAttribute("data-chushi-catch")));

const isoAfterOff = await isoInfo();
gate("C3 总关后捕获 API 数据清空", !!isoAfterOff && isoAfterOff.total === 0 && isoAfterOff.on === false, JSON.stringify(isoAfterOff));

await popup.screenshot({ path: SHOTS + "/final-popup.png" });
await openPanel();
await testPage.screenshot({ path: SHOTS + "/final-panel.png" });

console.log(`\n===== probe v8.7.112: ${ok} OK / ${bad.length} BAD =====`);
for (const b of bad) console.log("  [BAD]", b);
console.log("shots:", SHOTS);
await browser.close().catch(() => {});
server.close();
process.exit(bad.length ? 1 : 0);
