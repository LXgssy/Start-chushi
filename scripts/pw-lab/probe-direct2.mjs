/* 消歧：直连 index.html + 掠影种子 + 全新 profile ×3 —— load 是否被 favicon 预载拖死 */
import { chromium } from "playwright";
import { createHash } from "crypto";
const EXT = "/tmp/ext-stage";
const extId = createHash("sha256").update(EXT).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
for (let n = 0; n < 3; n++) {
  const ctx = await chromium.launchPersistentContext(`/tmp/ext-v152-d2-${n}`, {
    headless: true, channel: "chromium",
    args: [`--headless=new`, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  await ctx.route(/^https?:\/\//, (r) => { void r; });
  const seed = await ctx.newPage();
  await seed.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await seed.evaluate(() => {
    localStorage.setItem("start:settings", JSON.stringify({ background: "photo", photoId: "mist-lake", themeMode: "dark" }));
  });
  await seed.close();
  const page = await ctx.newPage();
  const t0 = Date.now();
  let loadedAt = -1;
  page.on("load", () => { loadedAt = Date.now() - t0; });
  await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "commit", timeout: 20000 });
  for (let i = 0; i < 100; i++) { if (loadedAt > 0) break; await page.waitForTimeout(100); }
  console.log(`trial${n}: loadAt=${loadedAt}ms`);
  await ctx.close();
}
