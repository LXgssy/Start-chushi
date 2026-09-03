// 折射视觉展示：辉光背景 + 折射强度热调对比截图
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/home/z/my-project/scripts/pw-lab/shots";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox", "--use-gl=angle", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// 导入液态玻璃预设
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.keyboard.press("Escape");
await page.waitForTimeout(2000);

// 打开设置面板（Dock 设置按钮）
await page.evaluate(() => {
  document.querySelector('.cl-dock [aria-label="设置"]')?.closest("button")?.click();
});
await page.waitForTimeout(900);

// 拉满折射强度（第 1 个滑杆 = 折射强度 0-300）
const slider = page.locator('.cl-panel input[type="range"]').first();
await slider.fill("300");
await page.evaluate(() => {
  const el = document.querySelector('.cl-panel input[type="range"]');
  el?.dispatchEvent(new Event("change", { bubbles: true }));
  el?.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.waitForTimeout(1200);

// 切浅色主题（设置面板主题切换）让折射更可辨
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.cl-panel button')];
  const light = btns.find((b) => /浅色|浅色模式/.test(b.textContent || ''));
  light?.click();
});
await page.waitForTimeout(1500);

// 关设置面板，全页截图（辉光背景 + 折射拉满）
await page.keyboard.press("Escape");
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + "/v13-refraction-max.png" });

// ⌘K 面板折射
await page.keyboard.press("Control+k");
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + "/v13-cmdk-max.png" });

await browser.close();
console.log("done");
