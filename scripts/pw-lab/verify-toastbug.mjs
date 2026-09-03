// 验证 toast viewport 挡点击：删除预设后 toast 窗口期内点右/左空白
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/home/z/my-project/scripts/pw-lab/shots";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1200);

// 开 ⌘K → 导入预设（快速路径）
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(500);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(700);

// 再开 → 管理预设 → 删除
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.getByText("管理预设", { exact: true }).first().click();
await page.waitForTimeout(500);
const item = page.locator("li").first();
await item.hover();
await item.getByRole("button", { name: /删除预设/ }).click();

// 关键时刻：toast「预设已移除」应该在显示中
await page.waitForTimeout(400); // toast 已弹出，仍在其显示窗口内

const state1 = await page.evaluate(() => {
  const vp = document.querySelector("ol[data-radix-toast-viewport]") ||
    document.querySelector("[data-radix-collection-item][role=status]")?.parentElement;
  const vpEl = vp || document.evaluate("//ol[contains(@style,'--radix')]", document, null, 9, null).singleNodeValue;
  return {
    viewportFound: !!vpEl,
    pointerEvents: vpEl ? getComputedStyle(vpEl).pointerEvents : null,
    rect: vpEl ? JSON.parse(JSON.stringify(vpEl.getBoundingClientRect())) : null,
    toastText: document.body.textContent?.includes("已移除") || false,
  };
});
console.log("[A] toast viewport 状态:", JSON.stringify(state1, null, 1));
await page.screenshot({ path: `${OUT}/v1-toast-active.png` });

// 点「返回上一级」→ 回指令列表（返回按钮在卡片左上，不在 viewport 带）
await page.locator('[aria-label="返回指令面板"]').click();
await page.waitForTimeout(600);

// 点右侧空白（viewport 竖带内：x = 1280-100 = 1180）
await page.mouse.click(1180, 400);
await page.waitForTimeout(700);
console.log("[B] toast 窗口内点右侧空白，面板仍在:", (await page.locator('[aria-label="指令面板"]').count()) > 0);

// 若仍开着，点左侧空白（x=40，viewport 带外）
if ((await page.locator('[aria-label="指令面板"]').count()) > 0) {
  await page.mouse.click(40, 400);
  await page.waitForTimeout(700);
  console.log("[C] 点左侧空白，面板仍在:", (await page.locator('[aria-label="指令面板"]').count()) > 0);
}
// cmdk selected 状态
const sel = await page.evaluate(() => document.querySelector('[cmdk-item][data-selected="true"]')?.textContent?.slice(0, 12) ?? null);
console.log("[D] cmdk selected:", sel);
await browser.close();
