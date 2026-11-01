/* 取证2：iframe navigation timing 全量 + readyState 演化 */
import { chromium } from "playwright";
import { createHash } from "crypto";
const EXT = "/tmp/ext-stage";
const extId = createHash("sha256").update(EXT).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const ctx = await chromium.launchPersistentContext("/tmp/ext-v152-nav", {
  headless: true, channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await ctx.route(/^https?:\/\//, () => {});
const seed = await ctx.newPage();
await seed.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
await seed.evaluate(() => {
  localStorage.setItem("start:settings", JSON.stringify({ background: "photo", photoId: "mist-lake", themeMode: "dark" }));
});
await seed.close();
const shell = await ctx.newPage();
await shell.goto(`chrome-extension://${extId}/shell.html`, { waitUntil: "commit", timeout: 20000 });
const samples = [];
for (let i = 0; i < 14; i++) {
  const s = await shell.evaluate(() => {
    const f = document.getElementById("csShellFrame");
    try {
      const w = f.contentWindow, d = f.contentDocument;
      const nav = w.performance.getEntriesByType("navigation")[0];
      const res = w.performance.getEntriesByType("resource");
      return {
        t: Date.now(),
        rs: d.readyState, src: f.getAttribute("src"), src: f.getAttribute("src"), src: f.getAttribute("src"), src: f.getAttribute("src"),
        i: nav ? Math.round(nav.domInteractive) : -1,
        dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : -1,
        load: nav ? Math.round(nav.loadEventEnd) : -1,
        nres: res.length,
        pend: res.filter((r) => r.responseEnd === 0).map((r) => r.name.slice(0, 70)),
      };
    } catch (e) { return { t: Date.now(), rs: "no-doc/" + String(e).slice(0, 40) }; }
  }).catch(() => null);
  if (s) samples.push(s);
  if (s && s.load > 0) break;
  await shell.waitForTimeout(700);
}
for (const s of samples) console.log(JSON.stringify(s));
await ctx.close();
