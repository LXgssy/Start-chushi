// 复现 verify-v12 序列：装液态玻璃 → 拖拽导入倒数日 → Escape → 右键
import { chromium } from "playwright-core";
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 160)));

await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);

// 导入液态玻璃（粘贴）
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(500);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2000);

// 拖拽导入倒数日（与 verify 相同内联 dispatch）
const countdownJson = fs.readFileSync("/home/z/my-project/examples/倒数日预设.json", "utf8");
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(500);
await page.evaluate(async (json) => {
  const dt = new DataTransfer();
  dt.items.add(new File([json], "倒数日预设.json", { type: "application/json" }));
  const target = document.querySelector('textarea[placeholder*="拖入"]').closest("div");
  for (const type of ["dragenter", "dragover", "drop"]) {
    target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
  }
  await new Promise((r) => setTimeout(r, 1200));
}, countdownJson);
console.log("after dragdrop, palette open:", await page.locator('[aria-label="指令面板"]').count());
await page.keyboard.press("Escape");
await page.waitForTimeout(600);

for (const [x, y] of [[640, 400], [640, 300], [900, 700]]) {
  await page.mouse.click(x, y, { button: "right" });
  await page.waitForTimeout(350);
  const n = await page.locator('[role="menu"]').count();
  console.log(`right-click @${x},${y}: menus=${n}`);
  if (n) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
}
await browser.close();
