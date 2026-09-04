import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

/* probe-ext-font4.mjs — CDP getMatchedStylesForNode：精确看 body 的 font-family
 * 被哪些规则命中/谁赢，一条不漏 */

const STAGE = "/tmp/ext-stage";
if (!existsSync(`${STAGE}/manifest.json`)) process.exit(2);
const browser = await chromium.launchPersistentContext("/tmp/ext-font-profile4", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
});
const extId = createHash("sha256").update(STAGE).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const page = await browser.newPage();
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const client = await page.context().newCDPSession(page);
await client.send("DOM.enable");
await client.send("CSS.enable");
const { root } = await client.send("DOM.getDocument", { depth: 2 });
const { nodeId } = await client.send("DOM.querySelector", { nodeId: root.nodeId, selector: "body" });
const matched = await client.send("CSS.getMatchedStylesForNode", { nodeId });

const lines = [];
for (const m of matched.matchedCSSRules || []) {
  const ff = m.rule.style.cssProperties?.find((p) => p.name === "font-family");
  if (ff) {
    lines.push({
      origin: m.rule.origin,
      sel: (m.rule.selectorList?.text || "").slice(0, 70),
      ff: (ff.value || "").slice(0, 80),
      layers: m.rule.layers?.map((l) => l.text).join(">"),
    });
  }
}
console.log(JSON.stringify(lines, null, 2));

/* inline style 与 attributes */
const inline = await client.send("CSS.getInlineStylesForNode", { nodeId });
console.log("inline:", JSON.stringify(inline.inlineStyle?.cssProperties?.filter((p) => p.name === "font-family") ?? []));
await browser.close();
