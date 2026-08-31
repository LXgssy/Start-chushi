// A/B：captureScreenshot vs HeadlessExperimental.beginFrame（渲染+截图一体）
import { chromium } from "playwright";

const EXE = "/home/z/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell";

async function bench(mode, label) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: EXE,
    args: ["--hide-scrollbars", "--lang=zh-CN", "--force-color-profile=srgb", "--deterministic-mode"],
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
  await page.evaluate(() => {
    document.querySelectorAll("nav[aria-label='快捷操作'] button")[0]?.click();
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("HeadlessExperimental.enable").catch(() => {});
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  const STEP = 1000 / 60;
  let n = 0, bytes = 0, t0 = performance.now();
  const N = 30;
  for (let i = 0; i < N; i++) {
    if (mode === "cap") {
      const expired = new Promise((r) => cdp.once("Emulation.virtualTimeBudgetExpired", r));
      await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: STEP });
      await Promise.race([expired, new Promise((r) => setTimeout(r, 3000))]);
      const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 85 });
      bytes += Buffer.from(shot.data, "base64").length;
    } else {
      const r = await cdp.send("HeadlessExperimental.beginFrame", {
        screenshot: { format: "jpeg", quality: 85 },
      });
      if (r.screenshotData) bytes += Buffer.from(r.screenshotData, "base64").length;
      if (!r.hasDamage && i > 5) console.warn("  no-damage frame", i);
    }
    n++;
  }
  console.log(`[${label}] avg=${((performance.now() - t0) / n).toFixed(0)}ms/frame avgKB=${(bytes / n / 1024).toFixed(0)}`);
  await browser.close();
}

await bench("cap", "captureScreenshot");
await bench("bf", "beginFrame");
console.log("BENCH2-OK");
