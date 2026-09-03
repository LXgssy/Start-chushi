import { chromium } from "playwright-core";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox","--use-gl=angle","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("PAGEERR:", e.message.slice(0,120)));
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
await page.waitForTimeout(600);
const dbg = await page.evaluate(async () => {
  const cv = document.querySelector(".search-pill > .lg-ov");
  if (!cv) return { err: "no canvas" };
  await new Promise((r) => setTimeout(r, 500));
  const ctx = cv.getContext("2d");
  const w = cv.width, h = cv.height;
  const mid = ctx.getImageData(0, Math.floor(h/2), w, 1).data;
  const row = [];
  for (let x = 0; x < w; x += Math.floor(w/12)) row.push(mid[x*4+3]);
  const col = [];
  const midc = ctx.getImageData(Math.floor(w/2), 0, 1, h).data;
  for (let y = 0; y < h; y += Math.max(1, Math.floor(h/10))) col.push(midc[y*4+3]);
  return { w, h, rowAlpha: row, colAlpha: col, cfg: window.__chushiLG ? window.__chushiLG().cfg : null };
});
console.log(JSON.stringify(dbg, null, 1));
await browser.close();
