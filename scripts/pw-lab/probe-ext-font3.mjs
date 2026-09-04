import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

/* probe-ext-font3.mjs — 二分定位：
 * A) 动态插入 body{font-family:var(--font-geist-sans),monospace} → 变了=原规则被覆盖；没变=var链坏
 * B) CSSOM 正确遍历（区分 CSSStyleRule.cssRules 空列表）找 --font-geist-sans 规则归属
 * C) 检查 stylesheets 的 disabled/media */

const STAGE = "/tmp/ext-stage";
if (!existsSync(`${STAGE}/manifest.json`)) process.exit(2);
const browser = await chromium.launchPersistentContext("/tmp/ext-font-profile3", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
});
const extId = createHash("sha256").update(STAGE).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const page = await browser.newPage();
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

const probe = await page.evaluate(() => {
  const out = {};
  const body = document.body;
  out.before = getComputedStyle(body).fontFamily.slice(0, 90);

  /* C) stylesheets 概览 */
  out.sheets = [...document.styleSheets].map((s) => {
    let n = -1, err = null;
    try { n = s.cssRules.length; } catch (e) { err = String(e).slice(0, 40); }
    return { href: (s.href || "inline").split("/").pop(), rules: n, disabled: s.disabled, media: s.media?.mediaText, err };
  });

  /* B) 正确遍历：CSSStyleRule 无 cssRules 属性时才跳过 */
  const hits = [];
  const walk = (rs, layer) => {
    for (const r of rs) {
      const type = r.constructor.name;
      if (type === "CSSLayerBlockRule") walk(r.cssRules, r.name);
      else if (type === "CSSMediaRule" || type === "CSSSupportsRule") walk(r.cssRules, layer);
      else if (r.selectorText && /(^|,|\s)body(\s|,|$)/.test(r.selectorText) && (r.style?.fontFamily || r.cssText.includes("font-family")))
        hits.push({ layer, sel: r.selectorText.slice(0, 60), ff: (r.style?.fontFamily || "").slice(0, 70) });
      else if (r.selectorText?.includes("__variable"))
        hits.push({ layer, sel: r.selectorText.slice(0, 60), ff: (r.style?.getPropertyValue("--font-geist-sans") || "").slice(0, 50) });
    }
  };
  for (const s of document.styleSheets) {
    try { walk(s.cssRules, null); } catch {}
  }
  out.hits = hits.slice(0, 10);

  /* A) 动态插入实验 */
  const st = document.createElement("style");
  st.textContent = `body{font-family:var(--font-geist-sans),monospace !important}`;
  document.head.appendChild(st);
  out.afterInject = getComputedStyle(body).fontFamily.slice(0, 90);
  st.remove();

  /* A2) 不带变量直接写 Geist */
  const st2 = document.createElement("style");
  st2.textContent = `body{font-family:Geist,monospace}`;
  document.head.appendChild(st2);
  out.afterLiteral = getComputedStyle(body).fontFamily.slice(0, 90);
  st2.remove();
  return out;
});
console.log(JSON.stringify(probe, null, 2));
await browser.close();
