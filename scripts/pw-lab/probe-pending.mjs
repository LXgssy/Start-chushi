/* 取证：弱网下 boot 7s 时 iframe 内 in-flight 资源清单 */
import { chromium } from "playwright";
import { createHash } from "crypto";
const EXT = "/tmp/ext-stage";
const extId = createHash("sha256").update(EXT).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const ctx = await chromium.launchPersistentContext("/tmp/ext-v152-pend", {
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
await shell.waitForTimeout(7000);
const info = await shell.evaluate(() => {
  const f = document.getElementById("csShellFrame");
  try {
    const d = f.contentDocument, w = f.contentWindow;
    const res = w.performance.getEntriesByType("resource").map((e) => ({
      n: e.name.slice(0, 90), pending: e.responseEnd === 0, dur: Math.round(e.duration),
    }));
    const nav = w.performance.getEntriesByType("navigation")[0];
    return {
      readyState: d.readyState,
      navLoadEventEnd: nav ? Math.round(nav.loadEventEnd) : -1,
      pending: res.filter((r) => r.pending),
      done: res.filter((r) => !r.pending).slice(0, 8),
    };
  } catch (e) { return { err: String(e).slice(0, 80) }; }
});
console.log(JSON.stringify(info, null, 1));
await ctx.close();
