/* 黑边修复终验 v4（方案：根滚动条隐藏 scrollbar-width:none）
 * A. 布局：clientWidth == innerWidth（无槽位）；Aurora/壁纸 rect 直通右缘
 * B. 像素：照片模式右缘 x=1279 与内容区同为红色系（全出血无缝）
 * C. 命中：elementsFromPoint(右缘) 命中壁纸层（无槽位盲区）
 * D. 回归：极光模式右缘近黑无缝；滚动仍可用（注入高元素后 scrollBy 生效） */
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

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#e11d48"/></svg>`;
const wall = "data:image/svg+xml;utf8," + encodeURIComponent(svg);

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

/* A. 布局 + C. 命中 */
const layout = await page.evaluate(() => {
  const aurora = document.querySelector("div.fixed.-z-10");
  const img = document.querySelector("img[data-wallpaper]");
  const ar = aurora.getBoundingClientRect();
  const ir = img.getBoundingClientRect();
  const edgeHits = document.elementsFromPoint(window.innerWidth - 4, 400).map((e) => e.tagName + "." + (e.className + "").split(" ")[0]);
  return {
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    gutter: window.innerWidth - document.body.getBoundingClientRect().width,
    auroraRight: ar.right,
    imgRight: ir.right,
    edgeHitAll: edgeHits,
    hitImgAtEdge: edgeHits.some((t) => t.startsWith("IMG")),
    scrollbarWidth: getComputedStyle(document.documentElement).scrollbarWidth,
  };
});
console.log("layout:", JSON.stringify(layout));

/* B. 像素：整幅右缘条 60px 全红 */
const clip = { x: 1280 - 60, y: 280, width: 60, height: 120 };
await writeFile("/tmp/bb-photo.png", await page.screenshot({ clip }));
const photo = JSON.parse(
  execFileSync("python3", ["/home/z/my-project/scripts/sample-png.py", "/tmp/bb-photo.png", "2:content,30:mid,52:gutter,59:rightEdge"], { encoding: "utf8" })
);
console.log("photo pixels:", JSON.stringify(photo));
await writeFile("/home/z/my-project/download/blackbar-fix-photo.png", await page.screenshot());

/* D1. 滚动仍可用 */
const scrollOK = await page.evaluate(() => {
  const d = document.createElement("div");
  d.style.cssText = "height:300vh";
  document.body.appendChild(d);
  const before = window.scrollY;
  window.scrollTo(0, 600);
  const after = window.scrollY;
  d.remove();
  window.scrollTo(0, 0);
  return after > before;
});
console.log("scroll works:", scrollOK);

/* D2. 极光模式右缘无缝 */
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings"));
  s.background = "glow";
  localStorage.setItem("start:settings", JSON.stringify(s));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(3600);
const glowState = await page.evaluate(() => ({
  bg: JSON.parse(localStorage.getItem("start:settings")).background,
  photoModeClass: document.documentElement.classList.contains("photo-mode"),
  wallpaperInDom: !!document.querySelector("img[data-wallpaper]"),
  htmlBgImage: document.documentElement.style.backgroundImage || "(none)",
}));
console.log("glow state:", JSON.stringify(glowState));
await writeFile("/tmp/bb-glow.png", await page.screenshot({ clip }));
const glow = JSON.parse(
  execFileSync("python3", ["/home/z/my-project/scripts/sample-png.py", "/tmp/bb-glow.png", "2:content,52:gutter,59:rightEdge"], { encoding: "utf8" })
);
console.log("glow pixels:", JSON.stringify(glow));
await writeFile("/home/z/my-project/download/blackbar-fix-glow.png", await page.screenshot());

const isRed = ([r, g, b]) => r > 90 && r > g + 50 && r > b + 40;
const near = (a, b, tol = 6) => Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;

const checks = {
  "A1 无槽位(gutter=0)": layout.gutter === 0,
  "A2 clientWidth==innerWidth": layout.clientWidth === layout.innerWidth,
  "A3 Aurora 直通右缘": layout.auroraRight >= layout.innerWidth,
  "A4 壁纸直通右缘": layout.imgRight >= layout.innerWidth,
  "A5 scrollbar-width=none": layout.scrollbarWidth === "none",
  "B1 照片右缘全红": isRed(photo.content) && isRed(photo.mid) && isRed(photo.gutter) && isRed(photo.rightEdge),
  "C1 右缘命中壁纸层": layout.hitImgAtEdge,
  "D1 滚动可用": scrollOK,
  "D2 极光右缘无缝": near(glow.gutter, glow.content) && near(glow.rightEdge, glow.content),
};
let pass = true;
for (const [k, v] of Object.entries(checks)) {
  console.log(`${v ? "PASS" : "FAIL"}  ${k}`);
  if (!v) pass = false;
}
console.log(pass ? "\n=== ALL PASS ✓ ===" : "\n=== FAIL ✗ ===");
await ctx.close();
await browser.close();
server.close();
process.exit(pass ? 0 : 1);
