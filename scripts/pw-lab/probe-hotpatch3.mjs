// 探针三：读引擎调试状态 + 真实 glassEnable 是否发生过
import { chromium } from "playwright-core";
import fs from "node:fs";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 150)));

await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "null");
  if (s) {
    s.background = "photo";
    s.photoId = "daily";
    localStorage.setItem("start:settings", JSON.stringify(s));
  }
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1600);

await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(500);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2500);

const dbg1 = await page.evaluate(() => window.__chushiLG?.() ?? null);
console.log("engine after enable:", JSON.stringify(dbg1));

/* 直发 glassPatch（blur: 28） */
const key = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("start:preset-settings") || "{}"))[0] || null);
console.log("key:", key);
await page.evaluate((k) => {
  document.querySelector("iframe").contentWindow.postMessage(
    { type: "api", op: "glassPatch", scriptKey: k, gid: "p1", cfg: { blur: 28 } }, "*");
}, key);
await page.waitForTimeout(800);
const dbg2 = await page.evaluate(() => window.__chushiLG?.() ?? null);
console.log("engine after patch:", JSON.stringify(dbg2));
await browser.close();
