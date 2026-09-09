/* 探测「初始」页面右侧黑边成因
 * 假设：html{scrollbar-gutter:stable} 预留了经典滚动条槽位（Windows 经典滚动条环境），
 * 而 AuroraBackground 是 fixed inset-0 —— 固定定位包含块不含滚动条槽位，
 * 背景层盖不到槽位，露出画布底色（暗色 ≈ #0a0a0e 近黑）→ 右侧一条黑边。
 * 验证：clientWidth vs innerWidth 的差 = 槽位宽；背景容器宽是否覆盖 innerWidth。 */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "/home/z/my-project/node_modules/playwright-core/index.mjs";

const ROOT = "/home/z/my-project/out";
const PREFIX = "/Start-chushi";
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json",
  ".woff2": "font/woff2", ".txt": "text/plain",
};

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p.startsWith(PREFIX)) p = p.slice(PREFIX.length) || "/";
    if (p.endsWith("/")) p += "index.html";
    let file = join(ROOT, normalize(p).replace(/^([.][.][/\\])+/, ""));
    let body = await readFile(file).catch(() => null);
    if (!body && !extname(file)) { body = await readFile(join(ROOT, "index.html")); }
    if (!body) { res.writeHead(404); res.end("nf"); return; }
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(500); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
for (const mode of ["overlay-headless-default", "classic-forced"]) {
  const args = mode === "classic-forced"
    ? ["--disable-features=OverlayScrollbar,OverlayScrollbars,FluentScrollbar,FluentOverlayScrollbar"]
    : [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, args });
  const page = await ctx.newPage();
  await page.goto(base + PREFIX + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200); // 等主内容挂载（splash → 主页）
  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const aurora = document.querySelector("div.fixed.-z-10");
    const r = aurora ? aurora.getBoundingClientRect() : null;
    return {
      innerWidth: window.innerWidth,
      clientWidth: de.clientWidth,
      gutter: window.innerWidth - de.clientWidth,
      scrollbarGutter: getComputedStyle(de).scrollbarGutter,
      aurora: r ? { left: r.left, width: r.width, covers: r.left + r.width >= window.innerWidth } : null,
      hasHScroll: de.scrollWidth > de.clientWidth,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      htmlBg: getComputedStyle(de).backgroundColor,
    };
  });
  console.log(`--- ${mode} ---`);
  console.log(JSON.stringify(m, null, 2));
  await ctx.close();
}
await browser.close();
server.close();
