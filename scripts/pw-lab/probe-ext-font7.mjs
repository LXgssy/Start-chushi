import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

/* probe-ext-font7.mjs — 揪出 injected stylesheet 的正身：
 * rule.styleSheetId → CSS.getStyleSheetText → 头部元信息（sourceURL/ownerNode/frame） */

const STAGE = "/tmp/ext-stage";
if (!existsSync(`${STAGE}/manifest.json`)) process.exit(2);
const browser = await chromium.launchPersistentContext("/tmp/ext-font-profile7", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
});
const extId = createHash("sha256").update(STAGE).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const page = await browser.newPage();
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(500);

const client = await page.context().newCDPSession(page);
await client.send("DOM.enable");
await client.send("CSS.enable");
const { root } = await client.send("DOM.getDocument", { depth: 2 });
const { nodeId } = await client.send("DOM.querySelector", { nodeId: root.nodeId, selector: "body" });
const matched = await client.send("CSS.getMatchedStylesForNode", { nodeId });

for (const m of matched.matchedCSSRules || []) {
  const ff = m.rule.style.cssProperties?.find((p) => p.name === "font-family");
  if (!ff) continue;
  console.log(`origin=${m.rule.origin} id=${m.rule.styleSheetId} layers=${m.rule.layers?.map((l) => l.text).join(">")}`);
  if (m.rule.origin === "injected") {
    console.log("--- injected rule 原始对象 ---");
    console.log(JSON.stringify(m.rule, null, 2).slice(0, 900));
    if (m.rule.styleSheetId) {
      const sheet = await client.send("CSS.getStyleSheetText", { styleSheetId: m.rule.styleSheetId });
      console.log("--- injected 全文 ---");
      console.log(sheet.text.slice(0, 600));
    }
  }
}

/* DOM 侧找 <style> 注入节点（document.styleSheets 已排除 adopted，改从 DOM 全量找 style 标签） */
const styleTags = await page.evaluate(() => {
  return [...document.querySelectorAll("style")].map((s) => ({
    id: s.id || null,
    first120: (s.textContent || "").slice(0, 120),
    hasDejaVu: (s.textContent || "").includes("DejaVu"),
  }));
});
console.log("=== DOM 里的 <style> 标签 ===");
console.log(JSON.stringify(styleTags, null, 2));

/* adoptedStyleSheets 全量文本 */
const adopted = await page.evaluate(() => {
  const out = [];
  for (const s of document.adoptedStyleSheets ?? []) {
    let t = "";
    try { t = [...s.cssRules].map((r) => r.cssText).join("\n").slice(0, 300); } catch {}
    out.push(t);
  }
  return out;
});
console.log("=== adoptedStyleSheets ===");
console.log(JSON.stringify(adopted, null, 2));
await browser.close();
