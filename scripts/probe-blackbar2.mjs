/* 深挖：aurora 容器为何 1265 而非 1280 —— 查 computed inset、祖先链 containing-block 触发条件 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "/home/z/my-project/node_modules/playwright-core/index.mjs";

const ROOT = "/home/z/my-project/out";
const PREFIX = "/Start-chushi";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2", ".txt": "text/plain" };
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p.startsWith(PREFIX)) p = p.slice(PREFIX.length) || "/";
    if (p.endsWith("/")) p += "index.html";
    let file = join(ROOT, normalize(p).replace(/^([.][.][/\\])+/, ""));
    let body = await readFile(file).catch(() => null);
    if (!body && !extname(file)) body = await readFile(join(ROOT, "index.html"));
    if (!body) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(500); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.goto(base + PREFIX + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const info = await page.evaluate(() => {
  const aurora = document.querySelector("div.fixed.-z-10");
  if (!aurora) return { err: "aurora not found" };
  const cs = getComputedStyle(aurora);
  const chain = [];
  let el = aurora;
  while (el && el !== document.documentElement) {
    const s = getComputedStyle(el);
    chain.push({
      tag: el.tagName, cls: (el.className + "").slice(0, 80),
      position: s.position, transform: s.transform, filter: s.filter,
      contain: s.contain, willChange: s.willChange, zoom: s.zoom,
      width: el.getBoundingClientRect().width,
      left: s.left, right: s.right, top: s.top, bottom: s.bottom,
      inset: s.inset,
    });
    el = el.parentElement;
  }
  return {
    auroraClass: aurora.className,
    computed: { position: cs.position, inset: cs.inset, left: cs.left, right: cs.right, width: cs.width, height: cs.height, zoom: cs.zoom },
    rect: aurora.getBoundingClientRect(),
    chain,
    dpr: window.devicePixelRatio,
    vv: { w: window.visualViewport?.width, scale: window.visualViewport?.scale },
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
server.close();
