// aurora-shot.mjs — 冻结动画的极光视觉基准（受控相位 0%）
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
const TAG = process.argv[2];
const ZIP = process.env.PDF_ZIP || "/home/z/beta-wt/download/v8.7.170/ChuShi-NewTab-v8.7.170.zip";
const STAGE = "/tmp/ext-shot";
const PROFILE = "/tmp/ext-shot-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`);
fs.rmSync(PROFILE, { recursive: true, force: true });
const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`, "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  viewport: { width: 1280, height: 800 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
const page = browser.pages()[0] || (await browser.newPage());
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const links = Array.from({ length: 40 }, (_, i) => ({ id: "p" + i, name: "站点" + i, url: `https://s${i}.example.com` }));
  localStorage.setItem("start:links", JSON.stringify(links));
  localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "letter", linksForm: "docked", background: "glow" }));
});
await page.addStyleTag({ content: "*{animation-play-state:paused!important;transition:none!important}" });
await page.reload({ waitUntil: "load" });
await page.addStyleTag({ content: "*{animation-play-state:paused!important;transition:none!important}" });
await page.waitForTimeout(2000);
await page.addStyleTag({ content: "*{animation-play-state:paused!important;transition:none!important}" });
await page.screenshot({ path: `/tmp/aurora-frozen-${TAG}.png` });
await browser.close();
console.log("shot done:", TAG);
