// 云推启动链实战复现探针：
//   A) 装机态=v8.4.5 原始包（git 提交版，用户实机同物）→ 触发真实 ext-bg 更新器
//      （csSnapCheck 通道）→ 后台真下载镜像 v8.4.6 快照 → 提交 meta →
//      新开标签页 → 壳路由 /cs-snap/index.html → 抓卡点（SW 服务/资源/控制台）
//   B) 同浏览器开 https://lxgssy.github.io/Start-chushi/ → 抓网页版 404 面
import { chromium } from "playwright-core";

const EXT_DIR = "/tmp/repro/ext845";
const MIRROR = "https://lxgssy.github.io/Start-chushi";
const SHOTS = "/tmp/repro";

let pass = 0, fail = 0;
function gate(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  [PASS] ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail ? " — " + detail : ""}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext("/tmp/repro/profile", {
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  headless: false,
  args: [
    "--no-sandbox",
    `--disable-extensions-except=${EXT_DIR}`,
    `--load-extension=${EXT_DIR}`,
    "--force-device-scale-factor=1",
    "--disable-dev-shm-usage",
  ],
  viewport: { width: 1280, height: 800 },
});

/* —— 全局网络取证 —— */
const net404 = [];        // {url, status}
const netFail = [];       // {url, err}
const snapResp = [];      // {url, status, xsn}
ctx.on("page", (p) => {
  p.on("response", (r) => {
    const u = r.url();
    if (r.status() >= 400) net404.push({ url: u, status: r.status() });
    if (u.includes("/cs-snap/")) {
      const xs = r.headers()["x-chushi-snap"] || "";
      snapResp.push({ url: u, status: r.status(), xsn: xs });
    }
  });
  p.on("requestfailed", (r) => netFail.push({ url: r.url(), err: r.failure()?.errorText || "?" }));
  p.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 300)));
  p.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      console.log(`  [console.${m.type()}]`, m.text().slice(0, 240));
  });
});

console.log("== A0 等扩展后台 SW ==");
let EXTID = "";
for (let i = 0; i < 30 && !EXTID; i++) {
  for (const w of ctx.serviceWorkers()) {
    const m = (w.url() || "").match(/^chrome-extension:\/\/([^/]+)\//);
    if (m) { EXTID = `chrome-extension://${m[1]}`; break; }
  }
  if (!EXTID) {
    const w = await ctx.waitForEvent("serviceworker", { timeout: 2000 }).catch(() => null);
    if (w) {
      const m = (w.url() || "").match(/^chrome-extension:\/\/([^/]+)\//);
      if (m) EXTID = `chrome-extension://${m[1]}`;
    }
  }
}
gate("A0 扩展后台 SW 在场", !!EXTID, EXTID);
if (!EXTID) { console.log("VERDICT: extension-not-loaded"); process.exit(2); }

/* —— A1 本地直载（v8.4.5 内嵌版）—— */
console.log("== A1 新标签页：本地直载（无快照态） ==");
const page1 = await ctx.newPage();
await page1.goto(`${EXTID}/shell.html`, { waitUntil: "load" });
await page1.waitForTimeout(3000);
const bootGone1 = await page1.evaluate(() => !document.getElementById("csShellBoot"));
const hasUI1 = await page1.evaluate(() => !!document.querySelector('nav[aria-label="快捷操作"], [class*="clock"]'));
const frame1 = page1.frames().map((f) => f.url()).filter((u) => u !== "about:blank");
console.log("  frames:", frame1.join(" | "));
gate("A1a 壳遮罩已褪", bootGone1);
gate("A1b 本地版出 UI", hasUI1);

/* —— A2 触发真实更新器：写 csSnapCheck → ext-bg snapCheck 下载镜像快照 —— */
console.log("== A2 触发真实更新器（csSnapCheck 通道） ==");
await page1.evaluate(() => new Promise((r) => chrome.storage.local.set({ csSnapCheck: Date.now() }, r)));
let meta = null;
for (let i = 0; i < 120; i++) {
  await sleep(1000);
  meta = await page1.evaluate(() => new Promise((res) => {
    const rq = indexedDB.open("chushi-snap", 1);
    rq.onsuccess = () => {
      const db = rq.result;
      try {
        const tx = db.transaction("kv", "readonly");
        const g = tx.objectStore("kv").get("meta");
        g.onsuccess = () => { db.close(); res(g.result || null); };
        g.onerror = () => { db.close(); res(null); };
      } catch (e) { try { db.close(); } catch (_) {} res(null); }
    };
    rq.onerror = () => res(null);
  }));
  if (meta) break;
  if (i % 10 === 9) console.log(`  ...等待 meta ${i + 1}s`);
}
gate("A2 快照 meta 已提交", !!meta, meta ? `v=${meta.v} files=${(meta.files || []).length}` : "120s 内无 meta（更新器未落库）");
if (meta) console.log("  meta:", JSON.stringify(meta).slice(0, 200));

/* —— A3 新开标签页：壳路由 → 快照 —— */
console.log("== A3 新开标签页（快照路由态） ==");
net404.length = 0; netFail.length = 0; snapResp.length = 0;
const page2 = await ctx.newPage();
await page2.goto(`${EXTID}/shell.html`, { waitUntil: "load" });
let snapFrame = null, frameUrl = "", booted = false;
for (let i = 0; i < 30; i++) {
  await sleep(500);
  snapFrame = page2.frames().find((f) => f.url().includes("/cs-snap/")) || null;
  frameUrl = snapFrame ? snapFrame.url() : "";
  if (snapFrame) {
    try {
      const st = await snapFrame.evaluate(() => ({
        ready: document.readyState,
        hasNav: !!document.querySelector('nav[aria-label="快捷操作"]'),
        pulse: !!document.querySelector(".pulse-dot"),
        scripts: document.scripts.length,
      }));
      if (st.hasNav) { booted = true; break; }
      if (i === 29) console.log("  快照帧末态:", JSON.stringify(st));
    } catch (e) { /* 帧 transient */ }
  }
}
const bootStill = await page2.evaluate(() => {
  const b = document.getElementById("csShellBoot");
  return b ? getComputedStyle(b).opacity : "removed";
}).catch(() => "?");
console.log("  快照帧:", frameUrl || "(无 cs-snap 帧)");
console.log("  壳遮罩 opacity:", bootStill);
console.log("  cs-snap 响应数:", snapResp.length, "样例:", JSON.stringify(snapResp.slice(0, 4)));
gate("A3a iframe 指向 /cs-snap/", !!snapFrame);
gate("A3b 快照导航有响应", snapResp.some((r) => r.url.includes("cs-snap/index.html")), JSON.stringify(snapResp.find((r) => r.url.includes("index.html")) || {}));
gate("A3c 快照版出 UI", booted);
await page2.screenshot({ path: `${SHOTS}/ext-snapshot-state.png` });

/* —— A4 快照态取证补充 —— */
if (snapFrame) {
  try {
    const diag = await snapFrame.evaluate(async () => {
      const out = { readyState: document.readyState, nav: !!document.querySelector("nav"), pulse: !!document.querySelector(".pulse-dot") };
      try {
        const r = await fetch("/cs-snap/index.html", { cache: "no-store" });
        out.selfFetch = { status: r.status, xsn: r.headers.get("x-chushi-snap") || "" };
      } catch (e) { out.selfFetch = String(e).slice(0, 120); }
      return out;
    });
    console.log("  快照帧深诊:", JSON.stringify(diag));
  } catch (e) { console.log("  快照帧深诊失败:", String(e).slice(0, 150)); }
}
const regs = await page2.evaluate(() => navigator.serviceWorker.getRegistrations().then((rs) => rs.map((r) => ({ scope: r.scope, state: (r.active || r.waiting || r.installing || {}).state }))));
console.log("  页面 SW 注册:", JSON.stringify(regs));
console.log("  A3 期 404 面:", JSON.stringify(net404.slice(0, 10)));
console.log("  A3 期失败面:", JSON.stringify(netFail.slice(0, 10)));

/* —— B 网页版 —— */
console.log("== B 网页版 github.io/Start-chushi ==");
net404.length = 0; netFail.length = 0;
const page3 = await ctx.newPage();
await page3.goto(`${MIRROR}/`, { waitUntil: "load", timeout: 30000 }).catch((e) => console.log("  goto:", String(e).slice(0, 120)));
await page3.waitForTimeout(10000);
const webDiag = await page3.evaluate(() => ({
  title: document.title,
  hasNav: !!document.querySelector('nav[aria-label="快捷操作"]'),
  pulse: !!document.querySelector(".pulse-dot"),
  bodyLen: document.body ? document.body.innerHTML.length : 0,
})).catch((e) => ({ err: String(e).slice(0, 150) }));
console.log("  网页版态:", JSON.stringify(webDiag));
const w404 = net404.filter((x) => !x.url.startsWith("chrome-extension"));
console.log("  网页版 404 面（前 12）:", JSON.stringify(w404.slice(0, 12)));
console.log("  网页版 404 总数:", w404.length);
gate("B1 主文档 200", !w404.some((x) => x.url.replace(/\/$/, "") === MIRROR));
gate("B2 静态资源 404=0（绝对路径病）", w404.length === 0, `404 数=${w404.length}`);
gate("B3 网页版出 UI", !!webDiag.hasNav);
await page3.screenshot({ path: `${SHOTS}/web-broken-state.png` });

console.log(`\n== VERDICT == pass=${pass} fail=${fail}`);
await ctx.close();
process.exit(fail ? 1 : 0);
