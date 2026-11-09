// shot-v87159.mjs — v8.7.159 视觉实拍（morph 真形变绽放中帧/落位 + modal + inline + 整墙）
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.159/ChuShi-NewTab-v8.7.159.zip";
const STAGE = "/tmp/ext-shot-v87159";
const PROFILE = "/tmp/ext-profile-shot-v87159";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";
const OUT = "/home/z/beta-wt/download/v8.7.159";

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
const seed = (style) =>
  page.evaluate(([links, st]) => {
    localStorage.setItem("start:settings", st);
    localStorage.setItem("start:links", links);
  }, [LINKS_SEED, JSON.stringify({ iconStyle: "letter", linksForm: "docked", ...(style ? { folderOpenStyle: style } : {}) })]);

// ---------- ① 整墙（morph 默认态九宫格磁贴） ----------
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
// 首载等默认数据 800ms debounce 落盘完毕再种（种入被默认磁贴覆盖的赛跑坑）
await page.waitForTimeout(1600);
await seed(null);
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/preview-wall.png` });

// ---------- ② morph 绽放中帧（磁贴本体长大中，skin 迷你格可见） ----------
await page.locator('[data-entry-id="fd1"]').click();
await page.waitForTimeout(230);
await page.screenshot({ path: `${OUT}/preview-morph.png` });
// ---------- ③ morph 落位帧（白卡完全长成） ----------
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/preview-morph-open.png` });
await page.locator('button[aria-label="关闭文件夹"]').click();
await page.waitForTimeout(900);

// ---------- ④ modal 居中模态 ----------
await seed("modal");
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2200);
await page.locator('[data-entry-id="fd1"]').click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/preview-modal.png` });
await page.mouse.click(40, 860);
await page.waitForTimeout(900);

// ---------- ⑤ inline 原位内嵌 ----------
await seed("inline");
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2200);
await page.locator('[data-entry-id="fd1"]').click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/preview-inline.png` });

console.log("shots done →", OUT);
await browser.close();
