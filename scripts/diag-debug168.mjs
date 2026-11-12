// diag-debug168.mjs — 探针：看页面到底渲染了什么
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
console.log("computed extId:", extId);
const page = browser.pages()[0] || (await browser.newPage());
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 200)));
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 200));
});

await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(2500);

const links = JSON.stringify([
  { id: "fd1", name: "诊断夹", folder: true, children: [
    { id: "a1", name: "站1", url: "https://a1.example.com" },
    { id: "a2", name: "站2", url: "https://a2.example.com" },
    { id: "a3", name: "站3", url: "https://a3.example.com" },
    { id: "a4", name: "站4", url: "https://a4.example.com" },
  ] },
  { id: "t1", name: "甲站", url: "https://t1.example.com" },
]);
await page.evaluate((l) => localStorage.setItem("start:links", l), links);
await page.evaluate(() => localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "favicon", linksForm: "docked" })));
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2500);

const info = await page.evaluate(() => ({
  url: location.href,
  linksRaw: (localStorage.getItem("start:links") || "").slice(0, 120),
  settingsRaw: (localStorage.getItem("start:settings") || "").slice(0, 120),
  entryCount: document.querySelectorAll("[data-entry-id]").length,
  tiles: [...document.querySelectorAll("[data-cl-tile]")].length,
  bodyText: document.body.innerText.slice(0, 300),
}));
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: "/tmp/diag168-debug.png" });
await browser.close();
console.log("DEBUG DONE");
