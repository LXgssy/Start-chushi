// v8.7.115 运行时终验探针——用户四项指令：
// ①抖音平台视频下载：route 拦截模拟 douyin.com 视频页 → 嗅探管线捕获
//   /aweme/v1/play/ 直链（XHR hook→桥 classify video→SW 入库→浮窗）→
//   抖音专区渲染（标题洗净「-抖音」后缀）→ 一键下载 → SW downloads 记录
//   + DNR 会话规则 9003（Referer=https://www.douyin.com/）实证。
// ②缓存抓取可播性根修：fMP4 结构化测试数据（ftyp+moov / moof+mdat）——
//   phase1 捕获未开（init+1 段：备胎截留、捕获账零入）→ 中途开捕获 →
//   phase2 两段+EOS → 下载文件字节对账（备胎 init + 捕获段）+ 文件头
//   ftyp 实证（前缀补齐生效，旧实现文件头是 moof 播不了）。
// ③缓存完成自动下载开关：面板开关行 → storage 写入 → 新会话 EOS →
//   无手势自动触发浏览器下载 + 字节对账。
// ④「嗅探到 N 个可下载资源」toast 退役：资源入列后 toast 零出现、徽标照常。
// 回归：免责声明门 / 总关拆捕获。
import { chromium } from "playwright-core";
import crypto from "crypto";
import http from "http";
import { execSync } from "child_process";
import { mkdirSync, rmSync, statSync, readFileSync } from "fs";

const ROOT = "/tmp/ext-v87115";
const ZIP = "/home/z/beta-wt/download/v8.7.115/ChuShi-NewTab-v8.7.115.zip";
const SHOTS = "/tmp/probe-v87115-shots";
const PROFILE = "/tmp/ext-v87115-profile";
const PORT = 26995;

const FAKE = Buffer.alloc(300 * 1024, 7);
const PLAY = Buffer.alloc(64 * 1024, 9);

const TEST_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>嗅探测试页 v87115</title></head>
<body><video id="tv" style="width:320px" muted></video>
<script>
function box(type, payload) {
  const b = new Uint8Array(8 + payload.length);
  new DataView(b.buffer).setUint32(0, b.length);
  for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
  b.set(payload, 8);
  return b;
}
const S = (s) => new Uint8Array(Array.from(s).map((c) => c.charCodeAt(0)));
function makeInit() {
  const ftyp = box("ftyp", S("isomiso2avc1mp41"));
  const moov = box("moov", new Uint8Array(96).fill(1));
  const out = new Uint8Array(ftyp.length + moov.length);
  out.set(ftyp, 0); out.set(moov, ftyp.length);
  return out;
}
function makeSeg(n) {
  const moof = box("moof", new Uint8Array(40).fill(n));
  const mdat = box("mdat", new Uint8Array(65536).fill(n));
  const out = new Uint8Array(moof.length + mdat.length);
  out.set(moof, 0); out.set(mdat, moof.length);
  return out;
}
window.__fed = [];
async function appendBuf(sb, buf) {
  try {
    sb.appendBuffer(buf);
    window.__fed.push(buf);
  } catch (e) { window.__fed.push(buf); }   // 解码失败不影响截留对账（探针在 apply 前已拷贝）
  await new Promise((res) => {
    const t = setTimeout(res, 1200);
    try { sb.addEventListener("updateend", () => { clearTimeout(t); res(); }, { once: true }); } catch (e) { clearTimeout(t); res(); }
  });
}
window.__mse = null;
window.mseReset = function () { window.__mse = null; window.__fed = []; return "reset"; };
window.msePhase = async function (phase) {
  /* 同一 MediaSource/SourceBuffer 跨阶段复用（真实世界：捕获中途开启
     落在同一条轨道上，sbSeq 不自增） */
  if (!window.__mse) {
    const video = document.getElementById("tv");
    const ms = new MediaSource();
    video.src = URL.createObjectURL(ms);
    await new Promise((res) => ms.addEventListener("sourceopen", res, { once: true }));
    const sb = ms.addSourceBuffer('video/mp4; codecs="avc1.42E01E"');
    window.__mse = { ms: ms, sb: sb };
  }
  const m = window.__mse;
  if (phase === "init") await appendBuf(m.sb, makeInit());
  else if (phase === "seg1") await appendBuf(m.sb, makeSeg(1));
  else if (phase === "seg2") await appendBuf(m.sb, makeSeg(2));
  else if (phase === "seg3") await appendBuf(m.sb, makeSeg(3));
  else if (phase === "eos") { try { m.ms.endOfStream(); } catch (e) {} }
  return "done fed=" + window.__fed.length;
};
window.__initLen = makeInit().byteLength;   /* box-walk 只取 init 本体（截断防混段） */
window.expected = function () {
  const lens = window.__fed.map((b) => b.byteLength);
  return { lens: lens, total: lens.reduce((a, b) => a + b, 0) };
};
window.fetchFake = function () {
  return fetch("/fake.mp4?r=" + Date.now()).then((r) => r.arrayBuffer()).then(() => "fetch-ok");
};
</script></body></html>`;

const DOUYIN_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>深夜食堂探店 - 抖音</title></head>
<body><h1> douyin video page mock</h1>
<script>
window.fetchPlay = function () {
  return fetch("https://www.douyin.com/aweme/v1/play/?video_id=mock123&line=0", { mode: "no-cors" }).catch(function () { return "blocked"; });
};
</script></body></html>`;

rmSync(ROOT, { recursive: true, force: true });
rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);
console.log("stage: 扩展解包 ->", ROOT);

const dlnotes = [];
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/test.html")) { res.writeHead(200, { "content-type": "text/html" }); res.end(TEST_HTML); return; }
  if (req.url.startsWith("/fake.mp4")) { res.writeHead(200, { "content-type": "video/mp4", "content-length": String(FAKE.length) }); res.end(FAKE); return; }
  if (req.url.startsWith("/dlcheck")) { dlnotes.push({ referer: req.headers.referer || "", ua: req.headers["user-agent"] || "" }); res.writeHead(200, { "content-type": "video/mp4" }); res.end(FAKE); return; }
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

const ctx = browser;
const popup = await ctx.newPage();
await popup.goto(EXT_URL("popup.html"));
await popup.waitForTimeout(400);

const extGet = (page, key) => page.evaluate((k) => new Promise((r) => chrome.storage.local.get(k, (o) => r(o && o[k]))), key);
const extSet = (page, obj) => page.evaluate((o) => new Promise((r) => chrome.storage.local.set(o, r)), obj);

/* ---------------- A. 免责声明门（回归） ---------------- */
console.log("—— A. 免责声明门（回归） ——");
gate("A0 初始 snifferOn 未开", (await extGet(popup, "snifferOn")) !== true);
await popup.click("#sw-sniffer");
await popup.waitForTimeout(250);
gate("A1 首开弹免责声明", await popup.evaluate(() => { const g = document.getElementById("sniff-gate"); return !!g && !g.hidden; }));
await popup.click("#sniff-gate-yes");
await popup.waitForTimeout(350);
gate("A2 同意后开启 snifferOn=true", (await extGet(popup, "snifferOn")) === true);
gate("A2b 同意态持久", (await extGet(popup, "snifferDisclaimerAgreed")) === true);

/* ---------------- B. 缓存抓取可播性根修（中途捕获 + init 补齐） ---------------- */
console.log("—— B. 缓存抓取中途捕获 + 初始化段补齐端到端 ——");
const testPage = await ctx.newPage();
await testPage.goto(`http://127.0.0.1:${PORT}/test.html`);
await testPage.waitForTimeout(800);
gate("B0 桥武装 data-chushi-sniff", await testPage.evaluate(() => document.documentElement.hasAttribute("data-chushi-sniff")));
const tabId = await popup.evaluate(() => new Promise((r) => chrome.tabs.query({ url: "http://127.0.0.1:*/*" }, (t) => r(t[0] && t[0].id))));
const isoInfo = () => popup.evaluate((tid) => chrome.scripting.executeScript({
  target: { tabId: tid },
  func: () => { const api = window.__chushiCatchApi; return api && api.info ? api.info() : null; },
}).then((r) => r[0] && r[0].result).catch(() => null), tabId);

const ballReady = await poll(() => testPage.evaluate(() => {
  const host = document.getElementById("chushi-sniffer-host");
  const ball = host && host.shadowRoot && host.shadowRoot.querySelector(".ball");
  return ball && getComputedStyle(ball).display !== "none";
}), 8000);
gate("B1 浮球在位", ballReady === true, String(ballReady));

const openPanel = async () => {
  await testPage.evaluate(() => {
    const host = document.getElementById("chushi-sniffer-host");
    const ball = host.shadowRoot.querySelector(".ball");
    if (!host.shadowRoot.querySelector(".panel.open") && ball) {
      const opts = { bubbles: true, pointerId: 1, isPrimary: true, clientX: 30, clientY: 30 };
      ball.dispatchEvent(new PointerEvent("pointerdown", opts));
      ball.dispatchEvent(new PointerEvent("pointerup", opts));
    }
  });
  await testPage.waitForTimeout(400);
};
const clickAct = (act) => testPage.evaluate((a) => {
  const host = document.getElementById("chushi-sniffer-host");
  const btn = host.shadowRoot.querySelector('[data-act="' + a + '"]:not([disabled])');
  if (!btn) return false;
  btn.click();
  return true;
}, act);

await openPanel();
gate("B2 缓存抓取区块 + 自动下载开关行", await testPage.evaluate(() => {
  const root = document.getElementById("chushi-sniffer-host").shadowRoot;
  return !!root.querySelector(".catch") && !!root.querySelector(".catch-auto") &&
    root.querySelector(".catch-auto .ca-t").textContent === "捕获完成后自动下载";
}));
gate("B2b 开关默认关（storage 未写）", (await extGet(popup, "snifferCatchAutoDl")) !== true);

/* phase1：捕获未开——init+seg1 应走备胎（捕获账零入；同一条 SourceBuffer） */
await testPage.evaluate(() => window.msePhase("init"));
await testPage.evaluate(() => window.msePhase("seg1"));
await testPage.waitForTimeout(800);
const info1 = await isoInfo();
gate("B3 备胎期捕获账零入 total=0", !!info1 && info1.total === 0, info1 ? JSON.stringify(info1) : "null");

await openPanel();
await clickAct("catch-toggle");               // 中途开捕获
await testPage.waitForTimeout(300);
gate("B4 捕获态开启 data-chushi-catch", await testPage.evaluate(() => document.documentElement.hasAttribute("data-chushi-catch")));

const mse2a = await testPage.evaluate(() => window.msePhase("seg2"));
const mse2b = await testPage.evaluate(() => window.msePhase("seg3"));
await testPage.evaluate(() => window.msePhase("eos"));
console.log("  mse phase2:", mse2a, mse2b);
await testPage.waitForTimeout(800);
const info2 = await isoInfo();
gate("B5 捕获段入账 total>0", !!info2 && info2.total > 0, info2 ? `${info2.total}B` : "null");
gate("B5b EOS 后 done=true", !!info2 && info2.done === true);

const expect = await testPage.evaluate(() => window.expected());
const initLen = await testPage.evaluate(() => window.__initLen);   /* init 本体字节数 */
console.log("  fed lens:", JSON.stringify(expect.lens), "total:", expect.total, "initLen:", initLen);
const capLen = (expect.lens.slice(2) || []).reduce((a, b) => a + b, 0);
gate("B6 备胎不进捕获账+捕获账=捕获段", info2 && info2.total === capLen && initLen > 0,
  `initBody=${initLen} cap=${capLen} vs total=${info2 && info2.total}`);

let dl = null;
testPage.on("download", (d) => { dl = d; });
await openPanel();
await clickAct("catch-dl");
await poll(() => dl, 8000);
await testPage.waitForTimeout(600);
gate("B7 下载数据触发浏览器下载", !!dl);
if (dl) {
  const name = dl.suggestedFilename();
  const path = await dl.path();
  const size = statSync(path).size;
  const head = readFileSync(path).subarray(0, 8);
  const tag = String.fromCharCode(head[4], head[5], head[6], head[7]);
  gate("B7b 文件名=标题.mp4", name === "嗅探测试页 v87115.mp4", name);
  gate("B7c 字节数=init本体+捕获段", size === initLen + capLen, `${size} vs ${initLen + capLen}`);
  gate("B7d 文件头 ftyp（init 前缀补齐）", tag === "ftyp", "head=" + tag + " " + head.toString("hex"));
  await testPage.screenshot({ path: SHOTS + "/catch-dl.png" });
}

/* ---------------- C. 缓存完成自动下载开关（两个完成点分测） ---------------- */
console.log("—— C. 缓存完成自动下载开关 ——");
await openPanel();
await clickAct("catch-auto");                 // 打开开关
await testPage.waitForTimeout(400);
gate("C1 开关写入 storage", (await extGet(popup, "snifferCatchAutoDl")) === true);
gate("C1b 面板开关视觉 on", await testPage.evaluate(() => {
  const sw = document.getElementById("chushi-sniffer-host").shadowRoot.querySelector(".catch-auto .sw");
  return !!sw && sw.classList.contains("on");
}));

/* 完成点①手动停止：B 轮数据仍在账上（capture 仍开）——停止即自动下载 */
let dl2 = null;
testPage.on("download", (d) => { dl2 = d; });
await openPanel();
await clickAct("catch-toggle");               // 停止捕获 → 完成点①
await testPage.waitForTimeout(1500);
gate("C2 停止捕获自动下载", !!dl2, dl2 ? dl2.suggestedFilename() : "no-download");
if (dl2) {
  const path2 = await dl2.path();
  const size2 = statSync(path2).size;
  gate("C2b 停止路径字节数对账（含 init 本体）", size2 === initLen + capLen, `${size2} vs ${initLen + capLen}`);
}

/* 完成点②endOfStream：重置会话后开捕获，完整跑一轮（init 走捕获账），EOS 自动下载 */
let dl3 = null;
testPage.on("download", (d) => { dl3 = d; });
await openPanel();
await clickAct("catch-toggle");               // 重新开始捕获
await testPage.waitForTimeout(300);
await testPage.evaluate(() => window.mseReset());
await testPage.evaluate(() => window.msePhase("init"));
await testPage.evaluate(() => window.msePhase("seg1"));
await testPage.evaluate(() => window.msePhase("seg2"));
await testPage.evaluate(() => window.msePhase("eos"));
console.log("  mse auto session: fed=", await testPage.evaluate(() => window.__fed.length));
await testPage.waitForTimeout(1500);          // EOS → 自动下载
gate("C3 EOS 无手势自动下载", !!dl3, dl3 ? dl3.suggestedFilename() : "no-download");
if (dl3) {
  const path3 = await dl3.path();
  const size3 = statSync(path3).size;
  const exp3 = await testPage.evaluate(() => window.expected());
  gate("C3b EOS 路径字节数对账", size3 === exp3.total, `${size3} vs ${exp3.total}`);
}

/* ---------------- D. 抖音完整视频下载 ---------------- */
console.log("—— D. 抖音平台视频下载 ——");
await ctx.route("https://www.douyin.com/video/9527", (route) =>
  route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: DOUYIN_HTML }));
await ctx.route("https://www.douyin.com/aweme/v1/play/*", (route) =>
  route.fulfill({ status: 200, contentType: "video/mp4", body: PLAY }));
const dyPage = await ctx.newPage();
await dyPage.goto("https://www.douyin.com/video/9527");
await dyPage.waitForTimeout(1000);
await dyPage.evaluate(() => window.fetchPlay());   // 播放器拉直链（XHR hook → 桥 → SW）
await dyPage.waitForTimeout(1200);
const dyTab = await popup.evaluate(() => new Promise((r) => chrome.tabs.query({ url: "https://www.douyin.com/*" }, (t) => r(t[0] && t[0].id))));
gate("D0 抖音模拟页 tabId", typeof dyTab === "number", String(dyTab));

const dyBall = await poll(() => dyPage.evaluate(() => {
  const host = document.getElementById("chushi-sniffer-host");
  const ball = host && host.shadowRoot && host.shadowRoot.querySelector(".ball");
  return ball && getComputedStyle(ball).display !== "none";
}), 8000);
gate("D1 抖音页浮球在位", dyBall === true, String(dyBall));
await dyPage.evaluate(() => {
  const host = document.getElementById("chushi-sniffer-host");
  const ball = host.shadowRoot.querySelector(".ball");
  const opts = { bubbles: true, pointerId: 1, isPrimary: true, clientX: 30, clientY: 30 };
  ball.dispatchEvent(new PointerEvent("pointerdown", opts));
  ball.dispatchEvent(new PointerEvent("pointerup", opts));
});
await dyPage.waitForTimeout(500);
gate("D2 抖音专区渲染（标题洗净 -抖音 后缀）", await dyPage.evaluate(() => {
  const root = document.getElementById("chushi-sniffer-host").shadowRoot;
  const t = root.querySelector(".bili-t");
  return !!t && t.textContent === "深夜食堂探店";
}));
gate("D2b 下载按钮在位（直链已捕获）", await dyPage.evaluate(() => {
  const root = document.getElementById("chushi-sniffer-host").shadowRoot;
  const btn = root.querySelector('[data-act="douyin-dl"]');
  return !!btn && btn.textContent === "下载";
}));
await dyPage.screenshot({ path: SHOTS + "/douyin-panel.png" });

const dlBtn = await dyPage.evaluate(() => {
  const root = document.getElementById("chushi-sniffer-host").shadowRoot;
  const btn = root.querySelector('[data-act="douyin-dl"]');
  if (!btn) return false;
  btn.click();
  return true;
});
gate("D3 一键下载点击成功", dlBtn === true);
const dlRec = await poll(async () => popup.evaluate(() => new Promise((r) =>
  chrome.downloads.search({ limit: 10, orderBy: ["-startTime"] }, (items) =>
    r((items || []).find((x) => /douyin\.com\/aweme\/v1\/play/.test(x.url || "")) || null)))), 8000);
gate("D4 SW 代理下载记录（抖音直链）", !!dlRec, dlRec ? (dlRec.url + " state=" + dlRec.state) : "none");

const dnrRules = await popup.evaluate(() => new Promise((r) =>
  chrome.declarativeNetRequest.getSessionRules((rs) => r(rs))));
const dyRule = (dnrRules || []).find((x) => x.id === 9003);
gate("D5 DNR 会话规则 9003 在位", !!dyRule);
gate("D5b Referer=set https://www.douyin.com/", !!dyRule &&
  JSON.stringify(dyRule.action.requestHeaders || []).indexOf("https://www.douyin.com/") >= 0,
  dyRule ? JSON.stringify(dyRule.action.requestHeaders) : "none");
gate("D5c 域族条件含 douyinvod/zjcdn", !!dyRule &&
  (dyRule.condition.requestDomains || []).indexOf("douyinvod.com") >= 0 &&
  (dyRule.condition.requestDomains || []).indexOf("zjcdn.com") >= 0);
await dyPage.close();

/* ---------------- E. 「嗅探到 N 个」toast 退役 ---------------- */
console.log("—— E. 发现提示 toast 退役 ——");
await testPage.evaluate(() => window.fetchFake());
const listed = await poll(() => testPage.evaluate(() => {
  const host = document.getElementById("chushi-sniffer-host");
  const list = host && host.shadowRoot && host.shadowRoot.querySelector(".list");
  return list ? list.textContent : "";
}), 8000);
gate("E1 webRequest 通道 fake.mp4 照常入列", /fake\.mp4/.test(listed || ""), (listed || "").slice(0, 50));
const toastState = await testPage.evaluate(() => {
  const root = document.getElementById("chushi-sniffer-host").shadowRoot;
  const toast = root.querySelector(".toast");
  const badge = root.querySelector(".badge");
  return { toast: toast ? toast.textContent : "", shown: toast ? toast.classList.contains("show") : false, badge: badge ? badge.textContent : "" };
});
gate("E2 toast 零「嗅探到」文案", toastState.toast.indexOf("嗅探到") < 0, JSON.stringify(toastState));
gate("E2b 徽标计数照常", toastState.badge !== "" && toastState.badge !== "0", toastState.badge);

/* ---------------- F. 总关回归 ---------------- */
console.log("—— F. 总关拆捕获（回归） ——");
await extSet(popup, { snifferOn: false });
await testPage.waitForTimeout(600);
gate("F1 总关后 data-chushi-sniff 摘除", await testPage.evaluate(() => !document.documentElement.hasAttribute("data-chushi-sniff")));
gate("F1b 捕获态一并拆除", await testPage.evaluate(() => !document.documentElement.hasAttribute("data-chushi-catch")));
const isoAfterOff = await isoInfo();
gate("F2 总关后捕获 API 数据清空", !!isoAfterOff && isoAfterOff.total === 0 && isoAfterOff.on === false, JSON.stringify(isoAfterOff));

await popup.screenshot({ path: SHOTS + "/final-popup.png" });
await openPanel();
await testPage.screenshot({ path: SHOTS + "/final-panel.png" });

console.log(`\n===== probe v8.7.115: ${ok} OK / ${bad.length} BAD =====`);
for (const b of bad) console.log("  [BAD]", b);
console.log("shots:", SHOTS);
await browser.close().catch(() => {});
server.close();
process.exit(bad.length ? 1 : 0);
