/* glow/纯净模式右缘验证：从初始化即 glow，右缘与内容区应同为极光底色 */
import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { execFileSync } from "node:child_process";
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
await page.addInitScript(() => {
  localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark", background: "glow", photoId: "aurora", wallpaperRev: 0 }));
});
await page.goto(base + PREFIX + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(3600);

const st = await page.evaluate(() => ({
  photoMode: document.documentElement.classList.contains("photo-mode"),
  wallpaper: !!document.querySelector("img[data-wallpaper]"),
}));
const clip = { x: 1280 - 60, y: 280, width: 60, height: 120 };
await writeFile("/tmp/bb-glow2.png", await page.screenshot({ clip }));
const px = JSON.parse(
  execFileSync("python3", ["/home/z/my-project/scripts/sample-png.py", "/tmp/bb-glow2.png", "2:content,30:mid,52:gutter,59:rightEdge"], { encoding: "utf8" })
);
console.log("state:", JSON.stringify(st));
console.log("glow pixels:", JSON.stringify(px));
const near = (a, b, tol = 5) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
const uniform = near(px.content, px.mid) && near(px.gutter, px.content) && near(px.rightEdge, px.content);
console.log(!st.photoMode && !st.wallpaper && uniform ? "GLOW PASS ✓ 右缘无缝" : "GLOW CHECK");
await writeFile("/home/z/my-project/download/blackbar-fix-glow.png", await page.screenshot());
await ctx.close();
await browser.close();
server.close();
