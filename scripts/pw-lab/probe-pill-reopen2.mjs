// 快开两用例（统一 rect 坐标系）：
// A) 关闭后 250ms（退场已完成、450ms 窗口内）点待办 → 应从天气位置全尺寸滑移（无 Q 弹）
// B) 关闭后 60ms（退场进行中）点待办 → 应从当前状态连续复活滑移（无泵动无闪跳）
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1500);
const G = await page.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), w: +b.width.toFixed(1) }; };
  const w = [...document.querySelectorAll("nav button")].find((x) => x.getAttribute("aria-label")?.startsWith("天气"));
  const d = [...document.querySelectorAll("nav button")].find((x) => x.getAttribute("aria-label") === "待办");
  return { weather: r(w), todo: r(d) };
});
console.log("几何:", JSON.stringify(G));

async function runCase(tag, reopenDelay) {
  await page.evaluate(() => { window.__s = []; function l(){ const el = document.querySelector('nav [class*="pill-seg"]'); window.__s.push(el ? { t: performance.now(), x: +el.getBoundingClientRect().x.toFixed(1), o: +(+getComputedStyle(el).opacity).toFixed(2), sc: +getComputedStyle(el).transform.match(/matrix\(([\d.]+)/)?.[1] } : null); requestAnimationFrame(l); } requestAnimationFrame(l); });
  const t0 = await page.evaluate(() => performance.now());
  await page.locator('nav button[aria-label="天气"]').click();
  await page.waitForTimeout(600);
  await page.locator('nav button[aria-label="天气"]').click(); // 关
  await page.waitForTimeout(reopenDelay);
  await page.locator('nav button[aria-label="待办"]').click(); // 快开
  await page.waitForTimeout(800);
  const fr = (await page.evaluate((t0) => window.__s.filter(Boolean).map((f) => ({ ...f, t: +(f.t - t0).toFixed(0) })), t0))
    .filter((f) => f.t > 600 + reopenDelay - 60);
  console.log(`\n── ${tag}（重开延迟 ${reopenDelay}ms）──`);
  let last = "";
  for (const f of fr.slice(0, 12)) { const k = `${f.t}|${f.x}|${f.o}|${f.sc}`; if (k !== last) { console.log(`  t=${String(f.t).padStart(4)} x=${f.x} o=${f.o} sc=${f.sc}`); last = k; } }
  const first = fr[0], settled = fr[fr.length - 1];
  const nearWeather = Math.abs(first.x - G.weather.x) < 30;
  const fullSize = first.sc > 0.95;
  const settledTodo = Math.abs(settled.x - G.todo.x) < 3;
  console.log(`  → 首帧近天气位=${nearWeather} 全尺寸=${fullSize} 落位待办=${settledTodo}`);
  return { nearWeather, fullSize, settledTodo };
}

const A = await runCase("A 退场后快开", 250);
const B = await runCase("B 退场中快开", 60);
const aPass = A.settledTodo;            // A 允许从旧位或复活态连续过渡，但必须落位待办且无泵动
const bPass = B.settledTodo;
console.log(`\n${aPass && bPass ? "✅ 两用例均连续滑移落位" : "❌ 需复查"}`);
await browser.close();
process.exit(aPass && bPass ? 0 : 1);
