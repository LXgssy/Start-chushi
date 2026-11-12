// diag-drawer168.mjs — 探针：抽屉唤出方式验证
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.167/ChuShi-NewTab-v8.7.167.zip";
const STAGE = "/tmp/ext-diag168b";
const PROFILE = "/tmp/ext-diag168b-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`);
fs.rmSync(PROFILE, { recursive: true, force: true });

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
  viewport: { width: 1280, height: 900 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
const page = browser.pages()[0] || (await browser.newPage());
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 200)));

const links = JSON.stringify([
  { id: "fd1", name: "诊断夹", folder: true, children: [
    { id: "a1", name: "站1", url: "https://a1.example.com" },
    { id: "a2", name: "站2", url: "https://a2.example.com" },
    { id: "a3", name: "站3", url: "https://a3.example.com" },
    { id: "a4", name: "站4", url: "https://a4.example.com" },
  ] },
  { id: "t1", name: "甲站", url: "https://t1.example.com" },
]);
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.evaluate((l) => localStorage.setItem("start:links", l), links);
await page.evaluate(() => localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "favicon", linksForm: "drawer" })));
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2500);

const veilCount = () => page.evaluate(() => document.querySelectorAll(".cl-drawer-veil").length);

console.log("initial veil:", await veilCount());
await page.keyboard.press("Alt+v");
await page.waitForTimeout(1000);
console.log("after Alt+v veil:", await veilCount());
await page.mouse.click(150, 650, { button: "middle" });
await page.waitForTimeout(1000);
console.log("after mid-click veil:", await veilCount());
await page.mouse.click(150, 650, { button: "middle" });
await page.waitForTimeout(1000);
console.log("after mid-click2 veil:", await veilCount());
await browser.close();
console.log("PROBE DONE");
