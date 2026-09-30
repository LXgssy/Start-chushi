// v8.7.8 视觉目检（Task 148）：
// A 组：掠影染色退役见证——photo-mode 下开抽屉 ::before display:none（白纱/暗纱滤镜
//       摘除），默认（辉光）模式染色保留（零波及对账）+ scale 1.03 / blur 20px 不回归
// B 组：⌘K→预设面板 + 导入↔管理互切交叉溶解帧序（v8.7.8 散场修复见证：
//       旧视图 content-defocus 模糊散场在飞，不再满值钉住硬拆）
// C 组：开发者文档入场级联帧序（0.20s 基础延迟 + 55% 模糊凝满——卡片先就位、
//       内容随后级联，无首帧跳变）
import { chromium } from "playwright-core";
import crypto from "crypto";

const ROOT = "/tmp/ext-beta";
const SHOTS = "/tmp/v878-visual";
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import { mkdirSync, rmSync } from "fs";
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

/* 本地 SVG 壁纸（data URI 免网络）：深蓝渐变 + 白网格线（与 v8.7.6/7 同款） */
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

const ctx = await chromium.launchPersistentContext("/tmp/v878-profile", {
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

/* ---------- A0 默认（辉光）模式：染色保留见证（零波及对账） ---------- */
const veilBeforeDefault = await af.evaluate(() => {
  const probe = document.createElement("div");
  probe.className = "cl-drawer-veil";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const d = getComputedStyle(probe, "::before").display;
  probe.remove();
  return d;
});
console.log("A0 默认模式 ::before display（期望非 none）:", veilBeforeDefault);

/* ---------- 掠影模式预置：settings JSON 原位改写 ---------- */
await af.evaluate((wp) => {
  const raw = localStorage.getItem("start:settings");
  const obj = raw ? JSON.parse(raw) : {};
  obj.background = "photo";
  obj.photoId = "custom";
  obj.wallpaperUrl = wp;
  obj.wallpaperRev = (obj.wallpaperRev || 0) + 1;
  localStorage.setItem("start:settings", JSON.stringify(obj));
}, WALLPAPER);
await page.reload({ waitUntil: "load" });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 });
af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await sleep(4000);
console.log("photo-mode 挂载:", await af.evaluate(() => document.documentElement.classList.contains("photo-mode")));
await page.screenshot({ path: `${SHOTS}/A0-photo-baseline.png` });

/* ---------- A 组：掠影开抽屉——染色退役 + 磨砂/微放大不回归 ---------- */
await page.mouse.click(90, 620, { button: "middle" }); /* 开抽屉 */
await sleep(1000); /* 凝聚 0.60s + 余量 */
const aState = await af.evaluate(() => {
  const veil = document.querySelector(".cl-drawer-veil");
  const wp = document.querySelector(".wallpaper-layer");
  return {
    veilDisplay: veil ? getComputedStyle(veil, "::before").display : "NO-VEIL",
    tintOpacity: veil ? getComputedStyle(veil, "::before").opacity : "NO-VEIL",
    veilBf: veil ? getComputedStyle(veil).backdropFilter : "NO-VEIL",
    wpTransform: wp ? getComputedStyle(wp).transform : "NO-WP",
  };
});
console.log("A 掠影开抽屉稳态:", JSON.stringify(aState));
console.log("A 期望: veilDisplay=none（染色退役） / veilBf 含 blur(20px)（磨砂不回归） / wpTransform 含 1.03（微放大不回归）");
await page.screenshot({ path: `${SHOTS}/A-photo-drawer-open.png` });
await page.mouse.click(90, 620, { button: "middle" }); /* 关 */
await sleep(1100);
await page.screenshot({ path: `${SHOTS}/A-photo-drawer-closed.png` });
console.log("A 组完成");

/* ---------- B 组：⌘K→预设面板 + 导入↔管理互切交叉溶解帧序 ---------- */
await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true })));
await sleep(900);
await page.screenshot({ path: `${SHOTS}/B1-palette-open.png` });
await af.evaluate(() => document.querySelector('[cmdk-item][data-value="导入预设"]')?.click());
await sleep(70);
await page.screenshot({ path: `${SHOTS}/B2-switch-early.png` });
const bMid = await af.evaluate(() => {
  const el = document.querySelector(".view-exit");
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { anim: cs.animationName, op: cs.opacity, filter: cs.filter, pos: cs.position };
});
await page.screenshot({ path: `${SHOTS}/B3-switch-mid.png` });
console.log("B 互切退场中间帧（期望 content-defocus + opacity<1 + blur 在飞）:", JSON.stringify(bMid));
await sleep(700);
await page.screenshot({ path: `${SHOTS}/B4-preset-settled.png` });
await af.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("管理预设"));
  btn?.click();
});
await sleep(80);
await page.screenshot({ path: `${SHOTS}/B5-tab-mid.png` });
await sleep(700);
await page.screenshot({ path: `${SHOTS}/B6-manage-settled.png` });
console.log("B 组完成");

/* ---------- C 组：开发者文档入场级联帧序 ---------- */
/* B6 停在管理 tab——「开发者文档」按钮在导入视图，先切回 */
await af.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("导入预设"));
  btn?.click();
});
await sleep(600);
await af.evaluate(() => {
  const btn = [...document.querySelectorAll("button, a")].find((b) => (b.textContent || "").includes("开发者文档"));
  btn?.click();
});
await sleep(130);
await page.screenshot({ path: `${SHOTS}/C1-docs-early.png` });
const cEarly = await af.evaluate(() => {
  const sec = document.querySelector(".docs-anim > section");
  if (!sec) return null;
  const cs = getComputedStyle(sec);
  return { op: cs.opacity, filter: cs.filter, delay: cs.animationDelay };
});
await page.screenshot({ path: `${SHOTS}/C2-docs-cascade-start.png` });
await sleep(250);
const cMid = await af.evaluate(() => {
  const secs = [...document.querySelectorAll(".docs-anim > section")].slice(0, 4);
  return secs.map((s) => {
    const cs = getComputedStyle(s);
    return { op: +(+cs.opacity).toFixed(2), blur: (cs.filter.match(/blur\(([\d.]+)px\)/) || [])[1] ?? "0" };
  });
});
await page.screenshot({ path: `${SHOTS}/C3-docs-cascade-mid.png` });
await sleep(700);
await page.screenshot({ path: `${SHOTS}/C4-docs-settled.png` });
console.log("C 首分区 @130ms（期望延迟未到仍隐身 op=0）:", JSON.stringify(cEarly));
console.log("C 前 4 分区 @380ms（期望阶梯：前清晰后仍糊——级联在飞）:", JSON.stringify(cMid));
await ctx.close();
console.log("DONE ->", SHOTS);
process.exit(0);
