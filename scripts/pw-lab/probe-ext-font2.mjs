import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

/* probe-ext-font2.mjs — 定位 --font-geist-sans 变量链断点：
 * body/html 的变量值、变量类是否存在、CSS 规则来源、双环境（web out vs 扩展 stage）对比 */

const STAGE = "/tmp/ext-stage";
if (!existsSync(`${STAGE}/manifest.json`)) process.exit(2);
const browser = await chromium.launchPersistentContext("/tmp/ext-font-profile2", {
  headless: true,
  channel: "chromium",
  args: [
    `--headless=new`,
    `--disable-extensions-except=${STAGE}`,
    `--load-extension=${STAGE}`,
  ],
});
const extId = createHash("sha256").update(STAGE).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");

const page = await browser.newPage();
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const probe = await page.evaluate(() => {
  const body = document.body, html = document.documentElement;
  const gcs = (el) => getComputedStyle(el);
  const varClass = [...body.classList].find((c) => c.startsWith("__variable"));
  // 找 CSSOM 里的变量规则
  const rules = [];
  for (const sheet of document.styleSheets) {
    let list;
    try { list = sheet.cssRules; } catch { continue; }
    const walk = (rs) => {
      for (const r of rs) {
        if (r.cssRules) { walk(r.cssRules); continue; }
        const t = r.cssText || "";
        if (t.includes("--font-geist-sans") || t.includes("__variable")) rules.push(t.slice(0, 160));
      }
    };
    walk(list);
  }
  return {
    bodyClass: body.className.slice(0, 200),
    varClassOnBody: !!varClass,
    varValueOnBody: gcs(body).getPropertyValue("--font-geist-sans").slice(0, 60),
    varValueOnHtml: gcs(html).getPropertyValue("--font-geist-sans").slice(0, 60),
    bodyFF: gcs(body).fontFamily.slice(0, 100),
    htmlFF: gcs(html).fontFamily.slice(0, 100),
    clockFF: gcs(document.querySelector(".clock-text")).fontFamily.slice(0, 100),
    fontSansToken: gcs(body).getPropertyValue("--font-sans").slice(0, 80),
    rules: rules.slice(0, 6),
  };
});
console.log(JSON.stringify(probe, null, 2));
await browser.close();
