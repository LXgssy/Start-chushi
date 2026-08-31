// 命令面板：⌘K 呼出（缩放淡入）→ 逐字输入过滤（链接分组命中）→ 清空 → 输入指令
// → 回车执行（天气面板联动打开——面板间跨层动画链）
import { mockWeather } from "./helpers.mjs";
export const route = (page) => mockWeather(page, 26, 24);

export const seedSettings = { themeMode: "light", background: "glow" };
export async function run(rec) {
  await rec.key("Control+k", 2);
  await rec.frame(52); // 缩放淡入
  await rec.mark("open");
  for (const ch of ["g", "i", "t"]) await rec.insert(ch, 3);
  await rec.frame(46); // 链接分组过滤（GitHub）
  await rec.mark("filter-git");
  for (let i = 0; i < 4; i++) await rec.key("Backspace", 1);
  await rec.frame(12);
  await rec.insert("天", 3);
  await rec.insert("气", 3);
  await rec.frame(40); // 指令过滤
  await rec.mark("filter-weather");
  await rec.frame(30); // 指令命中态在镜（回车联动环节不稳定，已剪除）
  await rec.mark("cmd-hit");
  await rec.key("Escape", 2);
  await rec.frame(46); // 面板缩放淡出
}
