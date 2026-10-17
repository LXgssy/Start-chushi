// v8.7.127 诊断探针——用户报告「B站/YouTube/抖音视频下载没了 + 浮窗在B站页面不出现」。
// 用 v8.7.127 实包 + 真实三站页面端到端复现浮窗出现链路：
//   A. SW 健康（启动错误扫描）
//   B. popup 真实 UI 开启嗅探（免责门全流程）
//   C. 真实 bilibili 视频页：注入/浮球/面板/B站专区/解析
//   D. 真实 youtube watch 页：面板 YouTube 专区
//   E. 真实 douyin 视频页：面板抖音专区
//   F. SPA 导航回归 + 冷启动重进
import { chromium } from "playwright-core";

const ROOT = "/tmp/snff-check";           // 已解包 v8.7.127
const PROFILE = "/tmp/probe-sniff-reg-profile";
const SHOTS = "/tmp/probe-sniff-reg-shots";
import { mkdirSync, rmSync } from "fs";
rmSync(PROFILE, { recursive: true, force: true });
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
import fs from "fs";

const browser = await Promise.race([
  chromium.launchPersistentContext(PROFILE, {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
      "--no-first-run", "--no-sandbox"],
  }), sleep(30000).then(() => { throw new Error("launch timeout"); })
]);

let ok = 0; const bad = [];
function gate(name, cond, detail = "") {
  if (cond) { ok++; console.log(`  [OK] ${name}${detail ? " | " + detail : ""}`); }
  else { bad.push(name + (detail ? " | " + detail : "")); console.log(`  [FAIL] ${name}${detail ? " | " + detail : ""}`); }
}

// SW 句柄 + console 错误收集
let sw = null;
for (let i = 0; i < 40 && !sw; i++) {
  sw = browser.serviceWorkers().find((w) => w.url().endsWith("ext-bg.js"));
  if (!sw) await sleep(250);
}
const swErrors = [];
if (sw) {
  sw.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") swErrors.push(m.type() + ": " + m.text()); });
  sw.on("pageerror", (e) => swErrors.push("pageerror: " + e.message));
}
gate("SW 存活", !!sw, sw ? sw.url().split("/").pop() : "未找到 ext-bg.js worker");

const SWURL = sw.url(); // chrome-extension://<id>/ext-bg.js
const EXT_ID = SWURL.match(/^chrome-extension:\/\/([^/]+)\//)[1];
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
console.log("EXT_ID:", EXT_ID);

// ---------------- B. popup 真实 UI 开启 ----------------
console.log("—— B. popup 真实 UI 开启嗅探 ——");
const popup = await browser.newPage();
await popup.goto(EXT_URL("popup.html"));
await popup.waitForTimeout(400);
const extGet = (page, key) => page.evaluate((k) => new Promise((r) => chrome.storage.local.get(k, (o) => r(o && o[k]))), key);
gate("B0 初始 snifferOn 未开", (await extGet(popup, "snifferOn")) !== true);
await popup.click("#sw-sniffer");
await popup.waitForTimeout(250);
const gateVisible = await popup.evaluate(() => { const g = document.querySelector("#sniff-gate"); return !!g && !g.hidden; });
gate("B1 免责门弹出", gateVisible);
const hasYes = await popup.evaluate(() => !!document.querySelector("#sniff-gate-yes"));
if (hasYes) { await popup.click("#sniff-gate-yes"); await popup.waitForTimeout(300); }
gate("B2 同意后 snifferOn=true", (await extGet(popup, "snifferOn")) === true);
await popup.close();

// 内容脚本浮球状态助手（MAIN world 只能看到 shadow host 与内部 open shadow）
const floatStateRaw = (page) => page.evaluate(() => {
  const host = document.getElementById("chushi-sniffer-host");
  if (!host || !host.shadowRoot) return { injected: false };
  const ball = host.shadowRoot.querySelector(".ball");
  const panel = host.shadowRoot.querySelector(".panel");
  return {
    injected: true,
    ballDisplay: ball ? ball.style.display : "none",
    panelOpen: panel ? panel.classList.contains("open") : false,
  };
});
const floatState = async (page, tries = 12) => {
  let last = { injected: false };
  for (let i = 0; i < tries; i++) {
    try { last = await floatStateRaw(page); if (last.injected && last.ballDisplay === "flex") return last; } catch (e) { /* 导航竞态重试 */ }
    await sleep(1000);
  }
  return last;
};

async function openPanel(page) {
  /* 浮球用 pointer 事件判定拖拽（>4px 算拖），必须发 pointer 序列而非 click */
  await page.evaluate(() => {
    const host = document.getElementById("chushi-sniffer-host");
    const ball = host && host.shadowRoot && host.shadowRoot.querySelector(".ball");
    if (!ball) return;
    const r = ball.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const pe = (t) => new PointerEvent(t, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse",
      clientX: cx, clientY: cy, button: 0, buttons: t === "pointerup" ? 0 : 1,
    });
    ball.dispatchEvent(pe("pointerdown"));
    ball.dispatchEvent(pe("pointerup"));
    ball.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: cx, clientY: cy }));
  });
  await sleep(600);
}
async function panelHtml(page) {
  return page.evaluate(() => {
    const host = document.getElementById("chushi-sniffer-host");
    const panel = host && host.shadowRoot && host.shadowRoot.querySelector(".panel");
    return panel ? panel.innerHTML : "";
  });
}

// ---------------- C. 真实 bilibili 视频页 ----------------
console.log("—— C. 真实 bilibili 视频页 ——");
const biliPage = await browser.newPage();
const biliErrors = [];
biliPage.on("pageerror", (e) => biliErrors.push("pageerror: " + e.message));
biliPage.on("console", (m) => { if (m.type() === "error") biliErrors.push("console: " + m.text().slice(0, 200)); });
try {
  await biliPage.goto("https://www.bilibili.com/video/BV1GJ411x7h7/", { waitUntil: "domcontentloaded", timeout: 45000 });
} catch (e) { console.log("  (goto warn:", e.message.slice(0, 80), ")"); }
await sleep(5000);
let st = await floatState(biliPage);
gate("C1 内容脚本注入", st.injected, JSON.stringify(st));
gate("C2 浮球显示", st.injected && st.ballDisplay === "flex", "display=" + st.ballDisplay);
await openPanel(biliPage);
const htmlB = await panelHtml(biliPage);
gate("C3 面板可开", htmlB.includes("资源嗅探"), "len=" + htmlB.length);
gate("C4 B站专区渲染", htmlB.includes("哔哩哔哩完整视频") || htmlB.includes("BV"), htmlB.includes("哔哩哔哩完整视频") ? "专区在" : "专区缺");
gate("C5 B站解析成功", htmlB.includes("完整视频") && !htmlB.includes("解析失败"), htmlB.match(/解析失败[^<]*/)?.[0] || "");
console.log("  bili 面板片段:", htmlB.slice(0, 500).replace(/\s+/g, " ").slice(0, 400));
await biliPage.screenshot({ path: SHOTS + "/bili-panel.png" });

// ---------------- D. 真实 youtube watch 页 ----------------
console.log("—— D. 真实 youtube watch 页 ——");
const ytPage = await browser.newPage();
try {
  await ytPage.goto("https://www.youtube.com/watch?v=dQw4w9WgXcQ", { waitUntil: "domcontentloaded", timeout: 45000 });
} catch (e) { console.log("  (goto warn:", e.message.slice(0, 80), ")"); }
await sleep(6000);
st = await floatState(ytPage);
gate("D1 注入+浮球", st.injected && st.ballDisplay === "flex", JSON.stringify(st));
console.log("  实际 URL:", await ytPage.url());
await openPanel(ytPage);
const htmlY = await panelHtml(ytPage);
const hrefNow = await ytPage.evaluate(() => location.href).catch(() => "(eval fail)");
console.log("  content href:", hrefNow);
console.log("  vid regex test:", /youtube\.com\/watch\?[^#]*\bv=([\w-]{11})/.test(String(hrefNow)));
gate("D2 YouTube 专区渲染", htmlY.includes("YouTube 完整视频"), htmlY.includes("YouTube 完整视频") ? "专区在" : "专区缺");
console.log("  yt 面板片段:", htmlY.slice(0, 400).replace(/\s+/g, " "));
await ytPage.screenshot({ path: SHOTS + "/yt-panel.png" });

// ---------------- E. 真实 douyin 视频页 ----------------
console.log("—— E. 真实 douyin 视频页 ——");
const dyPage = await browser.newPage();
try {
  await dyPage.goto("https://www.douyin.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
} catch (e) { console.log("  (goto warn:", e.message.slice(0, 80), ")"); }
await sleep(6000);
st = await floatState(dyPage);
gate("E1 注入+浮球", st.injected && st.ballDisplay === "flex", JSON.stringify(st));
await openPanel(dyPage);
const htmlD = await panelHtml(dyPage);
gate("E2 抖音专区（首页非视频页可为空，只验证注入）", st.injected, "len=" + htmlD.length);
console.log("  dy 面板片段:", htmlD.slice(0, 300).replace(/\s+/g, " "));
await dyPage.screenshot({ path: SHOTS + "/dy-panel.png" });

// ---------------- F. 冷启动重进 bilibili（SW 休眠后唤醒） ----------------
console.log("—— F. 冷启动重进 ——");
await biliPage.goto("about:blank");
await sleep(12000); // 让 SW 有机会休眠
try {
  await biliPage.goto("https://www.bilibili.com/video/BV1GJ411x7h7/?p=1&spm_id_from=333.788", { waitUntil: "domcontentloaded", timeout: 45000 });
} catch (e) { console.log("  (goto warn:", e.message.slice(0, 80), ")"); }
await sleep(6000);
st = await floatState(biliPage);
gate("F1 二次进入浮球显示", st.injected && st.ballDisplay === "flex", JSON.stringify(st));

console.log("\n================ 结果 ================");
console.log("OK:", ok, " FAIL:", bad.length);
if (bad.length) console.log("失败项:\n  - " + bad.join("\n  - "));
if (swErrors.length) console.log("SW console 错误/警告:\n  " + swErrors.slice(0, 20).join("\n  "));
if (biliErrors.length) console.log("bilibili 页错误(前10):\n  " + biliErrors.slice(0, 10).join("\n  "));
console.log("截图目录:", SHOTS);
await browser.close();
process.exit(bad.length ? 1 : 0);
