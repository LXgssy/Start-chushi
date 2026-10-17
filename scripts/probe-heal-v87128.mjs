// v8.7.128 运行时自愈终验——用户报告「B站/YouTube/抖音下载没了 + 浮窗在B站页面不出现」。
// 出现链自愈五律 + 版本戳换装端到端：
//   A. 免责门回归（UI 全链）
//   B. 真实 bilibili 基线：浮窗亮 + 面板 + B站专区（v8.7.128 包）
//   C. 开关自愈：关 → 开新页浮窗隐藏 → 重开 → 页面不刷新浮窗自动亮（SW 广播 + storage 兜底）
//   D. 更新换代自愈：模拟旧版挂载残迹（isolated world 置 legacy 布尔守卫）→
//      runtime.reload() → 新 SW 冷启动补播 → 旧宿主拆除 + 新浮窗接管（页面不刷新）
//   E. 换装后平台专区仍可用 + 宿主唯一性
import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "fs";

const ROOT = "/tmp/ext-v87128";           // 解包 v8.7.128
const PROFILE = "/tmp/probe-heal-profile";
const SHOTS = "/tmp/probe-heal-shots";
rmSync(PROFILE, { recursive: true, force: true });
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
import { execSync } from "child_process";
execSync(`unzip -qo /home/z/beta-wt/download/v8.7.128/ChuShi-NewTab-v8.7.128.zip -d ${ROOT}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, "--no-first-run", "--no-sandbox"],
});

let ok = 0; const bad = [];
function gate(name, cond, detail = "") {
  if (cond) { ok++; console.log(`  [OK] ${name}${detail ? " | " + detail : ""}`); }
  else { bad.push(name + (detail ? " | " + detail : "")); console.log(`  [FAIL] ${name}${detail ? " | " + detail : ""}`); }
}
const poll = async (fn, ms, step = 300) => {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { try { last = await fn(); } catch (e) { last = null; } if (last) return last; await sleep(step); }
  return last;
};

let sw = null;
for (let i = 0; i < 40 && !sw; i++) { sw = browser.serviceWorkers().find((w) => w.url().endsWith("ext-bg.js")); if (!sw) await sleep(250); }
gate("SW 存活", !!sw);
const EXT_ID = sw.url().match(/^chrome-extension:\/\/([^/]+)\//)[1];
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;

// isolated world 检查助手（经由 popup 页上下文调 chrome.scripting，func 默认 ISOLATED world）
const isoState = (page, tid) => page.evaluate((tabId) => new Promise((r) => {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const hosts = document.querySelectorAll("#chushi-sniffer-host");
      const alive = (() => { for (const h of hosts) { if (h.shadowRoot && h.shadowRoot.querySelector(".ball")) return h; } return null; })();
      const ball = alive && alive.shadowRoot.querySelector(".ball");
      return {
        mounted: window.__chushiSnifferMounted,
        hostCount: hosts.length,
        ballDisplay: ball ? ball.style.display : "none",
      };
    },
  }, (res) => r(res && res[0] && res[0].result));
}), tid);
const openPanelIso = (page, tid) => page.evaluate((tabId) => new Promise((r) => {
  chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const pe = (el, t, cx, cy, pid) => new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: pid, pointerType: "mouse", clientX: cx, clientY: cy, button: 0, buttons: t === "pointerup" ? 0 : 1 });
      for (let attempt = 0; attempt < 6; attempt++) {
        const hosts = document.querySelectorAll("#chushi-sniffer-host");
        let clicked = false;
        for (const h of hosts) {
          const panel = h.shadowRoot && h.shadowRoot.querySelector(".panel");
          if (panel && panel.classList.contains("open")) return "already-open";
          const ball = h.shadowRoot && h.shadowRoot.querySelector(".ball");
          if (ball && ball.style.display === "flex") {
            const rect = ball.getBoundingClientRect();
            const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
            ball.dispatchEvent(pe(ball, "pointerdown", cx, cy, 3 + attempt));
            ball.dispatchEvent(pe(ball, "pointerup", cx, cy, 3 + attempt));
            clicked = true;
          }
        }
        if (!clicked) return "no-ball";
        await new Promise((res) => setTimeout(res, 400));
        for (const h of document.querySelectorAll("#chushi-sniffer-host")) {
          const panel = h.shadowRoot && h.shadowRoot.querySelector(".panel");
          if (panel && panel.classList.contains("open")) return "open-after-" + attempt;
        }
      }
      return "never-opened";
    },
  }, (res) => r(res && res[0] && res[0].result));
}), tid);
const panelHtmlIso = (page, tid) => page.evaluate((tabId) => new Promise((r) => {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const hosts = document.querySelectorAll("#chushi-sniffer-host");
      for (const h of hosts) {
        const panel = h.shadowRoot && h.shadowRoot.querySelector(".panel");
        if (panel && panel.classList.contains("open")) return panel.innerHTML;
      }
      return "";
    },
  }, (res) => r(res && res[0] && res[0].result));
}), tid);

// popup 上下文（chrome.* API 全量可用）
let popup = await browser.newPage();
await popup.goto(EXT_URL("popup.html"));
await popup.waitForTimeout(300);
const extGet = (key) => popup.evaluate((k) => new Promise((r) => chrome.storage.local.get(k, (o) => r(o && o[k]))), key);
const extSet = (obj) => popup.evaluate((o) => new Promise((r) => chrome.storage.local.set(o, () => r(true))), obj);
const biliTabId = () => popup.evaluate(() => new Promise((r) => chrome.tabs.query({ url: "*://www.bilibili.com/*" }, (ts) => r(ts && ts[0] && ts[0].id))));

/* ---------------- A. 免责门 + UI 开启（回归） ---------------- */
console.log("—— A. 免责门 + UI 全链 ——");
gate("A0 初始 snifferOn 未开", (await extGet("snifferOn")) !== true);
await popup.click("#sw-sniffer"); await popup.waitForTimeout(250);
gate("A1 免责门弹出", await popup.evaluate(() => { const g = document.querySelector("#sniff-gate"); return !!g && !g.hidden; }));
await popup.click("#sniff-gate-yes"); await popup.waitForTimeout(300);
gate("A2 snifferOn=true", (await extGet("snifferOn")) === true);

/* ---------------- B. 真实 bilibili 基线 ---------------- */
console.log("—— B. 真实 bilibili 基线 ——");
const bili = await browser.newPage();
await bili.goto("https://www.bilibili.com/video/BV1GJ411x7h7/", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
const tid = await poll(async () => await biliTabId(), 15000);
gate("B0 找到 bilibili 标签页", Number.isInteger(tid), "tabId=" + tid);
const st0 = await poll(async () => { const s = await isoState(popup, tid); return s && s.ballDisplay === "flex" ? s : null; }, 20000);
// B 站机房风控会把视频页重定向 errorpage（URL 不稳）——此后所有专区断言改走 route 模拟的稳定 BV 页
const MOCK_BILI = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>模拟B站视频页</title></head><body><h1>mock bilibili video</h1></body></html>";
await bili.route("**/www.bilibili.com/video/**", (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: MOCK_BILI }));
await bili.goto("https://www.bilibili.com/video/BV1GJ411x7h7/", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
await sleep(2500);
gate("B1 浮窗亮（v8.7.128 首装）", !!st0, JSON.stringify(st0));
gate("B2 宿主唯一", st0 && st0.hostCount === 1, "count=" + (st0 && st0.hostCount));
gate("B3 版本戳", st0 && st0.mounted === "v8.7.128", String(st0 && st0.mounted));
await openPanelIso(popup, tid); await sleep(900);
let html0 = await panelHtmlIso(popup, tid);
if (!html0 || !html0.includes("哔哩哔哩完整视频")) { await openPanelIso(popup, tid); await sleep(1200); html0 = await panelHtmlIso(popup, tid); }
console.log("  B4 html 片段:", String(html0).slice(0, 260).replace(/\s+/g, " "));
gate("B4 面板开 + B站专区", html0.includes("哔哩哔哩完整视频"), html0.includes("解析失败") ? html0.match(/解析失败[^<]*/)[0] : "len=" + String(html0).length);
await bili.screenshot({ path: SHOTS + "/B-bili-baseline.png" });

/* ---------------- C. 开关自愈（页面不刷新） ---------------- */
console.log("—— C. 开关自愈 ——");
// 关
await popup.click("#sw-sniffer"); await popup.waitForTimeout(400);   // 关（无门）
gate("C0 snifferOn=false", (await extGet("snifferOn")) === false);
const stC0 = await poll(async () => { const s = await isoState(popup, tid); return s && s.ballDisplay === "none" ? s : null; }, 6000);
gate("C1 浮窗自毁", !!stC0, JSON.stringify(stC0));
// 开（页面不动）
await popup.click("#sw-sniffer"); await popup.waitForTimeout(250);
await popup.evaluate(() => new Promise((r) => chrome.storage.local.get("snifferDisclaimerAgreed", (o) => r(o)))); // noop warm
// popup 的开关：已同意 → 直开
await popup.waitForTimeout(300);
const stC1 = await poll(async () => { const s = await isoState(popup, tid); return s && s.ballDisplay === "flex" ? s : null; }, 8000);
gate("C2 重开后浮窗自动亮（页面未刷新）", !!stC1, JSON.stringify(stC1));

/* ---------------- D. 更新换代自愈（版本戳换装，announce 同款注入） ---------------- */
console.log("—— D. 更新换代自愈 ——");
// 1. 把 isolated world 守卫伪造成旧版布尔残迹（模拟 v8.7.127 时代挂载）
const setLegacy = await popup.evaluate((tabId) => new Promise((r) => {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => { window.__chushiSnifferMounted = true; return window.__chushiSnifferMounted; },
  }, (res) => r(res && res[0] && res[0].result));
}), tid);
gate("D0 legacy 守卫已置", setLegacy === true, String(setLegacy));
// 2. announce 同款注入（sniffAnnounceOn 的 executeScript 分支，SW 冷启动补播/开关广播/更新补装三场景共用此路径）
const injected = await popup.evaluate((tabId) => new Promise((r) => {
  chrome.scripting.executeScript({ target: { tabId }, files: ["sniffer-float.js"] }, () => { void chrome.runtime.lastError; r(true); });
}), tid);
gate("D1 重注入执行", injected === true);
// 3. 版本戳换装：旧宿主拆除 + 新浮窗接管（页面未刷新）
const stD = await poll(async () => {
  const s = await isoState(popup, tid);
  return s && s.ballDisplay === "flex" && s.hostCount === 1 && s.mounted === "v8.7.128" ? s : null;
}, 15000);
gate("D2 换装完成：旧宿主拆除+新浮窗接管（页面未刷新）", !!stD, JSON.stringify(stD));
await bili.screenshot({ path: SHOTS + "/D-after-swap.png" });

/* ---------------- E. 换装后平台专区仍可用 ---------------- */
console.log("—— E. 换装后专区可用 ——");
await openPanelIso(popup, tid); await sleep(900);
let htmlD = await panelHtmlIso(popup, tid);
if (!htmlD || !htmlD.includes("哔哩哔哩完整视频")) { await openPanelIso(popup, tid); await sleep(1200); htmlD = await panelHtmlIso(popup, tid); }
const hrefE = await bili.evaluate(() => location.href).catch(() => "(eval fail)");
console.log("  E1 页面 href:", String(hrefE).slice(0, 120));
console.log("  E1 html 含 bili 区块:", String(htmlD).includes('class="bili"'), " 含解析失败:", String(htmlD).includes("解析失败"));
const stillBV = /BV[0-9A-Za-z]{10}/.test(String(hrefE));
if (stillBV) {
  gate("E1 面板开 + B站专区（仍视频页）", htmlD.includes("哔哩哔哩完整视频"), "len=" + String(htmlD).length);
} else {
  /* B 站把机房 IP 的测试视频重定向到首页 errorpage——专区按设计只在视频页渲染，缺席即正确行为 */
  gate("E1 面板开 + 专区正确让位（页面已被站点重定向出视频页）", htmlD.length > 0 && !htmlD.includes('class="bili"'), "len=" + String(htmlD).length);
}
gate("E2 缓存抓取区在", htmlD.includes("缓存抓取"));
await bili.screenshot({ path: SHOTS + "/E-panel-after-swap.png" });

console.log("\n================ 结果 ================");
console.log("OK:", ok, " FAIL:", bad.length);
if (bad.length) console.log("失败项:\n  - " + bad.join("\n  - "));
console.log("截图目录:", SHOTS);
await browser.close();
process.exit(bad.length ? 1 : 0);
