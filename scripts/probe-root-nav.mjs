// 根路径导航拦截对照实验：goto vs reload vs 二次 goto
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync } from "child_process";
import { mkdirSync, rmSync } from "fs";

const ROOT = "/tmp/ext-v845";
const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launchPersistentContext("/tmp/ext-v845-profile-fresh", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--disable-gpu", "--no-sandbox"],
});
process.on("exit", () => { try { browser.close(); } catch { } });

const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("  [console-err]", m.text().slice(0, 120)); });

console.log("== 1) 常规进壳（注册 SW） ==");
await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 15000 });
await sleep(1500);
const sw = await page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  return regs.map((r) => ({ scope: r.scope.split("/").pop() || "/", active: r.active && r.active.state }));
});
console.log("SW:", JSON.stringify(sw));

console.log("== 2) goto 根路径（新导航） ==");
try {
  await page.goto(EXT_URL("__cssnap/probe-x"), { waitUntil: "load", timeout: 8000 });
  const body = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 40) : "NO-BODY");
  console.log("goto-subpath OK url=", page.url().slice(-22), "body=", body);
} catch (e) { console.log("goto FAIL:", String(e.message).split("\n")[0]); }

console.log("== 3) reload（在根路径上） ==");
try {
  await page.reload({ waitUntil: "load", timeout: 8000 });
  console.log("reload OK url=", page.url(), "frame=", await page.evaluate(() => !!document.getElementById("csShellFrame")));
} catch (e) { console.log("reload FAIL:", String(e.message).split("\n")[0]); }

console.log("== 4) 二次 goto 根路径 ==");
try {
  await page.goto(EXT_URL("__cssnap/probe-x2"), { waitUntil: "load", timeout: 8000 });
  const body2 = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 40) : "NO-BODY");
  console.log("goto2-subpath OK body=", body2);
} catch (e) { console.log("goto2 FAIL:", String(e.message).split("\n")[0]); }

console.log("== 5) SW fetch 计数探针（拦截是否发生） ==");
// 在 SW 里塞个标志：根导航被拦时 respondWith 前打点。SW 无法直接改——改用 clients 消息太重，
// 直接看行为差异即可。
await sleep(300);
process.exit(0);
