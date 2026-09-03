// 诊断：沙箱到底加载了哪个版本、脚本 boot 是否成功、toast 报了什么错
import { chromium } from "playwright-core";
import fs from "node:fs";

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push("[pageerror] " + e.message.slice(0, 200)));
page.on("console", (m) => {
  const t = m.text();
  if (/error|Error|失败|未定义|not defined|pendingFx/i.test(t))
    errors.push(`[console.${m.type()}] ${t.slice(0, 200)}`);
});
page.on("request", (r) => {
  if (r.url().includes("sandbox")) errors.push("[req] " + r.url());
});

await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(2000);

// 检查 SW 与 sandbox iframe
const sw = await page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  return { swCount: regs.length, scopes: regs.map((r) => r.scope) };
});
console.log("[SW]", JSON.stringify(sw));

await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(3000);

// 截 toast（如有报错 toast 会在此显示）
await page.screenshot({ path: "/home/z/my-project/scripts/pw-lab/shots/dbg1.png" });
const root = await page.evaluate(() => {
  const r = document.getElementById("chushi-fx-root");
  return { fxRoot: !!r, mounts: r ? r.children.length : 0 };
});
console.log("[fx-root]", JSON.stringify(root));

// 直接查 localStorage 里预设是否已安装
const installed = await page.evaluate(() => {
  const raw = localStorage.getItem("start:presets");
  const list = raw ? JSON.parse(raw) : [];
  return list.map((p) => ({ name: p.name, scripts: p.raw?.scripts?.length ?? 0 }));
});
console.log("[installed]", JSON.stringify(installed));

console.log("--- 捕获 ---");
for (const e of errors.slice(0, 20)) console.log(" ", e);
await browser.close();
