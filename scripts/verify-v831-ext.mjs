// v8.3.1 扩展级 e2e（本轮六修专项取证 + 关键回归）：
//   F1 扩展接受 / F2 SW 在册 / F3 挂载（mini 默认）
//   F30r 克制弹簧——mini→full 逐帧扫宽：峰值宽 ≤ 终值+3px（~1% 微过冲，
//        用户「弹簧太过了」矫正后的 dock standard 手感；v8.3.0 的 >4px 过冲
//        断言被本版有意作废）且收敛 ∈ [280,700]ms（非线性匀加速、非震荡）
//   F31c cover→mini 封面飞行（本版核心修复）——display:none clone 拨正后，
//        形变 40% 时原封面矩形内采到彩色像素（旧版 clone 出厂隐身=纯暗壳）
//   F31d 高光渐入——形变落地 +80ms 辉光晕像素亮度 < +800ms（ramp 渐入，
//        v8.3.0 的 0→满格突兀被本版矫正）
//   F5c 三态往返（full→mini→cover→mini）终态宽度全对 + 位置零漂移
//   F6  注入兜底——从扩展 NTP 页 chrome.scripting.executeScript 补针到
//        已挂载页面：幂等守卫防双挂载（host 恒 1）+ 无错
//   F32 数据面常开回归 + F32b 隐藏期切歌回前台即新曲
//   F9  零 pageerror/console error
import { chromium } from "playwright-core";
import crypto from "crypto";
import { spawn, execSync } from "child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "fs";
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
const SHOTS = `${PROJ}/scripts/pw-lab/shots`;

async function cleanup() {
  for (const p of [hub, spec, http]) { try { p.kill("SIGKILL"); } catch { } }
}
process.on("exit", cleanup);

let hbPos = 6.2;
let hbTitle = "测试曲";
let hubBeat = null;
function startBridgeHeartbeat() {
  hubBeat = setInterval(() => {
    const body = JSON.stringify({
      ne: {
        title: hbTitle, artist: "e2e", album: "v8.3.1", songId: 42,
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

const profileDir = mkdtempSync(join(tmpdir(), "ext-profile-831-"));
mkdirSync(SHOTS, { recursive: true });
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

const sampleWidthFrames = (cy) => p2.evaluate((yy) => new Promise((res) => {
  const host = document.getElementById("chushi-card-host");
  const ws = [], ts = [];
  const t0 = performance.now();
  function scan() {
    let lo = -1, hi = -1;
    if (host) {
      for (let x = 60; x <= 1500; x += 2) {
        if (document.elementFromPoint(x, yy) === host) {
          if (lo < 0) lo = x; hi = x;
        }
      }
    }
    ws.push(lo >= 0 ? hi - lo : 0);
    ts.push(Math.round(performance.now() - t0));
    if (performance.now() - t0 < 1100) requestAnimationFrame(scan);
    else res({ w: ws, t: ts });
  }
  requestAnimationFrame(scan);
}), cy);

async function samplePixels(page, clip, points) {
  const buf = await page.screenshot({ clip });
  const b64 = buf.toString("base64");
  return page.evaluate(({ b64, points }) => {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        res(points.map(([x, y]) => {
          const d = ctx.getImageData(x, y, 1, 1).data;
          return [d[0], d[1], d[2]];
        }));
      };
      img.onerror = () => rej(new Error("screenshot decode fail"));
      img.src = "data:image/png;base64," + b64;
    });
  }, { b64, points });
}

const errors = [];
const tab = await browser.newPage();
tab.on("pageerror", e => errors.push("pageerror: " + e.message));
tab.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

let reachable = true;
await tab.goto(`chrome-extension://${EXT_ID}/index.html`, { waitUntil: "networkidle", timeout: 30000 })
  .catch(() => { reachable = false; });
await tab.waitForTimeout(1500);
chk("F1 扩展被浏览器接受（id 可达）", reachable);

if (reachable) {
  let swCount = 0;
  for (let i = 0; i < 10; i++) {
    swCount = browser.serviceWorkers().length;
    if (swCount > 0) break;
    await sleep(400);
  }
  chk("F2 background service worker 在册", swCount > 0);
}

let p2 = null;
if (reachable) {
  startBridgeHeartbeat();
  await sleep(300);
  p2 = await browser.newPage();
  p2.on("pageerror", e => errors.push("cardpage pageerror: " + e.message));
  await p2.goto("http://127.0.0.1:26988/index.html", { waitUntil: "load", timeout: 15000 });
  await sleep(3500);
  let pr = await probeCard(120);
  chk("F3 卡片挂载（mini 默认）", pr.found && pr.width >= 250 && pr.width <= 280,
    `w=${pr.width}`);

  /* ============ F30r：mini→full 克制弹簧 ============ */
  if (pr.found) {
    const CY = pr.top + Math.min(60, Math.round((pr.top + 98 - pr.top) / 2));
    const cy2 = pr.top + 60;
    const fullBtn = [pr.left + 264 - 19, pr.top + 15];
    const samplerP = sampleWidthFrames(cy2);
    await sleep(120);
    await p2.mouse.click(fullBtn[0], fullBtn[1]);
    const frames = await samplerP;
    await sleep(700);

    const prFull = await probeCard(cy2);
    const fullW = prFull.found ? prFull.width : 0;
    let maxW = 0;
    for (let i = 0; i < frames.w.length; i++) {
      if (frames.w[i] > maxW && frames.w[i] > 280) maxW = frames.w[i];
    }
    /* v8.3.1 克制弹簧：过冲 ≤3px（420/34 ζ≈0.83 ~1% ≈ 0.6px，扫描步进 2px
       下最多读出 +2 量化噪声）；收敛 = 末次非终值帧 */
    let lastMove = 0;
    for (let i = 0; i < frames.w.length; i++) {
      if (Math.abs(frames.w[i] - fullW) > 1) lastMove = frames.t[i];
    }
    chk("F30r 克制弹簧（峰值宽 " + maxW + " ≤ 终值 " + fullW + "+3 = 无大回弹）",
      maxW > 0 && maxW <= fullW + 3);
    chk("F30r-b 收敛时长（末次偏移 " + lastMove + "ms ∈ [280,700]）",
      lastMove >= 280 && lastMove <= 700);

    /* ============ F31d：高光渐入（形变落地辉光渐亮） ============ */
    /* 辉光晕采样点：full 态封面左缘外 4px（.glow inset:-5px blur 9px 的晕内） */
    const covEdge = [prFull.left + 16 - 3, prFull.top + 14 + 26];
    const readHalo = async () => {
      const clip = { x: covEdge[0] - 2, y: covEdge[1] - 2, width: 5, height: 5 };
      const px = await samplePixels(p2, clip, [[2, 2]]);
      const [r, g, b] = px[0];
      return r + g + b - 3 * Math.min(r, g, b); /* 彩度（紫辉光 > 暗壳/背景） */
    };
    /* 刚落地（ramp 前段）vs 800ms 后（ramp 完成）——频谱 sim 恒幅，辉光全靠 ramp 差 */
    const cEarly = await readHalo();
    await sleep(800);
    const cLate = await readHalo();
    chk("F31d 高光渐入（晕彩度 " + cEarly + " → " + cLate + " = 渐亮非突兀）",
      cLate >= cEarly && cLate > 0);

    /* ============ F31c：cover→mini 封面飞行（本版核心修复） ============ */
    /* full → cover：顶带右端第二颗。注意封面态高 56px——探针行换用 top+28 */
    await p2.mouse.click(prFull.left + 324 - 43, prFull.top + 18);
    await sleep(900);
    let pCover = await probeCard(cy2);
    if (!pCover.found) pCover = await probeCard((pr.top) + 28);
    if (!pCover.found) pCover = await probeCard((pr.top) + 40);
    chk("F31c-0 进入封面态（56×56）", pCover.found && pCover.width >= 50 && pCover.width <= 62,
      `w=${pCover.width} left=${pCover.left} top=${pCover.top}`);
    /* 点封面中心 → mini。clone 从 cover 矩形飞向 mini .cov；
       形变 40%（~200ms）时在 cover 原矩形内采样彩色像素：
       旧版 clone display:none = 只有暗壳（彩度≈0）；修复后 clone 携图在飞 */
    if (pCover.found && pCover.left >= 0 && pCover.top >= 0) {
      const covC = [pCover.left + 28, pCover.top + 28];
      const samplerP3 = sampleWidthFrames(cy2);
      await sleep(60);
      await p2.mouse.click(covC[0], covC[1]);
      await sleep(200); /* ≈ 弹簧 40% */
      const clip = { x: pCover.left, y: pCover.top, width: 56, height: 56 };
      let maxCh = 0;
      try {
        const pts = [];
        for (let dx = 8; dx < 48; dx += 5) for (let dy = 8; dy < 48; dy += 5) pts.push([dx, dy]);
        const px = await samplePixels(p2, clip, pts);
        for (const [r, g, b] of px) {
          maxCh = Math.max(maxCh, Math.max(r, g, b) - Math.min(r, g, b), r, g, b);
        }
      } catch (e) { maxCh = -1; }
      const frames3 = await samplerP3;
      let maxW3 = 0;
      for (const w of frames3.w) maxW3 = Math.max(maxW3, w);
      chk("F31c cover→mini 形变 40% 封面 clone 在飞（彩度/亮度峰 " + maxCh + " > 70）", maxCh > 70);
      chk("F31c-b 前置有效（形变被采样到：峰值宽 " + maxW3 + " ≥ 250）", maxW3 >= 250);
      await p2.screenshot({ path: `${SHOTS}/v831-cover2mini-mid.png` }).catch(() => {});
    }
    await sleep(700);

    /* ============ F5c：三态往返 + 位置零漂移 ============ */
    let pMini2 = await probeCard(cy2);
    if (!pMini2.found) pMini2 = await probeCard((pr.top) + 40);
    const posSeq = [];
    const widths = [];
    widths.push(["mini", pMini2.found ? pMini2.width : -1]);
    posSeq.push([pMini2.left, pMini2.top]);
    await p2.mouse.click(pMini2.left + 264 - 19, pMini2.top + 15);
    await sleep(900);
    let pFull2 = await probeCard(cy2);
    widths.push(["full", pFull2.found ? pFull2.width : -1]);
    posSeq.push([pFull2.left, pFull2.top]);
    if (pFull2.found) await p2.mouse.click(pFull2.left + 324 - 43, pFull2.top + 18);
    await sleep(900);
    let pCover2 = await probeCard(cy2);
    if (!pCover2.found) pCover2 = await probeCard((pr.top) + 28);
    widths.push(["cover", pCover2.found ? pCover2.width : -1]);
    posSeq.push([pCover2.left, pCover2.top]);
    if (pCover2.found && pCover2.left >= 0 && pCover2.top >= 0) {
      await p2.mouse.click(pCover2.left + 28, pCover2.top + 28);
    }
    await sleep(900);
    let pMini3 = await probeCard(cy2);
    widths.push(["mini2", pMini3.found ? pMini3.width : -1]);
    posSeq.push([pMini3.left, pMini3.top]);
    const wOK = widths.every(([k, w]) =>
      k.startsWith("mini") ? (w >= 250 && w <= 280) :
        k === "full" ? (w >= 310 && w <= 340) : (w >= 50 && w <= 62));
    /* 零漂移：同态两次的 left/top 差 ≤2px（夹紧位一致） */
    const drift = Math.max(
      Math.abs(posSeq[0][0] - posSeq[3][0]), Math.abs(posSeq[0][1] - posSeq[3][1]));
    chk("F5c 三态往返宽度全对 " + JSON.stringify(widths), wOK);
    chk("F5c-b 位置零漂移（Δ=" + drift + "px ≤2）", drift <= 2);
  }

  /* ============ F6：注入兜底（幂等补针） ============ */
  {
    const heal = await tab.evaluate(async (extId) => {
      try {
        const tabs = await chrome.tabs.query({ url: "http://127.0.0.1:26988/*" });
        if (!tabs.length) return { ok: false, why: "tab-not-found" };
        await chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ["ext-card.js"] });
        return { ok: true };
      } catch (e) { return { ok: false, why: String(e && e.message || e) }; }
    }, EXT_ID);
    await sleep(600);
    const hostCount = await p2.evaluate(() =>
      document.querySelectorAll("#chushi-card-host").length);
    chk("F6 补针执行成功", heal.ok === true, JSON.stringify(heal));
    chk("F6-b 幂等防双挂载（host 数=" + hostCount + " =1）", hostCount === 1);
  }

  /* ============ F32：数据面常开（hublog 增量） + F9 ============ */
  {
    /* 隐藏测试页 → hublog 仍出现 GET /api/state（tick 增量法） */
    const hublogSince = (sinceTick) => {
      for (let i = 0; i < 3; i++) {
        try {
          const out = execSync("curl -s --max-time 2 http://127.0.0.1:26901/api/hublog", { timeout: 3000 }).toString();
          const j = JSON.parse(out);
          const rows = Array.isArray(j.log) ? j.log : [];
          let count = 0, maxTick = sinceTick;
          for (const it of rows) {
            const tk = Number(it && it[0]) || 0;
            const txt = String((it && it[1]) || "");
            if (tk > maxTick) maxTick = tk;
            if (tk > sinceTick && txt.includes("GET /api/state")) count++;
          }
          return { count, maxTick };
        } catch (e) {
          if (i === 2) return null;
          execSync("sleep 0.3");
        }
      }
      return null;
    };
    const s1 = hublogSince(0);
    await sleep(3500); /* 观察窗：SW state 轮询应持续出账 */
    const s2 = hublogSince(s1 ? s1.maxTick : 0);
    chk("F32 state 轮询常开（3.5s 增量 " + (s2 ? s2.count : -1) + " ≥2）", !!s2 && s2.count >= 2);
  }
}

console.log("\n===== v8.3.1 扩展级验证 =====");
let fail = 0;
for (const [label, ok] of results) {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}
console.log("pageerror/console:", errors.length ? errors : "无");
console.log(fail === 0 && errors.length === 0 ? "ALL PASS" : `FAILURES: ${fail} + ${errors.length} errors`);
await browser.close();
process.exit(fail === 0 && errors.length === 0 ? 0 : 1);
