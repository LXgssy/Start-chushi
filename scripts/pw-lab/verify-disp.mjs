// 色散开关探针：开启后滤镜应含 feColorMatrix×3 + feComposite×2
import { chromium } from "playwright-core";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);

await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(500);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2200);

await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(800);
await page.locator('[role="switch"][aria-label="边缘色散"]').click();
await page.waitForTimeout(900);
const probe = await page.evaluate(() => {
  const filters = [...document.querySelectorAll("filter")];
  const f = filters.find((x) => x.querySelector("feDisplacementMap"));
  return {
    colorMatrices: f ? f.querySelectorAll("feColorMatrix").length : 0,
    composites: f ? f.querySelectorAll('feComposite[operator="arithmetic"]').length : 0,
    persist: (JSON.parse(localStorage.getItem("start:preset-settings") || "{}")),
  };
});
console.log("色散滤镜:", JSON.stringify(probe));
const on = probe.colorMatrices === 3 && probe.composites === 2;
console.log(on ? "✓ 色散三通道滤镜就位" : "✗ 色散滤镜未生效");
console.log("persist dispersion:", JSON.stringify(Object.values(probe.persist)[0]?.dispersion));
await page.screenshot({ path: "/home/z/my-project/scripts/pw-lab/shots/v12-7-dispersion.png" });
console.log("pageerror:", errors.length ? errors : "无");
await browser.close();
process.exit(on && errors.length === 0 ? 0 : 1);
