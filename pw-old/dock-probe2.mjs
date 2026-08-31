// 完全复刻 vt-rec 条件的 dock 点击 A/B 探针（暂停态 + 光标覆盖层）
import { chromium } from "playwright";
const SHELL = "/home/z/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell";
const browser = await chromium.launch({ headless: true, executablePath: SHELL, args: ["--lang=zh-CN", "--hide-scrollbars"] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);

await ctx.addInitScript(`
  try {
    localStorage.setItem("start:seen", "1");
    var __s = {};
    try { __s = JSON.parse(localStorage.getItem("start:settings") || "{}"); } catch {}
    localStorage.setItem("start:settings", JSON.stringify({ ...__s, themeMode: "light", background: "glow" }));
    localStorage.setItem("start:todos", "[]");
  } catch {}
`);
await page.goto("http://localhost:3210", { waitUntil: "domcontentloaded" });
await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
// 暖机
for (let i = 0; i < 40; i++) {
  const ok = await page.evaluate(() => document.readyState === "complete" && !!document.querySelector("main")).catch(() => false);
  if (ok) break;
  const exp = new Promise((r) => cdp.once("Emulation.virtualTimeBudgetExpired", r));
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: 250 });
  await exp;
}
const exp2 = new Promise((r) => cdp.once("Emulation.virtualTimeBudgetExpired", r));
await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: 3500 });
await exp2;

// 注入光标（与 vt-rec 相同）
await page.evaluate(() => {
  const mk = (h) => { const d = document.createElement("div"); d.innerHTML = h; return d.firstElementChild; };
  const cur = mk(`<div style="position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform;filter:drop-shadow(0 1px 2.5px rgba(0,0,0,.4));display:none"><svg width="26" height="30" viewBox="0 0 26 30"><path d="M4 1 L4 22.5 L9.6 17.6 L13.2 25.8 L17.4 24 L13.8 15.9 L21.4 15.2 Z" fill="#ffffff" stroke="#1c1c1c" stroke-width="1.6" stroke-linejoin="round"/></svg></div>`);
  document.body.appendChild(cur);
  window.__vt = { cursor(x, y) { cur.style.display = "block"; cur.style.transform = `translate(${x - 4}px,${y - 1}px)`; } };
});

const panelOpen = () => page.evaluate(() => !!document.querySelector("[role='dialog']"));
const dockBtn = (i) =>
  page.evaluate((idx) => {
    const b = document.querySelectorAll("nav[aria-label='快捷操作'] button")[idx];
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: b.getAttribute("aria-label"), rect: `${r.left.toFixed(0)},${r.top.toFixed(0)} ${r.width.toFixed(0)}x${r.height.toFixed(0)}` };
  }, i);

// A：与 vt-rec 完全一致的 dispatch
const p1 = await dockBtn(1);
console.log("todo按钮:", JSON.stringify(p1));
await page.evaluate((p) => window.__vt.cursor(p.x, p.y), p1);
const hitA = await page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y };
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    el.dispatchEvent(
      type.startsWith("pointer")
        ? new PointerEvent(type, { ...opts, pointerType: "mouse", isPrimary: true })
        : new MouseEvent(type, opts)
    );
  }
  return `${el.tagName}${el.getAttribute("aria-label") ? "[" + el.getAttribute("aria-label") + "]" : ""}`;
}, p1);
console.log("A dispatch命中:", hitA, "→ panel:", await panelOpen());

// B：b.click() 直点
const hitB = await page.evaluate(() => {
  const b = document.querySelectorAll("nav[aria-label='快捷操作'] button")[1];
  b.click();
  return b.getAttribute("aria-label");
});
console.log("B el.click():", hitB, "→ panel:", await panelOpen());
await browser.close();
