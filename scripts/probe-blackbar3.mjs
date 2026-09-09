/* 验证修复方案：w-screen (100vw) 能否让背景层伸进 scrollbar-gutter 槽位 */
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
await page.waitForTimeout(1000);

/* 修复模拟：AuroraBackground 根容器 inset-0 → 加 width:100vw；html 画布底色对齐主题 */
await page.addStyleTag({
  content: `
    div.fixed.-z-10 { width: 100vw !important; }
    html { background-color: #0a0a0e; }
  `,
});
await page.waitForTimeout(300);

const m = await page.evaluate(() => {
  const aurora = document.querySelector("div.fixed.-z-10");
  const r = aurora.getBoundingClientRect();
  const splasher = [...document.querySelectorAll("div.fixed")].find((d) => /bg-\[#f6f5f2\]/.test(d.className));
  return {
    innerWidth: window.innerWidth,
    bodyWidth: document.body.getBoundingClientRect().width,
    auroraWidth: r.width,
    auroraCovers: r.left + r.width >= window.innerWidth,
    vwProbe: (() => { const d = document.createElement("div"); d.style.cssText = "position:fixed;width:100vw;height:1px;"; document.body.appendChild(d); const w = d.getBoundingClientRect().width; d.remove(); return w; })(),
    splashWidth: splasher ? splasher.getBoundingClientRect().width : null,
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
  };
});
console.log(JSON.stringify(m, null, 2));

/* 截图直观对比：右侧是否还有黑条（放大右缘 60px 区域采样像素色） */
const buf = await page.screenshot({ clip: { x: 1280 - 40, y: 300, width: 40, height: 40 } });
console.log("edge-shot bytes:", buf.length);
await browser.close();
server.close();
