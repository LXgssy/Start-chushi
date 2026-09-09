// 快开滑移取证：天气开→关→300ms 内点待办 → 应从天气位置滑移到待办（不播 Q 弹）
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1500);
const W = await page.evaluate(() => {
  const b = [...document.querySelectorAll("nav button")].find((x) => x.getAttribute("aria-label")?.startsWith("天气"));
  const d = [...document.querySelectorAll("nav button")].find((x) => x.getAttribute("aria-label") === "待办");
  return { wx: b.offsetLeft, ww: b.offsetWidth, dx: d.offsetLeft };
});
console.log("几何:", JSON.stringify(W));
await page.evaluate(() => { window.__s = []; function l(){ const el = document.querySelector('nav [class*="pill-seg"]'); if (el) { const st = getComputedStyle(el); window.__s.push({ t: performance.now(), x: +el.getBoundingClientRect().x.toFixed(1), o: +(+st.opacity).toFixed(2), sc: +st.transform.match(/matrix\(([\d.]+)/)?.[1] }); } requestAnimationFrame(l); } requestAnimationFrame(l); });
const t0 = await page.evaluate(() => performance.now());
await page.locator('nav button[aria-label="天气"]').click();
await page.waitForTimeout(500);
await page.locator('nav button[aria-label="天气"]').click(); // 关闭
await page.waitForTimeout(120); // ~300ms 内
await page.locator('nav button[aria-label="待办"]').click();
await page.waitForTimeout(700);
const frames = await page.evaluate((t0) => window.__s.map((f) => ({ ...f, t: +(f.t - t0).toFixed(0) })), t0);
// 只打印第二段（快开待办之后）的关键帧
const reopenAt = frames.findIndex((f) => f.t > 620);
console.log("快开后帧序列:");
let last = "";
for (const f of frames.slice(Math.max(0, reopenAt - 2))) {
  const k = `${f.t}|${f.x}|${f.o}|${f.sc}`;
  if (k !== last) { console.log(`  t=${String(f.t).padStart(4)}ms x=${f.x} o=${f.o} scale=${f.sc}`); last = k; }
}
const post = frames.filter((f) => f.t > 640);
const slidFromWeather = post.some((f) => f.x < W.dx - 5) && post.some((f) => Math.abs(f.x - W.dx) < 3);
const noPop = post.every((f) => f.sc > 0.95);
console.log(slidFromWeather && noPop ? "✅ 快开=从天气位置滑移到待办，无 Q 弹" : `❌ slid=${slidFromWeather} noPop=${noPop}`);
await browser.close();
process.exit(slidFromWeather && noPop ? 0 : 1);
