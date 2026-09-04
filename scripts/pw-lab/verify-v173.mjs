import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

/* verify-v173.mjs — v1.7.3 壁纸视频导入修复批端到端验证
 * A 本地上传 H.264 视频 → 探测通过入库 → <video> 真实解码上屏（红色像素实证）
 * B custom 模式重复导入另一视频 → wallpaperRev 自增 + 壁纸刷新为蓝色（不刷新根因回归）
 * C 本地上传 HEVC → 导入被拦截 + 友好提示（编码不支持），壁纸/版本号/IDB 均不变
 * D URL 导入 H.264 直链 → 探测通过生效 + rev 自增 + 互斥清 IDB
 * E URL 导入 HEVC 直链 → 拦截 + 提示，wallpaperUrl 不变
 * F URL 导入图片直链回归（v1.7.2 不破坏）
 * G pageerror 全程为 0 */

const ROOT = "/home/z/my-project/out";
const MEDIA = "/home/z/my-project/scripts/pw-lab/media";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain",
  ".mp4": "video/mp4", ".gif": "image/gif", ".webm": "video/webm",
};

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  p = p.replace(/^\/Start-chushi/, "") || "/";
  if (p.endsWith("/")) p += "index.html";
  if (p === "/test-wall.png") {
    res.writeHead(200, { "content-type": "image/png" });
    res.end(PNG_1PX);
    return;
  }
  if (p.startsWith("/media/")) {
    const f = join(MEDIA, p.slice("/media/".length));
    if (existsSync(f)) {
      res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
      res.end(readFileSync(f));
      return;
    }
  }
  let f = join(ROOT, p);
  if (!existsSync(f)) f = join(ROOT, "index.html");
  try {
    const body = readFileSync(f);
    res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("nf");
  }
});
await new Promise((r) => server.listen(4619, r));
console.log("serve out/ on :4619");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}
const B = "http://localhost:4619";

/* 工具：构造 File 塞进壁纸 file input 并触发 change */
async function uploadWallpaper(b64, name, type) {
  await page.evaluate(async ({ b64, name, type }) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const f = new File([arr], name, { type });
    const dt = new DataTransfer();
    dt.items.add(f);
    const input = document.querySelector("input[accept='image/*,video/*']");
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { b64, name, type });
}

/* 工具：读渲染中的壁纸 <video> 状态（src / 是否 photoReady / 中心像素） */
const videoState = () => page.evaluate(() => {
  const v = document.querySelector("video");
  if (!v) return null;
  let px = null;
  try {
    if (v.readyState >= 2) {
      const c = document.createElement("canvas");
      c.width = 64; c.height = 36;
      const g = c.getContext("2d");
      g.drawImage(v, 0, 0, 64, 36);
      const d = g.getImageData(32, 18, 1, 1).data;
      px = [d[0], d[1], d[2]];
    }
  } catch { px = "taint"; }
  return { src: v.src, ready: v.className.includes("opacity-100"), px };
});
const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem("start:settings") ?? "{}"));
const idbWall = () => page.evaluate(async () => {
  const db = await new Promise((res) => {
    const r = indexedDB.open("start-db", 1);
    r.onsuccess = () => res(r.result);
  });
  const blob = await new Promise((res) => {
    const tx = db.transaction("kv", "readonly");
    const q = tx.objectStore("kv").get("custom-wallpaper");
    q.onsuccess = () => res(q.result);
  });
  db.close();
  return blob ? { type: blob.type, size: blob.size } : null;
});

/* ---------- 场景准备：掠影模式 + 设置面板 ---------- */
await page.goto(B + "/", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".search-input", { timeout: 15000 });
await page.locator(".cl-dock button[aria-label*='设置']").first().click();
await page.waitForTimeout(600);
await page.locator("[role='radiogroup'][aria-label='背景'] button", { hasText: "掠影" }).click();
await page.waitForTimeout(700);

/* ---------- A 本地上传 H.264 视频 → 上屏 ---------- */
const red = readFileSync(join(MEDIA, "w-red.mp4")).toString("base64");
await uploadWallpaper(red, "red.mp4", "video/mp4");
await page.waitForSelector("video", { timeout: 8000, state: "attached" });
await page.waitForTimeout(2500); /* 探测 + 黑幕序列 + 揭幕 */
const sA = await settings();
const vA = await videoState();
check("A H.264 上传 → wallpaperRev 自增", sA.wallpaperRev === 1, String(sA.wallpaperRev));
check("A H.264 上传 → <video> 解码上屏（opacity-100）", vA?.ready === true, JSON.stringify(vA?.src ?? null));
check("A 上屏像素为红色（真实解码）", Array.isArray(vA?.px) && vA.px[0] > 180 && vA.px[1] < 80 && vA.px[2] < 80, JSON.stringify(vA?.px));
check("A 源为 blob objectURL", (vA?.src ?? "").startsWith("blob:"));

/* ---------- B custom 模式重复导入 → 刷新（根因回归） ---------- */
const blue = readFileSync(join(MEDIA, "w-blue.mp4")).toString("base64");
await uploadWallpaper(blue, "blue.mp4", "video/mp4");
await page.waitForTimeout(3000);
const sB = await settings();
const vB = await videoState();
check("B 重复导入 → wallpaperRev 再自增", sB.wallpaperRev === 2, String(sB.wallpaperRev));
check("B 重复导入 → 壁纸 <video> 换新源", vA && vB && vA.src !== vB.src, `${(vA?.src ?? "").slice(-12)} → ${(vB?.src ?? "").slice(-12)}`);
check("B 新视频解码上屏（蓝色像素实证刷新）", Array.isArray(vB?.px) && vB.px[2] > 180 && vB.px[0] < 80 && vB.px[1] < 80 && vB.ready === true, JSON.stringify(vB?.px));

/* ---------- C 本地上传 HEVC → 拦截 + 提示 ---------- */
const hevc = readFileSync(join(MEDIA, "hevc-test.mp4")).toString("base64");
await uploadWallpaper(hevc, "hevc.mp4", "video/mp4");
await page.waitForTimeout(1500);
const hintC = await page.locator("text=不支持该视频编码").count();
check("C HEVC 上传 → 明确提示编码不支持", hintC > 0);
const sC = await settings();
const vC = await videoState();
check("C HEVC 被拒 → wallpaperRev 不变", sC.wallpaperRev === 2, String(sC.wallpaperRev));
check("C HEVC 被拒 → 壁纸未受影响（仍蓝色 blob）", vC && vC.src === vB.src, JSON.stringify(vC?.px));
const wallC = await idbWall();
check("C HEVC 未入库（IDB 仍是 blue.mp4）", wallC?.size === readFileSync(join(MEDIA, "w-blue.mp4")).length, JSON.stringify(wallC));

/* ---------- D URL 导入 H.264 直链 → 生效 ---------- */
await page.fill("input[aria-label='壁纸直链 URL']", `${B}/media/w-red.mp4`);
await page.locator("input[aria-label='壁纸直链 URL']").press("Enter");
await page.waitForTimeout(3000);
const sD = await settings();
const vD = await videoState();
check("D 视频直链导入 → wallpaperUrl 持久化", sD.wallpaperUrl === `${B}/media/w-red.mp4`, String(sD.wallpaperUrl));
check("D 直链导入 → wallpaperRev 自增", sD.wallpaperRev === 3, String(sD.wallpaperRev));
check("D 直链视频解码上屏（红色像素）", Array.isArray(vD?.px) && vD.px[0] > 180 && vD.px[1] < 80 && vD.px[2] < 80 && vD.ready === true, JSON.stringify(vD?.px));
const wallD = await idbWall();
check("D URL 导入 → 互斥清 IDB 本地文件", wallD === null, JSON.stringify(wallD));

/* ---------- E URL 导入 HEVC 直链 → 拦截 ---------- */
await page.fill("input[aria-label='壁纸直链 URL']", `${B}/media/hevc-test.mp4`);
await page.locator("input[aria-label='壁纸直链 URL']").press("Enter");
await page.waitForTimeout(1500);
const hintE = await page.locator("text=无法在当前浏览器解码").count();
check("E HEVC 直链 → 明确提示无法解码", hintE > 0);
const sE = await settings();
check("E HEVC 直链被拒 → wallpaperUrl 不变", sE.wallpaperUrl === `${B}/media/w-red.mp4`, String(sE.wallpaperUrl));
check("E HEVC 直链被拒 → wallpaperRev 不变", sE.wallpaperRev === 3, String(sE.wallpaperRev));

/* ---------- F URL 导入图片直链回归 ---------- */
await page.fill("input[aria-label='壁纸直链 URL']", `${B}/test-wall.png`);
await page.locator("input[aria-label='壁纸直链 URL']").press("Enter");
await page.waitForTimeout(2000);
await page.waitForSelector("img[data-wallpaper]", { timeout: 8000 });
check("F 图片直链回归 → img[data-wallpaper] 渲染",
  (await page.getAttribute("img[data-wallpaper]", "src")) === `${B}/test-wall.png`);
check("F 图片直链 → rev 自增到 4", (await settings()).wallpaperRev === 4, String((await settings()).wallpaperRev));

check("G pageerror 全程为 0", errors.length === 0, errors.join(" | ").slice(0, 200));

const fails = results.filter((r) => !r.ok);
console.log(`\n===== verify-v173 ${results.length - fails.length}/${results.length} 通过 =====`);
writeFileSync("/home/z/my-project/tool-results/verify-v173.json", JSON.stringify(results, null, 2));
await browser.close();
server.close();
process.exit(fails.length > 0 ? 1 : 0);
