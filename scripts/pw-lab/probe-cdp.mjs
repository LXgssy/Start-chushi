/* 取证6（终极）：CDP 网络层 —— requestWillBeSent vs loadingFinished/Failed 差分 */
import { chromium } from "playwright";
import { createHash } from "crypto";
const EXT = "/tmp/ext-stage";
const extId = createHash("sha256").update(EXT).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const ctx = await chromium.launchPersistentContext("/tmp/ext-v152-cdp", {
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
const cdp = await ctx.newCDPSession(shell);
await cdp.send("Network.enable");
const sent = new Map(), done = new Set();
cdp.on("Network.requestWillBeSent", (e) => {
  const u = e.request.url;
  sent.set(e.requestId, { u: u.slice(0, 100), doc: e.documentURL?.slice(-20), t: Date.now(), type: e.type });
});
cdp.on("Network.loadingFinished", (e) => done.add(e.requestId));
cdp.on("Network.loadingFailed", (e) => done.add(e.requestId + ":fail(" + e.errorText + ")"));
const t0 = Date.now();
await shell.goto(`chrome-extension://${extId}/shell.html`, { waitUntil: "commit", timeout: 20000 });
await shell.waitForTimeout(4000);
const hung = [];
for (const [id, r] of sent) {
  if (!done.has(id) && !done.has(id + ":fail(canceled)")) hung.push({ at: r.t - t0, type: r.type, doc: r.doc, u: r.u });
  if (String(done.values()).includes && done.has(id + ":fail")) {}
}
console.log("HUNG requests (sent, no finish/fail):");
for (const h of hung) console.log(`  +${h.at}ms type=${h.type} doc=…${h.doc} ${h.u}`);
const finished = [...sent.values()].filter((_, i) => done.has([...sent.keys()][i]));
console.log("total sent:", sent.size, "finished/failed:", [...done].length);
await ctx.close();
