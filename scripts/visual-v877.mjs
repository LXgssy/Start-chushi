// v8.7.7 视觉目检（Task 147）：抽屉模糊渐入放慢 0.60s + 满值调浅 20px
// A 组：掠影微放大不回归见证（v8.7.6 ㊽-3 架构原样——scale 1→1.03→回缩闭环）
// C 组：抽屉开凝聚帧序（0.60s ease-in-out——旧 0.36s「看不出渐入」放慢后
//       中间帧应捕到渐进糊化曲线：截图强制出帧 + 逐步 evaluate 数值见证）
// B 组：抽屉关闭散场帧序（v8.7.6 节奏原样：0-35% 缓启 20→9px、35-100%
//       linear 9→1px、hidden @0.42s——本轮零改动，验证不回归）
import { chromium } from "playwright-core";
import crypto from "crypto";

const ROOT = "/tmp/ext-beta";
const SHOTS = "/tmp/v877-visual";
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import { mkdirSync, rmSync } from "fs";
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

/* 本地 SVG 壁纸（data URI 免网络）：深蓝渐变 + 白网格线（与 v8.7.6 同款） */
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

const ctx = await chromium.launchPersistentContext("/tmp/v877-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--no-sandbox"],
});
const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => {
  const orig = window.fetch;
  window.fetch = (u, ...rest) => {
    if (String(u).includes("sugrec")) {
      const names = ["子", "丑", "寅", "卯", "辰", "巳"];
      const g = names.map((n) => ({ q: "目检词" + n }));
      return Promise.resolve({ text: () => Promise.resolve("cb(" + JSON.stringify({ g }) + ")") });
    }
    return orig(u, ...rest);
  };
});
await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 });
const af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await sleep(4000); /* 排空入场动画 */

/* ---------- 掠影模式预置：settings JSON 原位改写（readLS 整体替换语义，字段全保留） ---------- */
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
const af2 = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await af2.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await sleep(4000);
const photoMode = await af2.evaluate(() => document.documentElement.classList.contains("photo-mode"));
console.log("photo-mode 挂载:", photoMode);
await page.screenshot({ path: `${SHOTS}/A0-photo-baseline.png` });

/* ---------- A 组：掠影开抽屉背景微放大（不回归见证） ---------- */
const tf0 = await af2.evaluate(() => {
  const w = document.querySelector(".wallpaper-layer");
  return w ? getComputedStyle(w).transform : "NO-ELEMENT";
});
console.log("A 基线 transform:", tf0);
await page.mouse.click(90, 620, { button: "middle" }); /* 开 */
await sleep(650);
await page.screenshot({ path: `${SHOTS}/A-open-steady.png` });
const tf1 = await af2.evaluate(() => {
  const w = document.querySelector(".wallpaper-layer");
  return w ? getComputedStyle(w).transform : "NO-ELEMENT";
});
console.log("A 开稳态 transform（期望含 1.03）:", tf1);
await page.mouse.click(90, 620, { button: "middle" }); /* 关 */
await sleep(1100);
const tf2 = await af2.evaluate(() => {
  const w = document.querySelector(".wallpaper-layer");
  return w ? getComputedStyle(w).transform : "NO-ELEMENT";
});
console.log("A 关稳态 transform（期望 none/回缩）:", tf2);
await page.screenshot({ path: `${SHOTS}/A-close-steady.png` });
console.log("A 组完成");

/* ---------- C 组：抽屉开凝聚帧序（0.60s 渐入——截图强制出帧捕中间态 + 数值见证） ---------- */
const readBlur = () => af2.evaluate(() => {
  const veil = document.querySelector(".cl-drawer-veil");
  if (!veil || !veil.isConnected) return null;
  return parseFloat((getComputedStyle(veil).backdropFilter || "").match(/blur\(([\d.]+)px\)/)?.[1] ?? "-1");
});
await page.mouse.click(90, 620, { button: "middle" }); /* 开 */
await page.screenshot({ path: `${SHOTS}/C-open-1.png` });
const c1 = await readBlur();
await page.screenshot({ path: `${SHOTS}/C-open-2-mid.png` });
const c2 = await readBlur();
await sleep(150);
await page.screenshot({ path: `${SHOTS}/C-open-3-late.png` });
const c3 = await readBlur();
await sleep(150);
await page.screenshot({ path: `${SHOTS}/C-open-4-late2.png` });
const c4 = await readBlur();
await sleep(500);
await page.screenshot({ path: `${SHOTS}/C-open-5-steady.png` });
const c5 = await readBlur();
console.log("C 凝聚 blur 序列（期望渐进升 to 20）:", JSON.stringify([c1, c2, c3, c4, c5]));
await page.screenshot({ path: `${SHOTS}/B0-drawer-open.png` });
console.log("C 组完成");

/* ---------- B 组：抽屉关闭散场帧序（v8.7.6 节奏原样，验证不回归） ---------- */
await page.mouse.click(90, 620, { button: "middle" }); /* 关 */
await page.screenshot({ path: `${SHOTS}/B-close-1.png` });
await sleep(130);
await page.screenshot({ path: `${SHOTS}/B-close-2-mid.png` });
await sleep(140);
await page.screenshot({ path: `${SHOTS}/B-close-3-late.png` });
await sleep(250);
await page.screenshot({ path: `${SHOTS}/B-close-4-end.png` });
/* 帧级 blur 值曲线见证（匀速尾段收拢近底，无爬行平台） */
const curve = [];
for (let i = 0; i < 16; i++) {
  const v = await readBlur();
  curve.push(v);
  await sleep(30);
}
console.log("blur 曲线(收尾确认窗):", JSON.stringify(curve));
await ctx.close();
console.log("DONE ->", SHOTS);
process.exit(0);
