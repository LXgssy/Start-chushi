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
const dbg = await page.evaluate(() => {
  const cv = document.querySelector(".search-pill > .lg-ov");
  const ctx = cv.getContext("2d");
  const w = cv.width, h = cv.height;
  const c = ctx.getImageData(Math.floor(w/2), Math.floor(h/2), 1, 1).data;
  const corner = ctx.getImageData(1, 1, 1, 1).data;
  let transparent = 0, opaque = 0;
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) { if (d[i] < 8) transparent++; else opaque++; }
  return {
    center: [c[0], c[1], c[2], c[3]],
    corner: [corner[0], corner[1], corner[2], corner[3]],
    transparent, opaque,
    urlHead: cv.toDataURL("image/png").slice(0, 60),
  };
});
console.log(JSON.stringify(dbg, null, 1));
const png = await page.evaluate(() => document.querySelector(".search-pill > .lg-ov").toDataURL("image/png"));
fs.writeFileSync("/home/z/my-project/scripts/pw-lab/shots/dbg-pill-canvas.png", Buffer.from(png.split(",")[1], "base64"));
await browser.close();
