// 探针：dock 按钮三种点击方式对比（dispatch 序列 / el.click() / 真实鼠标）
import { chromium } from "playwright";
const SHELL = "/home/z/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell";
const browser = await chromium.launch({ headless: true, executablePath: SHELL, args: ["--lang=zh-CN", "--hide-scrollbars"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3210", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
const panelOpen = () => page.evaluate(() => !!document.querySelector("[role='dialog']"));

// 方式1：我的 dispatch 序列（elementFromPoint）
let r = await page.evaluate(() => {
  const b = document.querySelectorAll("nav[aria-label='快捷操作'] button")[0];
  const rect = b.getBoundingClientRect();
  const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  const el = document.elementFromPoint(x, y);
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y };
  const seq = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];
  const hit = [];
  for (const type of seq) {
    const ev = type.startsWith("pointer")
      ? new PointerEvent(type, { ...opts, pointerType: "mouse", isPrimary: true })
      : new MouseEvent(type, opts);
    el.dispatchEvent(ev);
    hit.push(`${type}@${el.tagName}${el.getAttribute("aria-label") ? "#" + el.getAttribute("aria-label") : ""}`);
  }
  return hit;
});
console.log("dispatch命中:", r.join(" | "), "→ panel:", await panelOpen());

// 方式2：b.click()
r = await page.evaluate(() => {
  const b = document.querySelectorAll("nav[aria-label='快捷操作'] button")[0];
  b.click();
  return b.getAttribute("aria-label");
});
console.log("el.click():", r, "→ panel:", await panelOpen());

// 方式3：真实鼠标
const pt = await page.evaluate(() => {
  const b = document.querySelectorAll("nav[aria-label='快捷操作'] button")[0];
  const rect = b.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
});
await page.keyboard.press("Escape");
await page.waitForTimeout(800);
await page.mouse.click(pt.x, pt.y);
await page.waitForTimeout(600);
console.log("真实鼠标 → panel:", await panelOpen());
await browser.close();
