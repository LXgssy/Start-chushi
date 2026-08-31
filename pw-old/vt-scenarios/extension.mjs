// 扩展版演示：扩展构建产物经 http 直开（像素等同新标签页接管效果）
// 浅色辉光 + 干净态，录入场动画 + 网址直达徽标
import { mockWeather, abortCMA } from "./helpers.mjs";
export const target = "http://localhost:3211/index.html";
export const seedSettings = { themeMode: "light", background: "glow" };
export const route = async (page) => {
  await mockWeather(page, 24, 24);
  await abortCMA(page); // CMA 优先策略秒回退
};
export async function run(rec) {
  await rec.frame(140); // 入场动画
  await rec.mark("entered");
  await rec.page.evaluate(() => {
    const inp = document.querySelector("input[aria-label='搜索或输入网址']");
    inp?.focus();
  });
  await rec.frame(8);
  for (const ch of "https://github.com") await rec.insert(ch, 1);
  await rec.frame(44); // 网址直达徽标 + 箭头按钮浮现
  await rec.mark("url-badge");
  for (let i = 0; i < 18; i++) await rec.key("Backspace", 0);
  await rec.frame(24);
}
