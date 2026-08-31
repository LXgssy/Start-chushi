// 移动端（390x844）：入场 + 天气面板（mock 26°）——竖屏全流程
// 窄屏动作全部 JS 直驱（locator 等待在慢放下不可靠）
import { patchSettings, mockWeather, jsclick } from "./helpers.mjs";
export const win = "390x844";
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
  await page.mouse.move(385, 838); // 光标停在角落（触屏故事里不该有鼠标）
  await page.waitForTimeout(1200); // 入场动画余量
  await page.evaluate(() => {
    const inp = document.querySelector("input[aria-label='搜索或输入网址']");
    if (inp) inp.focus();
  });
  await page.waitForTimeout(900); // 聚焦态
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  await jsclick(page, "nav[aria-label='快捷操作'] button"); // 天气面板
  await page.waitForTimeout(2400);
  // 面板内搜索城市 → 级联结果（移动端同样有搜索切换动画）
  await page.evaluate(() => {
    const el = document.querySelector("input[aria-label='搜索城市']");
    el?.focus();
    if (el) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, "上海");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await page.waitForTimeout(2600); // 级联 + 拉伸
  await page.evaluate(() => {
    document.querySelector("[role='dialog'] ul.wresult-list li button")?.click();
  });
  await page.waitForTimeout(2200); // 回落 + 24°
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
}
