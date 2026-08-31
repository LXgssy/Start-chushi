// 验证：静止画面重复截图的成本（表面缓存？强制重绘？）+ optimizeForSpeed
import { chromium } from "playwright";

const EXE = "/home/z/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell";
const browser = await chromium.launch({
  headless: true,
  executablePath: EXE,
  args: ["--hide-scrollbars", "--lang=zh-CN", "--force-color-profile=srgb"],
});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto("http://localhost:3210", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem("start:settings") || "{}"); } catch {}
  localStorage.setItem("start:settings", JSON.stringify({ ...s, themeMode: "light", background: "glow" }));
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });

async function tshot(opts, label) {
  const t = performance.now();
  const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 85, ...opts });
  const ms = (performance.now() - t).toFixed(0);
  console.log(`${label}: ${ms}ms ${(Buffer.from(shot.data, "base64").length / 1024).toFixed(0)}KB`);
  return ms;
}
await tshot({}, "第1次（强制首绘）");
await tshot({}, "第2次（静止重复）");
await tshot({}, "第3次（静止重复）");
await tshot({ optimizeForSpeed: true }, "第4次（optimizeForSpeed）").catch(() => console.log("optimizeForSpeed 不支持"));
// 推进一帧后再截（有动画损伤 → 应回到 ~950ms）
const expired = new Promise((r) => cdp.once("Emulation.virtualTimeBudgetExpired", r));
await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: 16.67 });
await Promise.race([expired, new Promise((r) => setTimeout(r, 3000))]);
await tshot({}, "推进16.67ms后（有损伤）");
await browser.close();
console.log("BENCH3-OK");
