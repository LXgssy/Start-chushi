// probe-folder-open.mjs — 探针：点击磁贴后 elementFromPoint + popover 挂载状态
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.159/ChuShi-NewTab-v8.7.159.zip";
const STAGE = "/tmp/ext-diag-fca";
const PROFILE = "/tmp/ext-probe-fca";
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

const info1 = await page.evaluate(() => {
  const shell = document.querySelector('[data-entry-id="fd1"] .tile-shell');
  const r = shell.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  return {
    tile: { x: r.x, y: r.y, w: r.width, h: r.height },
    center: [cx, cy],
    hitTag: hit?.tagName, hitCls: (hit?.className || "").toString().slice(0, 90),
    inFd: !!hit?.closest('[data-entry-id="fd1"]'),
    form: document.querySelector('[data-cl-folder-popover]') ? "popover-open" : "closed",
  };
});
console.log("点击前:", JSON.stringify(info1, null, 1));

await page.mouse.click(info1.center[0], info1.center[1]);
await page.waitForTimeout(700);

const info2 = await page.evaluate(() => ({
  popover: document.querySelectorAll("[data-cl-folder-popover]").length,
  modal: document.querySelectorAll("[data-cl-folder-modal]").length,
  inline: document.querySelectorAll("[data-cl-folder-inline]").length,
  childC1: document.querySelectorAll('[data-entry-id="c1"]').length,
  childC1Where: document.querySelector('[data-entry-id="c1"]')?.closest("[data-cl-folder-popover],[data-cl-folder-inline]")?.tagName ?? null,
}));
console.log("点击后:", JSON.stringify(info2, null, 1));
console.log("pageerror:", errors.length ? errors : 0);
await browser.close();
