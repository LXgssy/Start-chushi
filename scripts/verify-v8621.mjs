/* v8.6.21 交互验证：
   1) 入场播完 intro 类摘除（拖拽让位 replay 物理不可能）
   2) 拖拽向左换位功能正常（数组重排成功，无报错）
   3) hover 层 willChange 常驻
   4) 磁贴四层语义类在位 */
import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
let pass = 0, fail = 0;
const gate = (name, ok, detail = "") => {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
  ok ? pass++ : fail++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.addInitScript(() => {
  const KEY = "start:settings";
  if (!localStorage.getItem(KEY)) {
    localStorage.setItem(KEY, JSON.stringify({ themeMode: "light", linksForm: "docked" }));
  }
});
await page.goto(BASE, { waitUntil: "load", timeout: 30000 }).catch(() => null);
await page.waitForSelector('[data-cl-tile="1"]', { timeout: 15000 });
await sleep(2600); /* 等入场动画全部播完 + HMR 稳定 */

const st1 = await page.evaluate(() => {
  const tile = document.querySelector('[data-cl-tile="1"]');
  const layers = {
    shell: !!tile.querySelector(".tile-shell"),
    frost: !!tile.querySelector(".tile-frost"),
    ring: !!tile.querySelector(".tile-ring"),
    body: !!tile.querySelector(".tile-body"),
  };
  const introGone =
    !tile.querySelector(".link-intro-tile") &&
    !tile.querySelector(".link-intro-frost") &&
    !tile.querySelector(".link-intro-body");
  const label = tile.querySelector(".tile-label");
  const hover = tile.querySelector("a span.block");
  return {
    layers,
    introGone,
    labelIntroGone: label ? !label.classList.contains("link-intro") : null,
    willChange: hover ? getComputedStyle(hover).willChange : null,
    names: [...document.querySelectorAll('[data-cl-tile="1"] .tile-label')].map((n) => n.textContent),
  };
});
gate("四层语义类在位（shell/frost/ring/body）",
  st1.layers.shell && st1.layers.frost && st1.layers.ring && st1.layers.body,
  JSON.stringify(st1.layers));
gate("入场播完 intro 动画类已摘（replay 物理不可能）",
  st1.introGone && st1.labelIntroGone,
  `tile=${st1.introGone} label=${st1.labelIntroGone}`);
gate("hover 层 willChange transform 常驻（合成层不撤销）",
  st1.willChange === "transform", `willChange=${st1.willChange}`);

/* 拖拽第二个磁贴向左越过第一个（用户场景：往左拖，让位者 replay 的场景） */
const names0 = st1.names.join("|");
const tile2 = page.locator('[data-cl-tile="1"]').nth(1);
const b2 = await tile2.boundingBox();
const tile1 = page.locator('[data-cl-tile="1"]').nth(0);
const b1 = await tile1.boundingBox();
await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
await page.mouse.down();
await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2, { steps: 12 });
await sleep(120);
await page.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2, { steps: 2 });
await sleep(150);
await page.mouse.up();
await sleep(700);

const st2 = await page.evaluate(() => ({
  names: [...document.querySelectorAll('[data-cl-tile="1"] .tile-label')].map((n) => n.textContent),
}));
const swapped = st2.names.join("|") !== names0;
gate("拖拽向左换位功能正常（数组重排生效）", swapped,
  `${names0} -> ${st2.names.join("|")}`);
gate("换位后让位磁贴仍无 intro 动画类（不 replay）", await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('[data-cl-tile="1"]')];
  return tiles.every((t) => !t.querySelector(".link-intro-tile"));
}));

gate("pageerror=0", errors.length === 0, errors.join(";").slice(0, 120));
console.log(`\n===== v8.6.21 interact verify: ${pass} PASS / ${fail} FAIL =====`);
await browser.close();
process.exit(fail ? 1 : 0);
