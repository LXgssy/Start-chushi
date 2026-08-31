// 探测扩展构建产物经 http 直开能否正常渲染（决定扩展场景录制方式）
import { chromium } from "playwright";
const EXE = "/home/z/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell";
const browser = await chromium.launch({ headless: true, executablePath: EXE, args: ["--lang=zh-CN"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
page.on("console", (m) => { if (m.type() === "error") errs.push("console:" + m.text().slice(0, 100)); });
await page.goto("http://localhost:3211/index.html", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
const info = await page.evaluate(() => ({
  hasMain: !!document.querySelector("main"),
  text: (document.querySelector("main")?.innerText || document.body.innerText).slice(0, 80).replace(/\n/g, "|"),
}));
console.log("INFO:", JSON.stringify(info));
console.log("ERRS:", errs.slice(0, 4));
await page.screenshot({ path: "/tmp/ext-probe.png" });
await browser.close();
