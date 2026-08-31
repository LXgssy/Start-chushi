// 面板 Tab 连切（用户点名要的「PC 端 tab 切换动画」）：
// 天气 → 待办（徽标在镜）→ 便签 → 番茄钟 → 设置，逐个直切不收起——
// 每次切换 = 卡片高度盒 0.25s 形变 + 内容 panel-rise + Dock 激活态迁移
// → 最后右上角 × 弹簧收场
import { dockClick, patchSettings } from "./helpers.mjs";
export async function prepare(page) {
  await patchSettings(page, { themeMode: "light", background: "glow" });
  await page.evaluate(() => {
    localStorage.setItem(
      "start:todos",
      JSON.stringify([
        { id: "t1", text: "整理季度复盘", done: false, createdAt: Date.now() },
        { id: "t2", text: "回看宣传片脚本", done: false, createdAt: Date.now() + 1 },
      ])
    );
    localStorage.setItem("start:note", "把发布会的节奏拆成三幕——问题、方案、回响。");
    localStorage.removeItem("start:pomo");
  });
}
export async function run(page) {
  await dockClick(page, 0); // 天气
  await page.waitForTimeout(1500);
  await dockClick(page, 1); // 待办（徽标 2）
  await page.waitForTimeout(1300);
  await dockClick(page, 2); // 便签
  await page.waitForTimeout(1300);
  await dockClick(page, 3); // 番茄钟
  await page.waitForTimeout(1300);
  await dockClick(page, 5); // 设置（最高的面板，高度形变最明显）
  await page.waitForTimeout(1700);
  await page.evaluate(() => {
    const x = document.querySelector("button[aria-label='关闭面板']");
    x?.click();
  });
  await page.waitForTimeout(800); // × 弹簧收场
}
