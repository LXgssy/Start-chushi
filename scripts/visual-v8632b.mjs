// v8.6.32 视觉验证②：预设部件→内建面板切换（㉙ 主诉路径）+ 高→矮底锚（㉚）
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

const PRESET = [{
  id: "probe-widget-1",
  name: "探针部件",
  installedAt: Date.now(),
  raw: {
    name: "探针部件",
    commands: [], links: [], dock: [],
    widgets: [{
      id: "w-test", name: "测试面板", surface: "dock",
      width: 320, height: 380,
      html: "<div style=\"width:100%;height:100vh;background:linear-gradient(160deg,#4f6ef7,#8b5cf6);color:#fff;font:15px sans-serif;padding:18px;box-sizing:border-box\">预设部件（探针）<br>高 380px 实底</div>",
    }],
  },
}];

const ctx = await chromium.launchPersistentContext("/tmp/ext-v869-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, "--no-first-run", "--no-sandbox"],
});
let page = ctx.pages().find((p) => p.url().startsWith(EXT_URL("shell.html"))) || (await ctx.newPage());
// 预置探针预设（先开 index 写 localStorage 再重载，useStored 挂载时读取）
await page.goto(EXT_URL("shell.html"), { waitUntil: "load" });
await sleep(2400);
const af0 = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await af0.evaluate((preset) => {
  localStorage.setItem("start:presets", JSON.stringify(preset));
}, PRESET);
await page.reload({ waitUntil: "load" });
await sleep(2600);
const af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
if (!af) throw new Error("appFrame 未建立");

const btns = await af.evaluate(() => [...document.querySelectorAll(".cl-dock button")].map((b) => b.getAttribute("aria-label")));
console.log("dock buttons:", JSON.stringify(btns));

// ---- 路径 A：部件打开 → 切内建待办（部件 380 高 → 待办 ~195 高 = shrink 底锚主诉）----
const openW = await af.evaluate(() => {
  const b = [...document.querySelectorAll(".cl-dock button")].find((x) => x.getAttribute("aria-label") === "测试面板");
  if (!b) return false;
  b.click(); return true;
});
console.log("widget open:", openW);
await sleep(1300);
await page.screenshot({ path: `${SHOTS}/10-widget-open.png`, clip: { x: 480, y: 180, width: 640, height: 700 } });

const trackA = await af.evaluate(() => new Promise((res) => {
  requestAnimationFrame(() => {
    const b = [...document.querySelectorAll(".dock-btn")].find((x) => x.getAttribute("aria-label") === "待办");
    if (b) b.click();
    const t0 = performance.now();
    const rows = [];
    const poll = () => {
      const st = document.querySelector(".cl-stage");
      const card = document.querySelector(".glass-card.cl-panel");
      if (st && card) {
        const sr = st.getBoundingClientRect();
        const cr = card.getBoundingClientRect();
        rows.push({ t: Math.round(performance.now() - t0), sh: Math.round(sr.height), ch: Math.round(cr.height), sb: Math.round(sr.bottom * 10) / 10, gap: Math.round((sr.bottom - cr.bottom) * 100) / 100 });
      }
      if (performance.now() - t0 < 700) requestAnimationFrame(poll);
      else res(rows);
    };
    poll();
  });
}));
await page.screenshot({ path: `${SHOTS}/11-a2builtin-settle.png`, clip: { x: 480, y: 180, width: 640, height: 700 } });
console.log("部件→待办 底锚轨迹:");
for (const r of trackA.filter((_, i) => i % 3 === 0).slice(0, 16)) console.log(`  t=${r.t}ms 壳高=${r.sh} 卡高=${r.ch} 壳底=${r.sb} gap=${r.gap}`);
const maxGapA = Math.max(...trackA.map((r) => r.gap));
const sbSet = new Set(trackA.map((r) => r.sb));
console.log(`  MAX gap=${maxGapA} 壳底位置数=${sbSet.size}（应=1）`);

// ---- 路径 B：内建待办 → 部件（反向，检查同帧让位）----
await sleep(400);
await af.evaluate(() => {
  const b = [...document.querySelectorAll(".cl-dock button")].find((x) => x.getAttribute("aria-label") === "测试面板");
  if (b) b.click();
});
await sleep(1300);
const stateB = await af.evaluate(() => {
  const st = document.querySelector(".cl-stage");
  const w = document.querySelector(".cl-dockwidget");
  const card = document.querySelector(".glass-card.cl-panel");
  return {
    stageH: st ? Math.round(st.getBoundingClientRect().height) : null,
    widgetVis: w ? getComputedStyle(w).visibility : null,
    widgetH: w ? Math.round(w.getBoundingClientRect().height) : null,
    cardGone: !card,
  };
});
console.log("待办→部件 落定:", JSON.stringify(stateB));

await ctx.close();
console.log("[DONE]");
