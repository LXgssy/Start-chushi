// v8.4.4 云端更新壳探针——壳桥全链路七门取证
//
//   T1 壳加载+握手：shell.html → iframe 载 lxgssy.github.io → hello/welcome
//      （boot 淡出、10s 内未回退 index.html）
//   T2 MAIN shim 在位：iframe 主世界 __chushiBridgeShim=true 且 chrome.storage.local
//      为伪造对象（旧版云端页零改动获得镜像能力）
//   T3 上行写落库：iframe shim chrome.storage.local.set → 壳扩展上下文读到真值
//   T4 下行 onChanged：壳扩展上下文写 → iframe shim onChanged 回调收到
//   T5 拒绝面：a) 壳页自身 postMessage（source≠iframe）被拒  b) 非法键名 shim 层拒绝
//   T6 回退链：route 掐断云端 → shell.html 握手超时 → 自动 location.replace("index.html")
//   T7 顶层 cs-bridge：直接开 Pages（无壳）→ shim+cs-bridge 配对 → 写入与扩展同库
//
// rig 复用 verify-v835-ext.mjs（launchPersistentContext + channel chromium + headless 扩展）
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync } from "child_process";
import { mkdirSync, rmSync } from "fs";

const ROOT = "/tmp/ext-v844";
const ZIP = "/tmp/my-project/download/v8.4.4/ChuShi-NewTab-v8.4.4.zip";
const CLOUD = "https://lxgssy.github.io/Start-chushi/";

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);
console.log("stage: 扩展解包 ->", ROOT);

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
  chromium.launchPersistentContext("/tmp/ext-v844-profile", {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
      "--no-first-run", "--disable-gpu", "--no-sandbox"],
  }),
  30000, "browser launch"
);
console.log("stage: browser up");
process.on("exit", () => { try { browser.close(); } catch { } });

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

/* ———— T1~T5：壳页 + 云端 iframe ———— */
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" || String(m.text()).includes("[cs-shim]")) console.log("  [console]", m.type(), m.text().slice(0, 140)); });
console.log("stage: T1 goto shell.html");
await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
await withTimeout(page.waitForFunction(
  () => {
    const f = document.getElementById("csShellFrame");
    return f && f.contentWindow && f.contentWindow.location && true;
  },
  { timeout: 15000 }
).catch(() => null), 16000, "frame ready");

// 等握手（boot 淡出即壳桥 hello 成功）
const handshaken = await withTimeout(page.waitForFunction(
  () => document.getElementById("csShellBoot") === null || document.getElementById("csShellBoot").style.opacity === "0",
  { timeout: 15000 }
).then(() => true).catch(() => false), 16000, "handshake");
ok("T1 壳加载+握手", handshaken && !page.url().includes("index.html"),
  `url=${page.url().slice(0, 60)}`);

const cloudFrame = page.frames().find((f) => f.url().includes("lxgssy.github.io"));
ok("T2a 云端 iframe 在场", !!cloudFrame, cloudFrame ? cloudFrame.url().slice(0, 60) : "未找到");

if (cloudFrame) {
  const shim = await cloudFrame.evaluate(() => ({
    marked: !!window.__chushiBridgeShim,
    fakeGet: typeof (window.chrome && window.chrome.storage && window.chrome.storage.local && window.chrome.storage.local.get),
    host: location.host,
  }));
  ok("T2b MAIN shim 伪造 chrome.storage", shim.marked && shim.fakeGet === "function",
    JSON.stringify(shim));

  // T3 上行写：shim set → 壳扩展上下文真值
  await cloudFrame.evaluate(() => window.chrome.storage.local.set({ probeT3: 1, cardEnabled: false }));
  await sleep(400);
  const back = await page.evaluate(() => new Promise((res) => chrome.storage.local.get(["probeT3", "cardEnabled"], res)));
  ok("T3 上行写落库（iframe→壳桥→chrome.storage）", back.probeT3 === 1 && back.cardEnabled === false,
    JSON.stringify(back));

  // T4 下行 onChanged：壳写 → shim 回调
  await cloudFrame.evaluate(() => {
    window.__t4 = [];
    window.chrome.storage.onChanged.addListener((ch, area) => { window.__t4.push([area, Object.keys(ch)]); });
  });
  await page.evaluate(() => new Promise((res) => chrome.storage.local.set({ cardGlow: false }, res)));
  await sleep(500);
  const t4 = await cloudFrame.evaluate(() => window.__t4);
  ok("T4 下行 onChanged 推送", Array.isArray(t4) && t4.some(([a, ks]) => a === "local" && ks.includes("cardGlow")),
    JSON.stringify(t4));

  // T5a source 伪造拒绝：壳页自身窗口冒充 page 发 set
  await page.evaluate(() => window.postMessage({ src: "chushi-bridge", role: "page", id: 999, op: "set", items: { probeT5: 1 } }, "*"));
  await sleep(400);
  const t5a = await page.evaluate(() => new Promise((res) => chrome.storage.local.get(["probeT5"], (o) => res(o.probeT5))));
  ok("T5a source 校验拒绝（非 iframe 来源）", t5a === undefined, `probeT5=${t5a}`);

  // T5b 非法键名：shim 层 KEY_RE 拒绝
  const t5b = await cloudFrame.evaluate(() =>
    window.chrome.storage.local.set({ "9bad key": 1 }).then(() => "accepted").catch((e) => "rejected:" + e.message));
  ok("T5b 非法键名拒绝", String(t5b).startsWith("rejected"), String(t5b).slice(0, 60));
}

/* ———— T6 回退链：掐断云端 → 超时回退 index.html ———— */
console.log("stage: T6 回退链（10s 超时实测）");
await browser.route("**://lxgssy.github.io/**", (route) => route.abort());
const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page2.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 15000 });
await withTimeout(page2.waitForURL(/index\.html/, { timeout: 14000 }).then(() => true).catch(() => false),
  15000, "fallback redirect");
ok("T6 云端不可达自动回退本地完整版", page2.url().includes("/index.html"), page2.url().slice(0, 60));
await browser.unroute("**://lxgssy.github.io/**");

/* ———— T7 顶层 cs-bridge：直访 Pages（无壳）与扩展同库 ———— */
console.log("stage: T7 顶层直访 Pages + cs-bridge");
const page3 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
try {
  await withTimeout(page3.goto(CLOUD, { waitUntil: "domcontentloaded", timeout: 25000 }), 26000, "goto cloud");
  await sleep(1200); // shim document_start 已注入
  const shim3 = await page3.evaluate(() => ({
    marked: !!window.__chushiBridgeShim,
    host: location.host,
    top: window.top === window,
  }));
  ok("T7a 顶层 shim 注入", shim3.marked && shim3.top, JSON.stringify(shim3));
  if (shim3.marked) {
    await page3.evaluate(() => window.chrome.storage.local.set({ probeT7: 1 }).catch(() => { }));
    await sleep(500);
    const t7 = await page.evaluate(() => new Promise((res) => chrome.storage.local.get(["probeT7"], (o) => res(o.probeT7))));
    ok("T7b cs-bridge 代写与扩展同库", t7 === 1, `probeT7=${t7}`);
  }
} catch (e) {
  ok("T7 顶层 cs-bridge", false, String(e.message).slice(0, 80));
}

/* ———— 汇总 ———— */
console.log("\n===== v8.4.4 壳桥探针汇总 =====");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  ${r.detail}`);
const fails = results.filter((r) => !r.pass).length;
console.log(`pageerror: ${errors.length}${errors.length ? " -> " + errors[0] : ""}`);
console.log(fails === 0 && errors.length === 0 ? "ALL-GREEN" : `FAILURES=${fails} pageerror=${errors.length}`);
process.exit(fails === 0 ? 0 : 1);
