import { chromium } from "playwright-core";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox","--use-gl=angle","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { const t = m.text(); if (t.includes("[lg]")) console.log("CONSOLE:", t.slice(0,200)); });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "null");
  if (s) { s.background = "photo"; s.photoId = "daily"; localStorage.setItem("start:settings", JSON.stringify(s)); }
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(500);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2500);
await page.keyboard.press("Escape");
await page.waitForTimeout(800);
const p1 = await page.evaluate(() => {
  const p = window.__chushiLG();
  const img = document.querySelector("img[data-wallpaper]");
  let wpAvg = null;
  try {
    const t = document.createElement("canvas");
    t.width = 16; t.height = 16;
    const c = t.getContext("2d");
    c.drawImage(img, 0, 0, 16, 16);
    const d = c.getImageData(0, 0, 16, 16).data;
    let r=0,g=0,b=0;
    for (let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];}
    wpAvg = [r/256|0, g/256|0, b/256|0];
  } catch (e) { wpAvg = "tainted:" + String(e).slice(0,40); }
  const cv = document.querySelector(".search-pill > .lg-ov");
  const ctx = cv.getContext("2d");
  const c = ctx.getImageData(cv.width>>1, cv.height>>1, 1, 1).data;
  return { wpDbg: p.wpDbg, wpW: p.wpW, wpH: p.wpH, wallpaperAvg: wpAvg, imgSrc: (img?.currentSrc||"").slice(-50), canvasCenter: [c[0],c[1],c[2],c[3]] };
});
console.log("P1:", JSON.stringify(p1, null, 1));
/* 实验：折射高度 → 0（band 应使画布全透明） */
await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(800);
const hasSlider = await page.locator('input[type="range"][aria-label="折射高度"]').isVisible().catch(()=>false);
if (!hasSlider) { console.log("NO SLIDER — settings section missing!"); }
else {
  await page.locator('input[type="range"][aria-label="折射高度"]').evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, "0");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(1000);
  const p2 = await page.evaluate(() => {
    const cv = document.querySelector(".search-pill > .lg-ov");
    const ctx = cv.getContext("2d");
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let op = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] >= 8) op++;
    return { opaquePx: op, total: d.length/4 };
  });
  console.log("P2 height=0:", JSON.stringify(p2), "（预期 opaque≈0）");
}
await browser.close();
