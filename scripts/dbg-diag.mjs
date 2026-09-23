import { chromium } from "playwright-core";
import crypto from "crypto";
const ROOT = "/tmp/ext-beta";
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const ctx = await chromium.launchPersistentContext("/tmp/v8711-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, "--no-first-run", "--no-sandbox"],
});
const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 260)));
await page.goto(`chrome-extension://${EXT_ID}/shell.html`, { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 });
const af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await new Promise((r) => setTimeout(r, 5000));
const st = await af.evaluate(() => {
  const raw = localStorage.getItem("start:presets");
  let keys = [];
  try { keys = JSON.parse(raw || "[]").map((p) => ({ id: p.id, rawKeys: Object.keys(p.raw || {}) })); } catch (e) { keys = ["PARSE-ERR " + e]; }
  return { dockBtns: document.querySelectorAll(".dock-btn").length, bodyLen: document.body.children.length, presets: keys };
});
console.log(JSON.stringify(st, null, 1));
await ctx.close();
