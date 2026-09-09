// dock 选框快速连点动效取证：
// ① 基线：慢速切换 天气→待办（800ms 间隔）——记录选框 x 轨迹
// ② 快速：天气⇄待办 连点 6 次（~110ms 间隔）——记录同一轨迹
// 对比两者的运动特征（滑移连续性/中途消失/重播出场）
import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1500);

// rAF 采样器：记录所有 pill-seg 选框的几何/透明度/变换
await page.evaluate(() => {
  window.__samples = [];
  window.__t0 = performance.now();
  function sample() {
    const pills = [...document.querySelectorAll('nav [class*="pill-seg"]')].map((el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return { x: +r.x.toFixed(1), w: +r.width.toFixed(1), o: +(+st.opacity).toFixed(2), tf: st.transform === "none" ? "none" : st.transform.slice(0, 40) };
    });
    const act = [...document.querySelectorAll("nav button[data-active]")].filter((b) => b.getAttribute("data-active") === "true").map((b) => b.getAttribute("aria-label"));
    window.__samples.push({ t: +(performance.now() - window.__t0).toFixed(0), n: pills.length, act: act.join("|"), pills });
    requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
});

function btn(label) {
  return page.locator(`nav button[aria-label="${label}"]`);
}

async function dump(tag, from) {
  const rows = await page.evaluate((f) => {
    const arr = window.__samples.slice(f);
    window.__t0 = performance.now();
    window.__samples = [];
    // 压缩：只保留 n 或 x/o 变化的帧
    const out = [];
    let prev = "";
    for (const r of arr) {
      const key = `${r.n}|${r.act}|` + r.pills.map((p) => `${p.x},${p.o},${p.tf === "none" ? "-" : "T"}`).join(";");
      if (key !== prev) { out.push(r); prev = key; }
    }
    return out;
  }, from);
  console.log(`\n===== ${tag}（${rows.length} 个变化帧）=====`);
  for (const r of rows) {
    const ps = r.pills.map((p) => `x=${p.x} w=${p.w} o=${p.o} ${p.tf === "none" ? "" : p.tf}`).join(" || ");
    console.log(`t=${String(r.t).padStart(5)}ms n=${r.n} active=[${r.act}] ${ps}`);
  }
}

// ── ① 基线：慢速切换 ──
const b0 = await page.evaluate(() => window.__samples.length);
await btn("天气").click();
await page.waitForTimeout(800);
await btn("待办").click();
await page.waitForTimeout(900);
await dump("① 基线：天气→待办（800ms 间隔）", b0);

// 关闭面板，回 null 态
await btn("待办").click();
await page.waitForTimeout(700);

// ── ② 快速连点 ──
const b1 = await page.evaluate(() => window.__samples.length);
await btn("天气").click();
await page.waitForTimeout(350);
for (let i = 0; i < 6; i++) {
  await btn(i % 2 === 0 ? "待办" : "天气").click();
  await page.waitForTimeout(110);
}
await page.waitForTimeout(900);
await dump("② 快速连点：开面板 350ms 后 6 连点（110ms 间隔）", b1);

await browser.close();
