// perf-probe.mjs — v8.7.171 性能基线/对比量测（真扩展环境）
// 场景：A 拖拽磁贴横穿墙面  B dock 按钮呼出面板  C 抽屉开合
// 指标：长帧数(>32ms)/平均帧时/P95 帧时/JS 堆
// 用法：node perf-probe.mjs <标签>  → /tmp/perf-<标签>.json
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const TAG = process.argv[2] || "baseline";
const ZIP = process.env.PDF_ZIP || "/home/z/beta-wt/download/v8.7.170/ChuShi-NewTab-v8.7.170.zip";
const STAGE = "/tmp/ext-perf";
const PROFILE = "/tmp/ext-perf-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`);
fs.rmSync(PROFILE, { recursive: true, force: true });

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: [
    "--no-sandbox",
    `--disable-extensions-except=${STAGE}`,
    `--load-extension=${STAGE}`,
    // 统一渲染参数（同环境相对对比有效）
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
  viewport: { width: 1280, height: 800 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
const page = browser.pages()[0] || (await browser.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));

await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1500);
/* 40 磁贴 + 极光背景（重负载口径） */
await page.evaluate(() => {
  const links = Array.from({ length: 40 }, (_, i) => ({
    id: "p" + i,
    name: "站点" + i,
    url: `https://s${i}.example.com`,
  }));
  localStorage.setItem("start:links", JSON.stringify(links));
  localStorage.setItem(
    "start:settings",
    JSON.stringify({ iconStyle: "letter", linksForm: "docked", background: "glow" })
  );
});
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2500);

/* 帧采样器：页面内 rAF 连续采样 */
await page.evaluate(() => {
  window.__frames = [];
  let last = performance.now();
  const loop = (t) => {
    window.__frames.push(t - last);
    last = t;
    if (window.__sampling !== false) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});
const snapFrames = async () => page.evaluate(() => {
  const f = window.__frames.splice(0);
  const sorted = [...f].sort((a, b) => a - b);
  const long = f.filter((x) => x > 32).length;
  const avg = f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0;
  const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
  return { n: f.length, long, avg: Math.round(avg * 100) / 100, p95: Math.round(p95 * 100) / 100 };
});
const heap = async () => page.evaluate(() =>
  (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0)
);

const result = { tag: TAG, scenes: {} };

/* ---------- 极光视觉基准截图（优化前后像素对比用） ---------- */
{
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/perf-aurora-${TAG}.png` });
}

/* ---------- 场景 A：拖拽磁贴横穿 40 格墙面（来回 3 趟） ---------- */
{
  const tile = await page.locator('[data-entry-id="p0"]').first().boundingBox();
  const tile2 = await page.locator('[data-entry-id="p39"]').first().boundingBox();
  const ax = tile.x + tile.width / 2, ay = tile.y + tile.height / 2;
  const bx = tile2.x + tile2.width / 2, by = tile2.y + tile2.height / 2;
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) { await page.mouse.move(ax + ((bx - ax) * i) / 20, ay + ((by - ay) * i) / 20); await page.waitForTimeout(16); }
  for (let i = 1; i <= 20; i++) { await page.mouse.move(bx + ((ax - bx) * i) / 20, by + ((ay - by) * i) / 20); await page.waitForTimeout(16); }
  for (let i = 1; i <= 20; i++) { await page.mouse.move(ax + ((bx - ax) * i) / 20, ay + ((by - ay) * i) / 20); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(600);
  result.scenes.drag = await snapFrames();
}

/* ---------- 场景 B：右键 → PDF 工具箱（重面板呼出，纱罩+backdrop 全开） ---------- */
{
  await page.click("body", { button: "right", position: { x: 900, y: 650 } });
  await page.waitForTimeout(300);
  const before = await snapFrames();
  await page.locator("text=PDF 工具箱").first().click();
  await page.waitForTimeout(1200);
  result.scenes.pdfPanel = { open: before, settle: await snapFrames() };
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
}

/* ---------- 场景 C：dock 呼出设置面板（纱罩） ---------- */
{
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  await page.mouse.move(200, 200);
  await page.waitForTimeout(400);
  const before = await snapFrames();
  /* dock 上的设置按钮（dock-btn 里的「设置」tip）——直接点 dock 按钮 */
  const dockBtn = page.locator('.cl-dock button[aria-label*="设置"], .cl-dock button:has([data-cl-dock-tip="设置"])').first();
  const cnt = await dockBtn.count();
  if (cnt) {
    await dockBtn.click({ timeout: 5000 });
  } else {
    /* 兜底：右键菜单路径（清场后） */
    await page.click("body", { button: "right", position: { x: 640, y: 400 } });
    await page.waitForTimeout(250);
    await page.locator('[role="menuitem"]:has-text("设置")').first().click();
  }
  await page.waitForTimeout(1200);
  result.scenes.settings = { open: before, settle: await snapFrames() };
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}

/* ---------- 静置基线（极光动画空载成本） ---------- */
{
  await page.waitForTimeout(400);
  result.scenes.idle = await snapFrames();
}

result.heapMB = await heap();
result.pageErrors = errors.length;
fs.writeFileSync(`/tmp/perf-${TAG}.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
await browser.close();
