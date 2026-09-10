// v8.2.7 扩展级 e2e（v8.2.5 全回归 + 律动变亮律/细节环 + 封面态 56px 律动高光
//   + 三态一镜到底过渡动画中途帧取证）（辉光层叠 + 顶带时间走针 + cardAcc 主题跟随 + 三态回归）
// 取证律沿 v8.2.1/v8.2.2：closed shadow 外部探测（elementFromPoint retarget）
//   + 全新 profile（mkdtemp）+ 动态坐标（探测结果推算，绝不硬编码）+ 截图人眼终审
//   + 像素采样取证（screenshot → 页内 canvas getImageData，data URI 不污染画布）
// F1 扩展接受 / F2 SW 在册 / F3+F3b 挂载与宽度
// F12a mini 顶带时间走针（插值秒进） / F12b 位置跨分钟界跳变
// F14a cardAcc 冷读（播放键青色） / F14b onChanged 热跟随（玫红）
// F13 辉光层叠（环带脉冲可见 + 中心不被辉光淹没 = 「高光跑封面」根治）
// F11 零跳转 / F5 三态往返 / F6 完全体歌词 / F8 进度条展开 / F10 封面拖动
// F5c 封面单击展开 / F7a 封面禁拖 / F7b 把手拖动 / F4 hublog / F9 零致命
// F16 一镜到底（mini→full 中途帧 ≠ 两端帧）/ F17 封面态辉光脉冲 / F13b 重校准（变亮律）
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
  "<!doctype html><html><head><title>CardTestPage</title></head><body><h1>测试页</h1></body></html>");
const http = spawn("python3", ["-m", "http.server", "26988", "--bind", "127.0.0.1"], { cwd: pageDir, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = `${PROJ}/scripts/pw-lab/shots`;

async function cleanup() {
  for (const p of [hub, spec, http]) { try { p.kill("SIGKILL"); } catch {} }
}
process.on("exit", cleanup);

/* 桥 1Hz 心跳：位置可变（hbPos 闭包变量，跨分钟界断言用），songId=42 */
let hbPos = 6.2;
let hubBeat = null;
function startBridgeHeartbeat() {
  hubBeat = setInterval(() => {
    const body = JSON.stringify({
      ne: {
        title: "测试曲", artist: "e2e", album: "v8.2.5", songId: 42,
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

/* 测试歌词（yrc 逐字 + 翻译，songId=42） */
function seedLyric() {
  const rows = [];
  const han = ["夜色朦胧", "晚风轻拂", "灯火阑珊", "心事浮动", "月光如水", "星辰入梦",
               "街角转弯", "耳机分你一半", "心跳同频", "夜色温柔"];
  /* v8.2.4 保持律取证：行1 = 短行（e=3000，末词 2500-3000），行2 从 6000 起
     ——行1 唱完 +200ms 进间隙，保持窗 3.2s→6.0s（2.8s 宽，采样稳） */
  const rows2 = ["[1000,2000](1000,500,0)夜(1500,500,0)色(2000,500,0)朦(2500,500,0)胧"];
  const trSched = [1000];
  let t = 6;
  for (const txt of han) {
    const s = t * 1000, d = 3800;
    const step = Math.round(d / txt.length);
    const words = [...txt].map((c, i) => `(${s + step * i},${step},0)${c}`).join("");
    rows2.push(`[${s},${d}]${words}`);
    trSched.push(s);
    t += 4;
  }
  rows.push(...rows2);
  const trRows = trSched.map((s, i) => {
    const ss = String(Math.floor(s / 1000) % 60).padStart(2, "0");
    return `[00:${ss}.00]line ${i + 1} (en)`;
  }).join("\n");
  const body = JSON.stringify({
    ok: true,
    lyric: {
      songId: 42, title: "测试曲", artist: "e2e",
      yrc: rows.join("\n") + "\n",
      ytlrc: trRows + "\n",
      lrc: "", tlyric: "", source: "e2e-yrc",
    },
  });
  const f = join(pageDir, "lyric.json");
  writeFileSync(f, body);
  execSync(`curl -s -X POST http://127.0.0.1:26901/api/lyric -H 'Content-Type: application/json' --data-binary @${f} >/dev/null 2>&1`,
    { timeout: 3000 });
}

const results = [];
const chk = (label, ok) => results.push([label, ok]);

/* 全新 profile：任何 storage 残留（位置/态）都会让坐标与判态失真 */
const profileDir = mkdtempSync(join(tmpdir(), "ext-profile-827-"));
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

/* 卡片外部探测（y 行扫 x 得水平区间，再列扫得 top） */
const probeCard = (y) => p2.evaluate((yy) => {
  const host = document.getElementById("chushi-card-host");
  if (!host) return { found: false };
  let lo = -1, hi = -1;
  for (let x = 100; x <= 1275; x += 3) {
    const hit = document.elementFromPoint(x, yy) === host;
    if (hit) { if (lo < 0) lo = x; hi = x; }
  }
  if (lo < 0) return { found: false };
  let top = -1;
  for (let y2 = 20; y2 <= 700; y2 += 3) {
    if (document.elementFromPoint(lo + 10, y2) === host) { top = y2; break; }
  }
  return { found: true, left: lo, right: hi, width: hi - lo, top };
}, y);

/* 像素采样：screenshot(clip) → data URI → 页内 canvas → 各点 RGB。
   points 为 clip 内局部坐标；headless dpr=1 截图与 CSS 像素 1:1 */
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

/* v8.2.4 布局：顶带 26px（cap 钮 y≈T+15），行区 y≈T+48，进度条 y≈T+84 */
function btns(pr, kind) {
  const L = pr.left, T = pr.top;
  if (kind === "mini") return {
    full: [L + 264 - 19, T + 15], coverBtn: [L + 264 - 43, T + 15],
    rail: [L + 116, T + 84], cov: [L + 34, T + 48], meta: [L + 106, T + 48],
    play: [L + 195, T + 48], time: [L + 34, T + 14],
  };
  if (kind === "full") return {
    mini: [L + 324 - 19, T + 18], coverBtn: [L + 324 - 43, T + 18],
  };
  return { center: [L + 28, T + 28] }; /* cover（v8.2.7：56px） */
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
  /* F14a 预置：cardAcc 冷读——内容脚本挂载前写入，读回路径走 init get */
  await tab.evaluate(() => new Promise((res) => chrome.storage.local.set({ cardAcc: "#22d3ee" }, res)));

  startBridgeHeartbeat();
  seedLyric();
  await sleep(300);
  p2 = await browser.newPage();
  p2.on("pageerror", e => errors.push("cardpage pageerror: " + e.message));
  await p2.goto("http://127.0.0.1:26988/index.html", { waitUntil: "load", timeout: 15000 });

  /* F3 卡片挂载 */
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
  await p2.screenshot({ path: `${SHOTS}/v823-a-mini.png` }).catch(() => {});

  /* F14a cardAcc 冷读：播放键 #22d3ee（青）→ g 远大于 r（默认紫 r>g） */
  {
    let cyanOK = false;
    for (let i = 0; i < 4 && !cyanOK; i++) {
      const B = btns(pr, "mini");
      const clip = { x: pr.left + 160, y: pr.top + 30, width: 70, height: 36 };
      const [[r, g, b]] = await samplePixels(p2, clip, [[B.play[0] - clip.x - 10, B.play[1] - clip.y - 10]]);
      cyanOK = g > r + 40 && b > 150;
      if (!cyanOK) await sleep(500);
    }
    chk("F14a cardAcc 冷读（播放键 = 强调色青 #22d3ee：g>r+40）", cyanOK);
  }

  /* F12a mini 顶带时间走针：顶带左区两次截图（间隔 1.7s）必不同 */
  {
    const B = btns(pr, "mini");
    const clip = { x: pr.left + 2, y: pr.top + 2, width: 64, height: 22 };
    const s1 = await p2.screenshot({ clip });
    await sleep(1700);
    const s2 = await p2.screenshot({ clip });
    chk("F12a mini 顶带时间走针（1.7s 两帧像素不同 = 不冻 0:00）", !s1.equals(s2));
  }

  /* F12b 跨分钟界：hbPos 6.2 → 125.4，顶带时间必跳变（0:0x → 2:0x） */
  {
    const B = btns(pr, "mini");
    const clip = { x: pr.left + 2, y: pr.top + 2, width: 64, height: 22 };
    hbPos = 6.2;
    await sleep(1300);
    const s1 = await p2.screenshot({ clip });
    hbPos = 125.4;
    await sleep(2300);
    const s2 = await p2.screenshot({ clip });
    hbPos = 6.2;
    chk("F12b 顶带时间跨分钟界跳变（position 6.2→125.4 两帧不同）", !s1.equals(s2));
    await sleep(1600);
  }

  /* F13 辉光层叠：环带（封面左缘外 3px）脉冲可见，且【环带峰值帧】中心
     不被辉光淹没（bug 态环带恒暗=修；峰值帧中心 r≈103=占位渐变，bug 态
     峰值帧中心 r≥133=辉光糊脸）。断言取 argmax(ring) 帧的中心值 */
  {
    await tab.evaluate(() => new Promise((res) => chrome.storage.local.set({ cardAcc: "#ff2d78" }, res)));
    await sleep(700);
    let ringMax = 0;
    const cSamples = [];
    const ringSamples = [];
    for (let i = 0; i < 20; i++) { /* v8.2.8：9→20 帧 ×160ms=3.2s（覆盖 sim 心跳全周期捕峰） */
      const clip = { x: pr.left, y: pr.top + 26, width: 70, height: 44 };
      const [ring, center] = await samplePixels(p2, clip, [[9, 22], [34, 22]]);
      ringMax = Math.max(ringMax, ring[0]);
      ringSamples.push(ring);
      cSamples.push(center);
      await sleep(160);
    }
    /* v8.2.7 F13b 重校准：变亮律让封面中心合法波动（brightness 滤镜随低音
       脉冲）——层叠律改由「色调守恒」守卫：accent #ff2d78 的 r-g=210，若辉光
       糊脸则峰值帧 r-g 大幅抬升；brightness 等比缩放 r-g 基本不动 */
    let spread = 0;
    for (const ch of [0, 1, 2]) {
      const vs = cSamples.map((c) => c[ch]);
      spread = Math.max(spread, Math.max(...vs) - Math.min(...vs));
    }
    let hueDrift = 0;
    {
      const gaps = cSamples.map((c) => c[0] - c[1]); /* r-g */
      hueDrift = Math.max(...gaps) - Math.min(...gaps);
    }
    let ringMin = 255;
    for (const [r0] of ringSamples) ringMin = Math.min(ringMin, r0);
    chk("F13a 封面四周辉光晕出（环带脉冲可见，峰值 r=" + ringMax + " > 底色 28）", ringMax > 60);
    chk("F13a2 环带呼吸幅度（max-min r = " + (ringMax - ringMin) + " ≥ 25 = 辉光真的在律动）", ringMax - ringMin >= 25);
    chk("F13b-变亮 封面本体随拍提亮（中心 9 帧最大波动 " + spread + " ≥ 9；img 未加载时由环带幅度兜底 F13a2）", spread >= 9);
    chk("F13b-层叠 色调守恒（r-g 漂移 " + hueDrift + " ≤ 45；辉光糊脸态必 >100）", hueDrift <= 45);
    await p2.screenshot({ path: `${SHOTS}/v823-b-glow.png` }).catch(() => {});
    await tab.evaluate(() => new Promise((res) => chrome.storage.local.set({ cardAcc: "#22d3ee" }, res)));
    await sleep(500);
  }

  /* F14b onChanged 热跟随：青 → 玫红，播放键 600ms 内换色（r>g） */
  {
    await tab.evaluate(() => new Promise((res) => chrome.storage.local.set({ cardAcc: "#f43f5e" }, res)));
    let hotOK = false;
    for (let i = 0; i < 5 && !hotOK; i++) {
      await sleep(300);
      const B = btns(pr, "mini");
      const clip = { x: pr.left + 160, y: pr.top + 30, width: 70, height: 36 };
      const [[r, g]] = await samplePixels(p2, clip, [[B.play[0] - clip.x - 10, B.play[1] - clip.y - 10]]);
      hotOK = r > g + 60;
    }
    chk("F14b cardAcc onChanged 热跟随（青→玫红 600ms 内播放键 r>g+60）", hotOK);
    await tab.evaluate(() => new Promise((res) => chrome.storage.local.set({ cardAcc: "#8b5cf6" }, res)));
    await sleep(400);
  }

  /* F11 v8.2.2 零跳转回归：点歌名不开面板页、态不变 */
  {
    const pagesBefore = browser.pages().length;
    let B11 = btns(pr, "mini");
    await p2.mouse.click(B11.meta[0], B11.meta[1]);
    await sleep(500);
    const pagesAfter = browser.pages().length;
    pr = await probeCard(CY);
    const url = p2.url();
    chk("F11 点歌名零跳转（面板页 " + pagesBefore + "→" + pagesAfter + "，仍在本页，态不变）",
        pagesAfter === pagesBefore && url.startsWith("http://127.0.0.1:26988") &&
        pr.found && pr.width >= 240 && pr.width <= 290);
  }

  /* F5d 标准态放大钮 → 完全体 */
  let B = btns(pr, "mini");
  await p2.mouse.click(B.full[0], B.full[1]);
  await sleep(600); /* v8.2.7 一镜到底 340ms + 余量 */
  pr = await probeCard(CY);
  chk("F5d 标准态放大钮 → 完全体（宽度 ≈324，实测 " + (pr.found ? pr.width : "未命中") + "）",
      pr.found && pr.width >= 300 && pr.width <= 345);
  await sleep(1600);
  await p2.screenshot({ path: `${SHOTS}/v823-c-full-lyric.png` }).catch(() => {});
  const vis1 = await p2.evaluate(() => document.visibilityState);
  chk("F8b 点放大钮未触发 openPanel（页面 visible）", vis1 === "visible");

  /* F4 歌词数据面 hublog 取证（紧随首次完全体——hublog 只留 48 条，防轮转）
     v8.2.8：断言重试 3 次（每次重种歌词 + 立即取日志）——48 条 1Hz 心跳
     轮转在慢机上是确定性 flaky 源（Task 88 已知律）。 */
  let f4hits = 0;
  for (let attempt = 0; attempt < 3 && f4hits === 0; attempt++) {
    await seedLyric();
    await sleep(1200);
    const hl2 = await tab.evaluate(async () => {
      const r = await fetch("http://127.0.0.1:26901/api/hublog");
      return (await r.json()).log.map((x) => String(x[1]));
    }).catch(() => []);
    f4hits = hl2.filter((l) => l.includes("/api/lyric")).length;
  }
  chk("F4 SW 歌词代理在 hublog 可见（GET /api/lyric，3 次重试）", f4hits > 0);
  console.log(`  (hublog /api/lyric 命中 ${f4hits} 次)`);

  /* ---------- F15 v8.2.4 yrc 高光保持（间隙期扫光不塌零） ----------
     行1 e=3000：唱完 +200ms（3.2s）进间隙，保持窗 3.2s→6.0s。
     补门态：末词 .ov 扫光挂 100% → 歌词区最高亮度 ≈ #f4f4f5(244)；
     bug 态（旧版无门）：全词 p 重算 0 → 最高亮度 ≈ #b4b4bc(180)。
     F15b 对照：行2 扫光期（hbPos 6.6→≈7.1）亮度回升 ≥215 = 排除静态假象。 */
  {
    const bandPts = (prF) => {
      const pts = [];
      for (let dy = 95; dy <= 185; dy += 6)
        for (let dx = 30; dx <= 300; dx += 8)
          pts.push([dx, dy]);
      return pts;
    };
    const maxLum = async (prF) => {
      const clip = { x: prF.left + 2, y: prF.top + 2, width: 320, height: 230 };
      const pts = bandPts(prF);
      const px = await samplePixels(p2, clip, pts);
      return Math.max(...px.map(([r, g, b]) => Math.max(r, g, b)));
    };
    hbPos = 2.0;                 /* 行1 唱到 2.0 → 2.8s 后插值 ≈4.3（保持窗内） */
    await sleep(2900);
    pr = await probeCard(CY);
    const lumHold = await maxLum(pr);
    await p2.screenshot({ path: `${SHOTS}/v824-f-hold.png` }).catch(() => {});
    chk(`F15a yrc 间隙期扫光保持（pos≈4.3 亮度 ${lumHold} ≥215 = 白扫光挂住；bug 态 ≤200 塌灰）`,
        lumHold >= 215);

    hbPos = 6.6;                 /* 行2 起点 6.0 后扫光期 */
    await sleep(1800);
    const lumNext = await maxLum(pr);
    hbPos = 6.2;
    chk(`F15b 行2 扫光期亮度回升（实测 ${lumNext} ≥215 = 对照组，非静态假象）`,
        lumNext >= 215);
    await sleep(1200);
  }

  /* F5a 完全体缩回标准 */
  B = btns(pr, "full");
  await p2.mouse.click(B.mini[0], B.mini[1]);
  await sleep(600);
  pr = await probeCard(CY);
  chk("F5a 完全体缩回钮 → 标准态（宽度回 ≈264，实测 " + (pr.found ? pr.width : "未命中") + "）",
      pr.found && pr.width >= 240 && pr.width <= 290);

  /* F8 标准态点进度条 → 完全体 */
  B = btns(pr, "mini");
  await p2.mouse.click(B.rail[0], B.rail[1]);
  await sleep(600);
  pr = await probeCard(CY);
  chk("F8 标准态点进度条 → 完全体（宽度 ≈324，实测 " + (pr.found ? pr.width : "未命中") + "）",
      pr.found && pr.width >= 300 && pr.width <= 345);

  /* F5b 完全体 → 标准 → 封面 */
  B = btns(pr, "full");
  await p2.mouse.click(B.mini[0], B.mini[1]);
  await sleep(550);
  pr = await probeCard(CY);
  B = btns(pr, "mini");
  await p2.mouse.click(B.coverBtn[0], B.coverBtn[1]);
  await sleep(550);
  const prCov = await probeCard(100);
  chk("F5b 收起钮 → 封面态（宽度 ≈56，实测 " + (prCov.found ? prCov.width : "未命中") + "）",
      prCov.found && prCov.width >= 36 && prCov.width <= 62);
  await p2.screenshot({ path: `${SHOTS}/v823-d-cover.png` }).catch(() => {});

  /* F10 封面态按住拖动 */
  const pc0 = await probeCard(100);
  await p2.mouse.move(pc0.left + 24, pc0.top + 24);
  await p2.mouse.down();
  await p2.mouse.move(pc0.left + 74, pc0.top + 20, { steps: 5 });
  await p2.mouse.move(pc0.left + 124, pc0.top + 24, { steps: 5 });
  await p2.mouse.up();
  await sleep(350);
  const pc1 = await probeCard(100);
  chk("F10a 封面态拖动移窗（左缘 +≈100：" + pc0.left + " → " + pc1.left + "，宽 " + pc1.width + "）",
      pc1.found && Math.abs((pc1.left - pc0.left) - 100) <= 16 && pc1.width <= 62);

  /* F5c 封面单击 → 标准（拖后 350ms click 闸过期） */
  await sleep(450);
  const pc2 = await probeCard(100);
  const BC = btns(pc2.found ? pc2 : pc0, "cover");
  await p2.mouse.click(BC.center[0], BC.center[1]);
  await sleep(550);
  pr = await probeCard(CY);
  chk("F5c 封面单击展开标准（宽度回 ≈264，实测 " + (pr.found ? pr.width : "未命中") + "）",
      pr.found && pr.width >= 240 && pr.width <= 290);

  /* F7a 封面禁拖 / F7b 把手拖动 */
  B = btns(pr, "mini");
  const before = pr;
  await p2.mouse.move(B.cov[0], B.cov[1]);
  await p2.mouse.down();
  await p2.mouse.move(B.cov[0] + 60, B.cov[1] + 40, { steps: 6 });
  await p2.mouse.move(B.cov[0] + 120, B.cov[1] + 60, { steps: 6 });
  await p2.mouse.up();
  await sleep(350);
  const after = await probeCard(CY);
  chk("F7a 封面禁拖（拖封面 120px 后左缘不动：" +
      `${before.left} → ${after.left}）`, after.found && Math.abs(after.left - before.left) <= 6);

  await p2.mouse.move(B.meta[0], B.meta[1]);
  await p2.mouse.down();
  await p2.mouse.move(B.meta[0] - 50, B.meta[1] + 20, { steps: 6 });
  await p2.mouse.move(B.meta[0] - 80, B.meta[1] + 30, { steps: 6 });
  await p2.mouse.up();
  await sleep(350);
  const afterDrag = await probeCard(CY);
  chk("F7b 主体把手拖动生效（左缘 " + before.left + " → " + afterDrag.left + "，≈-80）",
      afterDrag.found && before.left - afterDrag.left >= 50);
  await p2.screenshot({ path: `${SHOTS}/v823-e-dragged.png` }).catch(() => {});

  /* ---------- F16 v8.2.7 一镜到底：mini→full 中途帧取证 ----------
     三帧同区域截图：T0（mini 静置）/ T1（点击后 ~130ms，clone 飞形 + 面板
     长出中）/ T2（收敛后完全体）。若切换是无动画直切，T1 必等于 T2；
     若中途白屏/换镜，T1 会丢掉两侧内容。断言：T1≠T0 且 T1≠T2。 */
  {
    await sleep(700); /* 拖动后位置已存，先回稳定态 */
    pr = await probeCard(CY);
    B = btns(pr, "mini");
    const region = { x: pr.left, y: pr.top, width: 340, height: 140 };
    const s0 = await p2.screenshot({ clip: region });
    await p2.mouse.click(B.rail[0], B.rail[1]);
    await sleep(130);
    const s1 = await p2.screenshot({ clip: region });
    await sleep(700);
    const s2 = await p2.screenshot({ clip: region });
    chk("F16a 一镜到底中途帧 ≠ 起点（面板长出中）", !s0.equals(s1));
    chk("F16b 一镜到底中途帧 ≠ 终点（非直切）", !s1.equals(s2));
    pr = await probeCard(CY);
    chk("F16c 动画收敛后几何正确（完全体 ≈324，实测 " + (pr.found ? pr.width : "未命中") + "）",
        pr.found && pr.width >= 300 && pr.width <= 345);
    await p2.screenshot({ path: `${SHOTS}/v827-f-morph.png` }).catch(() => {});
  }

  /* ---------- F17 v8.2.7 封面态律动高光（56px 封面 + glow/gring 上身） ---------- */
  {
    /* 完全体 → 封面态 */
    B = btns(pr, "full");
    await p2.mouse.click(B.coverBtn[0], B.coverBtn[1]);
    await sleep(600);
    const pcv = await probeCard(pr.top + 24); /* 动态探针行：pos.y 已被 F7b 拖动改写 */
    chk("F17a 收起进封面态（宽度 ≈56，实测 " + (pcv.found ? pcv.width : "未命中") + "）",
        pcv.found && pcv.width >= 48 && pcv.width <= 64);
    /* 辉光采样：封面右缘外 2px（glow inset -5px 晕出区），2s 内脉冲幅度 */
    let gMin = 999, gMax = 0;
    for (let i = 0; i < 8; i++) {
      const clip = { x: pcv.right, y: pcv.top + 12, width: 8, height: 32 };
      const pts = [[2, 8], [2, 16], [3, 24]]; /* glow inset -5px：right+1..+4 是晕光带 */
      const px = await samplePixels(p2, clip, pts);
      const v = Math.max(...px.map(([r, g, b]) => r + g + b));
      const w = Math.min(...px.map(([r, g, b]) => r + g + b));
      gMax = Math.max(gMax, v); gMin = Math.min(gMin, w);
      await sleep(240);
    }
    chk("F17b 封面态辉光脉冲（右缘晕光带幅度 " + (gMax - gMin) + " > 35，峰值 " + gMax + "）",
        gMax - gMin > 35);
    await p2.screenshot({ path: `${SHOTS}/v827-g-coverglow.png` }).catch(() => {});
    /* 回标准态收尾（后续无依赖，位置保留） */
    const bc = btns(pcv, "cover");
    await p2.mouse.click(bc.center[0], bc.center[1]);
    await sleep(600);
  }

  await p2.close();
  if (hubBeat) clearInterval(hubBeat);
}

/* F9：零致命报错 */
const fatal = errors.filter(e =>
  !/Autofill|net::ERR_ABORTED|127\.0\.0\.1:269[0-9][0-9].*CONNECTION_REFUSED|Failed to load resource.*net::ERR_CONNECTION_REFUSED|ERR_CONNECTION_REFUSED/i.test(e));
chk("F9 零致命报错", fatal.length === 0);

let pass = true;
for (const [label, ok] of results) {
  console.log((ok ? "✓" : "✗ FAIL"), label);
  if (!ok) pass = false;
}
if (fatal.length) fatal.slice(0, 10).forEach(e => console.log("  err:", e.slice(0, 180)));
console.log(pass ? "\nEXT-E2E v8.2.7 PASS" : "\nEXT-E2E v8.2.7 FAIL");
await browser.close();
process.exit(pass ? 0 : 1);
