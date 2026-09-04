import { chromium } from "playwright-core";
import { readFileSync, existsSync as ex } from "node:fs";
import { createServer } from "node:http";
import { join, extname } from "node:path";

/* probe-web-font.mjs — 网页版（干净环境）字体链探测：
 * body/html 计算栈、变量值、CDP 命中规则、实验矩阵（layer vs 未分层） */

const OUT = "/home/z/my-project/out";
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".json": "application/json", ".svg": "image/svg+xml" };
const srv = createServer((req, res) => {
  const rel = req.url.split("?")[0].replace(/^\/Start-chushi\//, "/");
  const p = join(OUT, rel === "/" || rel === "" ? "index.html" : rel);
  try { res.setHeader("content-type", (MIME[extname(p)] ?? "application/octet-stream") + (extname(p) === ".html" ? "; charset=utf-8" : "")); res.end(readFileSync(p)); }
  catch { res.statusCode = 404; res.end("x"); }
});
await new Promise((r) => srv.listen(4174, r));

const browser = await chromium.launchPersistentContext("/tmp/web-font-profile", {
  headless: true,
  channel: "chromium",
});
const page = await browser.newPage();
await page.goto("http://localhost:4174/Start-chushi/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(600);

const basic = await page.evaluate(() => {
  const gcs = (el) => getComputedStyle(el);
  return {
    bodyFF: gcs(document.body).fontFamily.slice(0, 90),
    htmlFF: gcs(document.documentElement).fontFamily.slice(0, 90),
    clockFF: document.querySelector(".clock-text") ? gcs(document.querySelector(".clock-text")).fontFamily.slice(0, 90) : "(not found)",
    varOnBody: gcs(document.body).getPropertyValue("--font-geist-sans").slice(0, 50),
    varOnHtml: gcs(document.documentElement).getPropertyValue("--font-geist-sans").slice(0, 50),
    bodyClass: document.body.className.slice(0, 120),
  };
});
console.log("===== 网页版基础探测 =====");
console.log(JSON.stringify(basic, null, 2));

const client = await page.context().newCDPSession(page);
await client.send("DOM.enable");
await client.send("CSS.enable");
const { root } = await client.send("DOM.getDocument", { depth: 2 });
const { nodeId } = await client.send("DOM.querySelector", { nodeId: root.nodeId, selector: "body" });
const matched = await client.send("CSS.getMatchedStylesForNode", { nodeId });
const lines = [];
for (const m of matched.matchedCSSRules || []) {
  const ff = m.rule.style.cssProperties?.find((p) => p.name === "font-family");
  if (ff) lines.push({ origin: m.rule.origin, sel: (m.rule.selectorList?.text || "").slice(0, 50), ff: (ff.value || "").slice(0, 60), layers: m.rule.layers?.map((l) => l.text).join(">") });
}
console.log("===== CDP body font-family 命中规则 =====");
console.log(JSON.stringify(lines, null, 2));

const r = await page.evaluate(() => {
  const FULL = `var(--font-geist-sans),ui-sans-serif,system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",sans-serif`;
  const out = [];
  const t = (name, css) => {
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
    out.push({ name, ff: getComputedStyle(document.body).fontFamily.slice(0, 55) });
    st.remove();
  };
  t("A 未分层+var全栈", `body{font-family:${FULL}}`);
  t("F 未分层+纯var", `body{font-family:var(--font-geist-sans)}`);
  t("H body直写变量+原栈", `body{--font-geist-sans:"Geist";font-family:var(--font-geist-sans),ui-sans-serif,sans-serif}`);
  return out;
});
console.log("===== 网页版实验矩阵 =====");
console.log(JSON.stringify(r, null, 2));

await browser.close();
srv.close();
