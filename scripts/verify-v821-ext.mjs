// v8.2.1 扩展级 e2e（三态悬浮卡 + 完全体歌词 + 封面禁拖，真浏览器 + 真模拟器）
// 取证律：
//   ① closed shadow 外部探测——elementFromPoint 命中 retarget 到 host，扫描
//      视口得卡片实际渲染区间 → 宽度判态（cover≈48 / mini≈264 / full≈324）
//   ② 全新 profile（mkdtemp）——storage 残留位置会让一切坐标失效（首跑教训）
//   ③ 拖动断言用探测区间左缘（禁拖 = 不动；把手 = 动）
//   ④ hublog / visibility / 截图人眼终审辅助
//   F1 扩展接受 / F2 SW 在册 / F3 挂载
//   F4 歌词数据面（hublog GET /api/lyric）
//   F5 三态往返（封面↔标准↔完全体，宽度探证）
//   F6 完全体歌词渲染（截图终审）
//   F7 封面禁拖 + 主体把手可拖（探证）
//   F8 标准态点进度条 → 完全体且不触发 openPanel（visible 断言）
//   F9 零致命报错
import { chromium } from "playwright";
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

const PROJ = "/home/z/my-project";
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

/* 桥 1Hz 心跳：position 固定 6.2s（歌词第一二行区间），songId=42 */
let hubBeat = null;
function startBridgeHeartbeat() {
  hubBeat = setInterval(() => {
    const body = JSON.stringify({
      ne: {
        title: "测试曲", artist: "e2e", album: "v8.2.1", songId: 42,
        playing: true, position: 6.2, duration: 300,
        ts: Date.now(), v: "8.2.0", pic: "",
      },
      ts: Date.now(), who: "e2e", lease: "holder",
    });
    execSync(
      `curl -s -X POST http://127.0.0.1:26901/api/state -H 'Content-Type: application/json' -d '${body}' >/dev/null 2>&1`,
      { timeout: 3000 });
  }, 1000);
}

/* 测试歌词（yrc 逐字 + 翻译，songId=42，时间轴 1-45s） */
function seedLyric() {
  const rows = [];
  const han = ["夜色朦胧", "晚风轻拂", "灯火阑珊", "心事浮动", "月光如水", "星辰入梦",
               "街角转弯", "耳机分你一半", "心跳同频", "夜色温柔"];
  let t = 1;
  for (const txt of han) {
    const s = t * 1000, d = 3800;
    const step = Math.round(d / txt.length);
    const words = [...txt].map((c, i) => `(${s + step * i},${step},0)${c}`).join("");
    rows.push(`[${s},${d}]${words}`);
    t += 4;
  }
  const trRows = han.map((txt, i) => {
    const s = (1 + i * 4) * 1000;
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
const profileDir = mkdtempSync(join(tmpdir(), "ext-profile-821-"));
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launchPersistentContext(profileDir, {
  channel: "chromium",
  headless: process.env.HEADLESS === "1",
  args: [
    `--disable-extensions-except=${ROOT}`,
    `--load-extension=${ROOT}`,
    "--no-first-run",
    "--disable-gpu",
  ],
});

/* 卡片外部探测：elementFromPoint 扫描（closed shadow 命中 retarget 到 host），
   返回 {found, left, right, width, top}（扫描 y 行得水平区间；再列扫得 top） */
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

/* 动态坐标：clampPos 会随态改写 pos（full 时 x 被钆到 948）——一切按钮坐标
   从探测结果推算，绝不硬编码（首跑教训：36px 系统性偏移让坐标全废） */
function btns(pr, kind) {
  const L = pr.left, T = pr.top;
  if (kind === "mini") return {
    full: [L + 264 - 19, T + 19], coverBtn: [L + 264 - 43, T + 19],
    rail: [L + 116, T + 68], cov: [L + 34, T + 32], meta: [L + 106, T + 32],
  };
  if (kind === "full") return {
    mini: [L + 324 - 19, T + 19], coverBtn: [L + 324 - 43, T + 19],
  };
  return { center: [L + 24, T + 24] }; /* cover */
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

  /* 全新 profile → 默认 pos = (984,76)，mini 态 264 宽 → 卡中心行 y ≈ 76+40 */
  const CY = 116; /* mini/full 头部中心行；cover 态另行探测 */
  let pr = await probeCard(CY);
  chk("F3b 标准态默认（探测宽度 ≈264，实测 " + (pr.found ? pr.width : "未命中") + "）",
      pr.found && pr.width >= 240 && pr.width <= 290);

  /* F5d 标准态点放大钮（原 × 位）→ 完全体（动态坐标） */
  let B = btns(pr, "mini");
  await p2.mouse.click(B.full[0], B.full[1]);
  await sleep(450);
  pr = await probeCard(CY);
  chk("F5d 标准态放大钮 → 完全体（宽度 ≈324，实测 " + (pr.found ? pr.width : "未命中") + "）",
      pr.found && pr.width >= 300 && pr.width <= 345);
  await p2.screenshot({ path: `${SHOTS}/v821-a-full.png` }).catch(() => {});

  /* F8b 完全体下页面 visible（openPanel 未被误触发） */
  const vis1 = await p2.evaluate(() => document.visibilityState);
  chk("F8b 点放大钮未触发 openPanel（页面 visible）", vis1 === "visible");

  /* F6 完全体歌词渲染（等歌词往返 + 行构建 + rAF） */
  await sleep(1600);
  await p2.screenshot({ path: `${SHOTS}/v821-b-full-lyric.png` }).catch(() => {});

  /* F5a 完全体缩回标准：full 卡 (948,76) → fullMini 动态坐标 */
  B = btns(pr, "full");
  await p2.mouse.click(B.mini[0], B.mini[1]);
  await sleep(400);
  pr = await probeCard(CY);
  chk("F5a 完全体缩回钮 → 标准态（宽度回 ≈264，实测 " + (pr.found ? pr.width : "未命中") + "）",
      pr.found && pr.width >= 240 && pr.width <= 290);

  /* F8 标准态点进度条 → 完全体（rail 动态坐标） */
  B = btns(pr, "mini");
  await p2.mouse.click(B.rail[0], B.rail[1]);
  await sleep(450);
  pr = await probeCard(CY);
  chk("F8 标准态点进度条 → 完全体（宽度 ≈324，实测 " + (pr.found ? pr.width : "未命中") + "）",
      pr.found && pr.width >= 300 && pr.width <= 345);
  const vis2 = await p2.evaluate(() => document.visibilityState);
  chk("F8b2 进度条展开完全体且页面未被切走（visible）", vis2 === "visible");
  await p2.screenshot({ path: `${SHOTS}/v821-c-full-rail.png` }).catch(() => {});

  /* F5b 完全体 → 标准 → 封面（全程动态坐标） */
  B = btns(pr, "full");
  await p2.mouse.click(B.mini[0], B.mini[1]);
  await sleep(350);
  pr = await probeCard(CY);
  B = btns(pr, "mini");
  await p2.mouse.click(B.coverBtn[0], B.coverBtn[1]);
  await sleep(400);
  const prCov = await probeCard(100); /* cover 态 48×48 @ (984,76) → 中心行 y≈100 */
  chk("F5b 收起钮 → 封面态（宽度 ≈48，实测 " + (prCov.found ? prCov.width : "未命中") + "）",
      prCov.found && prCov.width >= 36 && prCov.width <= 62);
  await p2.screenshot({ path: `${SHOTS}/v821-d-cover.png` }).catch(() => {});

  /* F5c 封面态单击 → 标准态（cover 中心动态） */
  const BC = btns(prCov.found ? prCov : { left: 984, top: 76 }, "cover");
  await p2.mouse.click(BC.center[0], BC.center[1]);
  await sleep(400);
  pr = await probeCard(CY);
  chk("F5c 封面单击展开标准（宽度回 ≈264，实测 " + (pr.found ? pr.width : "未命中") + "）",
      pr.found && pr.width >= 240 && pr.width <= 290);

  /* F7a 封面禁拖：mini 态从封面动态坐标拖 120px → 宽度区间不动 */
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

  /* F7b 主体把手可拖：从 meta 动态坐标拖 -80px → 左缘随动 */
  await p2.mouse.move(B.meta[0], B.meta[1]);
  await p2.mouse.down();
  await p2.mouse.move(B.meta[0] - 50, B.meta[1] + 20, { steps: 6 });
  await p2.mouse.move(B.meta[0] - 80, B.meta[1] + 30, { steps: 6 });
  await p2.mouse.up();
  await sleep(350);
  const afterDrag = await probeCard(CY);
  chk("F7b 主体把手拖动生效（左缘 " + before.left + " → " + afterDrag.left + "，≈-80）",
      afterDrag.found && before.left - afterDrag.left >= 50);
  await p2.screenshot({ path: `${SHOTS}/v821-e-dragged.png` }).catch(() => {});

  /* F4 歌词数据面 hublog 取证 */
  const hublog = await tab.evaluate(async () => {
    const r = await fetch("http://127.0.0.1:26901/api/hublog");
    return (await r.json()).log.map((x) => String(x[1]));
  }).catch(() => []);
  chk("F4 SW 歌词代理在 hublog 可见（GET /api/lyric）",
      hublog.some((l) => l.includes("/api/lyric")));
  console.log(`  (hublog /api/lyric 命中 ${hublog.filter((l) => l.includes("/api/lyric")).length} 次)`);

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
console.log(pass ? "\nEXT-E2E v8.2.1 PASS" : "\nEXT-E2E v8.2.1 FAIL");
await browser.close();
process.exit(pass ? 0 : 1);
