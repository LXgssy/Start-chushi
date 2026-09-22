// v8.7.9 视觉目检（Task 149）：
// A 组：掠影开抽屉——blur 20→14px 再调轻 + 掠影站点去 saturate（v8.7.9 提亮律退役：
//       满值 bf 恒等于 blur(14px) 无 saturate）+ 染色退役/scale 1.03 不回归（v8.7.8 零回归）
// D 组：掠影满屏纱幕压暗律——抽屉上右键磁贴→编辑快捷服务：抽屉纱幕 + 编辑纱幕双层
//       叠加同为深纱 rgba(0,0,0,0.18)+blur(12px)（用户实测「又套一层模糊导致背景更亮」
//       根因退役）；D2 掠影命令面板 veil 同律；D3 掠影+浅色主题（白纱提亮主场景）同律
// E 组：零波及对账——默认（辉光）+浅色主题：面板 veil 白纱 bg-white/10 + saturate 玻璃
//       语言原样保留；抽屉 veil blur(14px) saturate(1.5)（非掠影态站点 sat 在位）
// 真右键 UX 行为由探针 T7e 每轮实证（133 门含 T7e PASS）；本脚本 D 组用 evaluate 派发
// contextmenu（handler 级见证，确定性）——headless 下新开抽屉磁贴挂载序在纱幕之后，
// elementFromPoint 命中纱幕（dbg-v879-rclick.mjs 实证），非产物缺陷。
// 像素见证：0.18 黑纱数学上只压暗不提亮；blur 亮度均值保持——提亮的两个物理通道
// （白底色/饱和度提升）已在计算值层排除；截图供帧序目检。
import { chromium } from "playwright-core";
import crypto from "crypto";

const ROOT = "/tmp/ext-beta";
const SHOTS = "/tmp/v879-visual";
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import { mkdirSync, rmSync } from "fs";
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

/* 本地 SVG 壁纸（data URI 免网络）：深蓝渐变 + 白网格线（与 v8.7.6/7/8 同款） */
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

const ctx = await chromium.launchPersistentContext("/tmp/v879-profile", {
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

/* ---------- A 组：掠影开抽屉——blur 14px + 无 saturate + 染色退役/微放大不回归 ---------- */
await page.mouse.click(90, 620, { button: "middle" }); /* 开抽屉 */
await sleep(1000); /* 凝聚 0.60s + intro 0.95s + 余量 */
const aState = await af.evaluate(() => {
  const veil = document.querySelector(".cl-drawer-veil");
  const wp = document.querySelector(".wallpaper-layer");
  const bf = veil ? getComputedStyle(veil).backdropFilter : "NO-VEIL";
  return {
    veilDisplay: veil ? getComputedStyle(veil, "::before").display : "NO-VEIL",
    veilBf: bf,
    satFree: !/saturate/.test(bf), /* v8.7.9 掠影去饱和律：满值帧必须无 saturate */
    wpTransform: wp ? getComputedStyle(wp).transform : "NO-WP",
  };
});
console.log("A 掠影开抽屉稳态:", JSON.stringify(aState));
console.log("A 期望: veilDisplay=none（染色退役不回归） / veilBf=blur(14px) 且 satFree=true（调轻+去饱和双律） / wpTransform 含 1.03");
await page.screenshot({ path: `${SHOTS}/A-photo-drawer-open.png` });

/* ---------- D 组：抽屉上右键磁贴→编辑快捷服务（双层纱幕叠加） ----------
   headless 下新开抽屉磁贴挂载序在纱幕之后，真指针右键 elementFromPoint 命中
   纱幕（dbg-v879-rclick.mjs 实证）；真右键 UX 行为由探针 T7e 每轮实证——
   此处 handler 级派发见证编辑纱幕样式。 ---------- */
await af.evaluate(() => {
  const t = document.querySelector('[data-cl-tile="1"]');
  const a = t?.querySelector("a") || t;
  a?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
});
await sleep(700);
const dState = await af.evaluate(() => {
  const screens = [...document.querySelectorAll(".cl-screen-veil")].map((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, bf: cs.backdropFilter };
  });
  const veil = document.querySelector(".cl-drawer-veil");
  return {
    screenCount: screens.length,
    editVeil: screens[0] || null,
    drawerBf: veil ? getComputedStyle(veil).backdropFilter : "NO-VEIL",
    dlgOpen: !!document.querySelector("[role='dialog']"),
  };
});
console.log("D 深色主题双层叠加稳态:", JSON.stringify(dState));
console.log("D 期望: editVeil.bg=rgba(0,0,0,0.18)+bf=blur(12px)（白纱退役·无 saturate） / drawerBf=blur(14px)（第二层不再提亮）");
await page.screenshot({ path: `${SHOTS}/D1-drawer-edit-dialog-dark.png` });
await page.keyboard.press("Escape");
await sleep(500);
await page.mouse.click(90, 620, { button: "middle" }); /* 关抽屉 */
await sleep(1100);

/* ---------- D2 组：掠影 ⌘K 命令面板 veil 压暗律（深色主题） ---------- */
await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true })));
await sleep(900);
const d2State = await af.evaluate(() => {
  const el = document.querySelector(".cl-screen-veil");
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { bg: cs.backgroundColor, bf: cs.backdropFilter };
});
console.log("D2 掠影命令面板 veil（深色主题）:", JSON.stringify(d2State));
console.log("D2 期望: bg=rgba(0,0,0,0.18)（白纱/黑纱主题二态统一退役为深纱）+ bf=blur(12px) 无 saturate");
await page.screenshot({ path: `${SHOTS}/D2-photo-palette-dark.png` });
await page.keyboard.press("Escape");
await sleep(500);

/* ---------- D3 组：掠影 + 浅色主题（白纱 bg-white/10 提亮主场景） ---------- */
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
console.log("D3 期望: bg=rgba(0,0,0,0.18)（浅色主题白纱退役——「保证模糊效果不会提亮背景」主场景）+ bf=blur(12px) 无 saturate");
await page.screenshot({ path: `${SHOTS}/D3-photo-palette-light.png` });
await page.keyboard.press("Escape");
await sleep(500);
await page.mouse.click(90, 620, { button: "middle" }); /* 开抽屉 */
await sleep(1000);
await af.evaluate(() => {
  const t = document.querySelector('[data-cl-tile="1"]');
  const a = t?.querySelector("a") || t;
  a?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
});
await sleep(700);
await page.screenshot({ path: `${SHOTS}/D4-drawer-edit-dialog-light.png` });
await page.keyboard.press("Escape");
await sleep(500);
await page.mouse.click(90, 620, { button: "middle" }); /* 关抽屉 */
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
console.log("E 期望: bg=白纱（rgba(255,255,255,0.1)/color-mix 序列化，非掠影零波及——白纱保留）+ bf=blur(12px) saturate(1.5)（玻璃语言保留）");
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
console.log("E 期望: blur(14px) saturate(1.5)（14px 调轻生效 + sat 玻璃语言保留——非掠影态站点 sat 在位）");
await page.screenshot({ path: `${SHOTS}/E2-default-drawer-light.png` });
await page.mouse.click(90, 620, { button: "middle" });
await sleep(600);
await ctx.close();
console.log("DONE ->", SHOTS);
process.exit(0);
