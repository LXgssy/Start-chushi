// probe-exit-btn.mjs — 对照：关闭按钮点击路径的 exit 启动延迟
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.160/ChuShi-NewTab-v8.7.160.zip";
const STAGE = "/tmp/ext-diag-fca";
const PROFILE = "/tmp/ext-probe-exit3";
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

async function timedClose(label, closeFn) {
  await page.mouse.click(tile.x, tile.y);
  await page.waitForTimeout(900);
  const out = await page.evaluate(
    (fn) =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const card = document.querySelector('[data-cl-folder-popover] .solid-card');
        const w0 = Math.round(card.getBoundingClientRect().width);
        let started = -1;
        let firstMove = -1;
        const tick = () => {
          const now = Math.round(performance.now() - t0);
          const c = document.querySelector('[data-cl-folder-popover] .solid-card');
          if (c) {
            const w = Math.round(c.getBoundingClientRect().width);
            const iw = c.style.width;
            if (started < 0 && iw && !iw.includes("%") && parseFloat(iw) > 0) started = now;
            if (firstMove < 0 && Math.abs(w - w0) > 3) firstMove = now;
            if (now > 1500) { resolve({ label: fn, w0, started, firstMove, done: false }); return; }
          } else {
            resolve({ label: fn, w0, started, firstMove, done: true });
            return;
          }
          requestAnimationFrame(tick);
        };
        eval(fn); // closeFn 字符串在页面内执行
        requestAnimationFrame(tick);
      }),
    closeFn
  );
  console.log(`${label}: 起点=${out.w0}px framer接管=${out.started}ms 首次位移=${out.firstMove}ms 完成=${out.done}`);
  await page.waitForTimeout(600);
}

await timedClose("外点空白", `document.elementFromPoint(20,860).dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,clientX:20,clientY:860,button:0,pointerType:"mouse"}))`);
await timedClose("关闭按钮", `document.querySelector('[data-cl-folder-popover] button[aria-label="关闭文件夹"]').click()`);
await timedClose("Esc 键", `window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))`);
await browser.close();
