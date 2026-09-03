// 液态玻璃预设包（自带引擎版）端到端验证
// 1) 导入预设 → fx-root 挂载 style/svg → 玻璃容器 data-fx + backdrop-filter 链序
// 2) ⌘K 幕布（全屏）不打 data-fx（幕布不是玻璃块）
// 3) 截图目验折射与高光
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/home/z/my-project/scripts/pw-lab/shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
page.on("console", (m) => {
  if (m.text().includes("[fxdbg]")) console.log("  [dbg]", m.text().slice(0, 200));
});

await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
// 清状态重测（上个运行可能已装预设）
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// 基线：未装预设，玻璃容器无 data-fx
const baseline = await page.evaluate(() => ({
  marked: document.querySelectorAll("[data-fx]").length,
  fxRoot: !!document.getElementById("chushi-fx-root"),
}));
console.log("[0] 基线（应无标记）:", JSON.stringify(baseline));
await page.screenshot({ path: `${OUT}/lg0-baseline.png` });

// 导入液态玻璃预设（⌘K → 导入预设 → 粘贴 → 导入）
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2500);

const state = await page.evaluate(() => {
  const root = document.getElementById("chushi-fx-root");
  const mounts = root ? [...root.querySelectorAll("[data-fx-mount]")] : [];
  const style = root?.querySelector("style");
  const svgs = [...root.querySelectorAll("svg")].filter((s) => s.querySelector("filter"));
  const filters = [...root.querySelectorAll("filter")];
  const marked = [...document.querySelectorAll("[data-fx]")].map((el) => ({
    cls: el.className.split(" ").filter((c) => /search-pill|cl-dock|cl-panel|glass-card/.test(c)).slice(0, 2).join(","),
    fx: el.dataset.fx,
    bf: getComputedStyle(el).backdropFilter.slice(0, 80),
  }));
  return {
    mounts: mounts.length,
    hasStyle: !!style,
    styleLen: style ? style.textContent.length : 0,
    svgFilters: svgs.length,
    filterIds: filters.map((f) => f.id),
    feImages: filters.map((f) => !!f.querySelector("feImage[href^='data:image/png']")),
    marked,
    order: style ? (style.textContent.includes("blur(") && style.textContent.includes("url(#lg-") ? "blur-then-url" : "BAD") : "no-style",
  };
});
console.log("[1] fx 挂载:", JSON.stringify(state, null, 1));

// 打开 ⌘K 检查：glass-card 被打标且幕布不打标
await page.keyboard.press("Control+k");
await page.waitForTimeout(1200);
const kState = await page.evaluate(() => {
  const veil = document.querySelector('[aria-label="指令面板"]');
  const card = document.querySelector(".glass-card[data-fx]");
  return {
    veilMarked: veil ? !!veil.dataset.fx : "no-veil",
    veilBf: veil ? getComputedStyle(veil).backdropFilter.slice(0, 60) : null,
    cardMarked: !!card,
    cardBf: card ? getComputedStyle(card).backdropFilter.slice(0, 90) : null,
  };
});
console.log("[2] ⌘K 开启:", JSON.stringify(kState, null, 1));
await page.screenshot({ path: `${OUT}/lg1-palette.png` });

// 关闭 ⌘K，截主页面液态玻璃全景
await page.keyboard.press("Escape");
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/lg2-main.png` });

// hover 搜索栏看镜面高光变量
await page.mouse.move(640, 60);
await page.waitForTimeout(400);
const hl = await page.evaluate(() => {
  const el = document.querySelector(".search-pill[data-fx]");
  return el ? { mx: el.style.getPropertyValue("--fx-mx"), my: el.style.getPropertyValue("--fx-my") } : null;
});
console.log("[3] 指针变量:", JSON.stringify(hl));

console.log("[4] pageerror:", errors.length === 0 ? "无" : errors.join(" | "));
await browser.close();
