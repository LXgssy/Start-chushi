// shot-v87161.mjs — v8.7.161 视觉实拍（folderIconStyle 双形态：grid2 现状 / grid3 微缩墙 + morph 皮层联动 + 设置面板）
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.161/ChuShi-NewTab-v8.7.161.zip";
const STAGE = "/tmp/ext-shot-v87161";
const PROFILE = "/tmp/ext-profile-shot-v87161";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";
const OUT = "/home/z/beta-wt/download/v8.7.161";

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`);
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

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
  { id: "fd2", name: "满夹", folder: true, children: Array.from({ length: 10 }, (_, i) => ({
    id: "d" + (i + 1), name: "满" + (i + 1), url: `https://f${i + 1}.example.com`,
  })) },
]);
const seed = (opts = {}) =>
  page.evaluate(([links, st]) => {
    localStorage.setItem("start:settings", st);
    localStorage.setItem("start:links", links);
  }, [LINKS_SEED, JSON.stringify({ iconStyle: "letter", linksForm: "docked", ...opts })]);

const goto = async () => {
  await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1600);
};

// ---------- ① grid2 现状墙（默认） ----------
await goto();
await seed({});
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/preview-wall-grid2.png` });

// ---------- ② grid3 三排微缩墙 ----------
await seed({ folderIconStyle: "grid3" });
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/preview-wall-grid3.png` });

// ---------- ③ grid3 + morph 落位（皮层 3×3 同源 + 白卡覆盖磁贴） ----------
await page.locator('[data-entry-id="fd1"]').click();
await page.waitForTimeout(1100);
await page.screenshot({ path: `${OUT}/preview-morph-grid3-open.png` });
await page.mouse.click(640, 60);
await page.waitForTimeout(900);

// ---------- ④ 设置面板「文件夹图标」分段选择器 ----------
await page.locator('button[aria-label="打开设置"], [data-cl-settings-btn], button:has-text("设置")').first()
  .click().catch(async () => {
    // 兜底：中键唤出抽屉后找设置入口
    await page.mouse.click(40, 860, { button: "middle" });
    await page.waitForTimeout(800);
    await page.locator('button[aria-label="打开设置"], [data-cl-settings-btn], button:has-text("设置")').first().click();
  });
await page.waitForTimeout(900);
// 「链接」分组内若需展开则点击
const secLink = page.locator('text=链接').first();
if (await secLink.count()) await secLink.click().catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/preview-settings.png`, fullPage: false });

console.log("shots done →", OUT);
await browser.close();
