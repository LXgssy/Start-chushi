// 便签：面板入场 → 打字机逐字输入两行 → 防抖落盘「已保存」徽标淡入 → Esc
import { mockWeather } from "./helpers.mjs";
export const route = (page) => mockWeather(page, 26, 24);

export const seedSettings = { themeMode: "light", background: "glow" };
export const seedExtra = `localStorage.removeItem("start:note");`;
export async function run(rec) {
  await rec.dock(2);
  await rec.frame(56);
  await rec.mark("panel-in");
  await rec.page.evaluate(() => {
    const ta = document.querySelector("textarea[aria-label='便签']");
    ta?.focus();
  });
  await rec.frame(6);
  for (const ch of "灵感：把发布会的节奏拆成三幕") await rec.insert(ch, 3);
  await rec.key("Enter", 3);
  for (const ch of "——问题、方案、回响。") await rec.insert(ch, 3);
  await rec.frame(92); // 防抖落盘 → 「已保存」淡入
  await rec.mark("saved");
  await rec.key("Escape");
  await rec.frame(28);
}
