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
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
/* 采样 rAF 心跳 + 按压状态 */
await page.evaluate(() => {
  window.__rafCount = 0;
  const tick = () => { window.__rafCount++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const cmdk = await page.locator('nav[aria-label="快捷操作"] button[aria-label="指令 ⌘K"]').boundingBox();
await page.mouse.move(cmdk.x + cmdk.width / 2, cmdk.y + cmdk.height / 2);
await page.mouse.down();
await page.waitForTimeout(160);
await page.mouse.up();
const samples = [];
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(300);
  samples.push(await page.evaluate(() => {
    const b = [...document.querySelectorAll('nav button')].find((x) => x.getAttribute("aria-label") === "指令 ⌘K");
    return {
      raf: window.__rafCount,
      tf: (b.style.transform || "").slice(0, 44),
      press: b.hasAttribute("data-lg-press"),
      p: b.style.getPropertyValue("--press-p"),
    };
  }));
}
console.log(samples.map((s, i) => `${(i + 1) * 0.3}s raf=${s.raf} press=${s.press} p=${s.p} tf=${s.tf}`).join("\n"));
await browser.close();
