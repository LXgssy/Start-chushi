// 最终端到端：用户原始 bug 流程 + 液态玻璃删除还原
// ① 导入液态玻璃预设（自带引擎）→ ② 管理 → 删除 → ③ 返回 ⌘K
// ④ 点右侧空白（toast 窗口内）→ 面板应关闭；无选中残留
// ⑤ 删除后 fx 挂载清空、磨砂还原（blur(40px) 回归）
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/home/z/my-project/scripts/pw-lab/shots";
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));

await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// ① 导入液态玻璃预设
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2000);
const glassOn = await page.evaluate(() => {
  const el = document.querySelector(".search-pill[data-fx]");
  return el ? getComputedStyle(el).backdropFilter.slice(0, 60) : "(unmarked)";
});
console.log("[1] 导入后搜索栏材质:", glassOn);

// ② 重新打开 → 管理预设 → 删除
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("管理预设", { exact: true }).first().click();
await page.waitForTimeout(600);
const item = page.locator("li").first();
await item.hover();
await item.getByRole("button", { name: /删除预设/ }).click();
await page.waitForTimeout(500); // toast 显示窗口内

// ③ 返回上一级
await page.locator('[aria-label="返回指令面板"]').click();
await page.waitForTimeout(600);

// ④ toast 窗口内点右侧空白（原 bug：点不动）
await page.mouse.click(1180, 400);
await page.waitForTimeout(800);
const stillOpen = (await page.locator('[aria-label="指令面板"]').count()) > 0;
console.log("[2] toast 窗口内点右侧空白，面板仍在:", stillOpen, stillOpen ? "← 仍有 bug" : "← 已修复");

// 鼠标在远处时无选中高亮
if (!stillOpen) {
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(800);
  const sel = await page.evaluate(
    () => getComputedStyle(document.querySelector('[cmdk-item][data-selected="true"]') || document.body).backgroundColor
  );
  console.log("[3] 返回后首项高亮(应透明):", sel);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}

// ⑤ 删除后还原检查
const restored = await page.evaluate(() => {
  const el = document.querySelector(".search-pill");
  const root = document.getElementById("chushi-fx-root");
  return {
    bf: el ? getComputedStyle(el).backdropFilter.slice(0, 40) : "(none)",
    mounts: root ? root.querySelectorAll("[data-fx-mount]").length : 0,
    marked: document.querySelectorAll("[data-fx]").length,
  };
});
console.log("[4] 删除预设后: bf=", restored.bf, "| fx 挂载=", restored.mounts, "| 标记=", restored.marked);

// 重开页面确认持久化状态干净（预设已删，刷新后无 fx）
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);
const afterReload = await page.evaluate(() => ({
  mounts: (document.getElementById("chushi-fx-root") || { children: [] }).children?.length ?? 0,
  installed: JSON.parse(localStorage.getItem("start:presets") || "[]").length,
}));
console.log("[5] 刷新后: 已装预设=", afterReload.installed, "| fx 挂载=", afterReload.mounts);
await page.screenshot({ path: `${OUT}/final-restored.png` });

console.log("[6] pageerror:", errors.length === 0 ? "无" : errors.join(" | "));
await browser.close();
