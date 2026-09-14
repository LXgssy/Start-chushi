// v8.4.7 发版终验：
//   G1 新载荷×真实 8.4.5 壳全链（真实改写语义+真实路由+真实 cs-snap SW）→ BOOT
//   G2 载荷 HTML 免疫态自检（旧改写正则零命中）
//   W  网页版子路径冒烟（/Start-chushi/web/ 精确挂载）→ BOOT + 重定向检查
import { chromium } from "playwright-core";
import { spawn } from "child_process";
import { execSync } from "child_process";

const EXT_DIR = "/tmp/repro/ext845";
const PORT = 27010;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 准备载荷目录 */
execSync(`rm -rf /tmp/repro/v847 && mkdir -p /tmp/repro/v847 && cd /tmp/repro/v847 && unzip -qo /tmp/my-project/download/v8.4.7/ChuShi-CloudSnapshot-v8.4.7.zip && touch .nojekyll`);
const fs = await import("fs");
const idx = fs.readFileSync("/tmp/repro/v847/index.html", "utf-8");
const leak = (idx.match(/(src|href)="\/(?!\/)/g) || []).length;
const hasSpace = idx.includes('src ="');
const hasRedirect = idx.includes("lxgssy.github.io");
console.log(`G2 免疫态: 旧改写正则命中=${leak}（须 0）, 空格形态=${hasSpace}, 重定向=${hasRedirect}`);

/* web fixture: 精确挂载 /Start-chushi/web/ */
execSync(`rm -rf /tmp/repro/webfix && mkdir -p /tmp/repro/webfix/Start-chushi/web && cp -r /tmp/my-project/download/v8.4.7/web-export/* /tmp/repro/webfix/Start-chushi/web/`);
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1", "-d", "/tmp/repro/webfix"], { stdio: "ignore" });
const server2 = spawn("python3", ["-m", "http.server", String(PORT + 1), "--bind", "127.0.0.1", "-d", "/tmp/repro/v847"], { stdio: "ignore" });
await sleep(1200);

const ctx = await chromium.launchPersistentContext("/tmp/repro/profile10", {
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

/* G1: 种子（真实 ext-bg 语义）→ 新标签页 → BOOT */
{
  const page0 = await ctx.newPage();
  await page0.goto(`${EXTID}/shell.html`, { waitUntil: "load" });
  await sleep(1200);
  const seed = await page0.evaluate(async (PORT) => {
    const MIRROR = `http://127.0.0.1:${PORT + 1}`;
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
    return "ok";
  }, PORT);
  console.log("G1 种子:", seed);
  for (let i = 0; i < 2; i++) {
    const pw = await ctx.newPage();
    await pw.goto(`${EXTID}/shell.html`, { waitUntil: "load" });
    await sleep(3000);
    await pw.close();
  }
  await page0.close();
  const page = await ctx.newPage();
  const bad = [];
  page.on("response", (r) => { if (r.status() >= 400) bad.push(r.status() + " " + r.url().slice(-50)); });
  await page.goto(`${EXTID}/shell.html`, { waitUntil: "load" });
  let booted = false, snapFrame = null, meta = "";
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    snapFrame = page.frames().find((f) => f.url().includes("/cs-snap/")) || null;
    if (snapFrame) {
      try {
        if (await snapFrame.evaluate(() => !!document.querySelector('nav[aria-label="快捷操作"]'))) { booted = true; break; }
      } catch (e) {}
    }
  }
  try { meta = await snapFrame.evaluate(() => document.querySelector('meta[name="application-name"]') ? "有" : "无"); } catch (e) {}
  console.log(`G1 快照启动: ${booted ? "BOOT ✓✓✓" : "卡死 ✗"} 404数=${bad.length}`);
  if (bad.length) console.log("   ", bad.slice(0, 5));
  await page.screenshot({ path: "/tmp/repro/v847-g1.png" });
  await page.close();
}

/* W: 网页版冒烟 */
{
  const page = await ctx.newPage();
  const bad = [];
  page.on("response", (r) => { if (r.status() >= 400) bad.push(r.status() + " " + r.url().slice(-60)); });
  await page.goto(`http://127.0.0.1:${PORT}/Start-chushi/web/`, { waitUntil: "load" }).catch((e) => console.log("  goto:", String(e).slice(0, 80)));
  await sleep(8000);
  const st = await page.evaluate(() => ({
    nav: !!document.querySelector('nav[aria-label="快捷操作"]'),
    pulse: !!document.querySelector(".pulse-dot"),
  })).catch((e) => ({ err: String(e).slice(0, 80) }));
  console.log(`W 网页版: ${JSON.stringify(st)} 404数=${bad.length}`);
  if (bad.length) console.log("   ", bad.slice(0, 5));
  await page.screenshot({ path: "/tmp/repro/v847-web.png" });
  await page.close();
}

await ctx.close();
server.kill();
server2.kill();
