import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
const ZIP = "/home/z/beta-wt/download/v8.7.173/ChuShi-NewTab-v8.7.173.zip";
const STAGE = "/tmp/ext-ctxdbg";
const PROFILE = "/tmp/ext-ctxdbg-profile";
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
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
const page = browser.pages()[0] || (await browser.newPage());
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { const st = JSON.parse(localStorage.getItem("start:settings") || "{}"); st.linksForm = "drawer"; localStorage.setItem("start:settings", JSON.stringify(st)); });
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(1500);
await page.evaluate(() => { const st = JSON.parse(localStorage.getItem("start:settings") || "{}"); st.linksForm = "docked"; localStorage.setItem("start:settings", JSON.stringify(st)); });
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(1500);
await page.mouse.click(900, 650, { button: "right" });
await page.waitForTimeout(800);
const txt = await page.evaluate(() => document.body.innerText.replace(/\n+/g, " | ").slice(0, 500));
console.log("BODY:", txt);
console.log("errors:", errs.length, errs.slice(0, 2));
await browser.close();
