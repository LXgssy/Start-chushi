// T9 终局对照：同一份极简 HTML，一个是沙箱特权路径，一个不是
//   E1 覆写 IDB 99.0.0::sandbox.html = 极简页；goto /cs-snap/sandbox.html（沙箱特权）
//   E2 同内容写入 99.0.0::plain.html；goto /cs-snap/plain.html（无特权）
import { chromium } from "playwright-core";
import crypto from "crypto";

const ROOT = "/tmp/ext-v845";
const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TINY = "<!DOCTYPE html><html><head><title>SBX</title></head><body><h1 id=\"t\">TINY-SBX</h1></body></html>";

const browser = await chromium.launchPersistentContext("/tmp/ext-v845-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--disable-gpu", "--no-sandbox"],
});
process.on("exit", () => { try { browser.close(); } catch { } });

const page = await browser.newPage();
await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 15000 });
await sleep(600);

// 覆写两份极简内容进 IDB
const seed = await page.evaluate(async (tiny) => {
  const db = await new Promise((resolve, reject) => {
    const rq = indexedDB.open("chushi-snap", 1);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(new TextEncoder().encode(tiny).buffer, "99.0.0::sandbox.html");
    tx.objectStore("files").put(new TextEncoder().encode(tiny).buffer, "99.0.0::plain.html");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return true;
}, TINY);
console.log("seed:", seed);

// E1 沙箱特权路径
const p1 = await browser.newPage();
try {
  await p1.goto(EXT_URL("cs-snap/sandbox.html"), { waitUntil: "load", timeout: 6000 });
  console.log("E1 沙箱特权 goto: OK", await p1.evaluate(() => document.getElementById("t") && document.getElementById("t").innerText));
} catch (e) { console.log("E1 沙箱特权 goto: FAIL", String(e.message).split("\n")[0].slice(0, 60)); }

// E2 无特权路径
const p2 = await browser.newPage();
try {
  await p2.goto(EXT_URL("cs-snap/plain.html"), { waitUntil: "load", timeout: 6000 });
  console.log("E2 无特权 goto: OK", await p2.evaluate(() => document.getElementById("t") && document.getElementById("t").innerText));
} catch (e) { console.log("E2 无特权 goto: FAIL", String(e.message).split("\n")[0].slice(0, 60)); }

process.exit(0);
