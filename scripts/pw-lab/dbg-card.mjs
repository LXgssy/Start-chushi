// ⌘K 卡 canvas 专项：DOM 全貌 + 引擎状态
import { chromium } from "playwright-core";
import fs from "node:fs";

const LOG = "/home/z/my-project/scripts/pw-lab/dbg-log2.txt";
fs.writeFileSync(LOG, "");
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox", "--use-gl=angle", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => fs.appendFileSync(LOG, `[c] ${m.text()}\n`));
page.on("pageerror", (e) => fs.appendFileSync(LOG, `[err] ${e.message}\n`));

await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);

await page.evaluate(() => {
  window.__mlog = [];
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1 && (n.tagName === "CANVAS" || n.querySelector?.("canvas")))
          window.__mlog.push("+" + n.tagName + "@" + Date.now() % 100000);
      }
      for (const n of m.removedNodes) {
        if (n.nodeType === 1 && n.tagName === "CANVAS")
          window.__mlog.push("-CANVAS@" + Date.now() % 100000);
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
});
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2200);

// 关键场景：导入后不关面板，直接等卡片稳定（fx3 已标记）
const probe1 = await page.evaluate(() => {
  const card = document.querySelector(".glass-card");
  return {
    mark: card?.dataset.fx,
    canvas: card ? card.querySelectorAll("canvas").length : 0,
    firstChildTags: card ? [...card.children].map((c) => c.tagName + "." + (c.className || "").toString().slice(0, 24)).slice(0, 5) : [],
  };
});
fs.appendFileSync(LOG, `[t+2.2s 导入后] ${JSON.stringify(probe1)}\n`);

await page.keyboard.press("Escape");
await page.waitForTimeout(600);
await page.keyboard.press("Control+k");
await page.waitForTimeout(3000);
const probe2 = await page.evaluate(() => {
  const card = document.querySelector(".glass-card");
  const mounts = [...document.querySelectorAll("[data-fx-mount]")].map((m) => m.dataset.fxMount);
  return {
    mark: card?.dataset.fx,
    canvas: card ? card.querySelectorAll("canvas").length : 0,
    allCanvas: document.querySelectorAll("canvas.chushi-fx-canvas").length,
    mounts,
    cardChildren: card ? [...card.children].map((c) => c.tagName).slice(0, 6) : [],
  };
});
const mlog = await page.evaluate(() => window.__mlog);
fs.appendFileSync(LOG, `[mlog] ${JSON.stringify(mlog)}\n`);
fs.appendFileSync(LOG, `[重开后+3s] ${JSON.stringify(probe2)}\n`);
await browser.close();
console.log("done");
