// SW 可行性探针 v2 —— 细粒度诊断：register 分步计时 + 状态轮询 + 双作用域对照
import { chromium } from "playwright-core";
import crypto from "crypto";
import { mkdirSync, rmSync, writeFileSync } from "fs";

const ROOT = "/tmp/ext-swtest";
rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT + "/__cssnap", { recursive: true });

writeFileSync(ROOT + "/manifest.json", JSON.stringify({
  manifest_version: 3, name: "sw-probe", version: "1.0", permissions: ["storage"],
}));

writeFileSync(ROOT + "/sw-probe.js", `
window.__reg = async (script, scope) => {
  const log = [];
  try {
    log.push("register-start " + script + " scope=" + scope);
    const p = navigator.serviceWorker.register(script, scope ? { scope } : {});
    const winner = await Promise.race([
      p.then((r) => ({ done: true, scope: r.scope })),
      new Promise((res) => setTimeout(() => res({ done: false }), 6000)),
    ]);
    log.push("register-return " + JSON.stringify(winner));
    const states = {};
    for (let i = 0; i < 6; i++) {
      const regs = await navigator.serviceWorker.getRegistrations();
      states[i] = regs.map((r) => ({
        scope: r.scope,
        installing: r.installing && r.installing.state,
        waiting: r.waiting && r.waiting.state,
        active: r.active && r.active.state,
      }));
      if (regs.some((r) => r.active && r.active.state === "activated")) break;
      await new Promise((res) => setTimeout(res, 500));
    }
    log.push("states " + JSON.stringify(states));
    return log;
  } catch (e) {
    log.push("register-throw " + String(e && e.message || e));
    return log;
  }
};
window.__synth = async () => {
  try {
    const r = await fetch("/__cssnap/virtual.html");
    return { status: r.status, text: (await r.text()).slice(0, 60) };
  } catch (e) { return { err: String(e.message) }; }
};
`);

writeFileSync(ROOT + "/sw-host.html", `<!DOCTYPE html><html><body><h1 id="t">sw-host</h1>
<script src="sw-probe.js"></script></body></html>`);

writeFileSync(ROOT + "/__cssnap/sw.js", `
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.pathname === "/__cssnap/virtual.html") {
    e.respondWith(new Response("<h1 id='synth'>SNAPSHOT-SERVED</h1>", { headers: { "Content-Type": "text/html; charset=utf-8" } }));
    return;
  }
});
`);

writeFileSync(ROOT + "/sw-root.js", `
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => { /* 仅登记存在性 */ });
`);

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
console.log("stage: EXT_ID =", EXT_ID);

const withTimeout = (p, ms, tag) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${tag}`)), ms))]);

const browser = await withTimeout(
  chromium.launchPersistentContext("/tmp/ext-swtest-profile", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
      "--no-first-run", "--disable-gpu", "--no-sandbox"],
  }),
  30000, "browser launch"
);
process.on("exit", () => { try { browser.close(); } catch { } });
console.log("stage: browser up");

const page = await browser.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 120)));
page.on("console", (m) => console.log("  [console]", m.type(), m.text().slice(0, 200)));

await page.goto(EXT_URL("sw-host.html"), { waitUntil: "load", timeout: 15000 });

console.log("\n== A) 子路径作用域 /__cssnap/ ==");
const a = await withTimeout(page.evaluate(() => window.__reg("/__cssnap/sw.js", "/__cssnap/")), 20000, "reg-sub");
console.log(a.join("\n"));

console.log("\n== B) 根作用域（默认） ==");
const b = await withTimeout(page.evaluate(() => window.__reg("/sw-root.js")), 20000, "reg-root");
console.log(b.join("\n"));

console.log("\n== C) 导航到虚拟 URL（iframe.src 同语义：按目标作用域拦截） ==");
let c2 = null;
try {
  const pv = await browser.newPage();
  await pv.goto(EXT_URL("__cssnap/virtual.html"), { waitUntil: "domcontentloaded", timeout: 8000 });
  c2 = { url: pv.url().slice(-24), synth: await pv.evaluate(() => !!document.getElementById("synth")) };
  await pv.close();
} catch (e) { c2 = "NAV-FAIL: " + String(e.message).slice(0, 90); }
console.log(JSON.stringify(c2));

console.log("\n== D) 无壳父页 iframe.src 指向虚拟 URL（真实架构形态） ==");
let d = null;
try {
  const pd = await browser.newPage();
  await pd.goto(EXT_URL("sw-host.html"), { waitUntil: "load", timeout: 8000 });
  await pd.evaluate(() => {
    const f = document.createElement("iframe");
    f.id = "snapFrame"; f.src = "/__cssnap/virtual.html";
    document.body.appendChild(f);
  });
  await new Promise((r) => setTimeout(r, 1200));
  const fr = pd.frames().find((f) => f.url().includes("__cssnap"));
  d = fr ? await fr.evaluate(() => !!document.getElementById("synth")) : "frame-not-found";
  await pd.close();
} catch (e) { d = "FAIL: " + String(e.message).slice(0, 90); }
console.log("synth-in-iframe:", JSON.stringify(d));

console.log("\n== E) 根路径 / 语义（地址栏 replaceState 短形态的 F5 安全性） ==");
let e1 = null;
try {
  const pe = await browser.newPage();
  await pe.goto(EXT_URL(""), { waitUntil: "domcontentloaded", timeout: 8000 });
  e1 = { url: pe.url(), title: await pe.title(), body: (await pe.evaluate(() => document.body.innerText.slice(0, 50))) };
  await pe.close();
} catch (err) { e1 = "NAV-FAIL: " + String(err.message).slice(0, 90); }
console.log(JSON.stringify(e1));

console.log("\n== F) replaceState 到根 ==");
const f1 = await page.evaluate(() => {
  try { history.replaceState(null, "", location.origin + "/"); return { ok: true, href: location.href }; }
  catch (err) { return { ok: false, err: String(err.message).slice(0, 80) }; }
});
console.log(JSON.stringify(f1));

process.exit(0);
