/* v8.6.21 hover 阴影错位实测：常驻磁贴 hover→移开，连拍抓帧对比阴影与磁贴相对位置 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3000";
const OUT = "/tmp/my-project/.shots-hover";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

await page.addInitScript(() => {
  const KEY = "start:settings";
  if (!localStorage.getItem(KEY)) {
    localStorage.setItem(KEY, JSON.stringify({ themeMode: "light", linksForm: "docked" }));
  }
});

await page.goto(BASE, { waitUntil: "load", timeout: 30000 }).catch(() => null);
await page.waitForTimeout(2500);

const tile = page.locator("[data-cl-tile]").first();
await tile.waitFor({ state: "visible", timeout: 8000 });
await page.waitForTimeout(1600); /* 等入场动画播完（introDone 之后） */

const box = await tile.boundingBox();
/* clip 磁贴周边区域（含阴影范围） */
const clip = { x: box.x - 40, y: box.y - 40, width: box.width + 120, height: box.height + 110 };

await tile.hover();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/t0-hover.png`, clip });

/* 移开并立即连拍 */
await page.mouse.move(640, 700, { steps: 2 });
const delays = [0, 80, 160, 260, 400, 700];
for (const d of delays) {
  const wait = d - (delays[delays.indexOf(d) - 1] ?? 0);
  if (wait > 0) await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/t${d}.png`, clip });
}
console.log("hover probe frames saved:", OUT);
await browser.close();
