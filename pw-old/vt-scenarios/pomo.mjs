// 番茄钟全动画：面板入场（进度环弹簧自 0 画出）→ 开始（环随滴答流动 + Dock 倒计时展开 + 呼吸灯）
// → Tab 切 休息（layoutId 药丸弹性拉伸）→ 切回 专注 → +1 分钟步进器 → Esc
import { mockWeather } from "./helpers.mjs";
export const route = (page) => mockWeather(page, 26, 24);

export const seedSettings = { themeMode: "light", background: "glow" };
export const seedExtra = `localStorage.removeItem("start:pomo");`;
export async function run(rec) {
  await rec.dock(3);
  await rec.frame(64); // 入场：进度环弹簧画出
  await rec.mark("ring-in");
  await rec.page.evaluate(() => {
    const b = [...document.querySelectorAll("[role='dialog'] button")].find((x) =>
      /开始|启动/.test(x.textContent)
    );
    b?.click();
  });
  await rec.frame(112); // 环流动 + Dock 数字展开 + 呼吸灯
  await rec.mark("running");
  await rec.jsclick("[role='tab']", "短休");
  await rec.frame(64); // layoutId 药丸弹性切换（专注→短休）
  await rec.mark("rest-tab");
  await rec.jsclick("[role='tab']", "专注");
  await rec.frame(50);
  await rec.page.evaluate(() => {
    const b =
      [...document.querySelectorAll("[role='dialog'] button")].find(
        (x) => (x.getAttribute("aria-label") || "") === "增加专注时长"
      ) ??
      [...document.querySelectorAll("[role='dialog'] button")].find((x) =>
        (x.getAttribute("aria-label") || "").startsWith("增加")
      );
    b?.click();
  });
  await rec.frame(44);
  await rec.mark("plus1");
  await rec.key("Escape");
  await rec.frame(26);
}
