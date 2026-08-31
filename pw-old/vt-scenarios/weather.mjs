// 天气面板全动画：dock 弹簧入场（26° 北京 + 逐时条）→ 输入「上海」
// → 结果逐项级联淡入 + 面板 0.45s 拉伸 → 悬停结果行 → 选中 → 回落 + 24° 切换
// → 逐时条横向平滑滚动 → Esc
import { mockWeather } from "./helpers.mjs";
export const seedSettings = { themeMode: "light", background: "glow" };
export const seedExtra = `
  localStorage.setItem("start:place", JSON.stringify({ lat: 39.9, lon: 116.4, name: "北京市" }));
`;
export const route = (page) => mockWeather(page, 26, 24);
export async function run(rec) {
  await rec.dock(0); // 首按钮=天气
  await rec.frame(66); // 弹簧入场 + mock fetch 就位
  await rec.mark("panel-in");
  await rec.setCJK("input[aria-label='搜索城市']", "上海");
  await rec.frame(124); // 350ms 防抖 + 级联淡入 + 0.45s 拉伸全程
  await rec.mark("stretched");
  await rec.over("[role='dialog'] ul.wresult-list li button", true, 1, 26); // 悬停高亮
  await rec.mark("hover-row");
  await rec.page.evaluate(() => {
    document.querySelector("[role='dialog'] ul.wresult-list li button")?.click();
  });
  await rec.frame(108); // 列表收起 + 高度回落 + 24° 上海切换
  await rec.mark("switched");
  // 逐时条横向平滑滚动
  await rec.each(18, () =>
    rec.page.evaluate(() => {
      const el = document.querySelector("[role='dialog'] .slim-scroll");
      if (el) el.scrollLeft += 13;
    })
  );
  await rec.each(18, () =>
    rec.page.evaluate(() => {
      const el = document.querySelector("[role='dialog'] .slim-scroll");
      if (el) el.scrollLeft -= 13;
    })
  );
  await rec.key("Escape");
  await rec.frame(30);
}
