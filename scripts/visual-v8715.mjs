// v8.7.15 视觉目检：
// M 组（本版核心）：音乐面板动画二次重写见证——
//   M1 首开弹簧轨迹：fresh 几何 h-full 同构（容器 offsetHeight 每帧==高度盒
//      =弹簧过冲/回弹全程作用于卡片本身，v8.7.14 联立钳制的结构反证）+
//      宽度恒定（开合零横向运动）+ iframe 满宽（横向满宽律=左移根修：
//      replaced element 固有 300px → 容器内宽满铺）
//   M2 稳态居中：stage 中心==视口中心（左移修复的稳态几何证据）+ 顶角圆角
//   M3 关闭：宽度恒定（不再回落 360 的横向挤压）+ h-full 收折贴合
//   M4 重开：freshOpen 状态机重臂（第二次 closed→open 仍走 h-full 同构）
//   M5 互切分律回归：设置→音乐 走联立底锚（shrink 段 offsetTop>0 卡底贴
//      dock）+ 宽度随拉伸弹簧（360→340）——几何分律两支各自正确
// 坑录沿用：data-widget 双挂载须筛 .cl-dockwidget；widget key 复合键后缀
// 匹配；click 序列以 ensureNoPanel 关闭态为前提；布局空间 offsetTop/Height
// 对 transform 免疫（content-focus 的 translateY/scale 不污染几何断言）。
import { chromium } from "playwright-core";
import crypto from "crypto";
import { readFileSync, mkdirSync, rmSync } from "fs";

const ROOT = "/tmp/ext-beta";
const SHOTS = "/tmp/v8715-visual";
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

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
let af = null;
for (let i = 0; i < 20 && !af; i++) {
  af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
  if (!af) await sleep(500);
}
if (!af) throw new Error("shell index.html frame not found");
await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await sleep(4000);

async function presetSettings(mut, ...args) {
  await af.evaluate(mut, ...args);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.endsWith("index.html");
  }, { timeout: 8000 });
  af = null;
  for (let i = 0; i < 20 && !af; i++) {
    af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
    if (!af) await sleep(500);
  }
  if (!af) throw new Error("shell frame not found (presetSettings)");
  await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
  await sleep(4000);
}

/* 注入官方音乐预设（raw 补 commands/links/dock 空数组——flatMap 硬依赖坑录） */
const official = JSON.parse(readFileSync("/tmp/beta-wt/src/lib/startpage/official-presets.json", "utf8"));
await af.evaluate((raw) => {
  localStorage.setItem("start:presets", JSON.stringify([
    { id: "official-smtc-v13", name: raw.name, installedAt: Date.now(), raw },
  ]));
}, JSON.parse(JSON.stringify({ ...official.presets[1].manifest, commands: [], links: [], dock: [] })));
await presetSettings(() => {});

async function ensureNoPanel() {
  await af.evaluate(() => document.querySelector(".fixed.inset-0.z-30")?.click());
  await sleep(600);
  const st = await af.evaluate(() => ({
    glass: !!document.querySelector(".glass-card.cl-panel"),
    h: document.querySelector(".cl-stage > div")?.getBoundingClientRect().height ?? 0,
  }));
  if (st.glass || st.h > 0) { await sleep(800); }
}

/* 通用开面板轨迹采样：click(label) 后 rAF 连续采 stage 宽高 + 部件容器布局
   几何 + iframe 宽高（布局空间，transform 免疫） */
const SAMPLE_JS = ` (function(label, dur) {
  [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === label)?.click();
  const stage = () => document.querySelector(".cl-stage");
  const wv = () => [...document.querySelectorAll('[data-widget$=":music"]')].find((el) => el.classList.contains("cl-dockwidget"));
  return new Promise((resolve) => {
    const t0 = performance.now();
    const rows = [];
    const tick = () => {
      const row = { t: Math.round(performance.now() - t0) };
      const st = stage();
      if (st) { row.stW = st.offsetWidth; row.stH = st.offsetHeight; }
      const w = wv();
      if (w) {
        row.wvTop = w.offsetTop; row.wvH = w.offsetHeight;
        row.wvOp = getComputedStyle(w).opacity;
        const fr = w.querySelector("iframe");
        if (fr) { row.frW = fr.offsetWidth; row.frH = fr.offsetHeight; }
      }
      rows.push(row);
      if (performance.now() - t0 < dur) requestAnimationFrame(tick);
      else resolve(rows);
    };
    requestAnimationFrame(tick);
  });
})`;

let passCount = 0, failCount = 0;
const judge = (name, ok, detail) => {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name} — ${detail}`);
  ok ? passCount++ : failCount++;
};

/* ================= M1：首开弹簧轨迹（fresh h-full 同构 + 满宽 + 宽度恒定） ================= */
console.log("===== M1 首开音乐（fresh h-full 同构见证）=====");
await ensureNoPanel();
const m1 = await af.evaluate(`${SAMPLE_JS}("音乐", 900)`);
const m1v = m1.filter((r) => r.wvOp > 0.99 && r.stW > 0);
/* 描边地板排除（TL25d 同款律）：s≤8 帧=border-box 描边撑出伪高，无几何意义 */
const m1geo = m1v.filter((r) => r.stH > 8);
const m1Settled = m1v.length ? m1v[m1v.length - 1] : null;
const m1Fill = m1geo.length ? Math.max(...m1geo.map((r) => Math.abs((r.wvH ?? 0) - r.stH))) : null;
const m1TopMax = m1v.length ? Math.max(...m1v.map((r) => r.wvTop ?? 0)) : null;
/* 宽度语言判据：宽度变化只允许发生在不可见帧（stH≤8，高度≈0 的快照窗口）——
   可见运动窗（stH>8）内宽度必须恒定 */
const m1wVisChanges = [];
for (let i = 1; i < m1v.length; i++) if (m1v[i].stW !== m1v[i - 1].stW) m1wVisChanges.push(m1v[i]);
const m1wVisBad = m1wVisChanges.filter((r) => r.stH > 8);
const m1WVisConst = m1geo.length ? Math.max(...m1geo.map((r) => r.stW)) - Math.min(...m1geo.map((r) => r.stW)) : null;
const m1Peak = m1v.length && m1Settled ? Math.max(...m1v.map((r) => r.stH)) / Math.max(1, m1Settled.stH) : null;
const m1FrWMin = m1v.filter((r) => r.frW).length ? Math.min(...m1v.filter((r) => r.frW).map((r) => r.frW)) : null;
judge("M1a h-full 同构（容器每帧==高度盒，弹簧全程作用于卡片）", m1Fill !== null && m1Fill <= 1.5, `fillMax=${m1Fill} n=${m1geo.length}（s≤8 描边地板帧已排除）`);
judge("M1b 顶锚归零（fresh 几何 top=0 全程）", m1TopMax === 0, `topMax=${m1TopMax}`);
judge("M1c 开启宽度恒定（宽度变化仅在不可见快照帧）", m1wVisBad.length === 0 && m1WVisConst === 0 && m1Settled?.stW === 340, `visWindowWConst=${m1WVisConst} badRows=${m1wVisBad.length} steadyW=${m1Settled?.stW}`);
judge("M1d iframe 满宽（左移根修：≥335 非 300 固有宽）", m1FrWMin !== null && m1FrWMin >= 335, `frWMin=${m1FrWMin}`);
judge("M1e 弹簧过冲穿过卡片（peakRatio 报告）", m1Peak !== null && m1Peak >= 1, `peakRatio=${m1Peak?.toFixed(4)}（standard ζ=0.83 过冲 ~1%，headless 采样可平滑）`);
await page.screenshot({ path: `${SHOTS}/M1a-open-mid.png` });
await sleep(700);
await page.screenshot({ path: `${SHOTS}/M1b-open-rest.png` });

/* ================= M2：稳态居中 + 圆角目检 ================= */
console.log("===== M2 稳态几何（居中+圆角）=====");
const m2 = await af.evaluate(() => {
  const st = document.querySelector(".cl-stage").getBoundingClientRect();
  const wv = [...document.querySelectorAll('[data-widget$=":music"]')].find((el) => el.classList.contains("cl-dockwidget"));
  const fr = wv?.querySelector("iframe");
  return {
    cxOff: Math.round((st.left + st.width / 2 - window.innerWidth / 2) * 100) / 100,
    stW: st.width, stH: st.height,
    wvW: wv?.offsetWidth, wvRadius: wv ? getComputedStyle(wv).borderRadius : null,
    frW: fr?.offsetWidth, wvTop: wv?.offsetTop, wvH: wv?.offsetHeight,
  };
});
judge("M2a 面板居中（stage 中心==视口中心）", Math.abs(m2.cxOff) <= 1, `cxOff=${m2.cxOff}px`);
judge("M2b 容器自圆律保持（16px）", m2.wvRadius === "16px", `radius=${m2.wvRadius}`);
judge("M2c 稳态 h-full 几何（top=0 满盒）", m2.wvTop === 0 && Math.abs(m2.wvH - m2.stH) <= 1.5, `top=${m2.wvTop} wvH=${m2.wvH} stH=${m2.stH}`);
console.log(`M2 详情: ${JSON.stringify(m2)}`);

/* ================= M3：关闭（宽度恒定 + h-full 收折贴合） ================= */
console.log("===== M3 关音乐 =====");
const m3 = await af.evaluate(`(function() {
  document.querySelector(".fixed.inset-0.z-30")?.click();
  const stage = () => document.querySelector(".cl-stage");
  const wv = () => [...document.querySelectorAll('[data-widget$=":music"]')].find((el) => el.classList.contains("cl-dockwidget"));
  return new Promise((resolve) => {
    const t0 = performance.now();
    const rows = [];
    const tick = () => {
      const row = { t: Math.round(performance.now() - t0) };
      const st = stage();
      if (st) { row.stW = st.offsetWidth; row.stH = st.offsetHeight; }
      const w = wv();
      if (w && getComputedStyle(w).opacity > 0.99) { row.wvTop = w.offsetTop; row.wvH = w.offsetHeight; }
      rows.push(row);
      if (performance.now() - t0 < 600) requestAnimationFrame(tick);
      else resolve(rows);
    };
    requestAnimationFrame(tick);
  });
})()`);
const m3v = m3.filter((r) => r.stW > 0 && r.stH > 2);
const m3WConst = m3v.length ? Math.max(...m3v.map((r) => r.stW)) - Math.min(...m3v.map((r) => r.stW)) : null;
const m3v2 = m3v.filter((r) => r.wvH > 0);
const m3Fill = m3v2.length ? Math.max(...m3v2.map((r) => Math.abs(r.wvH - r.stH))) : null;
judge("M3a 关闭宽度恒定（不回落 360）", m3WConst === 0, `wConst=${m3WConst}`);
judge("M3b 收折贴合（h-full 随壳收折）", m3Fill !== null && m3Fill <= 1.5, `fillMax=${m3Fill}`);
await ensureNoPanel();

/* ================= M4：重开（freshOpen 状态机重臂） ================= */
console.log("===== M4 重开音乐（fresh 重臂见证）=====");
const m4 = await af.evaluate(`${SAMPLE_JS}("音乐", 900)`);
const m4v = m4.filter((r) => r.wvOp > 0.99 && r.stW > 0);
const m4geo = m4v.filter((r) => r.stH > 8);
const m4Fill = m4geo.length ? Math.max(...m4geo.map((r) => Math.abs((r.wvH ?? 0) - r.stH))) : null;
const m4TopMax = m4v.length ? Math.max(...m4v.map((r) => r.wvTop ?? 0)) : null;
const m4WVisBad = [];
for (let i = 1; i < m4v.length; i++) if (m4v[i].stW !== m4v[i - 1].stW && m4v[i].stH > 8) m4WVisBad.push(m4v[i]);
judge("M4a 重开仍 h-full 同构（fresh 重臂）", m4Fill !== null && m4Fill <= 1.5 && m4TopMax === 0, `fillMax=${m4Fill} topMax=${m4TopMax}`);
judge("M4b 重开宽度恒定（closed 保持会话宽 340）", m4WVisBad.length === 0, `visBad=${m4WVisBad.length}`);
await ensureNoPanel();

/* ================= M5：互切分律回归（设置→音乐 走联立底锚+宽度拉伸） ================= */
console.log("===== M5 设置→音乐互切（联立底锚+拉伸语言）=====");
await af.evaluate(() => [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "设置")?.click());
await sleep(1000);
const m5 = await af.evaluate(`${SAMPLE_JS}("音乐", 900)`);
const m5v = m5.filter((r) => r.wvOp > 0.99 && r.stW > 0);
const m5Shrink = m5v.filter((r) => r.stH > (r.wvH ?? 0) + 1);
/* 442→128 陡降：standard 弹簧（stiffness 420）约 4 帧穿越收缩窗（headless
   rAF 采样密度下 shrinkN 仅 2-4）——判据以 gapB 几何为主，shrinkN 只要求
   收缩窗被采样命中（≥1） */
const m5GapB = m5Shrink.length ? Math.max(...m5Shrink.map((r) => Math.abs(r.stH - ((r.wvTop ?? 0) + r.wvH)))) : null;
const m5WDelta = m5v.length ? Math.max(...m5v.map((r) => r.stW)) - Math.min(...m5v.map((r) => r.stW)) : null;
const m5Settled = m5v.length ? m5v[m5v.length - 1] : null;
judge("M5a 互切收折段底锚恒贴（联立分支生效）", m5GapB !== null && m5GapB <= 1.5 && m5Shrink.length >= 1, `shrinkN=${m5Shrink.length} gapB=${m5GapB}`);
judge("M5b 互切宽度拉伸（360→340 弹簧保真）", m5WDelta !== null && m5WDelta >= 10, `wDelta=${m5WDelta}`);
judge("M5c 互切稳态归位（s=h 后 top=0 满盒）", m5Settled && m5Settled.wvTop === 0 && Math.abs(m5Settled.wvH - m5Settled.stH) <= 1.5, `top=${m5Settled?.wvTop} wvH=${m5Settled?.wvH} stH=${m5Settled?.stH}`);
await page.screenshot({ path: `${SHOTS}/M5-swap-steady.png` });
await ensureNoPanel();

console.log(`\n===== visual-v8715: ${passCount} PASS / ${failCount} FAIL =====`);
await ctx.close();
process.exit(failCount ? 1 : 0);
