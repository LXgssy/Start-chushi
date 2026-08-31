// 便签：面板入场 → 打字机输入（两行）→ 「已保存」徽标淡入 → 光标驻留
import { dockClick, patchSettings } from "./helpers.mjs";
export async function prepare(page) {
  await patchSettings(page, { themeMode: "light", background: "glow" });
  await page.evaluate(() => localStorage.removeItem("start:note"));
}
export async function run(page) {
  await dockClick(page, 2);
  await page.waitForTimeout(1400);
  const ta = page.locator("textarea[aria-label='便签']");
  await ta.focus();
  await ta.pressSequentially("灵感：把发布会的节奏拆成三幕", { delay: 80 });
  await page.keyboard.press("Enter");
  await ta.pressSequentially("——问题、方案、回响。", { delay: 80 });
  await page.waitForTimeout(1900); // 防抖落盘 → 「已保存」淡入
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
}
