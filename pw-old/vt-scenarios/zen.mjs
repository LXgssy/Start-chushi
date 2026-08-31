// 禅模式全动画：先启动番茄钟 → 双击空白 → 内容雾化散场 → 迷你时钟 + 运行中迷你番茄钟
// + 提示词浮现 → Esc 雾化聚拢归位
import { mockWeather } from "./helpers.mjs";
export const route = (page) => mockWeather(page, 26, 24);

export const seedSettings = { themeMode: "light", background: "glow" };
export const seedExtra = `localStorage.removeItem("start:pomo");`;
export async function run(rec) {
  await rec.dock(3); // 番茄钟
  await rec.frame(58);
  await rec.page.evaluate(() => {
    const b = [...document.querySelectorAll("[role='dialog'] button")].find((x) =>
      /开始|启动/.test(x.textContent)
    );
    b?.click();
  });
  await rec.frame(44); // 计时运行
  await rec.key("Escape"); // 收起面板（计时继续）
  await rec.frame(32);
  await rec.move(rec.W / 2, 300, 7); // 光标滑到空白区
  await rec.page.mouse.dblclick(rec.W / 2, 300); // 双击空白 → 雾化散场
  await rec.frame(142); // 迷你时钟 + 迷你番茄钟 + 提示词
  await rec.mark("zen-in");
  await rec.key("Escape"); // 雾化聚拢
  await rec.frame(90);
  await rec.mark("zen-out");
}
