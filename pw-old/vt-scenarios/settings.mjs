// 设置面板全控件巡礼：主题深浅全页过渡 → 背景掠影（区块雾化展开+图库+Ken Burns）
// → 每日一图开关 → 辉光 → 强调色 → 12 时（时钟翻转）→ 秒针（秒位跳动）→ 站点图标
// → 称呼（问候语实时更名）→ 搜索建议 → 滚动到底（数据区）→ Esc
import { mockWeather } from "./helpers.mjs";
export const route = (page) => mockWeather(page, 26, 24);

export const seedSettings = {
  themeMode: "light",
  background: "glow",
  hour12: false,
  showSeconds: false,
  iconStyle: "letter",
  userName: "",
  searchSuggest: false,
};
export async function run(rec) {
  await rec.dock(5); // 设置面板
  await rec.frame(62);
  await rec.mark("panel-in");
  await rec.seg("主题", "深色", 74); // 全页色彩过渡
  await rec.mark("dark");
  await rec.seg("主题", "浅色", 52);
  await rec.seg("背景", "掠影", 112); // 区块雾化展开 + 缩略图 + Ken Burns
  await rec.mark("gallery");
  // 第二张官方图库壁纸 → 选中环 + Ken Burns 起幅
  await rec.page.evaluate(() => {
    const all = [...document.querySelectorAll("[role='dialog'] button[aria-pressed]")].filter(
      (x) => x.closest("span")?.querySelector("img") || x.querySelector("img")
    );
    all[1]?.click();
  });
  await rec.frame(92); // 换壁纸 Ken Burns 起幅
  await rec.mark("wall-2");
  await rec.jsclick("[role='switch'][aria-label='每日一图']");
  await rec.frame(66); // 每日一图 on
  await rec.jsclick("[role='switch'][aria-label='每日一图']");
  await rec.frame(40); // off
  await rec.seg("背景", "辉光", 56);
  await rec.jsclick("button[aria-label='强调色 青碧']");
  await rec.frame(44); // 强调色全站换色
  await rec.mark("accent");
  await rec.seg("时制", "12 时", 74); // 时钟全字符翻转
  await rec.mark("12h");
  await rec.seg("秒针", "显示", 72); // 秒位跳动
  await rec.mark("seconds");
  await rec.seg("图标风格", "站点图标", 80); // 磁贴形变 + favicon 加载
  await rec.mark("favicons");
  await rec.setCJK("input[aria-label='称呼']", "阿宇");
  await rec.frame(40); // 问候语实时更名
  await rec.mark("greeting");
  await rec.seg("搜索建议", "显示", 32);
  await rec.each(13, () =>
    rec.page.evaluate(() => {
      const el =
        document.querySelector("[role='dialog'] .slim-scroll") ||
        document.querySelector("[role='dialog'] [class*='overflow']");
      if (el) el.scrollTop += 28;
    })
  );
  await rec.frame(30);
  await rec.mark("scrolled");
  await rec.key("Escape");
  await rec.frame(30);
}
