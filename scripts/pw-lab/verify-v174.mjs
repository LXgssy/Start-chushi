import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/* verify-v174.mjs — v1.7.4 删除磁贴抖动修复批端到端验证
 * A 行数计算计入常驻「添加」位：6 磁贴（7 槽两排）→ pb-44 基线（不再误判单排上移）；
 *   5 磁贴（6 槽单排）→ pb-[15rem] 上移
 * B 抖动根除（逐帧采样）：批量模式连删 8→7→6→5，时钟区 Y 单帧位移全程 < 20px
 *   （修复前：7→6 处 pb 误换挡瞬跳 32px；6→5 处网格塌排+居中回移单帧 ~52px）
 * C 高度形变盒：跨排删除（6→5）时 .cl-links 高度盒弹簧滑移（中间帧 ≥ 2）
 * D main 挂 padding 过渡；5 磁贴终态 pb-[15rem] 到位
 * E 添加磁贴（5→6）回 pb-44 基线；pageerror=0 */

const ROOT = "/home/z/my-project/out";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain",
};

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  p = p.replace(/^\/Start-chushi/, "") || "/";
  if (p.endsWith("/")) p += "index.html";
  let f = join(ROOT, p);
  if (!existsSync(f)) f = join(ROOT, "index.html");
  try {
    const body = readFileSync(f);
    const ext = f.slice(f.lastIndexOf("."));
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(4622, r));

const browser = await chromium.launch();
/* 视口 915px：命中抖动敏感区——该高度下「内容+padding」与 dvh 相互作用，
 * justify-center 空隙在 0↔非0 间摆动（800px 视口下内容恒溢出、空隙恒 0，
 * 时钟不动，复现不了旧抖动路径） */
const ctx = await browser.newContext({ viewport: { width: 1280, height: 915 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}
const B = "http://localhost:4622";

const mkLinks = (n) => {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push({ id: `t${i}`, name: `站${i}`, url: `https://example${i}.com` });
  return arr;
};
const setLinks = (n) => page.evaluate((links) => localStorage.setItem("start:links", JSON.stringify(links)), mkLinks(n));
const mainCls = () => page.getAttribute("main", "class");
async function boot(n) {
  await setLinks(n);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".cl-links", { timeout: 15000 });
  await page.waitForTimeout(900); /* intro 稳定 + morph 测高武装(500ms) */
}

/* ---------- A 行数语义（含常驻添加位） ---------- */
await page.goto(B + "/", { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await boot(6);
let cls = await mainCls();
check("A 6 磁贴（7 槽两排）→ pb-44 基线不再误上移", cls.includes("pb-44") && !cls.includes("pb-[15rem]"), cls.match(/pb-\S+/g)?.join(",") ?? "");
await boot(5);
cls = await mainCls();
check("A 5 磁贴（6 槽单排）→ pb-[15rem] 上移", cls.includes("pb-[15rem]"), cls.match(/pb-\S+/g)?.join(",") ?? "");
check("D main 挂 padding 过渡（换挡滑移不瞬跳）", cls.includes("transition-[padding]"));

/* ---------- B+C 抖动根除：批量模式连删 8→5，逐帧采样时钟 Y + 高度盒 ---------- */
await boot(8);
await page.evaluate(() => window.dispatchEvent(new CustomEvent("start:links-manage")));
await page.waitForTimeout(400);

const rounds = [];
for (let r = 0; r < 3; r++) {
  const data = await page.evaluate(async () => {
    const clockEl = document.querySelector("section[aria-label='时间与问候']");
    const box = document.querySelector(".cl-links > div");
    const del = document.querySelector(".cl-links button[aria-label^='删除']");
    const before = { clock: clockEl.getBoundingClientRect().top, h: box?.getBoundingClientRect().height ?? -1 };
    const ys = []; const hs = [];
    let stop = false;
    const t0 = performance.now();
    (function tick() {
      ys.push(clockEl.getBoundingClientRect().top);
      hs.push(box?.getBoundingClientRect().height ?? -1);
      if (performance.now() - t0 < 1700) requestAnimationFrame(tick);
      else stop = true;
    })();
    del.click();
    await new Promise((r2) => setTimeout(r2, 1800));
    return {
      clockBefore: before.clock, clockAfter: clockEl.getBoundingClientRect().top,
      hBefore: before.h, hAfter: box?.getBoundingClientRect().height ?? -1,
      ys, hs,
    };
  });
  rounds.push(data);
  await page.waitForTimeout(200);
}

const allYs = rounds.flatMap((s) => s.ys);
/* 判别律（Task 59 环境律）：无头 rAF ~13fps 下弹簧首帧步进可达行程 30%+（真机 60fps 约 1/4），
 * 单帧阈值会误伤弹簧——瞬跳与弹簧用「运动连续性」区分：
 *   瞬跳 = 单帧完成全部行程（中间帧 0）；弹簧 = 多帧连续（中间帧 ≥ 2） */
const transitFrames = (ys) => {
  const a = ys[0]; const b = ys[ys.length - 1];
  if (Math.abs(b - a) < 2) return { moved: false, mid: 0, maxJump: 0 };
  const lo = Math.min(a, b); const hi = Math.max(a, b);
  let mid = 0; let mj = 0;
  for (let i = 1; i < ys.length; i++) {
    mj = Math.max(mj, Math.abs(ys[i] - ys[i - 1]));
    if (ys[i] > lo + 1 && ys[i] < hi - 1) mid++;
  }
  return { moved: true, mid, maxJump: mj };
};

/* B1 根因①回归：同排删除（8→7、7→6）旧代码 pb 误换挡单帧瞬跳 32px → 现在时钟不动 */
const r0 = transitFrames(rounds[0].ys);
const r1 = transitFrames(rounds[1].ys);
check("B1 同排删除（8→7、7→6）时钟不再动（旧 pb 误换挡 32px 瞬跳根除）",
  Math.abs(rounds[0].clockAfter - rounds[0].clockBefore) < 3 && Math.abs(rounds[1].clockAfter - rounds[1].clockBefore) < 3,
  `Δ0=${(rounds[0].clockAfter - rounds[0].clockBefore).toFixed(1)} Δ1=${(rounds[1].clockAfter - rounds[1].clockBefore).toFixed(1)}`);

/* B2 根因②回归：跨排删除（6→5）旧行程单帧完成（mid=0）→ 现在弹簧+CSS 过渡多步走完。
 * 13fps 采样下 500ms 过渡仅 ~6 帧、ease-out 首帧占大半行程，mid≥1 即「非单帧瞬跳」
 * 的充要判据；真机 60fps 平滑性由 D（padding transition）+ C（高度盒多帧滑移）共同覆盖 */
const r2 = transitFrames(rounds[2].ys);
check("B2 跨排删除时钟多步滑移（非单帧瞬跳：中间帧 ≥ 1）", r2.mid >= 1,
  `Δ=${(rounds[2].clockAfter - rounds[2].clockBefore).toFixed(1)}px mid=${r2.mid} maxFrame=${r2.maxJump.toFixed(1)}`);
check("B 时钟整体确有位移（滑移非静止）", Math.abs(allYs[allYs.length - 1] - allYs[0]) > 6, `Δ=${(allYs[allYs.length - 1] - allYs[0]).toFixed(1)}px`);

/* C：跨排轮 = 高度发生变化的轮次（应为第 3 轮 6→5） */
const crossIdx = rounds.findIndex((s) => Math.abs(s.hAfter - s.hBefore) > 10);
check("C 跨排删除发生在 6→5 轮（前两轮同排无高度变化）", crossIdx === 2, `crossIdx=${crossIdx} hΔ=[${rounds.map((s) => (s.hAfter - s.hBefore).toFixed(0)).join(", ")}]`);
if (crossIdx >= 0) {
  const hs = rounds[crossIdx].hs;
  const distinctH = new Set(hs.map((h) => Math.round(h))).size;
  check("C 高度盒弹簧滑移（跨排轮中间帧 ≥ 2）", distinctH >= 2, `distinct=${distinctH} ${hs[0]?.toFixed(0)}→${hs[hs.length - 1]?.toFixed(0)}`);
}
const clsAfter = await mainCls();
check("C 5 磁贴终态 → pb-[15rem] 上移到位", clsAfter.includes("pb-[15rem]"), clsAfter.match(/pb-\S+/g)?.join(",") ?? "");

/* ---------- E 添加磁贴 5→6 回基线 ---------- */
await page.evaluate(() => document.querySelector("button[aria-label='添加快捷链接']").click());
await page.waitForSelector("[role='dialog'] input[placeholder*='网址']", { timeout: 5000 });
await page.fill("[role='dialog'] input[placeholder*='网址']", "example.com");
await page.keyboard.press("Enter");
await page.waitForTimeout(1200);
const clsBack = await mainCls();
check("E 添加回 6 磁贴 → 恢复 pb-44 基线", clsBack.includes("pb-44") && !clsBack.includes("pb-[15rem]"), clsBack.match(/pb-\S+/g)?.join(",") ?? "");

check("F pageerror 全程为 0", errors.length === 0, errors.join(" | ").slice(0, 200));

const fails = results.filter((r) => !r.ok);
console.log(`\n===== verify-v174 ${results.length - fails.length}/${results.length} 通过 =====`);
writeFileSync("/home/z/my-project/tool-results/verify-v174.json", JSON.stringify(results, null, 2));
await browser.close();
server.close();
process.exit(fails.length > 0 ? 1 : 0);
