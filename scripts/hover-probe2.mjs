/* v8.6.21 hover 阴影错位实测 v2：高清 2x，密集早期帧 */
import { chromium } from "playwright-core";
import { mkdirSync } from "fs";

const BASE = "http://localhost:3000";
const OUT = "/tmp/my-project/.shots-hover2";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
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
await page.waitForTimeout(1600);

const box = await tile.boundingBox();
const clip = { x: box.x - 24, y: box.y - 30, width: box.width + 80, height: box.height + 80 };

await tile.hover();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/h.png`, clip });

await page.mouse.move(640, 760, { steps: 2 });
const marks = [0, 30, 60, 100, 150, 200, 280, 380];
let last = 0;
for (const t of marks) {
  if (t - last > 0) await page.waitForTimeout(t - last);
  last = t;
  await page.screenshot({ path: `${OUT}/d${t}.png`, clip });
}
console.log("saved:", OUT);
await browser.close();
