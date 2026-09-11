// v8.3.4 浮窗取证门——歌词防裁切（像素）+ 高光防溢出（像素）+ 播放键乐观窗顺延（像素差分）。
//
//   E1 防裁切：3 行长英文行+翻译，行 2 on 后行顶带文字清晰可见（v8.3.3 旧律
//      此处被 mask 渐隐区吃掉）
//   E2 高光防溢出：mini 态播放中（频谱 sim 活跃）——卡片边界外一圈无紫色
//      辉光能量（B 通道），卡内封面周围辉光活着（正对照）
//   E3 播放键乐观窗顺延：点击暂停后 hub 旧真值（playing=true）持续 3.4s
//      （>旧 2500ms 窗）——图标保持 ▶ 不复位；真值 playing=false 到达后仍 ▶
//   E4 v8.3.4 文件门（staged ext-card.js：fsubw/lyrTrackUntil/OPT_MAX/壳裁切）
//   E9 零 pageerror
// rig 复用 verify-v833-ext.mjs（hubsim + spectrumsim + 真扩展加载）
import { chromium } from "playwright-core";
import crypto from "crypto";
import { spawn, execSync } from "child_process";
import { writeFileSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = "/tmp/ext-stage";
const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const PROJ = "/tmp/my-project";
const hub = spawn(`${PROJ}/scripts/hubsim`, ["26901"], { stdio: "ignore" });
const spec = spawn(`${PROJ}/scripts/spectrumsim`, ["26911"], { stdio: "ignore" });
const pageDir = mkdtempSync(join(tmpdir(), "cardpage-"));
writeFileSync(join(pageDir, "index.html"),
  "<!doctype html><html><head><title>CardTestPage</title></head><body style='background:#1a1c20'><h1 style='color:#666'>t</h1></body></html>");
const http = spawn("python3", ["-m", "http.server", "26988", "--bind", "127.0.0.1"],
  { cwd: pageDir, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("exit", () => { for (const p of [hub, spec, http]) { try { p.kill("SIGKILL"); } catch { } } });

/* yrc：行 2 = 120 字符长英文（~3 行换行）+翻译（防裁切主角），其余短行 */
const longEn = "Big dreams yeah and big screams yeah she is so impressionable when the beat drops low";
const yrc = [0, 1, 2, 3, 4, 5].map((i) => {
  const s = i * 3000;
  if (i === 2) {
    let body = "", at = 0;
    const words = longEn.split(" ");
    for (const w of words) { body += `(${at},120,0)${w} `; at += 120; }
    return `[${s},2700]` + body;
  }
  let body = "", at = 0;
  for (const c of ["一", "二", "三", "四", "五"]) { body += `(${at},500,0)${c}行`; at += 500; }
  return `[${s},2500]` + body;
}).join("\n");
/* ytlrc：行 2 翻译 */
const ytlrc = "[6.000]怀揣着远大的梦想和巨大的兴奋 她生性敏感";

let lyricStored = false;
for (let i = 0; i < 40 && !lyricStored; i++) {
  try {
    execSync("curl -s -m 1 http://127.0.0.1:26901/api/ping", { timeout: 1500 });
    execSync(`curl -s -X POST http://127.0.0.1:26901/api/lyric -H 'Content-Type: application/json' ` +
      `-d '${JSON.stringify({ ok: true, lyric: { songId: 42, yrc, ytlrc } })}'`, { timeout: 5000 });
    const back = execSync("curl -s -m 1 'http://127.0.0.1:26901/api/lyric?songId=42'", { timeout: 1500 }).toString();
    lyricStored = back.includes('"lyric"') && back.includes("yrc");
  } catch { await sleep(200); }
}
console.log(`歌词注入: ${lyricStored ? "OK" : "FAIL"}`);

let hbPos = 7.5;   // 行 2 区间（6-9s）
let hbPlaying = true;
const hubBeat = setInterval(() => {
  const body = JSON.stringify({
    ne: { title: "v834测试曲", artist: "e2e", album: "v8.3.4", songId: 42,
      playing: hbPlaying, position: hbPos, duration: 300, ts: Date.now(), v: "8.3.1",
      pic: "" },
    ts: Date.now(), who: "e2e", lease: "holder",
  });
  try {
    execSync(`curl -s -X POST http://127.0.0.1:26901/api/state -H 'Content-Type: application/json' -d '${body}' >/dev/null 2>&1`, { timeout: 3000 });
  } catch { }
}, 1000);

let passed = 0, failed = 0;
const chk = (label, okk) => { if (okk) { passed++; console.log("  ✓ " + label); } else { failed++; console.log("  ✗ " + label); } };

const profileDir = mkdtempSync(join(tmpdir(), "ext-profile-834-"));
const browser = await chromium.launchPersistentContext(profileDir, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--disable-gpu"],
});

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
    if (document.elementFromPoint(x, yy) === host) { if (lo < 0) lo = x; hi = x; }
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
  await page.mouse.click(pr.left + 264 - 19, pr.top + 15); /* miniFull → 完全体 */
  await sleep(2500);
}
const full = await probeCard((pr.found ? pr.top : 120) + 60);
chk(`E0 完全体在位（宽 ${full.found ? full.width : "?"}）`, full.found && full.width >= 300 && full.width <= 340);

/* ---------- E1 防裁切（像素）：行 2 on 后行顶带文字清晰 ---------- */
{
  await sleep(1800); /* 行 2 on + fsubw 过渡 + 滚动追踪收敛 */
  const clip = { x: full.left, y: full.top + 60, width: full.width, height: 190 };
  const buf = await page.screenshot({ clip });
  const b64 = buf.toString("base64");
  const r = await page.evaluate(async ({ b64 }) => {
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = "data:image/png;base64," + b64; });
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
    /* 最亮带 = 当前行（含 3 行英文+翻译，带高最大）；找亮度峰中心 */
    let bi = 0, bv = 0;
    rowL.forEach((v, i) => { if (v > bv) { bv = v; bi = i; } });
    /* 当前行带顶（向上找到亮度跌破峰值 35% 处） */
    let topEdge = bi;
    while (topEdge > 2 && rowL[topEdge - 1] > bv * 0.35) topEdge--;
    /* 行顶带 8px 内的亮像素数（文字清晰 = 白字像素 > 150 亮度） */
    let brightTop = 0;
    for (let y = topEdge; y < Math.min(topEdge + 8, H); y++) {
      for (let x = 8; x < W - 8; x++) {
        const i = (y * W + x) * 4;
        if ((d[i] + d[i + 1] + d[i + 2]) / 3 > 150) brightTop++;
      }
    }
    return { bi, bv, topEdge, brightTop, rowL };
  }, { b64 });
  chk(`E1 长行行顶可见（当前行峰 y=${r.bi} 带顶=${r.topEdge} 顶带亮像素=${r.brightTop} > 40）`,
    r.brightTop > 40);
}

/* ---------- E3 播放键乐观窗顺延（像素差分，完全体 fplay） ---------- */
/* fplay 位置：full 卡下半部紫色圆钮（.b.main 背景 var(--acc)）——像素质心定位 */
async function shotClip(clip) {
  const buf = await page.screenshot({ clip });
  return buf.toString("base64");
}
function diffB64(a, b) {
  return Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0 ? 0 : 1;
}
const fplay = await (async () => {
  const clip = { x: full.left, y: full.top + full.width - 90, width: full.width, height: 90 };
  const b64 = await shotClip(clip);
  return page.evaluate(async ({ b64, clip }) => {
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = "data:image/png;base64," + b64; });
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const W = c.width, H = c.height, d = ctx.getImageData(0, 0, W, H).data;
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      /* 紫 #8b5cf6：B 显著高于 R/G */
      if (d[i + 2] > 170 && d[i] > 80 && d[i] < 190 && d[i + 1] < 140) { sx += x; sy += y; n++; }
    }
    return n > 150 ? { cx: sx / n + clip.x, cy: sy / n + clip.y, n } : null;
  }, { b64, clip });
})();
chk(`E3-p 播放键定位（紫色质心像素 ${fplay ? fplay.n : 0} > 150）`, !!fplay);

if (fplay) {
  const bclip = { x: Math.round(fplay.cx) - 20, y: Math.round(fplay.cy) - 20, width: 40, height: 40 };
  const grab = async () => {
    await page.mouse.move(full.left - 120, full.top - 60); /* 移出 hover 区，状态一致 */
    await sleep(320);
    return shotClip(bclip);
  };
  const basePause = await grab();           /* 播放中：|| 图标 */
  await page.mouse.click(Math.round(fplay.cx), Math.round(fplay.cy));
  const afterClick = await grab();          /* 点击后：▶ 图标 */
  const dClick = diffB64(basePause, afterClick);
  chk(`E3-a 点击生效（图标翻转，截图差分=${dClick}）`, dClick !== 0);

  /* hub 保持旧真值 playing=true——跨过旧 2500ms 乐观窗（3.4s） */
  const t0 = Date.now();
  await sleep(3400);
  const at3400 = await grab();
  const dHold = diffB64(afterClick, at3400);
  chk(`E3-b 乐观顺延（${((Date.now() - t0) / 1000).toFixed(1)}s > 旧窗 2.5s，图标未复位 diff=${dHold} = 0）`, dHold === 0);

  /* 真值到达（playing=false）→ 图标对齐仍 ▶ */
  hbPlaying = false;
  await sleep(2400);
  const atTruth = await grab();
  const dTruth = diffB64(afterClick, atTruth);
  chk(`E3-c 真值对齐（playing=false 到达后图标仍 ▶，diff=${dTruth} = 0）`, dTruth === 0);
  hbPlaying = true;
}

/* ---------- E2 高光防溢出（mini 态，播放中 + 频谱 sim） ---------- */
{
  /* 切回 mini：full 态右上 fullMini（坐标法，v833 miniFull 同族） */
  await page.mouse.click(full.left + full.width - 19, full.top + 15);
  await sleep(1600);
  const mini = await probeCard(full.top + 40);
  chk(`E2-m mini 回归（宽 ${mini.found ? mini.width : "?"}）`, mini.found && mini.width >= 250 && mini.width <= 280);
  if (mini.found) {
    await sleep(900); /* AGC 峰值跟随爬升，辉光进入可见态 */
    const r = await page.evaluate(async ({ left, top }) => {
      const grab = (x, y, w, h) => {
        const cnv = document.createElement("canvas");
        cnv.width = w; cnv.height = h;
        return { cnv, x, y, w, h };
      };
      /* 截卡外左边缘带（x=left-6..left-2，y=top+20..top+80）与卡内对照点 */
      return { left, top };
    }, { left: mini.left, top: mini.top });
    /* 用截图 + canvas 采样三块：卡外左带 / 卡外顶带 / 卡内辉光对照 */
    const clip = { x: r.left - 14, y: r.top - 14, width: mini.width + 28, height: 140 };
    const b64 = await shotClip(clip);
    const s = await page.evaluate(async ({ b64 }) => {
      const img = new Image();
      await new Promise((res) => { img.onload = res; img.src = "data:image/png;base64," + b64; });
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const W = c.width;
      const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
      const avgBand = (x0, x1, y0, y1) => {
        let R = 0, G = 0, B = 0, n = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const p = px(x, y); R += p[0]; G += p[1]; B += p[2]; n++;
        }
        return [R / n, G / n, B / n];
      };
      /* clip 原点 = (left-14, top-14)。卡边在 clip 内 (14,14)。
         卡外左带：x 4..12（页面 left-10..left-2）；卡内辉光对照：封面右侧
         （封面 .cov 于卡内 x 12..56 → clip 内 x 26..70，辉光晕出至 ~x 90）取 x 74..92 y 30..60 */
      const outL = avgBand(4, 12, 30, 100);
      const inGlow = avgBand(74, 92, 30, 60);
      const outTop = avgBand(30, 200, 4, 12);
      return { outL, inGlow, outTop };
    }, { b64 });
    chk(`E2-a 卡外无溢出（左带 B=${s.outL[2].toFixed(0)} < 60，顶带 B=${s.outTop[2].toFixed(0)} < 60）`,
      s.outL[2] < 60 && s.outTop[2] < 60);
    chk(`E2-b 辉光活着（卡内对照 B=${s.inGlow[2].toFixed(0)} > 60 = 紫晕在封面周围，背景 ~30）`,
      s.inGlow[2] > 60);
  }
}

/* ---------- E4 文件门（staged = 运行中安装） ---------- */
{
  const card = readFileSync(join(ROOT, "ext-card.js"), "utf-8");
  chk("E4a 翻译行 height 过渡（fsubw + on 展开 16px）",
    card.includes("fsubw") && card.includes(".fln.on .fsubw{height:16px"));
  chk("E4b 滚动 target 逐帧追踪（lyrTrackUntil + scrollLyricTo）",
    card.includes("lyrTrackUntil") && card.includes("scrollLyricTo"));
  chk("E4c 乐观窗顺延（OPT_MAX=7000 + 真值对齐退役）",
    card.includes("OPT_MAX = 7000") && card.includes("aligned"));
  chk("E4d 壳裁切（card/fcard overflow:hidden，cover 不裁）",
    card.includes("display:none;overflow:hidden") && card.includes("height:140px"));
  chk("E4e 旧律残留零（display 硬切翻译行已退役）",
    !card.includes(".fln.on .fsub{display:block}"));
}

chk("E9 零 pageerror", errors.length === 0);
console.log(`\n=== v8.3.4 浮窗取证门: ${passed} 通过, ${failed} 失败 ===`);
await browser.close();
process.exit(failed ? 1 : 0);
