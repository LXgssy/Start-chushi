// v1.4.0 合并回归：图标替换 chushi.icons.override + 主题令牌覆写 chushi.theme.override（Task56 遗产在合并后仍工作）
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/home/z/my-project/scripts/pw-lab/shots";
const fail = (m) => { console.log("  ✗ " + m); process.exitCode = 1; };
const ok = (m) => console.log("  ✓ " + m);

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1400);

/* 测试预设：薄脚本调 icons.override + theme.override */
const preset = {
  chushi: 1,
  name: "焕新回归测试",
  author: "初始",
  description: "icons/theme API 回归",
  commands: [],
  scripts: [
    {
      id: "t",
      name: "t",
      code: `chushi.icons.override({ "dock-todo": "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='10' fill='%23ff0044'/></svg>" });
chushi.theme.override({ light: { "--ui-accent": "#00c896" } });
chushi.icons.override({});`,
    },
  ],
};
// 注：最后又清空 icons 以便单独验证 theme；分两次导入更清晰——这里只测 theme + icons 覆写清除路径
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(500);
await page.locator("textarea").fill(JSON.stringify(preset));
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2400);

/* 图标覆写被「空 map 清除」→ 底栏待办图标应为 lucide svg（无 img 注入）；
   主题覆写生效 → html 上 --ui-accent = #00c896（light 组 !important） */
const st = await page.evaluate(() => {
  const html = document.documentElement;
  const accent = html.style.getPropertyValue("--ui-accent");
  const injected = [...document.querySelectorAll("style[data-chushi-theme], style")].some((s) =>
    (s.textContent || "").includes("#00c896")
  );
  const todoBtn = document.querySelector('nav[aria-label="快捷操作"] button[aria-label="待办"] img');
  return { accent, injected, todoImg: !!todoBtn };
});
console.log("  accent inline:", JSON.stringify(st.accent), "| 样式注入含 #00c896:", st.injected, "| 待办图标被 img 替换:", st.todoImg);
if (!st.injected && !st.accent) fail("主题令牌覆写未生效（合并回归）");
else ok("chushi.theme.override 合并后仍工作");
if (st.todoImg) fail("空 map 清除后图标仍被替换");
else ok("chushi.icons.override 空 map 清除路径工作（图标还原 lucide）");
await page.screenshot({ path: `${OUT}/v14-icons-theme.png` });

/* 清理 */
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.getByText("管理预设", { exact: true }).first().click();
await page.waitForTimeout(600);
const item = page.locator("li").first();
await item.hover();
await item.getByRole("button", { name: /删除预设/ }).click();
await page.waitForTimeout(400);
await page.locator('[aria-label="返回指令面板"]').click();
await page.waitForTimeout(500);
const cleaned = await page.evaluate(() => {
  const html = document.documentElement;
  const still = [...document.querySelectorAll("style")].some((s) => (s.textContent || "").includes("#00c896"));
  return { still };
});
console.log("  删除预设后主题残留:", cleaned.still);
if (cleaned.still) fail("删除预设后主题覆写未回收");
else ok("删除预设即主题覆写整组还原");

console.log("pageerror:", errors.length ? errors.slice(0, 2) : "无");
if (errors.length) fail("存在页面错误");
await browser.close();
console.log(process.exitCode === 1 ? "\n=== FAIL ===" : "\n=== ALL PASS ===");
