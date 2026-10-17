// 升级路径实验：v8.7.125 → v8.7.127 同路径换包（ID/storage 保持），
// 复现用户「升级后浮窗消失」的可能路径。
//   P1: v8.7.125 安装 + UI 开启嗅探 + bilibili 浮窗确认
//   P2: 同路径覆写为 v8.7.127 → 重启 → bilibili 浮窗状态
import { chromium } from "playwright-core";
import { mkdirSync, rmSync, cpSync, readdirSync } from "fs";
import { execSync } from "child_process";

const UPG = "/tmp/ext-upg";                 // 固定路径（ID 由路径派生）
const PROFILE = "/tmp/probe-upg-profile";
const V125_ZIP = "/tmp/v87125.zip";
const V127_ZIP = "/tmp/snff-check";          // 已解包 v8.7.127
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stageFrom(zipOrDir, dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  if (zipOrDir.endsWith(".zip")) execSync(`unzip -q ${zipOrDir} -d ${dest}`);
  else cpSync(zipOrDir, dest, { recursive: true });
}
import { readFileSync } from "fs";
function verOf(dir) { return JSON.parse(readFileSync(dir + "/manifest.json", "utf-8")).version; }

const floatState = async (page, tries = 10) => {
  const raw = () => page.evaluate(() => {
    const host = document.getElementById("chushi-sniffer-host");
    if (!host || !host.shadowRoot) return { injected: false };
    const ball = host.shadowRoot.querySelector(".ball");
    return { injected: true, ballDisplay: ball ? ball.style.display : "none" };
  });
  let last = { injected: false };
  for (let i = 0; i < tries; i++) {
    try { last = await raw(); if (last.injected && last.ballDisplay === "flex") return last; } catch (e) {}
    await sleep(1000);
  }
  return last;
};

console.log("== P1 安装 v8.7.125 ==");
stageFrom(V125_ZIP, UPG);
console.log("  manifest:", verOf(UPG));

let browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${UPG}`, `--load-extension=${UPG}`, "--no-first-run", "--no-sandbox"],
});
let sw = null;
for (let i = 0; i < 40 && !sw; i++) { sw = browser.serviceWorkers().find((w) => w.url().endsWith("ext-bg.js")); if (!sw) await sleep(250); }
const EXT_ID = sw.url().match(/^chrome-extension:\/\/([^/]+)\//)[1];
console.log("  EXT_ID:", EXT_ID);

const popup = await browser.newPage();
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`);
await popup.waitForTimeout(400);
await popup.click("#sw-sniffer");
await popup.waitForTimeout(250);
await popup.click("#sniff-gate-yes");
await popup.waitForTimeout(300);
const on1 = await popup.evaluate(() => new Promise((r) => chrome.storage.local.get("snifferOn", (o) => r(o && o.snifferOn))));
console.log("  snifferOn:", on1);
await popup.close();

const p1 = await browser.newPage();
await p1.goto("https://www.bilibili.com/video/BV1GJ411x7h7/", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
await sleep(5000);
console.log("  v125 bilibili 浮窗:", JSON.stringify(await floatState(p1)));
await browser.close();

console.log("== P2 同路径覆写为 v8.7.127（ID/storage 保持） ==");
stageFrom(V127_ZIP, UPG);
console.log("  manifest:", verOf(UPG));

browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${UPG}`, `--load-extension=${UPG}`, "--no-first-run", "--no-sandbox"],
});
sw = null;
for (let i = 0; i < 40 && !sw; i++) { sw = browser.serviceWorkers().find((w) => w.url().endsWith("ext-bg.js")); if (!sw) await sleep(250); }
const EXT_ID2 = sw ? sw.url().match(/^chrome-extension:\/\/([^/]+)\//)[1] : "(无 SW)";
console.log("  EXT_ID:", EXT_ID2, " 一致:", EXT_ID === EXT_ID2);

const p2 = await browser.newPage();
await p2.goto("https://www.bilibili.com/video/BV1GJ411x7h7/", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
await sleep(6000);
console.log("  v127 bilibili 浮窗:", JSON.stringify(await floatState(p2)));

// storage 复核
const chk = await browser.newPage();
await chk.goto(`chrome-extension://${EXT_ID2}/popup.html`);
await chk.waitForTimeout(400);
const on2 = await chk.evaluate(() => new Promise((r) => chrome.storage.local.get(["snifferOn", "snifferDisclaimerAgreed"], (o) => r(o))));
console.log("  storage:", JSON.stringify(on2));
await browser.close();
