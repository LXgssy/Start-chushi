// v8.7.13 侦查实测：音乐面板 vs 内建面板开合动画差异 + 选框动画复现
// 用户报告：①音乐预设面板打开/关闭动画与其它面板不同步 ②dock 点音乐选框无关闭/选中动画
// M1 开设置 / M2 关设置 / M3 开音乐 / M4 关音乐 —— rAF 动画窗采样
import { chromium } from "playwright-core";
import crypto from "crypto";
import { readFileSync } from "fs";

const ROOT = "/tmp/ext-beta";
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext("/tmp/v8711-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--no-sandbox"],
});
const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 });
let af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await sleep(4000);

/* 注入官方音乐预设（InstalledPreset 形态）→ reload 承接 */
const official = JSON.parse(readFileSync("/tmp/beta-wt/src/lib/startpage/official-presets.json", "utf8"));
const musicManifest = official.presets[1].manifest;
await af.evaluate((raw) => {
  localStorage.setItem("start:presets", JSON.stringify([
    { id: "official-smtc-dbg", name: raw.name, installedAt: Date.now(), raw },
  ]));
}, JSON.parse(JSON.stringify({ ...musicManifest, commands: [], links: [], dock: [] })));
await page.reload({ waitUntil: "load" });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 });
af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await sleep(4000);
console.log("[frames]", page.frames().map((f) => f.url()).join(" | "), "=> af:", af.url());

/* dock 按钮与选框定位器（af 帧内） */
const LOC = `
  const btnBy = (label) => [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === label);
  const pill = () => document.querySelector('nav[aria-label="快捷操作"] > span.pointer-events-none');
  const glass = () => document.querySelector(".glass-card.cl-panel");
  const content = () => document.querySelector(".cl-panel-content");
  const stage = () => document.querySelector(".cl-stage > div"); /* 高度盒 */
  const widgetView = () => [...document.querySelectorAll('[data-widget$=":music"]')].find((el) => el.classList.contains("cl-dockwidget"));
  const mask = () => document.querySelector(".fixed.inset-0.z-30");
`;

/* 采样器：t0 后 rAF 连续采 ms 窗口，采样对象由 kind 决定 */
const SAMPLER = `
  (function() {
  ${LOC}
  return new Promise((resolve) => {
    const t0 = performance.now();
    const rows = [];
    const tick = () => {
      const t = Math.round(performance.now() - t0);
      const p = pill();
      const row = { t, dbg: { nav: !!document.querySelector('nav[aria-label="快捷操作"]'), stage: !!document.querySelector('.cl-stage'), dockBtns: document.querySelectorAll('.dock-btn').length } };
      if (p) {
        const cs = getComputedStyle(p);
        row.pill = { op: cs.opacity, tf: cs.transform.slice(0, 60) };
      } else row.pill = null;
      const g = glass();
      if (g) {
        const cs = getComputedStyle(g);
        row.glass = { bg: cs.backgroundColor, anim: cs.animationName.slice(0, 30) };
      }
      const c = content();
      if (c) {
        const cs = getComputedStyle(c);
        row.content = { op: (+cs.opacity).toFixed(2), filt: cs.filter.slice(0, 24), anim: cs.animationName.slice(0, 30) };
      }
      const wv = widgetView();
      if (wv) {
        const cs = getComputedStyle(wv);
        const fr = wv.querySelector("iframe");
        row.widget = {
          op: (+cs.opacity).toFixed(2), bg: cs.backgroundColor, anim: cs.animationName.slice(0, 30),
          frAnim: fr ? getComputedStyle(fr).animationName.slice(0, 30) : "NO-FR",
          frFilt: fr ? getComputedStyle(fr).filter.slice(0, 24) : "",
        };
      }
      const st = stage();
      if (st) row.h = Math.round(st.getBoundingClientRect().height);
      rows.push(row);
      if (performance.now() - t0 < WIN) requestAnimationFrame(tick);
      else resolve(rows);
    };
    const WIN = 900;
    requestAnimationFrame(tick);
  });
  })()
`;

/* 压缩输出：每 4 帧取 1 + 首末帧必留 */
const compact = (rows) => {
  const out = rows.filter((r, i) => i % 4 === 0 || i === rows.length - 1);
  return out.map((r) => JSON.stringify(r)).join("\n");
};

/* ---------- M1：开设置（内建基线） ---------- */
console.log("===== M1 开设置（内建基线）=====");
await af.evaluate(() => { [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "设置")?.click(); });
const m1 = await af.evaluate(SAMPLER.replace("const WIN = 900;", "const WIN = 900;"));
console.log(compact(m1));
await sleep(600);

/* ---------- M2：关设置 ---------- */
console.log("===== M2 关设置（内建基线）=====");
await af.evaluate(() => { document.querySelector(".fixed.inset-0.z-30")?.click(); });
const m2 = await af.evaluate(SAMPLER.replace("const WIN = 900;", "const WIN = 450;"));
console.log(compact(m2));
await sleep(800);

/* ---------- M3：开音乐 ---------- */
console.log("===== M3 开音乐（复现选框/玻璃差异）=====");
await af.evaluate(() => { [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "音乐")?.click(); });
const m3 = await af.evaluate(SAMPLER);
console.log(compact(m3));
await sleep(600);

/* ---------- M4：关音乐 ---------- */
console.log("===== M4 关音乐 =====");
await af.evaluate(() => { document.querySelector(".fixed.inset-0.z-30")?.click(); });
const m4 = await af.evaluate(SAMPLER.replace("const WIN = 900;", "const WIN = 450;"));
console.log(compact(m4));
await sleep(800);

/* ---------- M5：互切 设置→音乐（补见证） ---------- */
console.log("===== M5 设置→音乐互切 =====");
await af.evaluate(() => { [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "设置")?.click(); });
await sleep(900);
await af.evaluate(() => { [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "音乐")?.click(); });
const m5 = await af.evaluate(SAMPLER);
console.log(compact(m5));

await ctx.close();
console.log("DONE");
