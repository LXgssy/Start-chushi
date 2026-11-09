// probe-exit-deep.mjs — exit 启动延迟深度归因：事件目标 / portal 闪断 / style 时间线
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.160/ChuShi-NewTab-v8.7.160.zip";
const STAGE = "/tmp/ext-diag-fca";
const PROFILE = "/tmp/ext-probe-exit2";
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
page.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 140)));
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
await page.waitForTimeout(900);

const report = await page.evaluate(
  (pt) =>
    new Promise((resolve) => {
      const log = [];
      const hit = document.elementFromPoint(pt.x, pt.y);
      log.push({ t: 0, ev: "hit-target", tag: hit?.tagName, cls: (hit?.className || "").toString().slice(0, 60) });

      // portal 闪断监听：body 直接子节点里 data-cl-folder-popover 的添加/移除
      const popEl = () => document.querySelector(":scope > [data-cl-folder-popover]");
      let popExisted = !!popEl();

      const card = document.querySelector('[data-cl-folder-popover] .solid-card');
      const r0 = card.getBoundingClientRect();
      const startRect = { w: Math.round(r0.width) };
      const t0 = performance.now();

      const ev = new PointerEvent("pointerdown", {
        bubbles: true, cancelable: true, clientX: pt.x, clientY: pt.y, button: 0, pointerType: "mouse",
      });
      (hit || document.body).dispatchEvent(ev);
      log.push({ t: Math.round(performance.now() - t0), ev: "pointerdown-dispatched" });

      const tick = () => {
        const now = Math.round(performance.now() - t0);
        const c = document.querySelector('[data-cl-folder-popover] .solid-card');
        const popNow = !!popEl();
        if (popNow !== popExisted) {
          log.push({ t: now, ev: popNow ? "portal-RE-ATTACHED" : "portal-DETACHED" });
          popExisted = popNow;
        }
        if (c) {
          const b = c.getBoundingClientRect();
          const st = getComputedStyle(c);
          log.push({ t: now, w: Math.round(b.width), inlineW: c.style.width, transform: st.transform.slice(0, 40) });
          if (now > 1000) { resolve({ startRect, log }); return; }
        } else {
          log.push({ t: now, gone: true });
          resolve({ startRect, log });
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }),
  { x: 20, y: 860 }
);

console.log("起点 w:", report.startRect.w);
const comp = [];
let lastKey = "";
for (const f of report.log) {
  const key = JSON.stringify([f.w, f.gone, f.ev, f.inlineW, f.transform]);
  if (key !== lastKey) { comp.push(f); lastKey = key; }
}
comp.forEach((f) => console.log(JSON.stringify(f)));
await browser.close();
