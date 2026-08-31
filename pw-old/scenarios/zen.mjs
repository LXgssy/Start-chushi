// 禅模式全动画：先启动番茄钟 → 双击空白 → 内容雾化散场（zen-fade）
// → 迷你时钟 + 运行中迷你番茄钟（ZenPomodoro）+ 提示词浮现
// → Esc 雾化聚拢归位
import { patchSettings, dockClick, jsclick } from "./helpers.mjs";
export async function prepare(page) {
  await patchSettings(page, { themeMode: "light", background: "glow" });
  await page.evaluate(() => localStorage.removeItem("start:pomo"));
}
export async function run(page) {
  await dockClick(page, 3); // 番茄钟
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("[role='dialog'] button")].find((x) => /开始|启动/.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForTimeout(1200); // 计时运行
  await page.keyboard.press("Escape"); // 收起面板（计时继续）
  await page.waitForTimeout(700);
  await page.mouse.dblclick(960, 260); // 双击空白 → 雾化散场
  await page.waitForTimeout(3000); // 迷你时钟 + 迷你番茄钟 + 提示词
  await page.keyboard.press("Escape"); // Esc → 雾化聚拢
  await page.waitForTimeout(1900);
}
