// 探针：localStorage 设置在各阶段的真实值
import { chromium } from "playwright";
const SHELL = "/home/z/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell";
const browser = await chromium.launch({ headless: true, executablePath: SHELL, args: ["--lang=zh-CN"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const dump = (tag) =>
  page.evaluate(() => localStorage.getItem("start:settings")).then((v) => console.log(tag, "→", (v || "null").slice(0, 160)));

await page.goto("http://localhost:3210", { waitUntil: "domcontentloaded" });
await new Promise((r) => setTimeout(r, 2600));
await dump("A 挂载+2.6s后");
await page.evaluate(() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem("start:settings") || "{}"); } catch {}
  localStorage.setItem("start:settings", JSON.stringify({ ...s, themeMode: "light", background: "glow" }));
});
await dump("B patch后");
await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
await dump("C reload后立即");
const exp = new Promise((r) => cdp.once("Emulation.virtualTimeBudgetExpired", r));
await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: 3500 });
await exp;
await dump("D 暖机推进后");
const theme = await page.evaluate(() => ({
  dark: document.documentElement.classList.contains("dark"),
  segText: [...document.querySelectorAll("[role='radiogroup'] button")].map((b) => b.textContent).slice(0, 4),
}));
console.log("E 页面主题态:", JSON.stringify(theme));
await browser.close();
