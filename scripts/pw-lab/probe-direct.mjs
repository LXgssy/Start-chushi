/* 取证3：直接导航 index.html，弱网下 load 事件是否发 + 哪个资源 in-flight */
import { chromium } from "playwright";
import { createHash } from "crypto";
const EXT = "/tmp/ext-stage";
const extId = createHash("sha256").update(EXT).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");

async function trial(tag, poor) {
  const ctx = await chromium.launchPersistentContext("/tmp/ext-v152-direct", {
    headless: true, channel: "chromium",
    args: [`--headless=new`, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  if (poor) await ctx.route(/^https?:\/\//, (r) => { void r; });
  const page = await ctx.newPage();
  const t0 = Date.now();
  let loadedAt = -1;
  page.on("load", () => { loadedAt = Date.now() - t0; });
  await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "commit", timeout: 20000 });
  for (let i = 0; i < 130; i++) {
    if (loadedAt > 0) break;
    await page.waitForTimeout(100);
  }
  const info = await page.evaluate(() => {
    const res = performance.getEntriesByType("resource");
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      rs: document.readyState,
      loadEnd: nav ? Math.round(nav.loadEventEnd) : -1,
      pend: res.filter((r) => r.responseEnd === 0).map((r) => r.name.slice(0, 80)),
      doneTail: res.filter((r) => r.responseEnd > 0).slice(-6).map((r) => Math.round(r.duration) + "ms " + r.name.slice(0, 70)),
    };
  }).catch((e) => ({ err: String(e).slice(0, 80) }));
  console.log(`[${tag}] loadAt=${loadedAt}ms`, JSON.stringify(info));
  await ctx.close();
}
await trial("poor", true);
await trial("normal", false);
