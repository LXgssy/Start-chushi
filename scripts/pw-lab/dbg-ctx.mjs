// 定位右键菜单为何未弹出
import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") console.log("[console.error]", m.text().slice(0, 200)); });

await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1200);

// 方式 A：Playwright mouse right click
await page.mouse.click(640, 300, { button: "right" });
await page.waitForTimeout(400);
let n = await page.locator('[role="menu"]').count();
console.log("A mouse.click right @640,300:", n);

// 方式 B：dispatchEvent contextmenu
if (!n) {
  await page.locator("body").dispatchEvent("contextmenu", { button: 2, clientX: 500, clientY: 350, bubbles: true });
  await page.waitForTimeout(400);
  n = await page.locator('[role="menu"]').count();
  console.log("B dispatchEvent contextmenu:", n);
}

// 方式 C：click helper
if (!n) {
  await page.locator("main").click({ button: "right", position: { x: 300, y: 100 } });
  await page.waitForTimeout(400);
  n = await page.locator('[role="menu"]').count();
  console.log("C locator.click right:", n);
}

// 监听 contextmenu 是否到达 window & preventDefault 是否生效
await page.evaluate(() => {
  window.addEventListener("contextmenu", (e) => {
    console.log("[probe] contextmenu reached window, defaultPrevented=", e.defaultPrevented, "target=", (e.target && e.target.tagName) || "?");
  }, { capture: true, once: true });
});
await page.mouse.click(700, 600, { button: "right" });
await page.waitForTimeout(300);
console.log("final menus:", await page.locator('[role="menu"]').count());
await browser.close();
