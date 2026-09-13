// v8.4.5 本地直载壳探针——用户三条指令的全链路取证
//
//   T1 本地直载：shell.html → iframe 指本地 index.html，app 渲染，无云端参与
//   T2 零云端请求：全程 lxgssy.github.io 请求计数 = 0（本地直载铁证）
//   T3 即时性：boot 遮罩淡出 < 2.5s（v8.4.4 是 10s 握手量级）
//   T4 开关同步：iframe 原生 chrome.storage 双向（页面→落库；壳→onChanged）
//   T5 地址栏收敛：replaceState 后 location = …/index.html（无参数无云端网址），
//      F5 落在自足应用顶层（index.html 真文件直载，绝无 404）
//   T6 快照 SW 在场（子路径作用域 cs-snap/，activated）
//   T7 快照端到端：本地镜像 mock version.json v99 → csSnapCheck 触发 →
//      IDB 原子提交 → 新标签页直载 /cs-snap/index.html + 子资源走 IDB
//   T8 永不降级：mock v1.0.0 → meta 仍 99
//   T9 快照沙箱特权：/cs-snap/sandbox.html 真身入载荷 → unsafe-eval 可用
//      （manifest sandbox.pages cs-snap/sandbox.html 生效）
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "fs";

const ROOT = "/tmp/ext-v845";
const ZIP = "/tmp/my-project/download/v8.4.5/ChuShi-NewTab-v8.4.5.zip";
const MOCK = "/tmp/v845-mock";
const PORT = 26991;

rmSync(ROOT, { recursive: true, force: true });
rmSync(MOCK, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(MOCK, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);
console.log("stage: 扩展解包 ->", ROOT);

// 探针镜像重定向：SNAP_MIRRORS 指向本地 http.server（确定性 mock）
const bgPath = ROOT + "/ext-bg.js";
const bg = readFileSync(bgPath, "utf-8");
writeFileSync(bgPath, bg.replace(
  'const SNAP_MIRRORS = ["https://lxgssy.github.io/Start-chushi"];',
  `const SNAP_MIRRORS = ["http://127.0.0.1:${PORT}"];`));
console.log("stage: SNAP_MIRRORS -> http://127.0.0.1:" + PORT);

// mock 载荷 v99：假 index.html + mark.js（子资源取证）+ 真身 sandbox.html（沙箱特权取证）
const fakeHtml = `<!DOCTYPE html><html><head><title>SNAP99</title></head><body><h1 id="snap-v99">SNAPSHOT-99</h1><script src="/mark.js"></script></body></html>`;
const markJs = `window.__snapMark = 99;`;
writeFileSync(MOCK + "/index.html", fakeHtml);
writeFileSync(MOCK + "/mark.js", markJs);
const realSandbox = readFileSync(ROOT + "/sandbox.html");
writeFileSync(MOCK + "/sandbox.html", realSandbox);
function writeVer(v) {
  const files = ["index.html", "mark.js", "sandbox.html"].map((p) => ({ p, s: statSync(MOCK + "/" + p).size }));
  writeFileSync(MOCK + "/version.json", JSON.stringify({ v, files }));
}
writeVer("99.0.0");
const httpSrv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: MOCK, stdio: "ignore" });
process.on("exit", () => { try { httpSrv.kill(); } catch { } });
console.log("stage: mock 镜像 :26991 就绪");

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
console.log("stage: EXT_ID =", EXT_ID);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, tag) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${tag}`)), ms))]);

const browser = await withTimeout(
  chromium.launchPersistentContext("/tmp/ext-v845-profile", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
      "--no-first-run", "--disable-gpu", "--no-sandbox"],
  }),
  30000, "browser launch"
);
process.on("exit", () => { try { browser.close(); httpSrv.kill(); } catch { } });
console.log("stage: browser up");

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

/* ———— T1/T2/T3：本地直载 ———— */
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const cloudReqs = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("request", (r) => { if (r.url().includes("lxgssy.github.io")) cloudReqs.push(r.url()); });
const t0 = Date.now();
await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });

await withTimeout(page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 }).catch(() => null), 9000, "iframe src");
const srcSetMs = Date.now() - t0;
const frameSrc = await page.evaluate(() => document.getElementById("csShellFrame").src);
ok("T1a iframe 指本地 index.html", /chrome-extension:\/\/.+\/index\.html$/.test(frameSrc), frameSrc.slice(-32));

// app 渲染（同源 iframe contentDocument 可读）
const rendered = await withTimeout(page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  try { return f.contentDocument && f.contentDocument.body && f.contentDocument.body.children.length > 0; }
  catch { return false; }
}, { timeout: 15000 }).then(() => true).catch(() => false), 16000, "app render");
ok("T1b 本地 app 渲染（body 有内容）", rendered);

// T3 即时性：boot 遮罩淡出
const bootGone = await withTimeout(page.waitForFunction(() => {
  const b = document.getElementById("csShellBoot");
  return b === null || b.style.opacity === "0";
}, { timeout: 2500 }).then(() => true).catch(() => false), 2600, "boot fade");
ok("T3 即时性（遮罩淡出 <2.5s）", bootGone, `src 定位 ${srcSetMs}ms`);

// T2 零云端请求（等 hydration 稳定一会再断言）
await sleep(1500);
ok("T2 零云端请求（lxgssy.github.io）", cloudReqs.length === 0, `count=${cloudReqs.length}`);

/* ———— T4 开关同步（原生 chrome.storage 双向） ———— */
const appFrame = page.frames().find((f) => /\/index\.html$/.test(f.url()));
if (appFrame) {
  await appFrame.evaluate(() => new Promise((res) => chrome.storage.local.set({ cardGlow: false, probeT4: 1 }, res)));
  await sleep(300);
  const back = await page.evaluate(() => new Promise((res) => chrome.storage.local.get(["cardGlow", "probeT4"], res)));
  ok("T4a 页面→storage 落库（原生）", back.cardGlow === false && back.probeT4 === 1, JSON.stringify(back));

  await appFrame.evaluate(() => {
    window.__t4 = [];
    chrome.storage.onChanged.addListener((ch, area) => { if (area === "local") window.__t4.push(Object.keys(ch)); });
  });
  await page.evaluate(() => new Promise((res) => chrome.storage.local.set({ cardGlow: true }, res)));
  await sleep(500);
  const t4 = await appFrame.evaluate(() => window.__t4);
  ok("T4b storage→页面 onChanged（原生推送）", Array.isArray(t4) && t4.some((ks) => ks.includes("cardGlow")), JSON.stringify(t4));
} else {
  ok("T4 开关同步", false, "app frame 未找到");
}

/* ———— T5 地址栏收敛 + F5 语义 ———— */
const urlNow = page.url();
ok("T5a 地址栏收敛（无参数无云端网址）", urlNow === EXT_URL("index.html"), urlNow.slice(-40));
await page.reload({ waitUntil: "load", timeout: 10000 });
await sleep(800);
const afterReload = {
  url: page.url(),
  appTop: await page.evaluate(() => document.body && document.body.children.length > 0 && !document.getElementById("csShellFrame")),
};
ok("T5b F5 落自足应用顶层（真文件，绝无 404）", afterReload.url === EXT_URL("index.html") && afterReload.appTop,
  `${afterReload.url.slice(-32)} appTop=${afterReload.appTop}`);

/* ———— T6 快照 SW 在场（子路径作用域） ———— */
const swState = await page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  return regs.map((r) => ({ scope: r.scope.replace(/^chrome-extension:\/\/[^/]+/, ""), active: !!(r.active && r.active.state === "activated") }));
});
ok("T6 快照 SW activated（scope /cs-snap/）", swState.some((s) => s.active && s.scope.endsWith("/cs-snap/")), JSON.stringify(swState));

/* ———— T7 快照端到端 ———— */
console.log("stage: T7 快照端到端（csSnapCheck 触发）");
await page.evaluate(() => new Promise((res) => chrome.storage.local.set({ csSnapCheck: Date.now() }, res)));
let meta = null;
for (let i = 0; i < 40; i++) {
  await sleep(250);
  meta = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const rq = indexedDB.open("chushi-snap", 1);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
    });
    const v = await new Promise((resolve, reject) => {
      const rq = db.transaction("kv", "readonly").objectStore("kv").get("meta");
      rq.onsuccess = () => resolve(rq.result || null);
      rq.onerror = () => reject(rq.error);
    });
    db.close();
    return v;
  }).catch(() => null);
  if (meta && meta.v === "99.0.0") break;
}
ok("T7a 更新器下载并原子提交 meta v99", !!meta && meta.v === "99.0.0" && meta.files.length === 3,
  JSON.stringify(meta ? { v: meta.v, n: meta.files.length } : null));

if (meta && meta.v === "99.0.0") {
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const e2 = [];
  page2.on("pageerror", (e) => e2.push(e.message));
  await page2.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
  const snapFrameUrl = await withTimeout(page2.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.includes("/cs-snap/");
  }, { timeout: 10000 }).then(() => page2.evaluate(() => document.getElementById("csShellFrame").src))
    .catch(() => null), 11000, "snap route");
  ok("T7b 新标签页直载 /cs-snap/index.html", !!snapFrameUrl, snapFrameUrl ? snapFrameUrl.slice(-28) : "未路由");

  const snapFrame = page2.frames().find((f) => f.url().includes("/cs-snap/"));
  if (snapFrame) {
    const t7c = await withTimeout(snapFrame.waitForFunction(() => window.__snapMark === 99, { timeout: 6000 })
      .then(() => true).catch(() => false), 7000, "mark.js");
    const head = await snapFrame.evaluate(() => !!document.getElementById("snap-v99")).catch(() => false);
    ok("T7c 快照 HTML+子资源(mark.js) 均由 IDB 服务", t7c && head, `mark=${t7c} html=${head}`);
  } else {
    ok("T7c 快照内容取证", false, "快照 frame 未找到");
  }

  /* ———— T8 永不降级 ———— */
  writeVer("1.0.0");
  await page2.evaluate(() => new Promise((res) => chrome.storage.local.set({ csSnapCheck: Date.now() }, res)));
  await sleep(2500);
  const meta2 = await page.evaluate(async () => {
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
  }).catch(() => null);
  ok("T8 旧版 version.json 不降级（meta 仍 99）", !!meta2 && meta2.v === "99.0.0",
    JSON.stringify(meta2 ? meta2.v : null));

  /* ———— T9 快照沙箱特权 ———— */
  const p3 = await browser.newPage();
  try {
    await p3.goto(EXT_URL("cs-snap/sandbox.html"), { waitUntil: "load", timeout: 10000 });
    const sandboxProbe = await p3.evaluate(() => {
      let ev = "eval-blocked";
      try { (0, eval)("1+1"); ev = "eval-ok"; } catch { }
      return { ev, origin: self.origin === "null" ? "null" : self.origin };
    });
    ok("T9 快照沙箱特权（unsafe-eval + 唯一 origin）",
      sandboxProbe.ev === "eval-ok" && sandboxProbe.origin === "null", JSON.stringify(sandboxProbe));
  } catch (e) {
    ok("T9 快照沙箱特权", false, String(e.message).slice(0, 80));
  }
  await p3.close();
  await page2.close();
}

/* ———— 汇总 ———— */
console.log("\n===== v8.4.5 本地直载壳探针汇总 =====");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  ${r.detail}`);
const fails = results.filter((r) => !r.pass).length;
console.log(`pageerror: ${errors.length}${errors.length ? " -> " + errors[0] : ""}`);
console.log(fails === 0 && errors.length === 0 ? "ALL-GREEN" : `FAILURES=${fails} pageerror=${errors.length}`);
process.exit(fails === 0 ? 0 : 1);
