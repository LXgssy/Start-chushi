// v8.7.11 视觉目检：
// F 组（本版核心）：开面板【动画窗】无提亮见证——veil-in 关键帧 from 站点曾硬编码
//       blur(1px) saturate(1.5)，CSS 动画运行期优先级高于普通声明，把 v8.7.9 的
//       掠影深纱覆写架空 45%+ 时间窗 = 用户实测「打开有模糊效果背景的页面还是
//       会出现提亮一两秒」。见证：⌘K 后 rAF 连续采样 veil 计算值 ~700ms，
//       断言全程 bf 无 saturate 且 bg 非白纱（只允许 transparent→rgba(0,0,0,*)）。
// A 组：掠影开抽屉回归（blur 14px 无 sat + 染色退役 + scale 1.03）——v8.7.9 零回归
// D 组：掠影满屏纱幕压暗律回归（双层叠加/命令面板深浅双主题）——v8.7.9 零回归
// E 组：零波及对账——默认（辉光）+浅色主题白纱 + saturate 玻璃语言原样保留
// 伪影定律（TL34b 沉淀）：headless rAF 可能帧合并致样本稀疏/首帧即终态，但
// 「全程无 saturate + 全程非白纱」断言对任何采样密度均有效；过程性由 TL40
// 静态门规范级保证，本组为运行时计算值层见证。
import { chromium } from "playwright-core";
import crypto from "crypto";

const ROOT = "/tmp/ext-beta";
const SHOTS = "/tmp/v8711-visual";
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import { mkdirSync, rmSync } from "fs";
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

/* 本地 SVG 壁纸（data URI 免网络）：深蓝渐变 + 白网格线（与 v8.7.6/7/8/9 同款） */
const WALLPAPER = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='800'>` +
  `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
  `<stop offset='0' stop-color='#1e3a5f'/><stop offset='0.5' stop-color='#2d4a73'/>` +
  `<stop offset='1' stop-color='#0f2438'/></linearGradient></defs>` +
  `<rect width='1280' height='800' fill='url(#g)'/>` +
  `${[...Array(17)].map((_, i) => `<line x1='${i * 80}' y1='0' x2='${i * 80}' y2='800' stroke='rgba(255,255,255,0.18)' stroke-width='1.5'/>`).join("")}` +
  `${[...Array(11)].map((_, i) => `<line x1='0' y1='${i * 80}' x2='1280' y2='${i * 80}' stroke='rgba(255,255,255,0.18)' stroke-width='1.5'/>`).join("")}` +
  `</svg>`
);

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
await sleep(4000); /* 排空入场动画 */

/* settings 原位改写 + reload（v8.7.8 同款 readLS 整体替换语义，字段全保留） */
async function presetSettings(mut, ...args) {
  await af.evaluate(mut, ...args);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.endsWith("index.html");
  }, { timeout: 8000 });
  af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
  await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
  await sleep(4000);
}

/* ---------- 掠影模式预置 ---------- */
await presetSettings((wp) => {
  const raw = localStorage.getItem("start:settings");
  const obj = raw ? JSON.parse(raw) : {};
  obj.background = "photo";
  obj.photoId = "custom";
  obj.wallpaperUrl = wp;
  obj.wallpaperRev = (obj.wallpaperRev || 0) + 1;
  localStorage.setItem("start:settings", JSON.stringify(obj));
}, WALLPAPER);
console.log("photo-mode 挂载:", await af.evaluate(() => document.documentElement.classList.contains("photo-mode")));
await page.screenshot({ path: `${SHOTS}/D0-photo-baseline.png` });

/* ---------- F 组（v8.7.11 核心）：开命令面板动画窗无提亮见证 ---------- */
await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true })));
const fSamples = await af.evaluate(() => new Promise((resolve) => {
  const t0 = performance.now();
  const grab = () => {
    const el = document.querySelector(".cl-screen-veil");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { bf: cs.backdropFilter, bg: cs.backgroundColor, op: cs.opacity };
  };
  const samples = [];
  const tick = () => {
    const s = grab();
    if (s) samples.push({ t: Math.round(performance.now() - t0), ...s });
    if (performance.now() - t0 < 700) requestAnimationFrame(tick);
    else resolve({ n: samples.length, samples });
  };
  requestAnimationFrame(tick);
}));
const fJudged = fSamples ? {
  n: fSamples.n,
  first: fSamples.samples[0] || null,
  mid: fSamples.samples[Math.floor(fSamples.samples.length / 2)] || null,
  last: fSamples.samples[fSamples.samples.length - 1] || null,
  satFreeAll: fSamples.samples.every((x) => !/saturate/.test(x.bf)),
  noWhiteAll: fSamples.samples.every((x) => !/rgba?\(\s*2[0-9]{2}\s*,/.test(x.bg) || /rgba?\(\s*2[0-9]{2}\s*,\s*2[0-9]{2}\s*,\s*2[0-9]{2}\s*,\s*0/.test(x.bg)),
} : null;
console.log("F 动画窗采样:", JSON.stringify(fJudged));
console.log("F 期望: n>=3（headless 帧合并允许稀疏但非 0） / satFreeAll=true（全程无饱和度提升） / noWhiteAll=true（全程非白纱提亮）/ last.bf=blur(12px)（终态凝满无 sat）");
await page.screenshot({ path: `${SHOTS}/F1-palette-open-mid.png`, /* 截图尽力捕中态 */ });
await sleep(400); /* 动画余量收尾 */
const fSteady = await af.evaluate(() => {
  const el = document.querySelector(".cl-screen-veil");
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { bg: cs.backgroundColor, bf: cs.backdropFilter };
});
console.log("F 稳态（v8.7.9 律不回归）:", JSON.stringify(fSteady), "期望 bg=rgba(0,0,0,0.18)+bf=blur(12px) 无sat");
await page.keyboard.press("Escape");
await sleep(500);

/* ---------- F2 组：掠影下编辑快捷服务（LinkDialog）动画窗同律 ---------- */
await page.mouse.click(90, 620, { button: "middle" }); /* 开抽屉 */
await sleep(1000);
await af.evaluate(() => {
  const t = document.querySelector('[data-cl-tile="1"]');
  const a = t?.querySelector("a") || t;
  a?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
});
const f2Samples = await af.evaluate(() => new Promise((resolve) => {
  const t0 = performance.now();
  const samples = [];
  const tick = () => {
    const els = [...document.querySelectorAll(".cl-screen-veil")];
    const el = els[els.length - 1];
    if (el) {
      const cs = getComputedStyle(el);
      samples.push({ t: Math.round(performance.now() - t0), bf: cs.backdropFilter, bg: cs.backgroundColor });
    }
    if (performance.now() - t0 < 700) requestAnimationFrame(tick);
    else resolve({ n: samples.length, samples });
  };
  requestAnimationFrame(tick);
}));
const f2Judged = f2Samples ? {
  n: f2Samples.n,
  first: f2Samples.samples[0] || null,
  last: f2Samples.samples[f2Samples.samples.length - 1] || null,
  satFreeAll: f2Samples.samples.every((x) => !/saturate/.test(x.bf)),
  noWhiteAll: f2Samples.samples.every((x) => !/rgba?\(\s*2[0-9]{2}\s*,/.test(x.bg)),
} : null;
console.log("F2 编辑快捷服务动画窗采样（抽屉上第二层纱幕）:", JSON.stringify(f2Judged));
console.log("F2 期望: satFreeAll=true / noWhiteAll=true / last.bg=rgba(0,0,0,0.18)（双层叠加全程轻压暗）");
await page.screenshot({ path: `${SHOTS}/F2-drawer-edit-mid.png` });
await page.keyboard.press("Escape");
await sleep(500);
await page.mouse.click(90, 620, { button: "middle" }); /* 关抽屉 */
await sleep(1100);

/* ---------- A 组：掠影开抽屉回归（v8.7.9 四律不回归） ---------- */
await page.mouse.click(90, 620, { button: "middle" });
await sleep(1000);
const aState = await af.evaluate(() => {
  const veil = document.querySelector(".cl-drawer-veil");
  const wp = document.querySelector(".wallpaper-layer");
  const bf = veil ? getComputedStyle(veil).backdropFilter : "NO-VEIL";
  return {
    veilDisplay: veil ? getComputedStyle(veil, "::before").display : "NO-VEIL",
    veilBf: bf,
    satFree: !/saturate/.test(bf),
    wpTransform: wp ? getComputedStyle(wp).transform : "NO-WP",
  };
});
console.log("A 掠影开抽屉稳态:", JSON.stringify(aState));
console.log("A 期望: veilDisplay=none / veilBf=blur(14px) 且 satFree=true / wpTransform 含 1.05（v8.7.11 再大一点）");
await page.screenshot({ path: `${SHOTS}/A-photo-drawer-open.png` });
await page.mouse.click(90, 620, { button: "middle" });
await sleep(1100);

/* ---------- D2 组：掠影 ⌘K 命令面板稳态压暗律（深色主题，v8.7.9 律不回归） ---------- */
await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true })));
await sleep(900);
const d2State = await af.evaluate(() => {
  const el = document.querySelector(".cl-screen-veil");
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { bg: cs.backgroundColor, bf: cs.backdropFilter };
});
console.log("D2 掠影命令面板 veil（深色主题）:", JSON.stringify(d2State));
console.log("D2 期望: bg=rgba(0,0,0,0.18) + bf=blur(12px) 无 saturate");
await page.screenshot({ path: `${SHOTS}/D2-photo-palette-dark.png` });
await page.keyboard.press("Escape");
await sleep(500);

/* ---------- D3 组：掠影 + 浅色主题（白纱提亮主场景退役不回归） ---------- */
await presetSettings(() => {
  const raw = localStorage.getItem("start:settings");
  const obj = raw ? JSON.parse(raw) : {};
  obj.themeMode = "light";
  localStorage.setItem("start:settings", JSON.stringify(obj));
});
console.log("D3 掠影+浅色主题挂载:", await af.evaluate(() => {
  const cl = document.documentElement.classList;
  return { photo: cl.contains("photo-mode"), dark: cl.contains("dark") };
}));
await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true })));
await sleep(900);
const d3State = await af.evaluate(() => {
  const el = document.querySelector(".cl-screen-veil");
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { bg: cs.backgroundColor, bf: cs.backdropFilter };
});
console.log("D3 掠影+浅色命令面板 veil:", JSON.stringify(d3State));
console.log("D3 期望: bg=rgba(0,0,0,0.18)（浅色白纱退役）+ bf=blur(12px) 无 saturate");
await page.screenshot({ path: `${SHOTS}/D3-photo-palette-light.png` });
await page.keyboard.press("Escape");
await sleep(500);

/* ---------- G 组（v8.7.11 核心）：互切到 dock 部件——玻璃背板恒定见证 ----------
   修复前：部件容器 --boot-bg 纯色垫底 + content-focus-solid（filter 动画）挂容器
   =聚拢期容器 backdrop 被杀+揭示幕透出纯色暗卡=「音乐面板背景半透明又变回纯色」。
   修复后：容器挂 glass-card 同款磨砂玻璃 + 动画类迁移 iframe——动画窗全程
   backdrop-filter 恒 blur(20px) saturate(1.5)、底色恒 0.62/0.6，玻璃溶于玻璃。 */
await af.evaluate(() => {
  const preset = [{
    id: "probe-widget-g", name: "探针部件G", installedAt: Date.now(),
    raw: {
      name: "探针部件G", commands: [], links: [], dock: [],
      widgets: [{
        id: "w-g11", name: "测试面板", surface: "dock",
        width: 320, height: 380,
        html: '<div style="width:100%;height:100vh;background:linear-gradient(160deg,#4f6ef7,#8b5cf6);color:#fff;font:15px sans-serif;padding:18px;box-sizing:border-box">预设部件（G组）</div>',
      }],
    },
  }];
  localStorage.setItem("start:presets", JSON.stringify(preset));
});
await presetSettings(() => {}); /* 重载承接预设注入 */
const gOpen = await af.evaluate(async () => {
  const nf = () => new Promise((r) => requestAnimationFrame(r));
  const t0w = performance.now();
  while (performance.now() - t0w < 8000) {
    if (document.querySelector('.dock-btn[aria-label="设置"]')
      && document.querySelector('.cl-dock button[aria-label="测试面板"]')) break;
    await nf();
  }
  const sb = () => [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "设置");
  const wb = () => [...document.querySelectorAll(".cl-dock button")].find((b) => b.getAttribute("aria-label") === "测试面板");
  if (!sb() || !wb()) return { err: "btn missing" };
  sb().click();
  let g = 0;
  while (!document.querySelector(".glass-card.cl-panel") && g++ < 300) await nf();
  await new Promise((r) => setTimeout(r, 900));
  /* 互切→部件 + 动画窗 rAF 采样（容器玻璃计算值 + iframe 动画名） */
  wb().click();
  const t0 = performance.now();
  const rows = [];
  const tick = () => {
    /* v8.7.11 坑录：data-widget 双挂载（stage 弹簧壳+cl-dockwidget 视图），
       querySelector 首匹配命中的是 stage（无玻璃）——必须筛 cl-dockwidget 视图 */
    const wv = [...document.querySelectorAll('[data-widget$=":w-g11"]')].find((el) => el.classList.contains("cl-dockwidget"));
    if (wv) {
      const cs = getComputedStyle(wv);
      const fr = wv.querySelector("iframe");
      rows.push({
        t: Math.round(performance.now() - t0),
        bf: cs.backdropFilter, bg: cs.backgroundColor,
        anim: fr ? getComputedStyle(fr).animationName : "NO-FRAME",
      });
    }
    if (performance.now() - t0 < 800) requestAnimationFrame(tick);
    else resolveG(rows);
  };
  let resolveG;
  const done = new Promise((res) => { resolveG = res; });
  requestAnimationFrame(tick);
  await done;
  return { n: rows.length, rows };
});
const gRows = gOpen.rows || [];
const gJudged = {
  n: gOpen.n,
  bfSteadyAll: gRows.every((x) => /blur\(20px\)\s*saturate\(1\.5\)/.test(x.bf)),
  bgNeverBoot: gRows.every((x) => !/rgba\(24,\s*24,\s*28,\s*1\)/.test(x.bg) && !/rgb\(255,\s*255,\s*255\)/.test(x.bg)),
  bgGlass: gRows.filter((x) => /0\.6/.test(x.bg)).length > 0,
  focusInFlight: gRows.some((x) => x.anim === "content-focus-solid-kf"),
  first: gRows[0] || null,
  last: gRows[gRows.length - 1] || null,
};
console.log("G 互切玻璃背板采样:", JSON.stringify(gJudged));
console.log("G 期望: bfSteadyAll=true（动画窗玻璃恒定不失效）/ bgNeverBoot=true（纯色 boot 底退役）/ focusInFlight=true（聚拢在 iframe 在飞）");
await page.screenshot({ path: `${SHOTS}/G1-widget-glass-mid.png` });
await sleep(700);
await page.screenshot({ path: `${SHOTS}/G2-widget-glass-steady.png` });
await page.mouse.click(90, 620, { button: "middle" }); /* 关面板 */
await sleep(1100);

/* ---------- E 组：零波及对账——默认（辉光）+浅色主题恢复原玻璃语言 ---------- */
await presetSettings(() => {
  const raw = localStorage.getItem("start:settings");
  const obj = raw ? JSON.parse(raw) : {};
  obj.background = "glow";
  obj.photoId = "";
  obj.themeMode = "light";
  obj.wallpaperRev = (obj.wallpaperRev || 0) + 1;
  localStorage.setItem("start:settings", JSON.stringify(obj));
});
console.log("E 默认模式 photo-mode 已摘除:", await af.evaluate(() => !document.documentElement.classList.contains("photo-mode")));
await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true })));
await sleep(900);
const ePal = await af.evaluate(() => {
  const el = document.querySelector(".cl-screen-veil");
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { bg: cs.backgroundColor, bf: cs.backdropFilter };
});
console.log("E 辉光+浅色命令面板 veil:", JSON.stringify(ePal));
console.log("E 期望: bg=白纱（非掠影零波及——白纱保留）+ bf=blur(12px) saturate(1.5)（玻璃语言保留）");
await page.screenshot({ path: `${SHOTS}/E1-default-palette-light.png` });
await page.keyboard.press("Escape");
await sleep(500);
await page.mouse.click(90, 620, { button: "middle" }); /* 开抽屉 */
await sleep(1000);
const eDrawer = await af.evaluate(() => {
  const veil = document.querySelector(".cl-drawer-veil");
  return veil ? getComputedStyle(veil).backdropFilter : "NO-VEIL";
});
console.log("E 辉光+浅色抽屉 veil bf:", eDrawer);
console.log("E 期望: blur(14px) saturate(1.5)（调轻生效 + sat 玻璃语言保留）");
await page.screenshot({ path: `${SHOTS}/E2-default-drawer-light.png` });
await page.mouse.click(90, 620, { button: "middle" });
await sleep(600);
await ctx.close();
console.log("DONE ->", SHOTS);
process.exit(0);
