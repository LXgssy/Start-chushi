// 面板 Tab 连切：天气 → 待办（徽标在镜）→ 便签 → 番茄钟 → 设置（最高面板高度形变最明显）
// 每次切换 = 卡片高度盒形变 + 内容 panel-rise + Dock 激活态迁移 → × 弹簧收场
import { mockWeather } from "./helpers.mjs";
export const seedSettings = { themeMode: "light", background: "glow" };
export const seedExtra = `
  localStorage.setItem("start:place", JSON.stringify({ lat: 39.9, lon: 116.4, name: "北京市" }));
  localStorage.setItem(
    "start:todos",
    JSON.stringify([
      { id: "t1", text: "整理季度复盘", done: false, createdAt: Date.now() },
      { id: "t2", text: "回看宣传片脚本", done: false, createdAt: Date.now() + 1 },
    ])
  );
  localStorage.setItem("start:note", "把发布会的节奏拆成三幕——问题、方案、回响。");
  localStorage.removeItem("start:pomo");
`;
export const route = (page) => mockWeather(page, 26, 24);
export async function run(rec) {
  await rec.dock(0); // 天气
  await rec.frame(72);
  await rec.mark("weather");
  await rec.dock(1); // 待办（徽标 2）
  await rec.frame(62);
  await rec.mark("todo");
  await rec.dock(2); // 便签
  await rec.frame(62);
  await rec.mark("note");
  await rec.dock(3); // 番茄钟
  await rec.frame(62);
  await rec.mark("pomo");
  await rec.dock(5); // 设置
  await rec.frame(84);
  await rec.mark("settings");
  await rec.jsclick("button[aria-label='关闭面板']");
  await rec.frame(36); // × 弹簧收场
}
