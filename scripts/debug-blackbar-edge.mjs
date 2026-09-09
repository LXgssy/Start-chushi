/* 调试：右缘 elementsFromPoint 为何为空 */
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

const wall =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#e11d48"/></svg>`
  );

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.addInitScript(
  ([w]) => {
    localStorage.setItem(
      "start:settings",
      JSON.stringify({ themeMode: "dark", background: "photo", photoId: "custom", wallpaperUrl: w, wallpaperRev: 1 })
    );
  },
  [wall]
);
await page.goto(base + PREFIX + "/", { waitUntil: "networkidle" });
await page.waitForSelector("img[data-wallpaper]");
await page.waitForTimeout(2400);

const d = await page.evaluate(() => {
  const img = document.querySelector("img[data-wallpaper]");
  const aurora = document.querySelector("div.fixed.-z-10");
  const probe = (x, y) => document.elementsFromPoint(x, y).map((e) => e.tagName + "." + (e.className + "").split(" ").slice(0, 2).join("."));
  return {
    imgPE: getComputedStyle(img).pointerEvents,
    auroraPE: getComputedStyle(aurora).pointerEvents,
    bodyPE: getComputedStyle(document.body).pointerEvents,
    atCenter: probe(640, 400),
    atEdge: probe(1272, 400),
    atEdgeY1: probe(1272, 1),
    atBody1264: probe(1264, 400),
    imgRect: img.getBoundingClientRect(),
    auroraOverflow: getComputedStyle(aurora).overflow,
    auroraClip: getComputedStyle(aurora).clipPath,
  };
});
console.log(JSON.stringify(d, null, 2));
await browser.close();
server.close();
