// diag-glyph168.mjs — 字形级放大实拍：dpr=3，字母格大特写
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.167/ChuShi-NewTab-v8.7.167.zip";
const STAGE = "/tmp/ext-diag168d";
const PROFILE = "/tmp/ext-diag168d-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";

fs.rmSync(PROFILE, { recursive: true, force: true });

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 3,
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
const page = browser.pages()[0] || (await browser.newPage());

const mk = (n, pfx, nm) =>
  Array.from({ length: n }, (_, i) => ({ id: pfx + (i + 1), name: nm + (i + 1), url: `https://${pfx}${i + 1}.example.com` }));
const LINKS = JSON.stringify([
  { id: "fd1", name: "诊断夹", folder: true, children: mk(4, "a", "站") },
  { id: "t1", name: "甲站", url: "https://t1.example.com" },
]);

await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(2200);
await page.evaluate((l) => localStorage.setItem("start:links", l), LINKS);
await page.evaluate(() => localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "favicon", linksForm: "drawer" })));
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2000);
await page.keyboard.press("Alt+v");
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/glyph168-rest.png" });
const box = await page.locator('[data-entry-id="fd1"] .tile-shell.h-16').first().boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
await page.waitForTimeout(500);
await page.screenshot({ path: "/tmp/glyph168-hover.png" });
await browser.close();
console.log("GLYPH SHOTS DONE");
