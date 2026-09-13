// 决胜实验：MV3 带 background SW 的真扩展里
//   X1) 页面能否注册【子路径作用域】SW 并拦截该作用域导航？
//   X2) background SW 自己加 fetch 监听能否拦截扩展页导航（根路径）？
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";

const ROOT = "/tmp/ext-v845"; // 已解包的真扩展
// X1 素材：子路径 SW + 注册页（探针启动前写入解包目录）
rmSync(ROOT + "/cs-snap", { recursive: true, force: true });
mkdirSync(ROOT + "/cs-snap", { recursive: true });
writeFileSync(ROOT + "/cs-snap/sw.js", `
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.pathname === "/cs-snap/virtual.html") {
    e.respondWith(new Response("<h1 id='synth'>SUBPATH-SERVED</h1>", { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  }
});
`);
writeFileSync(ROOT + "/cs-host.html", `<!DOCTYPE html><html><body><h1>host</h1><script src="cs-host.js"></script></body></html>`);
writeFileSync(ROOT + "/cs-host.js", `
window.__reg = async () => {
  try {
    const reg = await navigator.serviceWorker.register("cs-snap/sw.js", { scope: "/cs-snap/" });
    return { ok: true, scope: reg.scope };
  } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
};
`);

// X2 素材：给 ext-bg.js 追加 fetch 监听（仅根路径导航 respond）
const bgPath = ROOT + "/ext-bg.js";
let bg = readFileSync(bgPath, "utf-8");
bg = bg.replace('const SNAP_MIRRORS = ["https://lxgssy.github.io/Start-chushi"];',
  'const SNAP_MIRRORS = ["http://127.0.0.1:26991"];');
bg += `
self.addEventListener("fetch", (e) => {
  try {
    const u = new URL(e.request.url);
    if (e.request.mode === "navigate" && u.pathname === "/bgtest") {
      e.respondWith(new Response("<h1 id='bg'>BG-FETCH-INTERCEPTED</h1>", { headers: { "Content-Type": "text/html; charset=utf-8" } }));
    }
  } catch (_) {}
});
`;
writeFileSync(bgPath, bg);
console.log("stage: 测试素材写入解包目录");

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
console.log("stage: EXT_ID =", EXT_ID);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launchPersistentContext("/tmp/ext-x-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--disable-gpu", "--no-sandbox"],
});
process.on("exit", () => { try { browser.close(); } catch { } });

// X2：根路径导航 → bg SW 是否拦
const p1 = await browser.newPage();
try {
  await p1.goto(EXT_URL("bgtest"), { waitUntil: "load", timeout: 8000 });
  const bgHit = await p1.evaluate(() => !!document.getElementById("bg"));
  console.log("X2 bg-fetch 拦根导航:", bgHit ? "INTERCEPTED ✔" : "NOT-INTERCEPTED（404/错误页）");
} catch (e) { console.log("X2 bg-fetch 拦根导航: NAV-FAIL", String(e.message).split("\n")[0].slice(0, 80)); }

// X1：子路径 SW 注册 + 拦截
const p2 = await browser.newPage();
try {
  await p2.goto(EXT_URL("cs-host.html"), { waitUntil: "load", timeout: 8000 });
  const reg = await p2.evaluate(() => window.__reg());
  console.log("X1a 子路径 SW 注册:", JSON.stringify(reg));
  await sleep(800);
  const p3 = await browser.newPage();
  await p3.goto(EXT_URL("cs-snap/virtual.html"), { waitUntil: "load", timeout: 8000 });
  const synth = await p3.evaluate(() => !!document.getElementById("synth"));
  console.log("X1b 子路径导航拦截:", synth ? "INTERCEPTED ✔" : "NOT-INTERCEPTED");
  await p3.close();
} catch (e) { console.log("X1 FAIL:", String(e.message).split("\n")[0].slice(0, 90)); }
await p1.close();
await p2.close();
process.exit(0);
