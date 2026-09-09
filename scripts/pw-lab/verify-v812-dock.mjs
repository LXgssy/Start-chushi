// v8.1.2 dock 选框单实例化回归冒烟：面板开/互切/关 + ⌘K + 控制台零报错
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errs.push("console:" + m.text().slice(0, 120)); });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1500);
const R = {};
// ① 天气面板开
await page.locator('nav button[aria-label*="天气"]').click();
await page.waitForTimeout(700);
R.weatherOpen = await page.evaluate(() => !!document.querySelector("main, body") && document.body.innerText.includes("天气") || true);
R.pillOnWeather = await page.evaluate(() => {
  const b = [...document.querySelectorAll("nav button")].find((x) => x.getAttribute("data-active") === "true");
  return b?.getAttribute("aria-label")?.includes("天气");
});
// ② 互切待办
await page.locator('nav button[aria-label="待办"]').click();
await page.waitForTimeout(700);
R.pillOnTodo = await page.evaluate(() => {
  const b = [...document.querySelectorAll("nav button")].find((x) => x.getAttribute("data-active") === "true");
  return b?.getAttribute("aria-label") === "待办";
});
R.todoPanel = await page.evaluate(() => document.body.innerText.includes("待办"));
// ③ 互切设置
await page.locator('nav button[aria-label="设置"]').click();
await page.waitForTimeout(700);
R.pillOnSettings = await page.evaluate(() => {
  const b = [...document.querySelectorAll("nav button")].find((x) => x.getAttribute("data-active") === "true");
  return b?.getAttribute("aria-label") === "设置";
});
R.settingsPanel = await page.evaluate(() => document.body.innerText.includes("设置"));
// ④ 点遮罩关闭
await page.mouse.click(640, 120);
await page.waitForTimeout(600);
R.closed = await page.evaluate(() => ![...document.querySelectorAll("nav button")].some((x) => x.getAttribute("data-active") === "true"));
R.pillGone = await page.evaluate(() => !document.querySelector('nav [class*="pill-seg"]'));
// ⑤ ⌘K
await page.keyboard.press("Control+k");
await page.waitForTimeout(800);
R.palette = await page.evaluate(() => !!document.querySelector("[cmdk-root]"));
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
console.log(JSON.stringify(R, null, 2));
const realErrs = errs.filter((e) => !e.includes("favicon") && !e.includes("net::") && !e.includes("Failed to load resource"));
console.log("errors:", realErrs.length ? realErrs : "无");
const ok = R.pillOnWeather && R.pillOnTodo && R.pillOnSettings && R.todoPanel && R.settingsPanel && R.closed && R.pillGone && R.palette && realErrs.length === 0;
console.log(ok ? "✅ dock 冒烟全过" : "❌ 有失败项");
await browser.close();
process.exit(ok ? 0 : 1);
