// ⌘K 玻璃卡 canvas 调试探针
import { chromium } from "playwright-core";
import fs from "node:fs";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox", "--use-gl=angle", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on("console", (m) => logs.push(m.type() + ":" + m.text().slice(0, 160)));
page.on("pageerror", (e) => logs.push("PAGEERROR:" + e.message.slice(0, 200)));

await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);

/* 导入液态玻璃预设 */
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2500);

/* 关 ⌘K 再开，检查玻璃卡标记/canvas/降级样式 */
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.keyboard.press("Control+k");
await page.waitForTimeout(1200);
const dbg = await page.evaluate(() => {
  const card = document.querySelector(".glass-card");
  const css = [...document.querySelectorAll("[data-fx-mount]")].map((m) => m.dataset.fxMount);
  return {
    cardExists: !!card,
    fxMark: card ? card.dataset.fx : null,
    canvas: card ? card.querySelectorAll("canvas").length : 0,
    canvasFirst: card ? (card.querySelector("canvas") ? card.querySelector("canvas").width : -1) : -1,
    mounts: css,
    allCanvas: document.querySelectorAll("canvas.chushi-fx-canvas").length,
  };
});
console.log("⌘K 卡调试:", JSON.stringify(dbg, null, 1));
console.log("页面日志:", logs.slice(-8).join("\n"));

/* 关键：等更久（快照→attach 链路多跳 postMessage） */
await page.waitForTimeout(2500);
const dbg2 = await page.evaluate(() => {
  const card = document.querySelector(".glass-card");
  return {
    canvas: card ? card.querySelectorAll("canvas").length : 0,
    w: card && card.querySelector("canvas") ? card.querySelector("canvas").width : -1,
  };
});
console.log("再等 2.5s:", JSON.stringify(dbg2));

await page.screenshot({ path: "/home/z/my-project/scripts/pw-lab/shots/dbg-cmdk.png" });
await browser.close();
