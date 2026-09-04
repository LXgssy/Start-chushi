import { chromium } from "playwright-core";
import { createHash } from "node:crypto";

const STAGE = "/tmp/ext-stage";
const browser = await chromium.launchPersistentContext("/tmp/ext-dbg-profile2", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
});
const extId = createHash("sha256").update(STAGE).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("[console]", m.text().slice(0, 200)); });
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });
await page.locator(".cl-dock button[aria-label='音乐']").click();
await page.waitForSelector("[data-panel='music']", { timeout: 5000 });
for (const ms of [1000, 3000, 6000]) {
  await page.waitForTimeout(ms === 1000 ? 1000 : 2000);
  const txt = await page.locator("[data-panel='music']").innerText();
  console.log(`\n===== T+${ms}ms 面板文本 =====`);
  console.log(txt.slice(0, 400));
}
console.log("\npageerror:", errors);
await browser.close();
