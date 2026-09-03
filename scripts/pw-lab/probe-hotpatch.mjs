// 热调链路二分探针：直接在沙箱 iframe 调 chushi.glass.patch vs 设置面板 UI 改值
import { chromium } from "playwright-core";
import fs from "node:fs";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox", "--use-gl=angle", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 120)));

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

const checksum = () =>
  page.evaluate(() => {
    const cv = document.querySelector(".search-pill > .lg-ov");
    if (!cv) return null;
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    return s;
  });

/* 路径 A：沙箱 iframe 内直接 patch */
const frames = page.frames();
const sb = frames.find((f) => f.url().includes("sandbox.html"));
console.log("sandbox frame:", sb ? sb.url().split("?")[1] : "NOT FOUND");
const before = await checksum();
if (sb) {
  const r = await sb.evaluate(async () => {
    // 找到液态玻璃脚本 key：直接扫 chushi 全局？沙箱内 chushi 是按脚本的——尝试遍历
    // 简化：直接对 window 里注册的 glassApi 不可达；改从 settings push 侧验证。
    return "skip";
  });
}
/* 真实路径：开设置面板拖滑杆 */
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(900);
const inp = page.locator('input[type="range"][aria-label="模糊半径"]');
console.log("slider visible:", await inp.isVisible().catch(() => false));
const c0 = await checksum();
await inp.evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, "24");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(1500);
const c1 = await checksum();
console.log("checksum before:", c0, "after:", c1, "changed:", c0 !== c1);
/* 持久化值核对 */
const persisted = await page.evaluate(() => {
  const raw = localStorage.getItem("start:preset-settings");
  return raw ? raw.slice(0, 300) : "(none)";
});
console.log("persisted:", persisted);
await browser.close();
