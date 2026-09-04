import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
const STAGE = "/tmp/ext-stage";
const browser = await chromium.launchPersistentContext("/tmp/ext-headful-profile", {
  headless: false,
  channel: "chromium",
  args: [`--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`, "--no-sandbox"],
});
const extId = createHash("sha256").update(STAGE).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const page = await browser.newPage();
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(500);
const ff = await page.evaluate(() => getComputedStyle(document.body).fontFamily.slice(0, 80));
console.log("headful bodyFF:", ff);
await browser.close();
