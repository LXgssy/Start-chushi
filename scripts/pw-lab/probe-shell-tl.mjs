/* 取证4：壳内 iframe 生命周期全时间线（3 轮） */
import { chromium } from "playwright";
import { createHash } from "crypto";
const EXT = "/tmp/ext-stage";
const extId = createHash("sha256").update(EXT).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");

async function trial(tag) {
  const ctx = await chromium.launchPersistentContext("/tmp/ext-v152-tl-" + tag, {
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
  const shell = await ctx.newPage();
  const t0 = Date.now();
  await shell.goto(`chrome-extension://${extId}/shell.html`, { waitUntil: "commit", timeout: 20000 });
  const marks = [];
  for (let i = 0; i < 80; i++) {
    const s = await shell.evaluate(() => {
      const boot = !!document.getElementById("csShellBoot");
      const f = document.getElementById("csShellFrame");
      if (!f) return { boot, src: "no-frame" };
      let inner = null;
      try {
        const w = f.contentWindow, d = f.contentDocument;
        const nav = w.performance.getEntriesByType("navigation")[0];
        const res = w.performance.getEntriesByType("resource");
        inner = {
          rs: d.readyState,
          loadEnd: nav ? Math.round(nav.loadEventEnd) : -1,
          pend: res.filter((r) => r.responseEnd === 0).map((r) => r.name.slice(0, 60)),
        };
      } catch { inner = "x"; }
      return { boot, src: (f.getAttribute("src") || "").slice(0, 40), inner };
    }).catch(() => null);
    if (s) marks.push({ at: Date.now() - t0, ...s });
    if (s && s.boot === false) break;
    await shell.waitForTimeout(150);
  }
  const n = marks.length;
  console.log(`[${tag}] rounds=${n} last=${JSON.stringify(marks[n - 1])}`);
  for (const m of marks.filter((x, i2) => i2 < 3 || x.inner?.loadEnd > 0 || i2 > n - 3 || (typeof x.inner === "object" && x.inner?.pend?.length))) {
    console.log("   ", JSON.stringify(m));
  }
  await ctx.close();
}
await trial("a");
await trial("b");
