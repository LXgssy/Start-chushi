// v8.3.2 浮窗歌词高斯模糊景深 e2e——closed Shadow DOM 不可达，走像素取证律。
//
//   F3  卡片挂载（mini 默认）
//   FB1 完全体歌词区逐行能量剖面：当前行（白 #f4f4f5 + sharp）边缘能量
//       显著高于相邻未唱行（灰 #71717a + blur 2px）——聚焦景深在位
//   FB2 峰值亮度对照：当前行带峰值亮度 > 相邻行带（确认找到的是当前行）
//   FB3 位置推移（6.2→12.4）后重扫描：新当前行仍聚焦——效果跟随行切换
//       （动态景深，非静态样式）
//   FB4 当前行行位守卫：R* 必须落在歌词窗中央带（滚动居中律的间接取证）
//   F9  零 pageerror
//
// 歌词注入：hubsim 单槽缓存 POST /api/lyric（songId 42，yrc 6 行 @3s 步进）。
// 布局锚：fcard padding-top 14 + .row 52（.cap 绝对定位不占流）+ .flyr
// margin-top 10 → 歌词窗 top=76，窗高 118，遮罩安全带 = 76+19 .. 76+99。
import { chromium } from "playwright-core";
import crypto from "crypto";
import { spawn, execSync } from "child_process";
import { writeFileSync, mkdtempSync } from "fs";
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
const http = spawn("python3", ["-m", "http.server", "26988", "--bind", "127.0.0.1"], { cwd: pageDir, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cleanup() {
  for (const p of [hub, spec, http]) { try { p.kill("SIGKILL"); } catch { } }
}
process.on("exit", cleanup);

/* yrc 歌词：6 行 @ 0/3/6/9/12/15s，行长 2.5s，5 词各 500ms */
const yrc = [0, 1, 2, 3, 4, 5].map((i) => {
  const s = i * 3000;
  const chars = ["一", "二", "三", "四", "五"].map((c) => `${c}`);
  let body = "", at = 0;
  for (const c of chars) { body += `(${at},500,0)${c}行`; at += 500; }
  return `[${s},2500]` + body;
}).join("\n");

/* hubsim 就绪等待（端口绑定前 POST 会静默丢失 = 暂无歌词假阴） */
let lyricStored = false;
for (let i = 0; i < 40 && !lyricStored; i++) {
  try {
    execSync("curl -s -m 1 http://127.0.0.1:26901/api/ping", { timeout: 1500 });
    /* 真桥 /api/lyric 响应形 = {ok:true, lyric:{songId,yrc,...}}（SW 解包装 j.lyric）*/
    execSync(`curl -s -X POST http://127.0.0.1:26901/api/lyric -H 'Content-Type: application/json' ` +
      `-d '${JSON.stringify({ ok: true, lyric: { songId: 42, yrc, ytlrc: "" } })}'`, { timeout: 5000 });
    const back = execSync("curl -s -m 1 'http://127.0.0.1:26901/api/lyric?songId=42'", { timeout: 1500 }).toString();
    lyricStored = back.includes('"lyric"') && back.includes("yrc");
  } catch { await sleep(200); }
}
console.log(`歌词注入: ${lyricStored ? "OK" : "FAIL（hubsim 未就绪或缓存未落）"}`);

let hbPos = 6.2;
let hubBeat = null;
function startBridgeHeartbeat() {
  hubBeat = setInterval(() => {
    const body = JSON.stringify({
      ne: {
        title: "景深测试曲", artist: "e2e", album: "v8.3.2", songId: 42,
        playing: true, position: hbPos, duration: 300,
        ts: Date.now(), v: "8.3.1",
        pic: "https://raw.githubusercontent.com/LXgssy/Start-chushi/main/public/gallery/thumbs/li-river.jpg",
      },
      ts: Date.now(), who: "e2e", lease: "holder",
    });
    execSync(
      `curl -s -X POST http://127.0.0.1:26901/api/state -H 'Content-Type: application/json' -d '${body}' >/dev/null 2>&1`,
      { timeout: 3000 });
  }, 1000);
}

const results = [];
const chk = (label, ok) => results.push([label, ok]);

const profileDir = mkdtempSync(join(tmpdir(), "ext-profile-832-"));
const browser = await chromium.launchPersistentContext(profileDir, {
  channel: "chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${ROOT}`,
    `--load-extension=${ROOT}`,
    "--no-first-run",
    "--disable-gpu",
  ],
});

const probeCard = (y) => p2.evaluate((yy) => {
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

/* 歌词窗逐行能量剖面：clip=卡片区域截图 → 页内 canvas 逐行边缘能量 */
async function lyricProfile(full) {
  const clip = { x: full.left, y: full.top, width: 324, height: 240 };
  const buf = await p2.screenshot({ clip });
  const b64 = buf.toString("base64");
  return p2.evaluate(({ b64 }) => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const Y0 = 76, SAFE = [95, 175]; /* 歌词窗 top=76；遮罩安全带 */
      const rows = [];
      for (let y = SAFE[0]; y < SAFE[1]; y++) {
        let e = 0, n = 0, peak = 0;
        for (let x = 30; x < 294; x += 2) {
          const d1 = ctx.getImageData(x, y, 1, 1).data;
          const d2 = ctx.getImageData(x + 2, y, 1, 1).data;
          const i1 = (d1[0] + d1[1] + d1[2]) / 3, i2 = (d2[0] + d2[1] + d2[2]) / 3;
          e += Math.abs(i1 - i2); n++;
          if (i1 > peak) peak = i1;
        }
        rows.push({ y, e: e / n, peak });
      }
      let best = rows[0];
      for (const r of rows) if (r.e > best.e) best = r;
      const cur = rows.filter((r) => Math.abs(r.y - best.y) <= 5);
      const below = rows.filter((r) => r.y >= best.y + 24 && r.y <= Math.min(best.y + 42, SAFE[1] - 1));
      const avg = (a) => a.reduce((s, r) => s + r.e, 0) / Math.max(1, a.length);
      const pk = (a) => Math.max(...a.map((r) => r.peak));
      res({ bestY: best.y, curE: avg(cur), belowE: avg(below), curPk: pk(cur), belowPk: pk(below),
            belowN: below.length, rows: rows.map((r) => Math.round(r.e * 10) / 10) });
    };
    img.onerror = () => rej(new Error("screenshot decode fail"));
    img.src = "data:image/png;base64," + b64;
  }), { b64 });
}

const errors = [];
let p2 = null;
const tab = await browser.newPage();
tab.on("pageerror", e => errors.push("pageerror: " + e.message));
tab.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
await tab.goto(`chrome-extension://${EXT_ID}/index.html`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
await tab.waitForTimeout(1200);

startBridgeHeartbeat();
await sleep(400);
p2 = await browser.newPage();
p2.on("pageerror", e => errors.push("cardpage pageerror: " + e.message));
await p2.goto("http://127.0.0.1:26988/index.html", { waitUntil: "load", timeout: 15000 });
await sleep(3500);
let pr = await probeCard(120);
chk("F3 卡片挂载（mini 默认）", pr.found && pr.width >= 250 && pr.width <= 280, `w=${pr.width}`);

if (pr.found) {
  /* mini → 完全体 */
  await p2.mouse.click(pr.left + 264 - 19, pr.top + 15);
  await sleep(2500); /* 形变 + 歌词拉取/构建 + 滚动模糊过渡稳定 */
  const full = await probeCard(pr.top + 60);
  chk("FB0 完全体在位（宽 ~324）", full.found && full.width >= 310 && full.width <= 340, `w=${full.width}`);

  if (full.found) {
    /* 相位一：position 6.2（±1s 心跳窗）→ line2 当前 */
    const p1 = await lyricProfile(full);
    chk("FB4a 当前行居中律（R*=" + p1.bestY + " ∈ [110,160]）", p1.bestY >= 110 && p1.bestY <= 160);
    chk("FB1a 聚焦景深（当前行能量 " + p1.curE.toFixed(1) + " > 相邻行 " + p1.belowE.toFixed(1) + " ×1.3）",
      p1.curE > 6 && p1.curE > p1.belowE * 1.3);
    chk("FB2a 峰值亮度（当前行 " + p1.curPk.toFixed(0) + " > 相邻行 " + p1.belowPk.toFixed(0) + "）",
      p1.curPk > p1.belowPk);

    /* 相位二：position → 12.4 → line4 当前（line2→done） */
    hbPos = 12.4;
    await sleep(2200); /* 心跳 1s + 滚动/模糊 .45s×2 */
    const p2p = await lyricProfile(full);
    chk("FB4b 新当前行居中律（R*=" + p2p.bestY + " ∈ [110,160]）", p2p.bestY >= 110 && p2p.bestY <= 160);
    chk("FB1b 效果跟随（新当前行能量 " + p2p.curE.toFixed(1) + " > 新相邻行 " + p2p.belowE.toFixed(1) + " ×1.3）",
      p2p.curE > 6 && p2p.curE > p2p.belowE * 1.3);
    chk("FB2b 新峰值亮度（当前行 " + p2p.curPk.toFixed(0) + " > 相邻行 " + p2p.belowPk.toFixed(0) + "）",
      p2p.curPk > p2p.belowPk);
  }
}

chk("F9 零 pageerror/console error", errors.length === 0, errors.join(" | "));

console.log("");
let bad = 0;
for (const [label, ok] of results) {
  console.log((ok ? "  ✓ " : "  ✗ ") + label);
  if (!ok) bad++;
}
console.log(`\n结果: ${results.length - bad} 通过 / ${bad} 失败`);
try { clearInterval(hubBeat); } catch {}
await browser.close();
process.exit(bad ? 1 : 0);
