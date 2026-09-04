import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { readFileSync, existsSync as ex } from "node:fs";
import { join, extname } from "node:path";

/* probe-ext-font5.mjs — 找 injected stylesheet 的载体：
 * adoptedStyleSheets / ownerNode 枚举 + 网页版(本地静态服务)对照 */

const STAGE = "/tmp/ext-stage";
const OUT = "/home/z/my-project/out";

/* 本地静态服务网页版对照 */
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".json": "application/json", ".svg": "image/svg+xml" };
const srv = createServer((req, res) => {
  const p = join(OUT, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  try { res.setHeader("content-type", MIME[extname(p)] ?? "application/octet-stream"); res.end(readFileSync(p)); }
  catch { res.statusCode = 404; res.end("x"); }
});
await new Promise((r) => srv.listen(4173, r));

const browser = await chromium.launchPersistentContext("/tmp/ext-font-profile5", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
});
const extId = createHash("sha256").update(STAGE).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");

async function dump(label, url) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const info = [];
    const scan = (sheet, tag) => {
      let ff = "";
      try {
        for (const r of sheet.cssRules) {
          if (r.selectorText === "body" && r.style?.fontFamily) ff = r.style.fontFamily.slice(0, 60);
        }
      } catch {}
      info.push({
        tag,
        href: sheet.href ? sheet.href.split("/").pop() : "(none)",
        owner: sheet.ownerNode ? (sheet.ownerNode.tagName + (sheet.ownerNode.id ? "#" + sheet.ownerNode.id : "")) : "(null)",
        ff,
      });
    };
    for (const s of document.styleSheets) scan(s, "doc");
    for (const s of document.adoptedStyleSheets ?? []) scan(s, "adopted");
    return {
      bodyFF: getComputedStyle(document.body).fontFamily.slice(0, 60),
      sheets: info,
    };
  });
  console.log(`\n===== ${label} =====`);
  console.log(JSON.stringify(r, null, 2));
  await page.close();
}

await dump("扩展 chrome-extension", `chrome-extension://${extId}/index.html`);
await dump("网页版 http://localhost:4173", "http://localhost:4173/");
await browser.close();
srv.close();
