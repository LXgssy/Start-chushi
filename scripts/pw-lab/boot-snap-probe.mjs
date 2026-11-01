/* 快照模式弱网探针 v2：种 IDB 快照（v8.7.152 假装云端新版）+ 网络壁纸设置，
   弱网（全 http(s) 挂起）观察 boot 遮罩。 */
import { chromium } from "playwright";
import { createHash } from "crypto";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const EXT = "/tmp/ext-stage";
const SNAPDIR = "/tmp/cloudsnap";
const SNAP_V = "8.7.152";
const extId = createHash("sha256").update(EXT).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");

function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, acc); else acc.push(p);
  }
  return acc;
}
const files = walk(SNAPDIR).map((p) => ({ rel: relative(SNAPDIR, p).split("?")[0], b64: readFileSync(p).toString("base64") }));
console.log("snapshot files:", files.length);

const ctx = await chromium.launchPersistentContext("/tmp/ext-probe-snap", {
  headless: true, channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
await ctx.route(/^https?:\/\//, () => { /* hang */ });

const seeder = await ctx.newPage();
await seeder.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
const CHUNK = 50;
for (let i = 0; i < files.length; i += CHUNK) {
  await seeder.evaluate(async (batch) => {
    const db = await new Promise((res, rej) => {
      const rq = indexedDB.open("chushi-snap", 1);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
        if (!d.objectStoreNames.contains("files")) d.createObjectStore("files");
      };
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
    await new Promise((res, rej) => {
      const tx = db.transaction("files", "readwrite");
      const st = tx.objectStore("files");
      for (const f of batch) st.put(Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0)).buffer, "8.7.152::" + f.rel);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }, files.slice(i, i + CHUNK));
  process.stdout.write(`\rseed ${Math.min(i + CHUNK, files.length)}/${files.length}`);
}
await seeder.evaluate(async (meta) => {
  const db = await new Promise((res) => { const rq = indexedDB.open("chushi-snap", 1); rq.onsuccess = () => res(rq.result); });
  await new Promise((res) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(meta, "meta"); tx.oncomplete = res; });
  localStorage.setItem("start:settings", JSON.stringify({
    background: "photo", wallpaperUrl: "https://example.com/hang-wallpaper.jpg", wallpaperRev: 3,
    accent: "#ff3b30", themeMode: "light",
  }));
}, { v: SNAP_V, files: files.map((f) => ({ p: f.rel, s: 0 })), at: Date.now() });
await seeder.close();
console.log("\n✓ 快照 IDB + settings 已种入");

const reqs = [];
ctx.on("request", (r) => { const u = r.url(); if (!u.startsWith("chrome-extension://")) reqs.push((r.isNavigationRequest() ? "NAV " : "GET ") + u.slice(0, 110)); });
const t0 = Date.now();
const shell = await ctx.newPage();
let bootGone = -1;
await shell.goto(`chrome-extension://${extId}/shell.html`, { waitUntil: "commit", timeout: 20000 });
for (let i = 0; i < 200; i++) {
  const has = await shell.evaluate(() => !!document.getElementById("csShellBoot")).catch(() => null);
  if (has === false) { bootGone = Date.now() - t0; break; }
  if (has === null) break;
  await shell.waitForTimeout(100);
}
await shell.waitForTimeout(3000);
const state = await shell.evaluate(() => {
  const f = document.getElementById("csShellFrame");
  let inner = null;
  try { inner = f?.contentDocument ? (f.contentDocument.body?.innerText || "").slice(0, 40) : "no-doc"; } catch { inner = "cross"; }
  return { boot: !!document.getElementById("csShellBoot"), src: f?.getAttribute("src"), inner };
}).catch((e) => ({ evalErr: String(e).slice(0, 100) }));
console.log(`SNAP+POOR: bootGoneMs=${bootGone}`, JSON.stringify(state));
console.log("non-ext requests:", reqs.length ? reqs.slice(0, 10) : "(zero)");
await ctx.close();
console.log("PROBE DONE");
