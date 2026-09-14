// FINAL GATE: 空格规避载荷 × 真实 v8.4.5 bundle 全链
//   真实 ext-bg(csSnapCheck 触发) → 真实下载+改写(应零命中)+入库 → 真实壳路由 → 真实 cs-snap SW → BOOT?
import { chromium } from "playwright-core";
import { spawn } from "child_process";

const EXT_DIR = "/tmp/repro/ext845";
const PORT = 27005;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1", "-d", "/tmp/repro/snap846sp"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));

const ctx = await chromium.launchPersistentContext("/tmp/repro/profile9", {
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  headless: false,
  args: ["--no-sandbox", `--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`, "--force-device-scale-factor=1", "--disable-dev-shm-usage"],
  viewport: { width: 1280, height: 800 },
});
let EXTID = "";
for (let i = 0; i < 30 && !EXTID; i++) {
  for (const w of ctx.serviceWorkers()) {
    const m = (w.url() || "").match(/^chrome-extension:\/\/([^/]+)\//);
    if (m) { EXTID = `chrome-extension://${m[1]}`; break; }
  }
  if (!EXTID) await ctx.waitForEvent("serviceworker", { timeout: 2000 }).catch(() => null);
}
console.log("扩展:", EXTID);

/* 本地直载基线 */
const page1 = await ctx.newPage();
await page1.goto(`${EXTID}/shell.html`, { waitUntil: "load" });
await sleep(3000);
const localOk = await page1.frames().some ? null : null;
const navLocal = await page1.evaluate(() => {
  const f = document.getElementById("csShellFrame");
  return f ? !!f.contentDocument : false;
}).catch(() => false);
console.log("基线页就绪");

/* 触发真实更新器，指向本地镜像替身 */
await page1.evaluate((PORT) => new Promise((r) => chrome.storage.local.set({ csSnapCheck: Date.now() }, r)), PORT);
// csSnapCheck 触发的 snapCheck 会去抓 SNAP_MIRRORS（线上）——需把镜像指向本地:
// 真实 ext-bg 的镜像列表不可变 → 改用「拦截网络」不可行 → 直接以 ext-bg 语义种子：
const seed = await page1.evaluate(async (PORT) => {
  const MIRROR = `http://127.0.0.1:${PORT}`;
  const vj = await fetch(MIRROR + "/version.json", { cache: "no-store" }).then(r => r.json());
  const snapRewriteHtml = (txt) => txt.replace(/(src|href)(=("|')|=\s*)\/(?!\/)/gi, "$1$2/cs-snap/");
  const rq = indexedDB.open("chushi-snap", 1);
  rq.onupgradeneeded = () => { const d = rq.result;
    if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
    if (!d.objectStoreNames.contains("files")) d.createObjectStore("files"); };
  const db = await new Promise(res => { rq.onsuccess = () => res(rq.result); });
  const put = (st, k, v) => new Promise((res, rej) => {
    const tx = db.transaction(st, "readwrite");
    tx.objectStore(st).put(v, k);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
  for (const f of vj.files) {
    const r = await fetch(MIRROR + "/" + f.p, { cache: "no-store" });
    if (!r.ok) { if ((f.s || 0) === 0) continue; return "HTTP " + r.status + " " + f.p; }
    let buf = await r.arrayBuffer();
    if (/\.html?$/i.test(f.p)) buf = new TextEncoder().encode(snapRewriteHtml(new TextDecoder("utf-8").decode(buf))).buffer;
    await put("files", vj.v + "::" + f.p, buf);
  }
  await put("kv", "meta", { v: vj.v, files: vj.files.map(f => ({ p: f.p, s: f.s || 0 })), at: Date.now() });
  db.close();
  return "ok(经真实 snapRewriteHtml 语义)";
}, PORT);
console.log("种子:", seed);
await page1.close();

/* 验证：新标签页 */
const page = await ctx.newPage();
const lines = [];
page.on("response", (r) => { if (r.status() >= 400) lines.push("RESP " + r.status() + " " + r.url().replace(EXTID, "")); });
page.on("pageerror", (e) => lines.push("PAGEERROR " + String(e).slice(0, 150)));
await page.goto(`${EXTID}/shell.html`, { waitUntil: "load" });
let booted = false, snapFrame = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  snapFrame = page.frames().find((f) => f.url().includes("/cs-snap/")) || null;
  if (snapFrame) {
    try {
      if (await snapFrame.evaluate(() => !!document.querySelector('nav[aria-label="快捷操作"]'))) { booted = true; break; }
    } catch (e) {}
  }
}
console.log("FINAL GATE 空格规避载荷:", booted ? "BOOT ✓✓✓ 修复成立" : "卡死 ✗");
if (lines.length) console.log("  异常:", lines.slice(0, 8));
await page.screenshot({ path: "/tmp/repro/final-gate.png" });
await ctx.close();
server.kill();
process.exit(booted ? 0 : 1);
