// 移动端（390x844）：入场 + 搜索聚焦 + 天气面板（mock 26°）→ 搜城市「上海」级联+拉伸
// → 选中回落 24° → Esc。无光标（触屏故事）
import { mockWeather } from "./helpers.mjs";
export const win = "390x844";
export const noCursor = true;
export const seedSettings = { themeMode: "light", background: "glow" };
export const seedExtra = `
  localStorage.setItem("start:place", JSON.stringify({ lat: 39.9, lon: 116.4, name: "北京市" }));
`;
export const route = (page) => mockWeather(page, 26, 24);
export async function run(rec) {
  await rec.frame(66); // 入场动画余量
  await rec.page.evaluate(() => {
    const inp = document.querySelector("input[aria-label='搜索或输入网址']");
    inp?.focus();
  });
  await rec.frame(44); // 聚焦态
  await rec.mark("focus");
  await rec.key("Escape");
  await rec.frame(30);
  await rec.dock(0); // 天气面板
  await rec.frame(100);
  await rec.mark("weather");
  await rec.page.evaluate(() => {
    const el = document.querySelector("input[aria-label='搜索城市']");
    el?.focus();
    if (el) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, "上海");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await rec.frame(126); // 级联 + 拉伸
  await rec.mark("stretched");
  await rec.page.evaluate(() => {
    document.querySelector("[role='dialog'] ul.wresult-list li button")?.click();
  });
  await rec.frame(104); // 回落 + 24°
  await rec.mark("switched");
  await rec.key("Escape");
  await rec.frame(28);
}
