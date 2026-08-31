// 番茄钟全动画：面板入场（进度环弹簧自 0 画出）→ 开始（环随滴答流动 + Dock 倒计时数字展开 + 呼吸灯）
// → Tab 切 休息（layoutId 药丸弹性拉伸）→ 切回 专注 → +1 分钟步进器 → 重置
import { dockClick, patchSettings } from "./helpers.mjs";
export async function prepare(page) {
  await patchSettings(page, { themeMode: "light", background: "glow" });
  await page.evaluate(() => localStorage.removeItem("start:pomo"));
}
export async function run(page) {
  await dockClick(page, 3);
  await page.waitForTimeout(1500); // 入场：进度环弹簧画出
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("[role='dialog'] button")].find((x) => /开始|启动/.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForTimeout(2600); // 环流动 + Dock 数字展开 + 呼吸灯
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("[role='tab']")].find((x) => x.textContent.includes("休息"));
    b?.click();
  });
  await page.waitForTimeout(1500); // layoutId 药丸弹性切换
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("[role='tab']")].find((x) => x.textContent.includes("专注"));
    b?.click();
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("[role='dialog'] button")].find((x) => (x.getAttribute("aria-label") || "") === "增加专注时长");
    if (!b) {
      // 兜底：任一「增加」步进器
      const any = [...document.querySelectorAll("[role='dialog'] button")].find((x) => (x.getAttribute("aria-label") || "").startsWith("增加"));
      any?.click();
      return;
    }
    b.click();
  });
  await page.waitForTimeout(1000);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
}
