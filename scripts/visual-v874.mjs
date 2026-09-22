// v8.7.4 视觉目检（Task 144 ㊺㊻）：搜索建议退场级联 + 抽屉纱罩柔散帧序
// A 组：建议 blur 退场帧序（mock sugrec → blur → 连拍：逐行下沉模糊散场）
// B 组：抽屉关闭柔散帧序（中键关 → 连拍：blur 起步即松解，无 0.14s 驻留顿拍）
import { chromium } from "playwright-core";
import crypto from "crypto";

const ROOT = "/tmp/ext-beta";
const SHOTS = "/tmp/v874-visual";
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import { mkdirSync, rmSync } from "fs";
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const browser = null;
const ctx = await chromium.launchPersistentContext("/tmp/v874-profile", {
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
await sleep(4500); /* 排空入场动画 */

/* ---------- A 组：建议退场级联帧序 ---------- */
await af.evaluate(async () => {
  const input = document.querySelector(".search-input");
  input.focus();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "目检");
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(900); /* 防抖+fetch+级联入场完成 */
await page.screenshot({ path: `${SHOTS}/A0-sug-open.png` });
await af.evaluate(() => document.querySelector(".search-input").blur());
await page.screenshot({ path: `${SHOTS}/A-out-1.png` });
for (const t of [2, 3, 4]) {
  await sleep(65);
  await page.screenshot({ path: `${SHOTS}/A-out-${t}.png` });
}
console.log("A 组完成");

/* ---------- B 组：抽屉关闭柔散帧序 ---------- */
await page.mouse.click(90, 620, { button: "middle" }); /* 开 */
await sleep(1100);
await page.screenshot({ path: `${SHOTS}/B0-drawer-open.png` });
const closeT0 = Date.now();
await page.mouse.click(90, 620, { button: "middle" }); /* 关 */
await page.screenshot({ path: `${SHOTS}/B-close-1.png` });
await sleep(150);
await page.screenshot({ path: `${SHOTS}/B-close-2-mid.png` });
await sleep(180);
await page.screenshot({ path: `${SHOTS}/B-close-3-late.png` });
await sleep(100);
/* 帧级 blur 值曲线见证（柔散渐进：起步即松解，无驻留平台） */
const curve = [];
for (let i = 0; i < 20; i++) {
  const v = await af.evaluate(() => {
    const veil = document.querySelector(".cl-drawer-veil");
    if (!veil || !veil.isConnected) return null;
    return parseFloat((getComputedStyle(veil).backdropFilter || "").match(/blur\(([\d.]+)px\)/)?.[1] ?? "-1");
  });
  curve.push(v);
  await sleep(30);
}
console.log("blur 曲线(二次确认窗):", JSON.stringify(curve));
await ctx.close();
console.log("DONE ->", SHOTS);
process.exit(0);
