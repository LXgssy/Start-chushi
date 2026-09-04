import { chromium } from "playwright-core";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

/* verify-ext-v172.mjs — v1.7.2 扩展冒烟：
 * ★ 字体锚修复核心断言：扩展新标签页 body/时钟 computed font-family 含 Geist
 *   （v1.7.1 及之前被 UA 注入的未分层 body 规则压成系统字体——字重发虚 +
 *   冒号双点失准），并以数字墨迹中心 vs 冒号圆点中心实测对齐
 * + 壁纸 URL 直链导入链路在扩展 CSP 环境下可用 + 无报错 */

const STAGE = "/tmp/ext-stage";
const browser = await chromium.launchPersistentContext("/tmp/ext-v172-profile", {
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

/* ---------- ★ 字体锚（v1.7.2 核心修复） ---------- */
const fontProbe = await page.evaluate(async () => {
  await document.fonts.ready;
  const clock = document.querySelector(".clock-text");
  return {
    body: getComputedStyle(document.body).fontFamily,
    clock: getComputedStyle(clock).fontFamily,
    check150: document.fonts.check("150 1em Geist"),
  };
});
check("扩展 body 字体栈含 Geist（注入规则被锚规则反压）", fontProbe.body.includes("Geist"), fontProbe.body.slice(0, 70));
check("扩展时钟字体栈含 Geist", fontProbe.clock.includes("Geist"), fontProbe.clock.slice(0, 70));
check("Geist 150 字重可用", fontProbe.check150 === true);

/* 冒号构造性对齐实测：数字槽内墨迹中心 vs 双圆点中点（同为槽盒顶的比例） */
const colonAlign = await page.evaluate(() => {
  const slot = document.querySelector(".digit-slot");
  const digit = slot?.querySelector("span");
  const colon = document.querySelector(".colon-slot");
  if (!slot || !digit || !colon) return null;
  const fs = parseFloat(getComputedStyle(clock_of(slot)).fontSize);
  function clock_of(el) { return el.closest(".clock-text") ?? el; }
  const slotR = slot.getBoundingClientRect();
  const digitR = digit.getBoundingClientRect();
  const inkCenter = (digitR.top + digitR.height / 2 - slotR.top) / fs; /* em */
  const dots = colon.querySelectorAll(".rounded-full");
  const colonR = colon.getBoundingClientRect();
  const dotMid = dots.length === 2
    ? (((dots[0].getBoundingClientRect().top + dots[0].getBoundingClientRect().height / 2) +
        (dots[1].getBoundingClientRect().top + dots[1].getBoundingClientRect().height / 2)) / 2 - colonR.top) / fs
    : null;
  return { inkCenter, dotMid, fs };
});
check("扩展冒号双点关于数字墨迹中心对称（偏差 < 0.01em）",
  colonAlign != null && colonAlign.dotMid != null && Math.abs(colonAlign.inkCenter - colonAlign.dotMid) < 0.01,
  colonAlign ? `ink=${colonAlign.inkCenter.toFixed(4)} dot=${colonAlign.dotMid?.toFixed(4)} @${colonAlign.fs}px` : "n/a");

/* ---------- 壁纸 URL 直链导入（扩展环境链路） ---------- */
/* 注入数据 URL 形态直链（chrome-extension 页面里 img-src 未受 MV3 默认 CSP 限制） */
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") ?? "{}");
  s.background = "photo";
  s.photoId = "custom";
  s.photoLast = "custom";
  s.wallpaperUrl = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  localStorage.setItem("start:settings", JSON.stringify(s));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);
const wallOk = await page.evaluate(() => {
  const img = document.querySelector("img[data-wallpaper]");
  return img != null && img.src.startsWith("data:image/gif");
});
check("扩展壁纸 URL 直链渲染（data URL 形态）", wallOk);

/* ---------- 基线冒烟 ---------- */
check("扩展新标签页渲染（时钟）", await page.locator(".cl-clock").count() > 0);
check("扩展 dock 渲染", await page.locator(".cl-dock").count() > 0);

check("pageerror 全程为 0", errors.length === 0, errors.join(" | ").slice(0, 200));
const fails = results.filter((r) => !r.ok);
console.log(`\n===== 扩展冒烟 v1.7.2 ${results.length - fails.length}/${results.length} 通过 =====`);
writeFileSync("/home/z/my-project/tool-results/verify-ext-v172.json", JSON.stringify(results, null, 2));
await browser.close();
process.exit(fails.length > 0 ? 1 : 0);
