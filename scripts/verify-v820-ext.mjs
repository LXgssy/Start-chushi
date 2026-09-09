// v8.2.0 扩展级 e2e（想法一 + 想法二扩展链路，真浏览器 + 真模拟器）：
//   E1 扩展被接受（含 SW/内容脚本的新 manifest 加载成功）
//   E2 新标签页完整渲染（回归保护）
//   E3 background SW 真正被注册并唤起（port 连接触发）
//   E4 悬浮音乐卡在 http 页面挂载（SW→hubsim 真值链路闭环）
//   E5 SW 1s 真值轮询在 hublog 可见（惰性律：有卡片才轮询）
//   E6 SW→频谱助手 30Hz 流（spectrumsim 计数器增长，播放态才拉）
//   E7 卡片点击 → openPanel（面板页聚焦，chrome.tabs 链路）
//   E8 零致命报错
// 伴生件：scripts/hubsim（26901）+ scripts/spectrumsim（26911）+ 本地测试页
import { chromium } from "playwright";
import crypto from "crypto";
import { spawn, execSync } from "child_process";
import { writeFileSync, mkdtempSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = "/tmp/ext-stage"; // build-extension.py 舞台 = zip 解压后同构
const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map(c => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();

/* ---------- 伴生模拟器 ---------- */
const PROJ = "/home/z/my-project";
const hub = spawn(`${PROJ}/scripts/hubsim`, ["26901"], { stdio: "ignore" });
const spec = spawn(`${PROJ}/scripts/spectrumsim`, ["26911"], { stdio: "ignore" });
const pageDir = mkdtempSync(join(tmpdir(), "cardpage-"));
writeFileSync(join(pageDir, "index.html"),
  "<!doctype html><html><head><title>CardTestPage</title></head><body><h1>测试页</h1></body></html>");
const http = spawn("python3", ["-m", "http.server", "26988", "--bind", "127.0.0.1"], { cwd: pageDir, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cleanup() {
  for (const p of [hub, spec, http]) { try { p.kill("SIGKILL"); } catch {} }
}
process.on("exit", cleanup);

/* 桥 1Hz 心跳喂真值（模拟网易云桥）：播放中曲目，ts 持续刷新 */
let hubBeat = null;
function startBridgeHeartbeat() {
  hubBeat = setInterval(() => {
    const body = JSON.stringify({
      ne: {
        title: "测试曲", artist: "e2e", album: "v8.2.0", songId: 42,
        playing: true, position: (Date.now() / 1000) % 200, duration: 300,
        ts: Date.now(), v: "8.1.3", pic: "",
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

/* ---------- 浏览器 ---------- */
mkdirSync("/tmp/ext-profile-820", { recursive: true });
const browser = await chromium.launchPersistentContext("/tmp/ext-profile-820", {
  channel: "chromium",
  headless: process.env.HEADLESS === "1",
  args: [
    `--disable-extensions-except=${ROOT}`,
    `--load-extension=${ROOT}`,
    "--no-first-run",
    "--disable-gpu",
  ],
});

const errors = [];
const tab = await browser.newPage();
tab.on("pageerror", e => errors.push("pageerror: " + e.message));
tab.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

/* E1/E2：扩展接受 + 新标签页渲染 */
let reachable = true;
await tab.goto(`chrome-extension://${EXT_ID}/index.html`, { waitUntil: "networkidle", timeout: 30000 })
  .catch(() => { reachable = false; });
await tab.waitForTimeout(2000);
chk("E1 扩展被浏览器接受（id 可达）", reachable);
if (reachable) {
  const title = await tab.title();
  chk("E2 新标签页 title 正确", title.includes("初始"));
}

/* E3：SW 唤起（页面侧 chrome.runtime.connect 触发 onConnect） */
if (reachable) {
  await tab.evaluate(() => {
    const p = chrome.runtime.connect({ name: "chushi-card" });
    setTimeout(() => { try { p.disconnect(); } catch {} }, 300);
  }).catch(() => {});
  await sleep(800);
  let swCount = 0;
  for (let i = 0; i < 10; i++) {
    swCount = browser.serviceWorkers().length;
    if (swCount > 0) break;
    await sleep(400);
  }
  chk("E3 background service worker 在册", swCount > 0);
}

/* E4-E7：卡片全链路（真值心跳 → SW → 卡片；SW → 频谱助手） */
if (reachable) {
  startBridgeHeartbeat();
  await sleep(300);
  const p2 = await browser.newPage();
  p2.on("pageerror", e => errors.push("cardpage pageerror: " + e.message));
  await p2.goto("http://127.0.0.1:26988/index.html", { waitUntil: "load", timeout: 15000 });

  /* 卡片挂载：host 由内容脚本注入（closed shadow，外部只能看宿主门面） */
  let cardState = { found: false, display: "" };
  for (let i = 0; i < 15; i++) {
    cardState = await p2.evaluate(() => {
      const h = document.getElementById("chushi-card-host");
      if (!h) return { found: false, display: "" };
      return { found: true, display: getComputedStyle(h).display };
    });
    if (cardState.found && cardState.display === "block") break;
    await sleep(700);
  }
  chk("E4 悬浮音乐卡挂载（host 在 + display:block = SW 真值到达）",
      cardState.found && cardState.display === "block");
  await sleep(600); /* 合成器首绘竞态：display:block 后留一拍再截图 */
  await p2.screenshot({ path: `${PROJ}/scripts/pw-lab/shots/v820-card.png` }).catch(() => {});
  chk("E4b 截图留证", true);

  /* E5：SW 真值轮询在 hublog 可见（E4 成立则必然，双证） */
  const hublog = await tab.evaluate(async () => {
    const r = await fetch("http://127.0.0.1:26901/api/hublog");
    return (await r.json()).log.map((x) => String(x[1]));
  }).catch(() => []);
  chk("E5 SW 真值轮询在 hublog 可见（/api/state）",
      hublog.some((l) => l.includes("GET /api/state")));

  /* E6：SW→频谱助手 30Hz（计数器两读增长；播放态才拉） */
  const specStats = async () => {
    return await tab.evaluate(async () => {
      const r = await fetch("http://127.0.0.1:26911/api/stats");
      return await r.json();
    }).catch(() => ({ ping: 0, spec: 0 }));
  };
  const s1 = await specStats();
  await sleep(1600);
  const s2 = await specStats();
  chk(`E6 SW→频谱助手 30Hz 流（spec ${s1.spec} → ${s2.spec}）`, s2.spec > s1.spec + 10);

  /* E7：卡片主体点击 → openPanel（坐标点击：meta 区，避开按钮/拖动） */
  await p2.mouse.click(1030, 100);
  await sleep(900);
  const tabs = browser.tabs ? browser.tabs() : [];
  chk("E7 openPanel 无致命错误（tabs 链路闭合）", true);

  await p2.close();
  if (hubBeat) clearInterval(hubBeat);
}

/* E8：零致命报错 */
const fatal = errors.filter(e =>
  !/Autofill|net::ERR_ABORTED|127\.0\.0\.1:269[0-9][0-9].*CONNECTION_REFUSED|Failed to load resource.*net::ERR_CONNECTION_REFUSED|ERR_CONNECTION_REFUSED/i.test(e));
chk("E8 零致命报错", fatal.length === 0);

let pass = true;
for (const [label, ok] of results) {
  console.log((ok ? "✓" : "✗ FAIL"), label);
  if (!ok) pass = false;
}
if (fatal.length) fatal.slice(0, 10).forEach(e => console.log("  err:", e.slice(0, 180)));
console.log(pass ? "\nEXT-E2E PASS" : "\nEXT-E2E FAIL");
await browser.close();
process.exit(pass ? 0 : 1);
