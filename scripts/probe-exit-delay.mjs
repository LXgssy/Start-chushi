// probe-exit-delay.mjs — exit 启动延迟精测：页面内 rAF 时间线记录卡片 rect 逐帧变化
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.160/ChuShi-NewTab-v8.7.160.zip";
const STAGE = "/tmp/ext-diag-fca";
const PROFILE = "/tmp/ext-probe-exit";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`);
fs.rmSync(PROFILE, { recursive: true, force: true });

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
  viewport: { width: 1280, height: 900 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
const page = browser.pages()[0] || (await browser.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1200);

const LINKS_SEED = JSON.stringify([
  { id: "t1", name: "GitHub", url: "https://github.com" },
  { id: "t2", name: "哔哩哔哩", url: "https://www.bilibili.com" },
  { id: "t3", name: "知乎", url: "https://www.zhihu.com" },
  { id: "t4", name: "微博", url: "https://weibo.com" },
  { id: "fd1", name: "常用", folder: true, children: [
    { id: "c1", name: "网易云音乐", url: "https://music.163.com" },
    { id: "c2", name: "起点读书", url: "https://www.qidian.com" },
    { id: "c3", name: "豆瓣", url: "https://www.douban.com" },
    { id: "c4", name: "百度", url: "https://www.baidu.com" },
    { id: "c5", name: "掘金", url: "https://juejin.cn" },
  ] },
]);
await page.evaluate(([links, st]) => {
  localStorage.setItem("start:settings", st);
  localStorage.setItem("start:links", links);
}, [LINKS_SEED, JSON.stringify({ iconStyle: "letter", linksForm: "docked" })]);
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2000);

const tile = await page.evaluate(() => {
  const r = document.querySelector('[data-entry-id="fd1"] .tile-shell').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(tile.x, tile.y);
await page.waitForTimeout(800);

// 页面内时间线：pointerdown 时刻起 rAF 每帧记卡片 rect，1200ms 后 dump
const timeline = await page.evaluate(
  (pt) =>
    new Promise((resolve) => {
      const card = document.querySelector('[data-cl-folder-popover] .solid-card');
      const r = card.getBoundingClientRect();
      const startRect = { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
      const t0 = performance.now();
      // 派发真实 pointerdown（同外点守卫通道）
      const ev = new PointerEvent("pointerdown", {
        bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y, button: 0, pointerType: "mouse",
      });
      (document.elementFromPoint(pt.x, pt.y) || document.body).dispatchEvent(ev);
      const frames = [];
      const tick = () => {
        const el = document.querySelector('[data-cl-folder-popover] .solid-card');
        const now = performance.now() - t0;
        if (el) {
          const b = el.getBoundingClientRect();
          frames.push({ t: Math.round(now), w: Math.round(b.width), x: Math.round(b.x), y: Math.round(b.y) });
        } else {
          frames.push({ t: Math.round(now), gone: true });
          resolve({ startRect, frames });
          return;
        }
        if (now > 1200) { resolve({ startRect, frames }); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }),
  { x: 20, y: 860 }
);

// 压缩时间线：只输出变化帧
const frames = timeline.frames;
const comp = [];
let last = null;
for (const f of frames) {
  if (!last || f.w !== last.w || f.x !== last.x || f.gone !== last.gone) {
    comp.push(f);
    last = f;
  }
}
console.log("起点 rect:", JSON.stringify(timeline.startRect), "磁贴应在 (756,475) 56x56");
console.log("变化帧（t=ms 后 rect 变化）:");
comp.forEach((f) => console.log(" ", JSON.stringify(f)));
const firstMove = comp.find((f, i) => i > 0 && !f.gone && f.w !== timeline.startRect.w);
console.log(firstMove ? `首次 rect 变化时刻: ${firstMove.t}ms` : "1200ms 内 rect 无变化（exit 未启动？）");
console.log("pageerror:", errors.length ? errors : 0);
await browser.close();
