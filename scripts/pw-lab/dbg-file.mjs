// 文件日志版调试：所有 console 输出落盘，绕开终端显示层
import { chromium } from "playwright-core";
import fs from "node:fs";

const LOG = "/home/z/my-project/scripts/pw-lab/dbg-log.txt";
fs.writeFileSync(LOG, "");

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox", "--use-gl=angle", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => fs.appendFileSync(LOG, `[console] ${m.text()}\n`));
page.on("pageerror", (e) => fs.appendFileSync(LOG, `[pageerror] ${e.message}\n`));

await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);

await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2500);

await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.keyboard.press("Control+k");
await page.waitForTimeout(12000);

const dbg = await page.evaluate(() => {
  const card = document.querySelector(".glass-card");
  const presets = JSON.parse(localStorage.getItem("start:presets") || "[]");
  return {
    allCanvas: document.querySelectorAll("canvas.chushi-fx-canvas").length,
    presets: presets.map((p) => ({
      name: p.name,
      codeLen: (p.raw && p.raw.scripts && p.raw.scripts[0] && p.raw.scripts[0].code || "").length,
      hasBootLog: (p.raw && p.raw.scripts && p.raw.scripts[0] && p.raw.scripts[0].code || "").includes("boot, codeLen"),
    })),
    frozen: localStorage.getItem("start:sandbox-frozen"),
    iframe: !!document.querySelector('iframe[title="初始沙箱"]'),
    mounts: [...document.querySelectorAll("[data-fx-mount]")].map((m) => m.dataset.fxMount),
    fxMarks: [...document.querySelectorAll("[data-fx]")].map((e) => e.dataset.fx),
  };
});
fs.appendFileSync(LOG, `[result] ${JSON.stringify(dbg)}\n`);
await browser.close();
console.log("done -> dbg-log.txt");
