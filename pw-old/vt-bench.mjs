// 帧循环瓶颈基准 v2：对比软件光栅 vs SwiftShader/ANGLE + GPU 光栅化
// 用法: bun vt-bench.mjs [base|gl|glr|glr2]
import { chromium } from "playwright";

const COMMON = ["--hide-scrollbars", "--lang=zh-CN", "--force-color-profile=srgb"];
const VARIANT = process.argv[2] || "base";
let ARGS = COMMON;
if (VARIANT === "gl") ARGS = [...COMMON, "--use-angle=swiftshader"];
if (VARIANT === "glr") ARGS = [...COMMON, "--use-angle=swiftshader", "--enable-gpu-rasterization", "--enable-zero-copy"];
if (VARIANT === "glr2") ARGS = [...COMMON, "--use-gl=angle", "--use-angle=swiftshader", "--enable-gpu-rasterization"];

const EXE = "/home/z/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell";

async function bench(W, H, quality, label) {
  const browser = await chromium.launch({ headless: true, executablePath: EXE, args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3210", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    let s = {};
    try { s = JSON.parse(localStorage.getItem("start:settings") || "{}"); } catch {}
    localStorage.setItem("start:settings", JSON.stringify({ ...s, themeMode: "light", background: "glow" }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    document.querySelectorAll("nav[aria-label='快捷操作'] button")[0]?.click();
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  const STEP = 1000 / 60;
  let wait = 0, cap = 0, n = 0, bytes = 0;
  const N = 30;
  for (let i = 0; i < N; i++) {
    let t = performance.now();
    const expired = new Promise((r) => cdp.once("Emulation.virtualTimeBudgetExpired", r));
    await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: STEP });
    await Promise.race([expired, new Promise((r) => setTimeout(r, 3000))]);
    wait += performance.now() - t;
    t = performance.now();
    const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality });
    cap += performance.now() - t;
    bytes += Buffer.from(shot.data, "base64").length;
    n++;
  }
  console.log(`[${VARIANT}] ${label}: avgWait=${(wait / n).toFixed(0)}ms avgCap=${(cap / n).toFixed(0)}ms total=${((wait + cap) / n).toFixed(0)}ms/frame avgKB=${(bytes / n / 1024).toFixed(0)}`);
  await browser.close();
}

await bench(1920, 1080, 85, "1080p q85");
await bench(1280, 720, 85, "720p  q85");
console.log("BENCH-OK");
