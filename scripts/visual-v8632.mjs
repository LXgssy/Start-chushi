// v8.6.32 视觉验证：面板切换中帧截图（㉚底部高光 + ㉙预设→内建底锚拉伸）
// 复用探针环境（ROOT=/tmp/ext-v869 保证 EXT_ID 一致）
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync } from "child_process";

const ROOT = "/tmp/ext-v869";
const SHOTS = "/tmp/v8632-visual";
execSync(`mkdir -p ${SHOTS}`);
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext("/tmp/ext-v869-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--no-sandbox"],
});
let page = ctx.pages().find((p) => p.url().startsWith(EXT_URL("shell.html"))) ||
  (await ctx.newPage());
await page.goto(EXT_URL("shell.html"), { waitUntil: "load" });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 10000 }).catch(() => null);
await sleep(2600);

const af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
if (!af) throw new Error("appFrame 未建立");

// 场景 1：builtin→builtin 切换（待办→番茄钟 矮→高；番茄钟→待办 高→矮）
await af.evaluate(() => {
  const btns = document.querySelectorAll(".dock-btn");
  btns[1]?.click(); // 待办
});
await sleep(1200);
await af.evaluate(() => {
  const btns = document.querySelectorAll(".dock-btn");
  btns[3]?.click(); // 切番茄钟（grow）
});
await sleep(140);
await page.screenshot({ path: `${SHOTS}/01-grow-mid.png`, clip: { x: 480, y: 260, width: 640, height: 620 } });
await sleep(1200);
await af.evaluate(() => {
  const btns = document.querySelectorAll(".dock-btn");
  btns[1]?.click(); // 切回待办（shrink）
});
await sleep(140);
await page.screenshot({ path: `${SHOTS}/02-shrink-mid.png`, clip: { x: 480, y: 260, width: 640, height: 620 } });
await sleep(1200);

// 场景 2：预设部件→内建（㉙ 主诉路径）
const nBtns = await af.evaluate(() => {
  const dock = document.querySelector(".cl-dock");
  return dock ? dock.querySelectorAll("button").length : 0;
});
console.log("dock buttons:", nBtns);
const opened = await af.evaluate(() => {
  const btns = [...document.querySelectorAll(".cl-dock button")];
  const wBtn = btns.find((b) => (b.getAttribute("aria-label") || "").includes("面板"));
  if (wBtn) { wBtn.click(); return wBtn.getAttribute("aria-label"); }
  return null;
});
console.log("widget opened:", opened);
await sleep(1100);
await af.evaluate(() => {
  const btns = document.querySelectorAll(".dock-btn");
  btns[1]?.click(); // 预设面板→待办（部件→内建）
});
await sleep(140);
await page.screenshot({ path: `${SHOTS}/03-widget2builtin-mid.png`, clip: { x: 480, y: 260, width: 640, height: 620 } });
await sleep(1200);

// 行为数据：widget→builtin 切换窗逐帧底边采样
const reopened = await af.evaluate(() => {
  const btns = [...document.querySelectorAll(".cl-dock button")];
  const wBtn = btns.find((b) => (b.getAttribute("aria-label") || "").includes("面板"));
  if (wBtn) { wBtn.click(); return wBtn.getAttribute("aria-label"); }
  return null;
});
console.log("widget reopened:", reopened);
await sleep(1100);
const track = await af.evaluate(() => new Promise((res) => {
  requestAnimationFrame(() => {
    const btns = document.querySelectorAll(".dock-btn");
    if (btns[1]) btns[1].click();
    const t0 = performance.now();
    const rows = [];
    const poll = () => {
      const st = document.querySelector(".cl-stage");
      const card = document.querySelector(".glass-card.cl-panel");
      if (st && card) {
        const sr = st.getBoundingClientRect();
        const cr = card.getBoundingClientRect();
        rows.push({ t: Math.round(performance.now() - t0), sh: Math.round(sr.height * 10) / 10, ch: Math.round(cr.height * 10) / 10, sb: Math.round(sr.bottom * 10) / 10, gap: Math.round((sr.bottom - cr.bottom) * 100) / 100 });
      }
      if (performance.now() - t0 < 700) requestAnimationFrame(poll);
      else res(rows.slice(0, 40));
    };
    poll();
  });
}));
console.log("widget→builtin 底锚轨迹（前 24 帧）:");
for (const r of track.slice(0, 24)) console.log(`  t=${r.t}ms 壳高=${r.sh} 卡高=${r.ch} 壳底=${r.sb} gap=${r.gap}`);

await ctx.close();
console.log("[DONE] 截图 ->", SHOTS);
