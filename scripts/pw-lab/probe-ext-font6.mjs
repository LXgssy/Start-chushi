import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

/* probe-ext-font6.mjs — 实验矩阵：原 body 栈的哪种形态会失效
 * A 未分层+var  B @layer base+var  C 未分层+字面  D @layer base+字面
 * E 未分层+var(短栈无-apple-system)  F 未分层+var 但变量在 html 上定义 */

const STAGE = "/tmp/ext-stage";
if (!existsSync(`${STAGE}/manifest.json`)) process.exit(2);
const browser = await chromium.launchPersistentContext("/tmp/ext-font-profile6", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
});
const extId = createHash("sha256").update(STAGE).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const page = await browser.newPage();
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const r = await page.evaluate(() => {
  const FULL = `var(--font-geist-sans),ui-sans-serif,system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",sans-serif`;
  const LIT = `"Geist","Geist Fallback",ui-sans-serif,system-ui,"PingFang SC",sans-serif`;
  const SHORT = `var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif`;
  const tests = [
    ["A 未分层+var全栈", `body{font-family:${FULL}}`, false],
    ["B layer base+var全栈", `@layer base{body{font-family:${FULL}}}`, false],
    ["C 未分层+字面", `body{font-family:${LIT}}`, false],
    ["D layer+字面", `@layer base{body{font-family:${LIT}}}`, false],
    ["E 未分层+var短栈", `body{font-family:${SHORT}}`, false],
    ["F 纯var", `body{font-family:var(--font-geist-sans)}`, false],
  ];
  const out = [];
  for (const [name, css] of tests) {
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
    const ff = getComputedStyle(document.body).fontFamily;
    out.push({ name, ff: ff.slice(0, 60) });
    st.remove();
  }
  /* G: 把变量定义搬到 html 上再看原规则 */
  const st = document.createElement("style");
  st.textContent = `html{--font-geist-sans:"Geist","Geist Fallback"}`;
  document.head.appendChild(st);
  out.push({ name: "G 变量挂html后不动原规则", ff: getComputedStyle(document.body).fontFamily.slice(0, 60) });
  st.remove();
  return out;
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
