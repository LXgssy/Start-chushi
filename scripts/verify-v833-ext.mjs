// v8.3.3 浮窗取证门——行界滞回门（像素级）+ 新标签页焦点归位 + 归位律文件门。
//
//   E1 焦点归位：NTP 加载后 body 持焦点（tabIndex=-1），地址栏不再持有
//   E2 门压制（像素反证）：行 2 激活后两拍 backward（熔断第 2 拍放行）——
//      2s 内最亮行（当前行）不得回跳到行 1 的 y 位（重亮=门失效）
//   E3 前进即时：位置前推 → 最亮行下移一行（正常切换不受门影响）
//   E4 归位律文件门：staged ext-card.js 封面滤镜零残留 + done 提层在位
// rig 复用 verify-v832-ext.mjs（hubsim + spectrumsim + 真扩展加载）
import { chromium } from "playwright-core";
import crypto from "crypto";
import { spawn, execSync } from "child_process";
import { writeFileSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = "/tmp/ext-stage";
const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map(c => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const PROJ = "/tmp/my-project";
const hub = spawn(`${PROJ}/scripts/hubsim`, ["26901"], { stdio: "ignore" });
const spec = spawn(`${PROJ}/scripts/spectrumsim`, ["26911"], { stdio: "ignore" });
const pageDir = mkdtempSync(join(tmpdir(), "cardpage-"));
writeFileSync(join(pageDir, "index.html"),
  "<!doctype html><html><head><title>CardTestPage</title></head><body style='background:#22252a'><h1 style='color:#888'>测试页</h1></body></html>");
const http = spawn("python3", ["-m", "http.server", "26988", "--bind", "127.0.0.1"],
  { cwd: pageDir, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("exit", () => { for (const p of [hub, spec, http]) { try { p.kill("SIGKILL"); } catch { } } });

/* yrc 歌词：6 行 @ 0/3/6/9/12/15s */
const yrc = [0, 1, 2, 3, 4, 5].map((i) => {
  const s = i * 3000;
  let body = "", at = 0;
  for (const c of ["一", "二", "三", "四", "五"]) { body += `(${at},500,0)${c}行`; at += 500; }
  return `[${s},2500]` + body;
}).join("\n");

let lyricStored = false;
for (let i = 0; i < 40 && !lyricStored; i++) {
  try {
    execSync("curl -s -m 1 http://127.0.0.1:26901/api/ping", { timeout: 1500 });
    execSync(`curl -s -X POST http://127.0.0.1:26901/api/lyric -H 'Content-Type: application/json' ` +
      `-d '${JSON.stringify({ ok: true, lyric: { songId: 42, yrc, ytlrc: "" } })}'`, { timeout: 5000 });
    const back = execSync("curl -s -m 1 'http://127.0.0.1:26901/api/lyric?songId=42'", { timeout: 1500 }).toString();
    lyricStored = back.includes('"lyric"') && back.includes("yrc");
  } catch { await sleep(200); }
}
console.log(`歌词注入: ${lyricStored ? "OK" : "FAIL"}`);

let hbPos = 7.5;   // 心跳位置（可动态改）
let hbOn = true;
const hubBeat = setInterval(() => {
  if (!hbOn) return;
  const body = JSON.stringify({
    ne: { title: "滞回门测试曲", artist: "e2e", album: "v8.3.3", songId: 42,
      playing: true, position: hbPos, duration: 300, ts: Date.now(), v: "8.3.1",
      pic: "https://raw.githubusercontent.com/LXgssy/Start-chushi/main/public/gallery/thumbs/li-river.jpg" },
    ts: Date.now(), who: "e2e", lease: "holder",
  });
  try {
    execSync(`curl -s -X POST http://127.0.0.1:26901/api/state -H 'Content-Type: application/json' -d '${body}' >/dev/null 2>&1`, { timeout: 3000 });
  } catch { }
}, 1000);

let passed = 0, failed = 0;
const chk = (label, ok) => { if (ok) { passed++; console.log("  ✓ " + label); } else { failed++; console.log("  ✗ " + label); } };

const profileDir = mkdtempSync(join(tmpdir(), "ext-profile-833-"));
const browser = await chromium.launchPersistentContext(profileDir, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--disable-gpu"],
});

/* ---------- E1 焦点归位（NTP 页） ---------- */
{
  const ntp = await browser.newPage();
  await ntp.goto(`chrome-extension://${EXT_ID}/index.html`, { waitUntil: "load", timeout: 20000 });
  await sleep(1300);
  const st = await ntp.evaluate(() => ({
    ae: document.activeElement === document.body ? "body"
      : document.activeElement === document.documentElement ? "html"
      : document.activeElement ? document.activeElement.tagName : "null",
    tabIndex: document.body.tabIndex,
  }));
  chk(`E1 焦点归位（activeElement=${st.ae}，body.tabIndex=${st.tabIndex}）`,
    st.ae === "body" && st.tabIndex === -1);
  await ntp.close();
}

/* ---------- 浮窗页（完全体歌词） ---------- */
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message)));
await page.goto("http://127.0.0.1:26988/index.html", { waitUntil: "load", timeout: 15000 });
await sleep(3500);

const probeCard = (y) => page.evaluate((yy) => {
  const host = document.getElementById("chushi-card-host");
  if (!host) return { found: false };
  let lo = -1, hi = -1;
  for (let x = 60; x <= 1500; x += 2) {
    const hit = document.elementFromPoint(x, yy) === host;
    if (hit) { if (lo < 0) lo = x; hi = x; }
  }
  if (lo < 0) return { found: false };
  let top = -1;
  for (let y2 = 20; y2 <= 900; y2 += 2) {
    if (document.elementFromPoint(lo + 10, y2) === host) { top = y2; break; }
  }
  return { found: true, left: lo, right: hi, width: hi - lo, top };
}, y);

let pr = await probeCard(120);
chk(`E-m 卡片挂载（mini 宽 ${pr.found ? pr.width : "?"}）`, pr.found && pr.width >= 250 && pr.width <= 280);
if (pr.found) {
  await page.mouse.click(pr.left + 264 - 19, pr.top + 15);
  await sleep(2500);
}
const full = await probeCard((pr.found ? pr.top : 120) + 60);
chk(`E0 完全体在位（宽 ${full.found ? full.width : "?"}）`, full.found && full.width >= 300 && full.width <= 340);

/* 行亮度剖面：clip 卡片歌词窗 → 页内 canvas 逐行亮度 → 最亮行 y */
async function brightRow() {
  const clip = { x: full.left, y: full.top + 60, width: full.width, height: 180 };
  const buf = await page.screenshot({ clip });
  const b64 = buf.toString("base64");
  return page.evaluate(async ({ b64 }) => {
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = "data:image/png;base64," + b64; });
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const W = c.width, H = c.height, d = ctx.getImageData(0, 0, W, H).data;
    const rowL = [];
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = 8; x < W - 8; x++) { const i = (y * W + x) * 4; s += d[i] + d[i + 1] + d[i + 2]; }
      rowL.push(s / W);
    }
    let bi = 0, bv = 0;
    rowL.forEach((v, i) => { if (v > bv) { bv = v; bi = i; } });
    return { bi, bv, rowL };
  }, { b64 });
}

/* 落位：等行 2（6-9s）成为当前行 */
await sleep(2600);
/* 链路活性探针：yrc 逐字扫光在播 → 歌词窗像素必然持续变化；全静 = 链路死 */
{
  const a = await brightRow();
  await sleep(700);
  const b = await brightRow();
  let diff = 0;
  for (let i = 0; i < Math.min(a.rowL.length, b.rowL.length); i++) diff += Math.abs(a.rowL[i] - b.rowL[i]);
  chk(`E-L 链路活性（700ms 行剖面差分 ${diff.toFixed(1)} > 3 = 扫光在走）`, diff > 3);
}
const base = await brightRow();
const curY = base.bi; /* 行 2 的 y（最亮） */

/* ---------- E2 门压制：两拍 backward（7.5→6.0，delta≈-1.5 熔断带第 2 拍放行） ---------- */
hbPos = 6.0; await sleep(120); hbPos = 6.0;
let upjump = 0, samples = 0;
const t0 = Date.now();
while (Date.now() - t0 < 2000) {
  const r = await brightRow();
  samples++;
  if (r.bi < curY - 8) upjump++; /* 最亮行跳回上方（行 1 重亮的像素特征） */
  await sleep(110);
}
chk(`E2 门压制（backward 双拍后 2s 内重亮回跳 ${upjump}/${samples} = 0，当前行 y=${curY} 保持）`,
  upjump === 0);

/* ---------- E3 前进即时：9.4 → 行 3 ---------- */
/* E3 扫描位置取证：逐字扫光只在当前行走——行切换后「时变方差峰」
   （扫描行）从行 2（curY）移到行 3（上方一行，滚动居中律）。
   滚动居中 = 最亮行 y 恒定，不能拿最亮行位移当判据（首版错模型）。 */
async function scanRow() {
  const profs = [];
  for (let i = 0; i < 6; i++) { profs.push((await brightRow()).rowL); await sleep(150); }
  const n = Math.min(...profs.map((p) => p.length));
  const varRow = [];
  for (let y = 0; y < n; y++) {
    const vs = profs.map((p) => p[y]);
    const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
    varRow.push(Math.sqrt(vs.reduce((a, b) => a + (b - mean) ** 2, 0) / vs.length));
  }
  let bi = 0, bv = 0;
  varRow.forEach((v, i) => { if (v > bv) { bv = v; bi = i; } });
  return { bi, bv };
}
hbPos = 9.4;
let movedUp = false, scan2 = null;
const t2 = Date.now();
while (Date.now() - t2 < 4500) { /* 1Hz 心跳 + SW 轮询链路延迟 ≤2s，窗给足 */
  scan2 = await scanRow();
  if (scan2.bv > 2 && scan2.bi <= curY - 12) { movedUp = true; break; }
  await sleep(200);
}
chk(`E3 前进即时（扫描峰 ${curY}→${scan2 && scan2.bi} 上移一行 = 效果跟随，${Date.now() - t2}ms 内）`,
  movedUp);
hbOn = false;
clearInterval(hubBeat);

/* ---------- E4 归位律文件门（staged = 运行中安装） ---------- */
{
  const card = readFileSync(join(ROOT, "ext-card.js"), "utf-8");
  const sb = readFileSync(join(ROOT, "sandbox.js"), "utf-8");
  chk("E4a 浮窗封面滤镜零残留（c.img.style.filter 不存在）", !card.includes("c.img.style.filter"));
  chk("E4b done 行常驻提层在位（will-change:transform,filter）", card.includes("will-change:transform,filter"));
  chk("E4c 浮窗行界滞回门在位（GATE_MS + gPend）", card.includes("GATE_MS") && card.includes("gPend"));
  chk("E4d 宿主滞回门在位（sandbox gateFrame + guard 旁路）", sb.includes("gateFrame") && sb.includes("guard &&"));
}

chk("E9 零 pageerror", errors.length === 0);
console.log(`\n=== v8.3.3 浮窗取证门: ${passed} 通过, ${failed} 失败 ===`);
await browser.close();
process.exit(failed ? 1 : 0);
