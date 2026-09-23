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

// 实验A：函数 evaluate
const a = await af.evaluate(() => document.querySelectorAll(".dock-btn").length);
console.log("函数 evaluate dock-btn 数:", a);
// 实验B：字符串 evaluate
const b = await af.evaluate("document.querySelectorAll('.dock-btn').length");
console.log("字符串 evaluate dock-btn 数:", b);
// 实验C：字符串 IIFE
const c = await af.evaluate("(function(){ return document.querySelectorAll('.dock-btn').length; })()");
console.log("字符串 IIFE dock-btn 数:", c);
// 实验D：字符串带 const 定义
const d = await af.evaluate("const x = 1; document.querySelectorAll('.dock-btn').length + x;");
console.log("字符串 const+表达式:", d);
await ctx.close();
