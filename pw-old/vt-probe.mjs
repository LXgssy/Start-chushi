// 探针：pause→reload 后文档状态 & 虚拟时间是否真冻结
import { chromium } from "playwright";
const SHELL = "/home/z/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell";
const browser = await chromium.launch({ headless: true, executablePath: SHELL, args: ["--lang=zh-CN"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto("http://localhost:3210", { waitUntil: "domcontentloaded" });
await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
await page.reload({ waitUntil: "domcontentloaded" }).catch((e) => console.log("reload err:", String(e).slice(0, 80)));
await new Promise((r) => setTimeout(r, 3400));
const s1 = await page.evaluate(() => ({
  url: location.href.slice(0, 60),
  ready: document.readyState,
  hasBody: !!document.body,
  hasMain: !!document.querySelector("main"),
  now: performance.now(),
}));
await new Promise((r) => setTimeout(r, 1200));
const s2 = await page.evaluate(() => ({ now: performance.now(), hasBody: !!document.body }));
console.log("S1:", JSON.stringify(s1));
console.log("S2:", JSON.stringify(s2), "frozen:", s1.now === s2.now);
await browser.close();
