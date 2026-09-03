import { chromium } from "playwright-core";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox","--use-gl=angle","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => {
  window.__shaders = [];
  const orig = WebGLRenderingContext.prototype.shaderSource;
  WebGLRenderingContext.prototype.shaderSource = function (sh, src) {
    window.__shaders.push(String(src));
    return orig.call(this, sh, src);
  };
});
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
const r = await page.evaluate(() => {
  const ss = window.__shaders || [];
  const frag = ss.find((s) => s.includes("uRefractionHeight") && s.includes("void main"));
  return {
    count: ss.length,
    fragLen: frag ? frag.length : 0,
    hasBand: frag ? frag.includes("band") : false,
    bandSnippet: frag ? frag.slice(frag.indexOf("float band"), frag.indexOf("float band") + 260) : null,
  };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
