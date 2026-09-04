import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

/* verify-v172.mjs — v1.7.2 五问批端到端验证
 * ① 搜索建议：鼠标 hover 选中后移出列表 → 高亮清除（回车不再命中旧项）
 * ② 掠影壁纸：URL 导入图片直链 → wallpaperUrl 持久化 + img[data-wallpaper] 渲染；
 *    URL 导入 .mp4 直链 → <video> 渲染；本地上传 GIF 原样保存（不降采样）
 * ③ 一排磁贴主列上移（min-[720px]:pb-[15rem]）；两排恢复 pb-44
 * ④ 字体链：body/clock computed 含 Geist（扩展环境由 verify-ext-v172 实测）
 * ⑤ 导入面板拖拽提示 = 与宿主同参弹簧（按钮位移发生 + 高度弹簧中间态）
 * ⑥ pageerror 全程为 0 */

const ROOT = "/home/z/my-project/out";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain",
  ".cshz": "application/zip", ".zip": "application/zip",
  ".mp4": "video/mp4", ".gif": "image/gif", ".webm": "video/webm",
};

/* 极小 PNG（1x1 红点）与最小 webm 供媒体测试 */
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
  if (p === "/test-clip.mp4") {
    /* 无有效视频载荷也可——渲染链只断言 <video> 挂载与 onCanPlay 兜底 */
    res.writeHead(200, { "content-type": "video/mp4" });
    res.end(Buffer.alloc(64));
    return;
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
await new Promise((r) => server.listen(4618, r));
console.log("serve out/ on :4618");

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
const B = "http://localhost:4618";

/* ---------- ① 搜索建议选中残留 ---------- */
await page.goto(B + "/", { waitUntil: "networkidle" });
await page.waitForSelector(".search-input", { timeout: 15000 });
await page.click(".search-input");
await page.fill(".search-input", "天气");
await page.waitForSelector("#search-sug-list [role='option']", { timeout: 8000 });
/* hover 第 2 行 → 高亮 */
const opt2 = page.locator("#search-sug-list [role='option']").nth(1);
await opt2.hover();
await page.waitForTimeout(120);
check("① hover 后第 2 行高亮", (await opt2.getAttribute("data-active")) === "true");
/* 移出列表 → 高亮清除 */
await page.mouse.move(640, 620);
await page.waitForTimeout(150);
const cleared = await page.locator("#search-sug-list [role='option'][data-active='true']").count();
check("① 鼠标移出列表后高亮清除", cleared === 0, `残留 ${cleared} 条`);
/* 键盘选择仍然工作（↑ 键） */
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(80);
check("① 键盘导航不受影响", (await page.locator("#search-sug-list [role='option']").first().getAttribute("data-active")) === "true");
await page.keyboard.press("Escape");

/* ---------- ④ 网页版字体链回归 ---------- */
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });
const ffWeb = await page.evaluate(() => ({
  body: getComputedStyle(document.body).fontFamily,
  clock: getComputedStyle(document.querySelector(".clock-text")).fontFamily,
}));
check("④ 网页版 body 字体栈含 Geist", ffWeb.body.includes("Geist"), ffWeb.body.slice(0, 60));
check("④ 网页版时钟字体栈含 Geist", ffWeb.clock.includes("Geist"), ffWeb.clock.slice(0, 60));

/* ---------- ③ 一排磁贴上移 / 两排恢复 ---------- */
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("main", { timeout: 15000 });
const mainCls1 = await page.getAttribute("main", "class");
check("③ 默认一排磁贴 → 主列含 pb-[15rem] 上移", mainCls1.includes("pb-[15rem]"), mainCls1.match(/pb-\S+/g)?.join(",") ?? "");
/* 注入 8 个磁贴（两排）→ 恢复 pb-44 */
await page.evaluate(() => {
  const links = [];
  for (let i = 0; i < 8; i++) links.push({ id: `t${i}`, name: `站${i}`, url: "https://example.com" });
  localStorage.setItem("start:links", JSON.stringify(links));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("main", { timeout: 15000 });
const mainCls2 = await page.getAttribute("main", "class");
check("③ 两排磁贴 → 主列恢复 pb-44 基线", mainCls2.includes("pb-44") && !mainCls2.includes("pb-[15rem]"), mainCls2.match(/pb-\S+/g)?.join(",") ?? "");

/* ---------- ② 掠影壁纸：URL 导入图片 / 视频 ---------- */
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".search-input", { timeout: 15000 });
/* 打开设置面板（dock 齿轮） */
await page.locator(".cl-dock button[aria-label='设置'], .cl-dock button:has([aria-label])").first();
const gear = page.locator("[data-panel-id='settings'], .cl-dock button").filter({ hasText: "" });
/* 走全局事件更稳：派发 ⌘K 打开设置不可行——直接点 dock 的设置按钮（aria-label） */
const settingsBtn = page.locator(".cl-dock button[aria-label*='设置']");
await settingsBtn.first().click();
await page.waitForTimeout(600);
/* 背景切「掠影」 */
await page.locator("[role='radiogroup'][aria-label='背景'] button", { hasText: "掠影" }).click();
await page.waitForTimeout(700);
/* URL 导入图片直链（回车提交——面板深处另有「导入」数据按钮，避免误点） */
await page.fill("input[aria-label='壁纸直链 URL']", `${B}/test-wall.png`);
await page.locator("input[aria-label='壁纸直链 URL']").press("Enter");
await page.waitForTimeout(400);
const afterImg = await page.evaluate(() => JSON.parse(localStorage.getItem("start:settings") ?? "{}"));
check("② 图片直链导入 → wallpaperUrl 持久化", afterImg.wallpaperUrl === `${B}/test-wall.png`, String(afterImg.wallpaperUrl));
check("② 图片直链导入 → photoId=custom", afterImg.photoId === "custom");
/* 壁纸渲染（黑幕序列 660ms + 预热） */
await page.waitForSelector("img[data-wallpaper]", { timeout: 8000 });
check("② 图片直链 → img[data-wallpaper] 渲染", (await page.getAttribute("img[data-wallpaper]", "src")) === `${B}/test-wall.png`);
/* URL 导入视频直链 → <video> 渲染 */
await page.fill("input[aria-label='壁纸直链 URL']", `${B}/test-clip.mp4`);
await page.locator("input[aria-label='壁纸直链 URL']").press("Enter");
await page.waitForTimeout(1600);
const afterVid = await page.evaluate(() => JSON.parse(localStorage.getItem("start:settings") ?? "{}"));
check("② 视频直链导入 → wallpaperUrl 持久化", afterVid.wallpaperUrl === `${B}/test-clip.mp4`);
await page.waitForSelector("video", { timeout: 8000, state: "attached" });
check("② 视频直链 → <video muted loop autoplay> 渲染", await page.evaluate(() => {
  const v = document.querySelector("video");
  return !!v && v.muted && v.loop && v.hasAttribute("autoplay") && v.getAttribute("src")?.endsWith("test-clip.mp4");
}));
/* 自定义壁纸缩略图：视频 → 图标占位（无 broken img） */
const thumbIconOk = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("[aria-label='自定义壁纸']")];
  return btns.length === 1 && btns[0].querySelector("img") == null;
});
check("② 视频壁纸缩略图用图标占位（无坏图）", thumbIconOk);

/* ---------- ② 本地 GIF 上传原样保存（不降采样） ---------- */
/* 构造一个 4 字节以上的假 GIF 文件（判定走 mime，无需真解码） */
const gifB64 = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const f = new File([arr], "tiny.gif", { type: "image/gif" });
  const dt = new DataTransfer();
  dt.items.add(f);
  const input = document.querySelector("input[accept='image/*,video/*']");
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, gifB64.toString("base64"));
await page.waitForTimeout(600);
const gifStored = await page.evaluate(async () => {
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
check("② GIF 上传原样入库（type/尺寸不变）", gifStored?.type === "image/gif" && gifStored.size === gifB64.length, JSON.stringify(gifStored));
check("② GIF 上传 → 清 URL 源（互斥）", (await page.evaluate(() => JSON.parse(localStorage.getItem("start:settings")).wallpaperUrl)) === "");

/* ---------- ⑤ 导入面板拖拽提示 = 同参弹簧 ---------- */
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".search-input", { timeout: 15000 });
/* ⌘K 打开指令面板（metaKey+ctrlKey 同设，无头环境稳定） */
await page.evaluate(() => {
  const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true });
  document.dispatchEvent(ev);
});
await page.waitForTimeout(700);
await page.getByText("导入预设").first().click();
await page.waitForTimeout(500);
/* dragover 与采样合并进同一次 evaluate（Task 59 环境律：无头 rAF ~13fps）。
   v1.7.2 断言升级：Collapse 与宿主外壳同为 460/38 弹簧——采样中间帧数 ≥ 2
   即时间线连续（脱拍修复后按钮位移与高度形变同一条弹簧，肉眼同步） */
const btnRow = page.locator("text=填入示例").first();
const sample5 = await page.evaluate((el) => new Promise((resolve) => {
  const dt = new DataTransfer();
  el.closest("div").dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
  const t0 = performance.now(); const ys = []; let hintBox = null;
  function tick() {
    ys.push(el.getBoundingClientRect().y);
    for (const p of document.querySelectorAll("p")) {
      if (p.textContent.includes("松开即导入")) {
        const box = p.parentElement; /* Collapse 的 motion.div 高度盒 */
        hintBox = { h: box.style.height, overflow: getComputedStyle(box).overflow };
      }
    }
    if (performance.now() - t0 < 700) requestAnimationFrame(tick);
    else resolve({ ys, hintBox });
  }
  requestAnimationFrame(tick);
}), await btnRow.elementHandle());
await page.waitForTimeout(200);
const afterY = (await btnRow.boundingBox())?.y;
const hintVisible = (await page.locator("text=松开即导入该预设文件").count()) > 0;
const { ys, hintBox } = sample5;
const beforeY = ys[0];
const shift = afterY - beforeY;
const distinct = new Set(ys.map((y) => Math.round(y * 10))).size;
check("⑤ 拖拽提示出现（Collapse 弹簧展开）", hintVisible);
check("⑤ 按钮组被推下且高度弹簧连续（位移发生 + 中间帧 ≥ 2 + 高度盒在管）",
  shift > 4 && hintBox != null && hintBox.overflow === "hidden" && distinct >= 2,
  `shift=${shift.toFixed(1)} distinct=${distinct} heightBox=${JSON.stringify(hintBox)}`);
/* 拖离收起 */
await page.evaluate(() => {
  const ta = document.querySelector("textarea[placeholder*='chushi']");
  const dt = new DataTransfer();
  ta.closest("div").dispatchEvent(new DragEvent("dragleave", { bubbles: true, cancelable: true, dataTransfer: dt }));
});
await page.waitForTimeout(600);
check("⑤ 拖离后提示收起", (await page.locator("text=松开即导入该预设文件").count()) === 0);

check("⑥ pageerror 全程为 0", errors.length === 0, errors.join(" | ").slice(0, 200));

const fails = results.filter((r) => !r.ok);
console.log(`\n===== verify-v172 ${results.length - fails.length}/${results.length} 通过 =====`);
writeFileSync("/home/z/my-project/tool-results/verify-v172.json", JSON.stringify(results, null, 2));
await browser.close();
server.close();
process.exit(fails.length > 0 ? 1 : 0);
