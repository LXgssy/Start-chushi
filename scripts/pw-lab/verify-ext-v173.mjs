import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

/* verify-ext-v173.mjs — v1.7.3 扩展冒烟：
 * A 扩展环境本地上传 H.264 视频 → 探测入库 → <video> 解码上屏
 * B custom 模式重复导入 → wallpaperRev 自增 + 换源刷新
 * C HEVC 上传 → 拦截提示
 * D 视频直链 URL 导入（http 探测 + 生效）
 * 基线时钟/dock + pageerror=0 */

const STAGE = "/tmp/ext-stage";
const MEDIA = "/home/z/my-project/scripts/pw-lab/media";

const srv = createServer((req, res) => {
  const f = join(MEDIA, req.url.replace(/^\//, ""));
  try {
    const body = readFileSync(f);
    res.writeHead(200, { "content-type": "video/mp4" });
    res.end(body);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => srv.listen(4621, r));

const browser = await chromium.launchPersistentContext("/tmp/ext-v173-profile", {
  headless: true,
  channel: "chromium",
  args: [
    `--headless=new`,
    `--autoplay-policy=no-user-gesture-required`,
    `--disable-extensions-except=${STAGE}`,
    `--load-extension=${STAGE}`,
  ],
});
const extId = createHash("sha256").update(STAGE).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
console.log("extId:", extId);

const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });
await page.waitForTimeout(800);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

/* 打开设置 → 掠影 */
await page.locator(".cl-dock button[aria-label*='设置']").first().click();
await page.waitForTimeout(600);
await page.locator("[role='radiogroup'][aria-label='背景'] button", { hasText: "掠影" }).click();
await page.waitForTimeout(700);

async function upload(b64, name) {
  await page.evaluate(async ({ b64, name }) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const f = new File([arr], name, { type: "video/mp4" });
    const dt = new DataTransfer();
    dt.items.add(f);
    const input = document.querySelector("input[accept='image/*,video/*']");
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { b64, name });
}
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

/* A H.264 上传 */
await upload(readFileSync(join(MEDIA, "w-red.mp4")).toString("base64"), "red.mp4");
await page.waitForSelector("video", { timeout: 8000, state: "attached" });
await page.waitForTimeout(2500);
let st = await settings();
let vs = await videoState();
check("A 扩展 H.264 上传 → rev=1 + 解码上屏（红像素）",
  st.wallpaperRev === 1 && Array.isArray(vs?.px) && vs.px[0] > 180 && vs.ready === true, JSON.stringify({ rev: st.wallpaperRev, px: vs?.px }));

/* B 重复导入刷新 */
await upload(readFileSync(join(MEDIA, "w-blue.mp4")).toString("base64"), "blue.mp4");
await page.waitForTimeout(3000);
st = await settings();
const vs2 = await videoState();
check("B 扩展重复导入 → rev=2 + 换源刷新（蓝像素）",
  st.wallpaperRev === 2 && vs.src !== vs2?.src && Array.isArray(vs2?.px) && vs2.px[2] > 180 && vs2.ready === true,
  JSON.stringify({ rev: st.wallpaperRev, px: vs2?.px }));

/* C HEVC 拦截 */
await upload(readFileSync(join(MEDIA, "hevc-test.mp4")).toString("base64"), "hevc.mp4");
await page.waitForTimeout(1500);
const hintC = await page.locator("text=不支持该视频编码").count();
st = await settings();
check("C 扩展 HEVC 上传 → 拦截 + 提示 + rev 不变", hintC > 0 && st.wallpaperRev === 2, `hint=${hintC} rev=${st.wallpaperRev}`);

/* D 视频直链 URL 导入 */
await page.fill("input[aria-label='壁纸直链 URL']", "http://localhost:4621/w-red.mp4");
await page.locator("input[aria-label='壁纸直链 URL']").press("Enter");
await page.waitForTimeout(3000);
st = await settings();
const vs3 = await videoState();
/* 注：chrome-extension 页面对 http 跨源视频有 canvas 污染保护（px="taint"），
   属浏览器安全模型而非功能缺陷——跨源下以 readyState≥2（可解码就绪）+ 探测通过判定 */
check("D 扩展视频直链导入 → 探测通过生效（就绪 + rev=3）",
  st.wallpaperUrl === "http://localhost:4621/w-red.mp4" && st.wallpaperRev === 3 && vs3 != null &&
  (vs3.px === "taint" || (Array.isArray(vs3.px) && vs3.px[0] > 180)) && vs3.ready === true,
  JSON.stringify({ url: st.wallpaperUrl, rev: st.wallpaperRev, px: vs3?.px, ready: vs3?.ready }));

/* 基线 */
check("基线：扩展时钟渲染", await page.locator(".cl-clock").count() > 0);
check("基线：扩展 dock 渲染", await page.locator(".cl-dock").count() > 0);
check("pageerror 全程为 0", errors.length === 0, errors.join(" | ").slice(0, 200));

const fails = results.filter((r) => !r.ok);
console.log(`\n===== 扩展冒烟 v1.7.3 ${results.length - fails.length}/${results.length} 通过 =====`);
writeFileSync("/home/z/my-project/tool-results/verify-ext-v173.json", JSON.stringify(results, null, 2));
await browser.close();
srv.close();
process.exit(fails.length > 0 ? 1 : 0);
