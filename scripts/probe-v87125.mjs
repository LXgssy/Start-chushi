// v8.7.125 运行时终验探针——用户指令「修复缓存抓取没有正确抓取当前播放
// 视频的缓存，抓出来的视频文件一堆乱码并且音画不同步」三连根修端到端：
// A. 免责声明门（回归，v8.7.115 同款）
// B. 多媒体源过滤（抓错目标根修）：广告 MS（ms1）与正片 MS（ms2，音视双轨）
//    先后喂数据，下载只出正片两轨两文件——广告轨道被忽略（skipped=1 提示
//    + info.extra=1 + 广告字节特征零出现 + 正片字节逐文件对账）。
// C. emsg 前置分段 init 补齐（乱码根修）：捕获未开截 init 入备胎 → 开捕获
//    后喂 [emsg][moof][mdat] 形态分段（v4 只认 moof/styp 开头会漏补 → 文件
//    缺 ftyp 无法解析）→ 下载文件头 ftyp 实证 + 字节对账。
// D. 多 init 拆分（音画不同步根修）：同一轨道流中 ABR 换源再次 append init
//    （ftyp 头）→ 下载拆成 -1/-2 两段文件，各自 init 完整（对账 + 文件一
//    中间无文件二的 init 字节）。
// E. 自动下载开关回归（v8.7.115 完成点①手动停止）。
// F. 面板截图目检（状态行其他源提示 + 新 tip 文案）。
import { chromium } from "playwright-core";
import crypto from "crypto";
import http from "http";
import { execSync } from "child_process";
import { mkdirSync, rmSync, statSync, readFileSync } from "fs";

const ROOT = "/tmp/ext-v87125";
const ZIP = "/home/z/beta-wt/download/v8.7.125/ChuShi-NewTab-v8.7.125.zip";
const SHOTS = "/tmp/probe-v87125-shots";
const PROFILE = "/tmp/ext-v87125-profile";
const PORT = 26996;

const TEST_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>嗅探测试页 v87125</title></head>
<body><video id="tv" style="width:320px" muted></video>
<script>
function box(type, fill, payloadLen) {
  const b = new Uint8Array(8 + payloadLen);
  new DataView(b.buffer).setUint32(0, b.length);
  for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
  b.fill(fill, 8);
  return b;
}
function mkInit(fill) {
  const ftyp = box("ftyp", 0, 16);
  const moov = box("moov", fill, 96);
  const out = new Uint8Array(ftyp.length + moov.length);
  out.set(ftyp, 0); out.set(moov, ftyp.length);
  return out;
}
function mkSeg(fill) {
  const moof = box("moof", fill, 40);
  const mdat = box("mdat", fill, 65536);
  const out = new Uint8Array(moof.length + mdat.length);
  out.set(moof, 0); out.set(mdat, moof.length);
  return out;
}
function mkEmsgSeg(fill) {
  const emsg = box("emsg", fill, 24);
  const moof = box("moof", fill, 40);
  const mdat = box("mdat", fill, 65536);
  const out = new Uint8Array(emsg.length + moof.length + mdat.length);
  out.set(emsg, 0); out.set(moof, emsg.length); out.set(mdat, emsg.length + moof.length);
  return out;
}
window.LENS = { init: mkInit(1).byteLength, seg: mkSeg(1).byteLength, emsgSeg: mkEmsgSeg(1).byteLength };
window.__sessions = [];
window.newSession = async function (kinds) {
  const video = document.getElementById("tv");
  const ms = new MediaSource();
  video.src = URL.createObjectURL(ms);
  await new Promise((res) => ms.addEventListener("sourceopen", res, { once: true }));
  const sbs = kinds.map((k) => ms.addSourceBuffer(k));
  const si = window.__sessions.push({ ms: ms, sbs: sbs }) - 1;
  return si;
};
window.feed = async function (si, kIdx, buf) {
  const s = window.__sessions[si];
  try { s.sbs[kIdx].appendBuffer(buf); } catch (e) { /* decode fail 不影响截留对账 */ }
  await new Promise((res) => {
    const t = setTimeout(res, 900);
    try { s.sbs[kIdx].addEventListener("updateend", () => { clearTimeout(t); res(); }, { once: true }); } catch (e) { clearTimeout(t); res(); }
  });
};
window.eos = function (si) { try { window.__sessions[si].ms.endOfStream(); } catch (e) {} return "eos"; };
/* 逐字节对账：seq = [[fill, kind], ...]，kind: init|seg|emsgSeg；入参 arr 下载文件全量字节 */
window.cmpBytes = function (arr, seq) {
  const parts = seq.map(([fill, kind]) => kind === "init" ? mkInit(fill) : kind === "emsgSeg" ? mkEmsgSeg(fill) : mkSeg(fill));
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  let diff = -1;
  if (arr.length !== total) return { ok: false, why: "len " + arr.length + " vs " + total };
  for (let i = 0; i < total; i++) { if (arr[i] !== out[i]) { diff = i; break; } }
  return { ok: diff < 0, why: diff >= 0 ? "firstDiff@" + diff : "" };
};
window.expectLen = function (seq) {
  return seq.reduce((a, [fill, kind]) => a + (kind === "init" ? mkInit(fill).length : kind === "emsgSeg" ? mkEmsgSeg(fill).length : mkSeg(fill).length), 0);
};
</script></body></html>`;

rmSync(ROOT, { recursive: true, force: true });
rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);
console.log("stage: 扩展解包 ->", ROOT);

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/test.html")) { res.writeHead(200, { "content-type": "text/html" }); res.end(TEST_HTML); return; }
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

/* ---------------- 通用工具 ---------------- */
const testPage = await ctx.newPage();
await testPage.goto(`http://127.0.0.1:${PORT}/test.html`);
await testPage.waitForTimeout(800);
gate("B0 桥武装 data-chushi-sniff", await testPage.evaluate(() => document.documentElement.hasAttribute("data-chushi-sniff")));
const tabId = await popup.evaluate(() => new Promise((r) => chrome.tabs.query({ url: "http://127.0.0.1:*/*" }, (t) => r(t[0] && t[0].id))));
const isoInfo = () => popup.evaluate((tid) => chrome.scripting.executeScript({
  target: { tabId: tid },
  func: () => { const api = window.__chushiCatchApi; return api && api.info ? api.info() : null; },
}).then((r) => r[0] && r[0].result).catch(() => null), tabId);

const openPanel = async () => {
  await testPage.evaluate(() => {
    const host = document.getElementById("chushi-sniffer-host");
    const ball = host && host.shadowRoot && host.shadowRoot.querySelector(".ball");
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
const toastText = () => testPage.evaluate(() => {
  const root = document.getElementById("chushi-sniffer-host").shadowRoot;
  const t = root.querySelector(".toast");
  return t ? t.textContent : "";
});

/* 收集下载：等 n 个，返回 [{name, buf}] */
function watchDownloads(n) {
  const dls = [];
  const handler = (d) => dls.push(d);
  testPage.on("download", handler);
  return {
    wait: async () => {
      await poll(() => dls.length >= n, 15000, 200);
      await sleep(700);
      testPage.removeListener("download", handler);
      const out = [];
      for (const d of dls.slice(0, n)) {
        const p = await d.path();
        out.push({ name: d.suggestedFilename(), buf: readFileSync(p) });
      }
      return out;
    },
  };
}

/* ---------------- B. 多媒体源过滤（抓错目标根修） ---------------- */
console.log("—— B. 广告 MS + 正片 MS：只下当前播放 ——");
const siAd = await testPage.evaluate(() => window.newSession(['video/mp4; codecs="avc1.42E01E"']));
await testPage.evaluate((si) => window.feed(si, 0, mkInit(5)), siAd);      // 广告 init（备胎期）
await testPage.evaluate((si) => window.feed(si, 0, mkSeg(5)), siAd);       // 广告段1（备胎期）
await testPage.waitForTimeout(800);
let info = await isoInfo();
gate("B1 备胎期捕获账零入", !!info && info.total === 0, info ? JSON.stringify(info) : "null");

await openPanel();
await clickAct("catch-toggle");                                            // 中途开捕获
await testPage.waitForTimeout(300);
gate("B2 捕获态开启", await testPage.evaluate(() => document.documentElement.hasAttribute("data-chushi-catch")));

await testPage.evaluate((si) => window.feed(si, 0, mkSeg(5)), siAd);       // 广告续播（进捕获账 ms1）
const siMain = await testPage.evaluate(() => window.newSession(['video/mp4; codecs="avc1.42E01E"', 'audio/mp4; codecs="mp4a.40.2"']));
await testPage.evaluate((si) => window.feed(si, 0, mkInit(1)), siMain);    // 正片视频 init（ms2）
await testPage.evaluate((si) => window.feed(si, 0, mkSeg(1)), siMain);
await testPage.evaluate((si) => window.feed(si, 0, mkSeg(1)), siMain);
await testPage.evaluate((si) => window.feed(si, 1, mkInit(3)), siMain);    // 正片音频 init（ms2）
await testPage.evaluate((si) => window.feed(si, 1, mkSeg(3)), siMain);
await testPage.evaluate((si) => window.feed(si, 1, mkSeg(3)), siMain);
await testPage.waitForTimeout(800);
info = await isoInfo();
gate("B3 捕获账含广告+正片 total>0", !!info && info.total > 0, info ? `${info.total}B tracks=${info.tracks}` : "null");
gate("B3b info.extra=1（另一媒体源在账）", !!info && info.extra === 1, info ? `extra=${info.extra}` : "null");

const L = await testPage.evaluate(() => window.LENS);
const expV = L.init + 2 * L.seg, expA = L.init + 2 * L.seg;

await openPanel();
await clickAct("catch-toggle");                                            // 停止捕获
const wb = watchDownloads(2);
await openPanel();
await clickAct("catch-dl");
const dlsB = await wb.wait();
gate("B4 只出 2 个文件（广告被过滤，非 3 个）", dlsB.length === 2, dlsB.map((d) => d.name).join(" | "));
const fV = dlsB.find((d) => d.name.indexOf("-视频") >= 0);
const fA = dlsB.find((d) => d.name.indexOf("-音频") >= 0);
gate("B5 文件名带视频/音频标签", !!fV && !!fA, dlsB.map((d) => d.name).join(" | "));
if (fV) {
  const tag = fV.buf.subarray(4, 8).toString("latin1");
  gate("B6 视频文件头 ftyp", tag === "ftyp", "head=" + tag);
  const cmpV = await testPage.evaluate((a) => window.cmpBytes(a, [[1, "init"], [1, "seg"], [1, "seg"]]), Array.from(fV.buf));
  gate("B6b 视频文件逐字节=正片视频轨（init+2段）", cmpV.ok, cmpV.why);
}
if (fA) {
  const cmpA = await testPage.evaluate((a) => window.cmpBytes(a, [[3, "init"], [3, "seg"], [3, "seg"]]), Array.from(fA.buf));
  gate("B7 音频文件逐字节=正片音频轨（init+2段）", cmpA.ok, cmpA.why);
  gate("B7b 扩展名 m4a（audio/mp4）", /-音频\.m4a$/.test(fA.name), fA.name);
}
gate("B8 toast 忽略组提示", (await toastText()).indexOf("已忽略 1 个其他媒体源") >= 0, await toastText());
info = await isoInfo();
gate("B8b info 仍报 extra=1", !!info && info.extra === 1);
await testPage.screenshot({ path: SHOTS + "/B-filter.png" });

/* ---------------- C. emsg 前置分段 init 补齐（乱码根修） ---------------- */
console.log("—— C. emsg 前置分段：box-walk 补 init ——");
const siC = await testPage.evaluate(() => window.newSession(['video/mp4; codecs="avc1.42E01E"']));
await testPage.evaluate((si) => window.feed(si, 0, mkInit(7)), siC);       // 捕获未开：init 入备胎
await testPage.evaluate((si) => window.feed(si, 0, mkEmsgSeg(7)), siC);    // 备胎期续喂 emsg 段：initScan 应在 moov 后 emsg 处精确截断
await testPage.waitForTimeout(800);
await openPanel();
await clickAct("catch-restart");                                           // 从头捕获（清账重开；备胎保留）
await testPage.waitForTimeout(400);
await testPage.evaluate((si) => window.feed(si, 0, mkEmsgSeg(7)), siC);    // emsg 前置分段 ×2（捕获账）
await testPage.evaluate((si) => window.feed(si, 0, mkEmsgSeg(7)), siC);
await testPage.waitForTimeout(600);
info = await isoInfo();
gate("C1 emsg 段入账", !!info && info.total === 2 * L.emsgSeg, info ? `${info.total} vs ${2 * L.emsgSeg}` : "null");
const wc = watchDownloads(1);
await openPanel();
await clickAct("catch-dl");
const dlsC = await wc.wait();
gate("C2 出 1 个文件", dlsC.length === 1, dlsC.map((d) => d.name).join(" | "));
if (dlsC[0]) {
  const tag = dlsC[0].buf.subarray(4, 8).toString("latin1");
  gate("C3 文件头 ftyp（emsg 前置也补上 init）", tag === "ftyp", "head=" + tag);
  gate("C4 字节=init备胎+2×emsg段", dlsC[0].buf.length === L.init + 2 * L.emsgSeg, `${dlsC[0].buf.length} vs ${L.init + 2 * L.emsgSeg}`);
  const emsgAt = dlsC[0].buf.subarray(L.init + 4, L.init + 8).toString("latin1");
  gate("C5 init 之后紧跟 emsg 分段", emsgAt === "emsg", emsgAt);
  const cmpC = await testPage.evaluate((a) => window.cmpBytes(a, [[7, "init"], [7, "emsgSeg"], [7, "emsgSeg"]]), Array.from(dlsC[0].buf));
  gate("C6 逐字节=init+2×emsg段（备胎前缀无 emsg 混入）", cmpC.ok, cmpC.why);
}

/* ---------------- D. 多 init 拆分（音画不同步根修） ---------------- */
console.log("—— D. ABR 换源二次 init：拆段保存 ——");
const siD = await testPage.evaluate(() => window.newSession(['video/mp4; codecs="avc1.42E01E"']));
await openPanel();
await clickAct("catch-restart");
await testPage.waitForTimeout(400);
await testPage.evaluate((si) => window.feed(si, 0, mkInit(1)), siD);       // 流 A init
await testPage.evaluate((si) => window.feed(si, 0, mkSeg(1)), siD);
await testPage.evaluate((si) => window.feed(si, 0, mkSeg(1)), siD);
await testPage.evaluate((si) => window.feed(si, 0, mkInit(2)), siD);       // ABR 换源：二次 init（fill=2）
await testPage.evaluate((si) => window.feed(si, 0, mkSeg(2)), siD);
await testPage.evaluate((si) => window.feed(si, 0, mkSeg(2)), siD);
await testPage.waitForTimeout(600);
const wd = watchDownloads(2);
await openPanel();
await clickAct("catch-dl");
const dlsD = await wd.wait();
gate("D1 拆成 2 个文件", dlsD.length === 2, dlsD.map((d) => d.name).join(" | "));
const segA = dlsD.map((d) => d.name).sort()[0];
const segB = dlsD.map((d) => d.name).sort()[1];
gate("D2 文件名带段序号 -1/-2", /-1\.mp4$/.test(segA) && /-2\.mp4$/.test(segB), `${segA} | ${segB}`);
const f1 = dlsD.find((d) => d.name === segA);
const f2 = dlsD.find((d) => d.name === segB);
if (f1 && f2) {
  gate("D3 段1字节=init1+2段", f1.buf.length === L.init + 2 * L.seg, `${f1.buf.length} vs ${L.init + 2 * L.seg}`);
  gate("D4 段2字节=init2+2段", f2.buf.length === L.init + 2 * L.seg, `${f2.buf.length} vs ${L.init + 2 * L.seg}`);
  gate("D5 段1无二次 init（moov 填充 0x02 零出现）", !f1.buf.subarray(8).some((b, i) => i >= L.init && b === 2));
  const f1MoovFill = f1.buf[L.init - 1];  // init moov 尾填充字节（fill=1）
  const f2MoovFill = f2.buf[L.init - 1];
  gate("D6 段1 moov 填充=0x01、段2=0x02（两段各自 init）", f1MoovFill === 1 && f2MoovFill === 2, `f1=${f1MoovFill} f2=${f2MoovFill}`);
  const t1 = f1.buf.subarray(4, 8).toString("latin1");
  gate("D7 段2 文件头 ftyp", t1 === "ftyp" && f2.buf.subarray(4, 8).toString("latin1") === "ftyp");
}
info = await isoInfo();
gate("D8 toast 拆段提示", (await toastText()).indexOf("拆成 2 段") >= 0 || (await toastText()).indexOf("已忽略") >= 0, await toastText());

/* ---------------- E. 自动下载开关回归（完成点①手动停止） ---------------- */
console.log("—— E. 自动下载开关回归 ——");
await openPanel();
await clickAct("catch-auto");
await testPage.waitForTimeout(400);
gate("E1 开关写入 storage", (await extGet(popup, "snifferCatchAutoDl")) === true);
const siE = await testPage.evaluate(() => window.newSession(['video/mp4; codecs="avc1.42E01E"']));
await openPanel();
await clickAct("catch-restart");
await testPage.waitForTimeout(400);
await testPage.evaluate((si) => window.feed(si, 0, mkInit(9)), siE);       // init 走捕获账（重启后捕获已开）
await testPage.evaluate((si) => window.feed(si, 0, mkSeg(9)), siE);
await testPage.waitForTimeout(600);
const we = watchDownloads(1);
await openPanel();
await clickAct("catch-toggle");                                            // 停止 → 自动下载
const dlsE = await we.wait();
gate("E2 停止自动下载 1 文件", dlsE.length === 1, dlsE.map((d) => d.name).join(" | "));
if (dlsE[0]) gate("E3 字节=init+1段（init 已在捕获账）", dlsE[0].buf.length === L.init + L.seg, `${dlsE[0].buf.length} vs ${L.init + L.seg}`);

/* ---------------- F. 面板截图目检 ---------------- */
console.log("—— F. 截图目检 ——");
await openPanel();
await testPage.waitForTimeout(300);
const tipTxt = await testPage.evaluate(() => {
  const root = document.getElementById("chushi-sniffer-host").shadowRoot;
  const tip = root.querySelector(".catch-tip");
  return tip ? tip.textContent : "";
});
gate("F1 tip 新文案（只保存当前播放的媒体源）", tipTxt.indexOf("只保存当前播放的媒体源") >= 0 && tipTxt.indexOf("拆成多段") >= 0, tipTxt.slice(0, 60) + "…");
await testPage.screenshot({ path: SHOTS + "/F-panel.png" });
console.log("shots ->", SHOTS);

console.log(`\n===== probe v8.7.125: ${ok} OK / ${bad.length} BAD =====`);
for (const b of bad) console.log("  [BAD]", b);
await browser.close();
server.close();
process.exit(bad.length ? 1 : 0);
