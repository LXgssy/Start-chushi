import { chromium } from "playwright-core";
import crypto from "crypto";
import { readFileSync } from "fs";
const ROOT = "/tmp/ext-beta";
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const ctx = await chromium.launchPersistentContext("/tmp/v8711-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, "--no-first-run", "--no-sandbox"],
});
const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`chrome-extension://${EXT_ID}/shell.html`, { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 });
const af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await new Promise((r) => setTimeout(r, 4000));

const official = JSON.parse(readFileSync("/tmp/beta-wt/src/lib/startpage/official-presets.json", "utf8"));
await af.evaluate((raw) => {
  localStorage.setItem("start:presets", JSON.stringify([
    { id: "official-smtc-v13", name: raw.name, installedAt: Date.now(), raw },
  ]));
}, JSON.parse(JSON.stringify({ ...official.presets[1].manifest, commands: [], links: [], dock: [] })));
await page.reload({ waitUntil: "load" });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 });
const af2 = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await af2.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await new Promise((r) => setTimeout(r, 4000));

/* 同 evaluate：click + 高频采样 pill（headless 默认帧率） */
const rows = await af2.evaluate(`(function() {
  [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "音乐")?.click();
  const pill = () => document.querySelector('nav[aria-label="快捷操作"] > span.pointer-events-none');
  return new Promise((resolve) => {
    const t0 = performance.now();
    const rows = [];
    const tick = () => {
      const p = pill();
      const t = Math.round(performance.now() - t0);
      rows.push({ t, has: !!p, tf: p ? getComputedStyle(p).transform.slice(0, 40) : "", op: p ? getComputedStyle(p).opacity : "" });
      if (t < 700) requestAnimationFrame(tick);
      else resolve(rows);
    };
    requestAnimationFrame(tick);
  });
})()`);
console.log(rows.slice(0, 20).map((r) => JSON.stringify(r)).join("\n"));
console.log("...共", rows.length, "帧; scale<0.95 帧数:", rows.filter((r) => /matrix\(0\.9[0-4]|matrix\(0\.[0-8]/.test(r.tf)).length);
await ctx.close();
