// shot-icons.mjs — 把 v8.4.8 构建跑起来，截取所有含图标的界面
import { chromium } from "playwright-core";
import crypto from "crypto";
import { mkdirSync, rmSync } from "fs";

const ROOT = "/tmp/ext-v849"; // 已解包的 v8.4.8 构建（调试补丁不影响截图）
const PROFILE = "/tmp/ext-shots-profile2";
const OUT = "/tmp/shots";
rmSync(PROFILE, { recursive: true, force: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--disable-gpu", "--no-sandbox"],
});
process.on("exit", () => { try { browser.close(); } catch { } });

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 10000 }).catch(() => null);
const app = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await app.waitForFunction(() => !!document.querySelector("a[data-cl-tile]"), { timeout: 15000 }).catch(() => null);
await sleep(1200);
await page.screenshot({ path: `${OUT}/01-home.png` });
console.log("01-home ✓");

// 打开设置面板并分段截图
const settingsBtn = app.locator('nav[aria-label="快捷操作"] button[aria-label*="设置"]').first();
await settingsBtn.click({ timeout: 8000 });
await sleep(900);
await page.screenshot({ path: `${OUT}/02-settings-top.png` }).catch(() => { });
console.log("02-settings-top ✓");

// 滚动设置面板逐段截图
const scroller = app.locator("div.slim-scroll").last();
for (let i = 0; i < 6; i++) {
  await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight / 6 * i; }).catch(() => { });
  await sleep(350);
  await page.screenshot({ path: `${OUT}/03-settings-s${i}.png` }).catch(() => { });
}
console.log("03-settings-s* ✓");

// 更新日志弹窗
const logBtn = app.getByText("更新日志", { exact: true }).first();
if (await logBtn.isVisible().catch(() => false)) {
  await logBtn.click();
  await sleep(1100);
  await page.screenshot({ path: `${OUT}/04-changelog.png` });
  console.log("04-changelog ✓");
  await page.keyboard.press("Escape");
  await sleep(500);
}

// 关闭设置面板
await page.keyboard.press("Escape");
await sleep(600);

// 各面板截图
for (const [name, label] of [["05-todo", "待办"], ["06-pomodoro", "番茄"], ["07-music", "音乐"], ["08-weather", "天气"]]) {
  const btn = app.locator(`nav[aria-label="快捷操作"] button[aria-label*="${label}"]`).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click({ timeout: 5000 }).catch(() => { });
    await sleep(1000);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log(`${name} ✓`);
    await page.keyboard.press("Escape");
    await sleep(600);
  } else {
    console.log(`${name} 跳过（按钮不可见）`);
  }
}

// ⌘K 指令面板
await page.keyboard.press("Control+k");
await sleep(900);
await page.screenshot({ path: `${OUT}/09-cmdk.png` });
console.log("09-cmdk ✓");
await page.keyboard.press("Escape");

console.log("DONE ->", OUT);
process.exit(0);
