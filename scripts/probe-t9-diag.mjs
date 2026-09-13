// T9 诊断：定位沙箱页超时层级
//   D1 fetch /cs-snap/sandbox.html（子资源路径）能否被 SW 服务
//   D2 顶层 goto /cs-snap/index.html（假快照，非沙箱）是否正常
//   D3 顶层 goto /cs-snap/sandbox.html（沙箱）——超时复现？
//   D4 iframe 嵌 /cs-snap/sandbox.html——沙箱特权 + 能否加载
import { chromium } from "playwright-core";
import crypto from "crypto";

const ROOT = "/tmp/ext-v845";
const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launchPersistentContext("/tmp/ext-v845-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--disable-gpu", "--no-sandbox"],
});
process.on("exit", () => { try { browser.close(); } catch { } });

// 前置：确保快照 meta 在场（沿用 v8.4.5 探针的 mock profile——其 meta 应已是 99）
const page = await browser.newPage();
await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 15000 });
await sleep(800);

const meta = await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const rq = indexedDB.open("chushi-snap", 1);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
  const v = await new Promise((resolve) => {
    const rq = db.transaction("kv", "readonly").objectStore("kv").get("meta");
    rq.onsuccess = () => resolve(rq.result || null);
  });
  db.close();
  return v;
});
console.log("pre-meta:", JSON.stringify(meta ? meta.v : null), "files:", meta ? meta.files.map((f) => f.p).join(",") : "-");

// D1 fetch 子资源路径
const d1 = await page.evaluate(async () => {
  try {
    const r = await fetch("/cs-snap/sandbox.html");
    const t = await r.text();
    return { status: r.status, head: t.slice(0, 60).replace(/\n/g, " ") };
  } catch (e) { return { err: String(e.message).slice(0, 60) }; }
});
console.log("D1 fetch sandbox.html:", JSON.stringify(d1));

// D2 顶层 goto 非沙箱假快照
const p2 = await browser.newPage();
try {
  await p2.goto(EXT_URL("cs-snap/index.html"), { waitUntil: "load", timeout: 8000 });
  console.log("D2 goto cs-snap/index.html: OK, snap99 =", await p2.evaluate(() => !!document.getElementById("snap-v99")));
} catch (e) { console.log("D2 goto cs-snap/index.html: FAIL", String(e.message).split("\n")[0].slice(0, 70)); }

// D3 顶层 goto 沙箱页
const p3 = await browser.newPage();
try {
  await p3.goto(EXT_URL("cs-snap/sandbox.html"), { waitUntil: "load", timeout: 8000 });
  console.log("D3 goto cs-snap/sandbox.html: OK");
} catch (e) { console.log("D3 goto cs-snap/sandbox.html: FAIL", String(e.message).split("\n")[0].slice(0, 70)); }

// D4 iframe 嵌沙箱页
try {
  await p2.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 8000 });
  await sleep(400);
  await p2.evaluate(() => {
    const f = document.createElement("iframe");
    f.id = "sbx"; f.src = "/cs-snap/sandbox.html";
    document.body.appendChild(f);
  });
  await sleep(1500);
  const fr = p2.frames().find((f) => f.url().includes("cs-snap/sandbox"));
  if (!fr) { console.log("D4 iframe: frame-not-found"); }
  else {
    const r4 = await fr.evaluate(() => {
      let ev = "eval-blocked";
      try { (0, eval)("1+1"); ev = "eval-ok"; } catch { }
      return { ev, origin: self.origin === "null" ? "null" : self.origin };
    });
    console.log("D4 iframe sandbox:", JSON.stringify(r4));
  }
} catch (e) { console.log("D4 FAIL:", String(e.message).split("\n")[0].slice(0, 70)); }

process.exit(0);
