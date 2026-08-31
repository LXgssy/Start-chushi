// 命令面板：⌘K 呼出（缩放淡入）→ 输入过滤（链接分组命中）→ 清空 → 输入指令 →
// 回车执行（天气面板联动打开——面板间的跨层动画链）
import { patchSettings } from "./helpers.mjs";
export async function prepare(page) {
  await patchSettings(page, { themeMode: "light", background: "glow" });
}
export async function run(page) {
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(1000); // 缩放淡入
  await page.keyboard.type("git", { delay: 110 });
  await page.waitForTimeout(1000); // 链接分组过滤（GitHub）
  for (let i = 0; i < 4; i++) await page.keyboard.press("Backspace");
  await page.waitForTimeout(400);
  await page.keyboard.type("天气", { delay: 110 });
  await page.waitForTimeout(900); // 指令过滤
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1800); // 面板收起 + 天气面板打开（动画链）
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
}
