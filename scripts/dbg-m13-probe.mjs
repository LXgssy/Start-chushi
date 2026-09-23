// debug：检查按钮存在性/预设注入/点击后面板状态
import { chromium } from "playwright-core";
import crypto from "crypto";
import { readFileSync } from "fs";

const ROOT = "/tmp/ext-beta";
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext("/tmp/v8711-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--no-sandbox"],
});
const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 });
let af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await sleep(4000);

const official = JSON.parse(readFileSync("/tmp/beta-wt/src/lib/startpage/official-presets.json", "utf8"));
await af.evaluate((raw) => {
  localStorage.setItem("start:presets", JSON.stringify([
    { id: "official-smtc-dbg", name: raw.name, installedAt: Date.now(), raw },
  ]));
}, JSON.parse(JSON.stringify({ ...official.presets[1].manifest, commands: [], links: [], dock: [] })));
await page.reload({ waitUntil: "load" });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 });
af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await sleep(4000);

const st1 = await af.evaluate(() => {
  const btns = [...document.querySelectorAll(".dock-btn")].map((b) => b.getAttribute("aria-label"));
  return {
    btns,
    presets: (localStorage.getItem("start:presets") || "").slice(0, 120),
    navExists: !!document.querySelector('nav[aria-label="快捷操作"]'),
  };
});
console.log("状态1:", JSON.stringify(st1, null, 1));

/* 点设置 → 等 400ms → 查面板 */
await af.evaluate(() => { [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "设置")?.click(); });
await sleep(400);
const st2 = await af.evaluate(() => ({
  glass: !!document.querySelector(".glass-card.cl-panel"),
  stage: !!document.querySelector(".cl-stage"),
  mask: !!document.querySelector(".fixed.inset-0.z-30"),
  dataActive: [...document.querySelectorAll(".dock-btn[data-active]")].map((b) => b.getAttribute("aria-label")),
}));
console.log("点设置后:", JSON.stringify(st2));

await ctx.close();
console.log("DONE");
