// cardAcc 快速诊断：storage 值是否到达内容脚本世界 + host --acc 是否被设置
import { chromium } from "playwright-core";
import crypto from "crypto";
import { spawn, execSync } from "child_process";
import { writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = "/tmp/ext-stage";
const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map(c => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const PROJ = "/tmp/my-project";
const hub = spawn(`${PROJ}/scripts/hubsim`, ["26901"], { stdio: "ignore" });
const pageDir = mkdtempSync(join(tmpdir(), "dbgpage-"));
writeFileSync(join(pageDir, "index.html"), "<!doctype html><html><head><title>D</title></head><body>hi</body></html>");
const http = spawn("python3", ["-m", "http.server", "26988", "--bind", "127.0.0.1"], { cwd: pageDir, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on("exit", () => { for (const p of [hub, http]) { try { p.kill("SIGKILL"); } catch {} } });

const profileDir = mkdtempSync(join(tmpdir(), "dbg-prof-"));
const browser = await chromium.launchPersistentContext(profileDir, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, "--no-first-run", "--disable-gpu"],
});

// 预置 cardAcc（扩展页写）
const tab = await browser.newPage();
await tab.goto(`chrome-extension://${EXT_ID}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
await sleep(1200);
const written = await tab.evaluate(() => new Promise((res) => {
  chrome.storage.local.set({ cardAcc: "#22d3ee" }, () => {
    chrome.storage.local.get(["cardAcc"], (o) => res(JSON.stringify(o)));
  });
}));
console.log("[ext page] write+readback:", written);

// 真值心跳（无真值卡片整体隐没）
const beat = setInterval(() => {
  const body = JSON.stringify({ ne: { title: "t", artist: "a", songId: 1, playing: true, position: 3, duration: 300, ts: Date.now(), v: "8.2.3", pic: "" }, ts: Date.now(), who: "e2e", lease: "holder" });
  execSync(`curl -s -X POST http://127.0.0.1:26901/api/state -H 'Content-Type: application/json' -d '${body}' >/dev/null 2>&1`, { timeout: 3000 });
}, 1000);

const p2 = await browser.newPage();
await p2.goto("http://127.0.0.1:26988/index.html", { waitUntil: "load" });
await sleep(3500);
const diag = await p2.evaluate(() => {
  const host = document.getElementById("chushi-card-host");
  if (!host) return { host: false };
  const cs = getComputedStyle(host);
  return {
    host: true,
    display: cs.display,
    accVar: host.style.getPropertyValue("--acc"),
    accComputed: cs.getPropertyValue("--acc"),
    storageInPage: (typeof chrome !== "undefined" && chrome.storage) ? "chrome.storage 可用" : "无 chrome.storage",
  };
});
console.log("[card page] diag:", JSON.stringify(diag, null, 1));

// 热跟随：改色后再读
await tab.evaluate(() => new Promise((res) => chrome.storage.local.set({ cardAcc: "#f43f5e" }, res)));
await sleep(800);
const diag2 = await p2.evaluate(() => {
  const host = document.getElementById("chushi-card-host");
  return { accVar: host.style.getPropertyValue("--acc") };
});
console.log("[card page] after hot-set:", JSON.stringify(diag2));
clearInterval(beat);
await browser.close();
process.exit(0);
