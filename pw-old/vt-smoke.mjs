// 虚拟时钟逐帧录制冒烟测试：
//  1) Emulation.setVirtualTimePolicy pause/advance 循环能否逐帧驱动 framer-motion（intro-rise）
//  2) CSS :hover 过渡是否随虚拟帧推进
//  3) 虚拟时间下 Date 是否前进（时钟画面）
//  4) 1920x1080 JPEG 截图单帧耗时基准
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";

const OUT = "/tmp/vtsmoke";
mkdirSync(OUT, { recursive: true });
const FPS = 60;
const STEP = 1000 / FPS;
const W = 1920, H = 1080;

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/z/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell",
  args: ["--hide-scrollbars", "--lang=zh-CN", "--force-color-profile=srgb"],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const t0 = Date.now();
await page.goto("http://localhost:3210", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem("start:settings") || "{}"); } catch {}
  localStorage.setItem("start:settings", JSON.stringify({ ...s, themeMode: "light", background: "glow" }));
  localStorage.setItem("start:seen", "1");
});
await page.reload({ waitUntil: "domcontentloaded" });
// 水合探测（真实时间）
await page
  .waitForFunction(() => {
    const m = document.querySelector("main");
    if (!m) return false;
    const now = new Date();
    return m.innerText.replace(/\D/g, "").includes(
      String(now.getHours()).padStart(2, "0") + String(now.getMinutes()).padStart(2, "0")
    );
  }, { timeout: 20000 })
  .catch(() => {});
console.log("load+warm real ms:", Date.now() - t0);

const cdp = await ctx.newCDPSession(page);

// —— 关键：先挂好 expired 监听，再 pause；逐帧 advance+budget —— //
let frameNo = 0;
const shots = [];
async function step() {
  const expired = new Promise((r) => cdp.once("Emulation.virtualTimeBudgetExpired", r));
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: STEP });
  const ok = await Promise.race([expired.then(() => true), new Promise((r) => setTimeout(() => r(false), 1500))]);
  if (!ok) console.warn("frame", frameNo, "budget expire TIMEOUT");
  const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 85 });
  const buf = Buffer.from(shot.data, "base64");
  writeFileSync(`${OUT}/f_${String(frameNo).padStart(4, "0")}.jpg`, buf);
  shots.push(buf.length);
  frameNo++;
}

// 进入虚拟时间（真实时间轴上 pause 的瞬间起，页面动画全部冻结）
await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });

// 阶段 A：立即逐帧 60 帧（此刻 intro-rise 入场动画可能已被真实时间放完，
//   所以先 reload 一次：pause 生效后动画尚未开始——用 goto 后立刻 pause 再 reload 不可行，
//   改为：pause 后 evaluate location.reload() 会中断 CDP…… 所以直接用 CSS transition 验证）
// 实测策略：阶段 A 先截 10 帧静止基线（动画已完，应几乎零差异）
for (let i = 0; i < 10; i++) await step();
console.log("phase A baseline done");

// 阶段 B：CSS transition 验证 —— hover 一个快捷链接磁贴（真实 mouse 事件 + CSS 过渡）
const tile = await page.evaluate(() => {
  const a = document.querySelector("a[aria-label]");
  if (!a) return null;
  const r = a.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: a.getAttribute("aria-label") };
});
console.log("tile:", tile);
if (tile) {
  await page.mouse.move(tile.x, tile.y);
  for (let i = 0; i < 30; i++) await step(); // 悬停过渡 30 帧
}
console.log("phase B hover done");

// 阶段 C：面板入场动画（framer-motion）—— JS 直点天气面板后逐帧 75 帧
await page.evaluate(() => {
  const b = document.querySelectorAll("nav[aria-label='快捷操作'] button")[0];
  b?.click();
});
for (let i = 0; i < 75; i++) await step();
console.log("phase C panel done");

// 阶段 D：虚拟时间下 Date 校验
const d1 = await page.evaluate(() => new Date().getTime());
await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: 5000 }); // +5s
await new Promise((r) => cdp.once("Emulation.virtualTimeBudgetExpired", r));
const d2 = await page.evaluate(() => new Date().getTime());
console.log("virtual 5s → Date delta:", d2 - d1, "ms");

const avg = Math.round(shots.reduce((a, b) => a + b, 0) / shots.length);
console.log(`frames=${frameNo} avgJpegBytes=${avg} totalRealMs=${Date.now() - t0}`);
await browser.close();
console.log("SMOKE-OK");
