import { chromium } from "playwright-core";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox","--use-gl=angle","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("PAGEERR:", e.message.slice(0, 300)));
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

console.log("--- 基线：不开预设直接点设置 ---");
await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(900);
console.log("panel:", await page.evaluate(() => !!document.querySelector(".cl-panel")));
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

console.log("--- 导入预设后点设置 ---");
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(500);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2500);
console.log("palette still open:", await page.evaluate(() => !!document.querySelector("[data-cmdk-root]")));
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
console.log("palette after esc:", await page.evaluate(() => !!document.querySelector("[data-cmdk-root]")));
await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(900);
const st = await page.evaluate(() => ({
  panel: !!document.querySelector(".cl-panel"),
  panelTxt: document.querySelector(".cl-panel")?.innerText.slice(0, 300) || null,
  lgRoot: !!document.getElementById("chushi-lg-root"),
}));
console.log(JSON.stringify(st, null, 1));
await browser.close();
