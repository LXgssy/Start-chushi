import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* repro-shake.mjs — 复现「快捷服务两排变一排时页面抖动」（v1.8.0 bug 2）
 * 手法：矮视口（1280x680）+ 6 个磁贴（+添加 = 7 槽 = 两排）→ 编辑模式删 2 个
 * → 变一排。全程 rAF 采样：滚动条（scrollWidth-clientWidth）、时钟/搜索框
 * boundingClientRect、window.scrollX/Y —— 任一帧间跳变 >2px 即判抖动。
 */

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
await new Promise((r) => server.listen(4629, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: Number(process.env.VP_H || 680) } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  localStorage.clear();
  localStorage.setItem("start:settings", JSON.stringify({ themeMode: "dark" }));
  const ids = ["a", "b", "c", "d", "e", "f"];
  localStorage.setItem("start:links", JSON.stringify(
    ids.map((id, i) => ({ id, name: "磁贴" + (i + 1), url: "https://example.com/" + id }))
  ));
});
await page.goto("http://localhost:4629/", { waitUntil: "networkidle" });
await page.waitForSelector(".clock-text", { timeout: 15000 });
await page.waitForTimeout(1200); // 等入场动画稳定

/* 帧级采样器：headless 下 rAF 被节流，用 16ms setInterval 采样 */
await page.evaluate(() => {
  window.__samples = [];
  const clock = document.querySelector(".clock-text") ?? document.body;
  window.__probe = () => {
    const d = document.documentElement;
    const r = clock.getBoundingClientRect();
    const main = document.querySelector("main");
    window.__samples.push({
      t: performance.now(),
      sb: d.scrollWidth - d.clientWidth,
      sy: window.scrollY, sx: window.scrollX,
      cx: Math.round(r.left * 10) / 10, cy: Math.round(r.top * 10) / 10,
      sh: d.scrollHeight, ch: d.clientHeight,
      mt: Math.round(main.getBoundingClientRect().top * 10) / 10,
      mh: main.getBoundingClientRect().height,
      tiles: document.querySelectorAll(".cl-links a").length,
    });
  };
  window.__probeTimer = setInterval(window.__probe, 16);
});

/* 删除磁贴：派发批量管理事件 → 等编辑态 → 原生 el.click() 删除
 * （DEL_S 环境变量控制删除个数；原生点击绕过 Playwright 的
 *  scrollIntoViewIfNeeded —— 排除测试器自身引入的滚动） */
const DELS = Number(process.env.DEL_S || 2);
await page.evaluate(() => window.dispatchEvent(new CustomEvent("start:links-manage")));
await page.waitForTimeout(500);
for (let i = 0; i < DELS; i++) {
  await page.evaluate(() => {
    const btn = document.querySelector("button[aria-label^='删除']");
    if (btn) btn.click();
  });
  await page.waitForTimeout(150);
}
/* 删除后观察 1500ms（磁贴重排 + 高度弹簧 + pb 过渡全程） */
await page.waitForTimeout(1500);

const samples = await page.evaluate(() => { clearInterval(window.__probeTimer); return window.__samples });
await browser.close();
server.close();

/* 分析：帧间跳变 */
const jumps = [];
for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1], b = samples[i];
  const d = {
    sb: b.sb - a.sb, sy: b.sy - a.sy, sx: b.sx - a.sx,
    cx: b.cx - a.cx, cy: b.cy - a.cy,
  };
  for (const k of Object.keys(d)) {
    if (Math.abs(d[k]) > 2) {
      jumps.push({ t: Math.round(b.t), field: k, delta: Math.round(d[k] * 10) / 10, from: a[k], to: b[k] });
    }
  }
}
const tileSeq = [...new Set(samples.map((s) => s.tiles))];
console.log(`采样 ${samples.length} 帧；磁贴数序列=${tileSeq.join("→")}（应含 7→6→5：含添加槽）`);
console.log(`滚动条槽位：前=${samples[0].sb} 后=${samples[samples.length - 1].sb}`);
console.log(`时钟首帧 y=${samples[0].cy} 末帧 y=${samples[samples.length - 1].cy}`);
/* 跳变前后完整快照 */
const ji = jumps.length ? samples.findIndex((s, i) => i > 0 && Math.abs(s.sy - samples[i - 1].sy) > 2) : -1;
if (ji > 0) {
  for (const k of [-2, -1, 0, 1, 2]) {
    const s = samples[Math.min(samples.length - 1, Math.max(0, ji + k))];
    console.log(`  [${k >= 0 ? "+" : ""}${k}] t=${Math.round(s.t)} sy=${s.sy} cy=${s.cy} sh=${s.sh} ch=${s.ch} mainTop=${s.mt} mainH=${Math.round(s.mh)}`);
  }
}
if (jumps.length === 0) {
  console.log("✓ 无帧级跳变 >2px —— 未复现抖动");
} else {
  console.log(`✗ 复现 ${jumps.length} 处跳变：`);
  const seen = new Set();
  for (const j of jumps) {
    const key = j.field + "@" + Math.floor(j.t / 100);
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  t=${j.t}ms ${j.field}: ${j.from} → ${j.to} (Δ${j.delta})`);
  }
}
if (errors.length) console.log("pageerror:", errors);
