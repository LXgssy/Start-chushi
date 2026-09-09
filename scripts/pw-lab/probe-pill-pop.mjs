// Q 弹出场专项取证：关闭态点开天气 → 前 500ms 逐帧记录 scale/opacity
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  window.__s = [];
  function loop() {
    const el = document.querySelector('nav [class*="pill-seg"]');
    if (el) {
      const st = getComputedStyle(el);
      window.__s.push({ t: +(performance.now()).toFixed(0), o: +(+st.opacity).toFixed(2), tf: st.transform.slice(0, 24) });
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
});
await page.locator('nav button[aria-label="天气"]').click();
await page.waitForTimeout(600);
const frames = await page.evaluate(() => {
  const t0 = window.__s[0]?.t ?? 0;
  return window.__s.map((f) => ({ ...f, t: +(f.t - t0).toFixed(0) }));
});
console.log("开面板 Q 弹帧序列（首帧起）:");
for (const f of frames) console.log(`  t=${String(f.t).padStart(4)}ms o=${f.o} ${f.tf}`);
const hasPop = frames.some((f) => f.o < 0.9 || /0\.[0-9]/.test(f.tf.split(",")[0]));
console.log(hasPop ? "✅ Q 弹出场在播" : "❌ 无出场动画（首帧即终态）");
await browser.close();
process.exit(hasPop ? 0 : 1);
