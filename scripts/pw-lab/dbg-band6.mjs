import { chromium } from "playwright-core";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox","--use-gl=angle","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
const p = await page.evaluate(() => {
  const pr = window.__chushiLG();
  return { dbgGl: pr.dbgGl };
});
console.log("UNIFORMS:", JSON.stringify(p.dbgGl, null, 1));
/* 读 GL 画布自身像素 */
const glPix = await page.evaluate(() => {
  const gcv = window.__chushiLG().dbgGlCanvas;
  if (!gcv) return null;
  const t = document.createElement("canvas");
  t.width = gcv.width; t.height = gcv.height;
  const c = t.getContext("2d");
  c.drawImage(gcv, 0, 0);
  const d = c.getImageData(0, 0, t.width, t.height).data;
  const at = (x, y) => { const i = (y * t.width + x) * 4; return [d[i], d[i+1], d[i+2], d[i+3]]; };
  return { w: t.width, h: t.height, center: at(t.width>>1, t.height>>1), edge: at(2, t.height>>1) };
});
console.log("GLCANVAS:", JSON.stringify(glPix));
await browser.close();
