// 天气面板全动画（上轮被否的另一半）：dock 弹簧入场（26° 北京 + 逐时条）
// → 输入「上海」→ 结果逐项 36ms 级联淡入 + 面板 data-soft 0.45s 拉伸
// → 悬停结果行 → 选中 → 面板回落 + 24° 数据切换 + 城市徽章更名
// → 逐时条横向平滑滚动 → 署名行在镜
import { patchSettings, mockWeather, jsclick, setCJK } from "./helpers.mjs";
export async function prepare(page) {
  await patchSettings(page, { themeMode: "light", background: "glow" });
  await mockWeather(page, 26, 24);
  await page.evaluate(() =>
    localStorage.setItem(
      "start:place",
      JSON.stringify({ lat: 39.9, lon: 116.4, name: "北京市" })
    )
  );
}
export async function run(page) {
  await jsclick(page, "nav[aria-label='快捷操作'] button"); // 首按钮=天气
  await page.waitForTimeout(1800); // 弹簧入场 + mock fetch 就位（26° 北京 + 逐时条）
  await setCJK(page, "input[aria-label='搜索城市']", "上海");
  await page.waitForTimeout(2800); // 350ms 防抖 + 级联淡入 + 0.45s 拉伸全程（60fps 下 27 帧）
  await page.evaluate(() => {
    const li = document.querySelectorAll("[role='dialog'] ul.wresult-list li button")[1];
    li?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  await page.waitForTimeout(700); // 悬停高亮
  await page.evaluate(() => {
    document.querySelector("[role='dialog'] ul.wresult-list li button")?.click();
  });
  await page.waitForTimeout(2400); // 列表收起 + 高度回落 + 24° 上海切换
  // 逐时条横向平滑滚动（scrollLeft 增量步进 600ms）
  await page.evaluate(async () => {
    const el = document.querySelector("[role='dialog'] .slim-scroll");
    if (!el) return;
    for (let i = 0; i < 24; i++) {
      el.scrollLeft += 9;
      await new Promise((r) => requestAnimationFrame(r));
    }
    for (let i = 0; i < 24; i++) {
      el.scrollLeft -= 9;
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  await page.waitForTimeout(900);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
}
