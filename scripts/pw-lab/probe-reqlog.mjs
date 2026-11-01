/* 取证5：请求日志差分 —— 壳上下文 vs 直连 */
import { chromium } from "playwright";
import { createHash } from "crypto";
const EXT = "/tmp/ext-stage";
const extId = createHash("sha256").update(EXT).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");

async function trial(tag, viaShell) {
  const ctx = await chromium.launchPersistentContext("/tmp/ext-v152-rl-" + tag, {
    headless: true, channel: "chromium",
    args: [`--headless=new`, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  await ctx.route(/^https?:\/\//, (r) => { void r; });
  const reqs = [];
  ctx.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith("chrome-extension://")) reqs.push({ at: Date.now(), f: r.frame()?.url().split("/").pop() || "?", u: u.slice(0, 80) });
  });
  const seed = await ctx.newPage();
  await seed.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await seed.evaluate(() => {
    localStorage.setItem("start:settings", JSON.stringify({ background: "photo", photoId: "mist-lake", themeMode: "dark" }));
  });
  await seed.close();
  const t0 = Date.now();
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/${viaShell ? "shell.html" : "index.html"}`, { waitUntil: "commit", timeout: 20000 });
  await page.waitForTimeout(3000);
  console.log(`[${tag}] viaShell=${viaShell}`);
  for (const r of reqs) console.log(`   +${r.at - t0}ms frame=${r.f} ${r.u}`);
  await ctx.close();
}
await trial("shell", true);
await trial("direct", false);
