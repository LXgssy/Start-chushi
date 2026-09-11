// v8.3.0 扩展级 e2e（本轮三修的专项取证 + 关键回归）：
//   F1 扩展接受 / F2 SW 在册 / F3 挂载（mini 默认）
//   F30 真弹簧回弹——mini→full 逐帧扫宽：峰值宽 > 终值宽 + 4px（过冲回弹存在）
//        且收敛时长 380~750ms（不是 linear 匀加速，也不是无休止震荡）
//   F31 封面连续锚——形变途中在「旧封面矩形 → 新封面矩形」走廊上采样到
//        非深灰像素（封面 clone 在飞，不是 v8.2.9 的原地消失重排）
//   F5c 三态往返（full→mini→cover→mini）终态宽度全对 + 位置零漂移
//        （校准卡顿反证：cleanup 提交位与形变终点一致，无 1px 级复位）
//   F32 数据面常开——全部卡片隐藏期 hublog 仍出现 GET /api/state
//        （v8.2.9 visCount 门在此窗口=0 条；休眠退役的直接行为证据）
//   F32b 隐藏期切歌，回前台卡片已显示新曲（不再停留上一首）
//   F9 零 pageerror/console error
// 取证律沿 v8.2.7：全新 profile + 动态坐标 + 像素采样 + 截图人眼终审。
import { chromium } from "playwright-core";
import crypto from "crypto";
import { spawn, execSync } from "child_process";
import { writeFileSync, mkdtempSync, mkdirSync, readFileSync } from "fs";
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
  "<!doctype html><html><head><title>CardTestPage</title></head><body><h1>测试页</h1></body></html>");
const http = spawn("python3", ["-m", "http.server", "26988", "--bind", "127.0.0.1"], { cwd: pageDir, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = `${PROJ}/scripts/pw-lab/shots`;

async function cleanup() {
  for (const p of [hub, spec, http]) { try { p.kill("SIGKILL"); } catch { } }
}
process.on("exit", cleanup);

/* 桥 1Hz 心跳：hbTitle/hbPos 可变（切歌/走针断言用），songId=42 */
let hbPos = 6.2;
let hbTitle = "测试曲";
let hubBeat = null;
function startBridgeHeartbeat() {
  hubBeat = setInterval(() => {
    const body = JSON.stringify({
      ne: {
        title: hbTitle, artist: "e2e", album: "v8.3.0", songId: 42,
        playing: true, position: hbPos, duration: 300,
        ts: Date.now(), v: "8.2.3",
        pic: "https://raw.githubusercontent.com/LXgssy/Start-chushi/main/public/gallery/thumbs/li-river.jpg",
      },
      ts: Date.now(), who: "e2e", lease: "holder",
    });
    execSync(
      `curl -s -X POST http://127.0.0.1:26901/api/state -H 'Content-Type: application/json' -d '${body}' >/dev/null 2>&1`,
      { timeout: 3000 });
  }, 1000);
}
const stopHeartbeat = () => { if (hubBeat) { clearInterval(hubBeat); hubBeat = null; } };

/* hublog 增量取证：48 条环形缓冲会被历史稀释——快照计数法不可用。
   改用条目自带 tick（CLOCK_MONOTONIC 毫秒）做增量：统计 tick > since
   且文本含 GET /api/state 的条目。心跳是 POST 不混入；歌词/频谱路径
   不含 /api/state 也不混入。瞬态失败重试 3 次。 */
function hublogSince(sinceTick) {
  for (let i = 0; i < 3; i++) {
    try {
      const out = execSync(
        "curl -s --max-time 2 http://127.0.0.1:26901/api/hublog", { timeout: 3000 }).toString();
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
      if (i === 2) { console.log(String.fromCharCode(91) + "hublog err] " + (e.message || e)); return null; }
      execSync("sleep 0.3");
    }
  }
  return null;
}

const results = [];
const chk = (label, ok) => results.push([label, ok]);

const profileDir = mkdtempSync(join(tmpdir(), "ext-profile-830-"));
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launchPersistentContext(profileDir, {
  executablePath: process.env.CHROME_BIN || undefined,
  channel: process.env.CHROME_BIN ? undefined : "chromium",
  headless: true,
  args: [
    `--disable-extensions-except=${ROOT}`,
    `--load-extension=${ROOT}`,
    "--no-first-run",
    "--disable-gpu",
  ],
});

/* 卡片外部探测（y 行扫 x 得水平区间） */
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

/* 形变逐帧采样：页内 rAF 循环，每帧扫 y=CY 行的 host 命中区间 → 宽度序列。
   dur 采样窗 1100ms；返回 {w:[...], t:[...]}（t 相对采样起点 ms） */
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

/* 像素采样：screenshot(clip) → data URI → 页内 canvas → 各点 RGB */
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

/* F1：扩展接受 */
let reachable = true;
await tab.goto(`chrome-extension://${EXT_ID}/index.html`, { waitUntil: "networkidle", timeout: 30000 })
  .catch(() => { reachable = false; });
await tab.waitForTimeout(1500);
chk("F1 扩展被浏览器接受（id 可达）", reachable);

/* F2：SW 在册 */
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

  /* F3 卡片挂载（mini 默认） */
  let mounted = false;
  for (let i = 0; i < 15; i++) {
    mounted = await p2.evaluate(() => {
      const h = document.getElementById("chushi-card-host");
      return !!h && getComputedStyle(h).display === "block";
    });
    if (mounted) break;
    await sleep(700);
  }
  chk("F3 悬浮音乐卡挂载（host display:block = SW 真值到达）", mounted);
  await sleep(1200);

  const CY = 116;
  let pr = await probeCard(CY);
  chk("F3b 标准态默认（探测宽度 ≈264，实测 " + (pr.found ? pr.width : "未命中") + "）",
    pr.found && pr.width >= 240 && pr.width <= 290);
  await p2.screenshot({ path: `${SHOTS}/v830-a-mini.png` }).catch(() => {});

  /* ============ F30/F31：mini→full 弹簧形变 + 封面飞行 ============ */
  /* miniFull 钮坐标（顶带右端第一颗）：v8.2.3 布局 cap 右缘 8px，两颗 22px+2px 间隙 */
  const fullBtn = [pr.left + 264 - 19, pr.top + 15];
  /* 采样与点击同帧起跑：先挂采样（rAF 在下一帧才扫），120ms 后点按钮 */
  const samplerP = sampleWidthFrames(CY);
  await sleep(120);
  await p2.mouse.click(fullBtn[0], fullBtn[1]);
  const frames = await samplerP;
  await sleep(700); /* 收敛余量 */

  const prFull = await probeCard(CY);
  const fullW = prFull.found ? prFull.width : 0;
  /* 过冲取证：形变期最大探测宽 > 终值 + 4px（Δ60 的 ~10% 弹簧过冲 ≈ 6px，
     扫描步进 2px 可分辨）。只统计 width>280 的帧（排除起跑前 mini 态噪声） */
  let maxW = 0, maxT = 0;
  for (let i = 0; i < frames.w.length; i++) {
    if (frames.w[i] > maxW) { maxW = frames.w[i]; maxT = frames.t[i]; }
  }
  /* v8.3.3 判据对齐：v8.3.1 弹簧克制化（壳 dock standard 同参 ζ≈0.83，
     目标 ~1% 微过冲 ≈ +3.2px）——过冲必须存在（非线性弹簧非缓动）但
     必须克制（≤+6px）；旧门 +4 是 v8.3.0 大回弹时代阈值 */
  chk("F30a 克制弹簧微过冲（形变峰值宽 " + maxW + " ∈ 终值 " + fullW + " +[1,6] = 有回弹且克制）",
    fullW > 300 && maxW >= fullW + 1 && maxW <= fullW + 6);
  /* 收敛取证：最后一次偏离终值 ±3px 的时间在 380~900ms（≈ 弹簧 550ms ± 余量） */
  let lastMove = 0;
  for (let i = 0; i < frames.w.length; i++) {
    if (Math.abs(frames.w[i] - fullW) > 3) lastMove = frames.t[i];
  }
  chk("F30b 弹簧收敛时长（末次偏移 " + lastMove + "ms ∈ [300,950]，非永久震荡）",
    lastMove >= 300 && lastMove <= 950);

  /* F31 封面连续锚：mini 封面中心 (L+34,T+48) → full 封面中心 (toX+43,toY+41)，
     toX=L-36（默认右贴边夹紧）、toY=T → 走廊中点 ≈ (L+20,T+44)。形变 ~45% 处
     clone 应途经此处；v8.2.9（无 clone）该处只有深灰壳。photo 封面=彩色，
     深灰壳 r/g/b≈28-40 → 三通道 max>70 即非壳色。 */
  {
    const midX = pr.left + 20, midY = pr.top + 44;
    /* 重新触 发一次 mini→full？此刻已是 full——改在 full→mini 反向走廊取证 */
    const miniBtn = [prFull.left + 324 - 19, prFull.top + 18];
    const fullCovC = [prFull.left + 43, prFull.top + 41];
    const samplerP2 = sampleWidthFrames(CY);
    await sleep(60);
    await p2.mouse.click(miniBtn[0], miniBtn[1]);
    /* 反向（full→mini）：cov 从 (toX+43,toY+41) 飞回 (L+34,T+48)，同一走廊 */
    await sleep(200); /* ≈ 弹簧 40% 处 */
    const clip = { x: fullCovC[0] - 26, y: fullCovC[1] - 26, width: 52, height: 52 };
    let colorful = false, maxCh = 0;
    try {
      const pts = [];
      for (let dx = 4; dx < 52; dx += 6) for (let dy = 4; dy < 52; dy += 6) pts.push([dx, dy]);
      const px = await samplePixels(p2, clip, pts);
      for (const [r, g, b] of px) maxCh = Math.max(maxCh, r, g, b);
      colorful = maxCh > 70;
    } catch (e) { maxCh = -1; }
    chk("F31 封面连续锚（full→mini 形变 40% 途中原封面矩形仍在飞：走廊 max 通道 " +
      maxCh + " > 70 = clone 在飞，非原地消失）", colorful);
    const frames2 = await samplerP2;
    await sleep(800);
    /* 峰值宽出现在采样窗内 = 形变确实发生（F31 前置有效性） */
    let maxW2 = 0;
    for (const w of frames2.w) maxW2 = Math.max(maxW2, w);
    chk("F31b 前置有效（full→mini 形变被采样到：峰值宽 " + maxW2 + " ≥ mini 终值）", maxW2 >= 260);
    await p2.screenshot({ path: `${SHOTS}/v830-b-after-roundtrip.png` }).catch(() => {});
  }

  /* ============ F5c 三态往返 + 位置零漂移（校准卡顿反证） ============ */
  {
    await sleep(600);
    let pMini = await probeCard(CY);
    const posSeq = [];
    const widths = [];
    widths.push(["mini", pMini.found ? pMini.width : -1]);
    posSeq.push([pMini.left, pMini.top]);
    /* mini → full */
    await p2.mouse.click(pMini.left + 264 - 19, pMini.top + 15);
    await sleep(900);
    let pFull = await probeCard(CY);
    widths.push(["full", pFull.found ? pFull.width : -1]);
    posSeq.push([pFull.left, pFull.top]);
    /* full → cover（顶带右端第二颗 fullCover） */
    await p2.mouse.click(pFull.left + 324 - 43, pFull.top + 18);
    await sleep(900);
    let pCover = await probeCard(CY);
    widths.push(["cover", pCover.found ? pCover.width : -1]);
    posSeq.push([pCover.left, pCover.top]);
    /* cover → mini（单击封面） */
    await p2.mouse.click(pCover.left + 28, pCover.top + 28);
    await sleep(900);
    let pMini2 = await probeCard(CY);
    widths.push(["mini2", pMini2.found ? pMini2.width : -1]);
    posSeq.push([pMini2.left, pMini2.top]);

    const wOK = widths.every(([k, w]) =>
      (k === "full" && Math.abs(w - 324) <= 6) ||
      (k === "cover" && Math.abs(w - 56) <= 8) ||
      ((k === "mini" || k === "mini2") && Math.abs(w - 264) <= 6));
    chk("F5c-1 三态往返宽度全对（" + widths.map(([k, w]) => k + "=" + w).join(" ") + "）", wOK);
    /* 位置零漂移：mini 起点与 mini2 终点 left/top 差 ≤ 3px（夹紧位一致，
       形变期 left/top 动画 + cleanup 提交 = 无「复位一下」） */
    const dL = Math.abs(posSeq[3][0] - posSeq[0][0]);
    const dT = Math.abs(posSeq[3][1] - posSeq[0][1]);
    chk("F5c-2 位置零漂移（mini→full→cover→mini 后 left Δ" + dL + " top Δ" + dT + " ≤ 3）",
      dL <= 3 && dT <= 3);
    pr = pMini2;
  }

  /* ============ F32 数据面常开（休眠退役直接证据） ============ */
  {
    /* 全部可见面撤离：NewTab 标签导航到 about:blank（杀页面轮询源）+ 置前
       （p2 隐藏，所有卡片 hidden）。此时 hublog 的 GET /api/state 只能来自
       SW——v8.2.9 在此窗口轮询全停（0 条），v8.3.0 常开（≥2 条/3.5s）。 */
    await tab.goto("about:blank").catch(() => {});
    await tab.bringToFront();
    await sleep(800); /* vis 翻转稳定窗 */
    const s0 = hublogSince(0);
    hbTitle = "第二曲";
    await sleep(3500);
    const s1 = s0 ? hublogSince(s0.maxTick) : null;
    chk("F32 全卡片隐藏期 SW 仍 1Hz 拉真值（隐藏窗内 GET /api/state 新增 " +
      (s1 ? s1.count : "取证失败") + " 条 ≥ 2；v8.2.9 休眠门=0）", !!s1 && s1.count >= 2);

    /* F32b 隐藏期切歌 → 回前台首帧已是新曲（真值在隐藏期送达渲染）。
       取证序：隐藏期改为第二曲 → bringToFront 后立刻截一帧 → 改回测试曲
       再截一帧 → 两帧像素必不同。 */
    await p2.bringToFront();
    await sleep(600);
    const pNow = await probeCard(CY);
    const clip = { x: pNow.left + 60, y: pNow.top + 40, width: 120, height: 14 };
    const sNew = await p2.screenshot({ clip }); /* 第二曲（隐藏期已送达渲染） */
    hbTitle = "测试曲";
    await sleep(1600);
    const sOld = await p2.screenshot({ clip });
    chk("F32b 隐藏期切歌不滞留（回前台首帧 vs 改回后两帧像素不同）",
      !sNew.equals(sOld));
    await sleep(1500);
  }

  await p2.screenshot({ path: `${SHOTS}/v830-c-final.png` }).catch(() => {});
}
stopHeartbeat();

chk("F9 零致命（pageerror/console error = " + errors.length + "）", errors.length === 0);

/* 汇总 */
let fail = 0;
console.log("==== v8.3.0 e2e ====");
for (const [label, ok] of results) {
  console.log((ok ? "PASS" : "FAIL") + "  " + label);
  if (!ok) fail++;
}
console.log(fail === 0 ? "== ALL GREEN ==" : "== " + fail + " FAILED ==");
process.exit(fail === 0 ? 0 : 1);
