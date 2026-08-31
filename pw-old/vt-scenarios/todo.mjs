// 待办全动画：面板入场 → 三条错峰入场 → 勾选（划线 scaleX 动画 + 徽标递减）
// → 再勾一条 → 悬停已完成行（删除键浮现）→ 清除已完成（级联退场）→ 再加一条 → Esc
import { mockWeather } from "./helpers.mjs";
export const route = (page) => mockWeather(page, 26, 24);

export const seedSettings = { themeMode: "light", background: "glow" };
export const seedExtra = `localStorage.setItem("start:todos", "[]");`;
export async function run(rec) {
  await rec.dock(1);
  await rec.frame(80);
  await rec.mark("panel-in");
  const add = (text) =>
    rec.page.evaluate((t) => {
      const inp = document.querySelector("input[aria-label='添加待办']");
      if (!inp) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(inp, t);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      return true;
    }, text);
  await add("整理季度复盘");
  await rec.frame(26);
  await add("回看宣传片脚本");
  await rec.frame(26);
  await add("给 v1.0.2 提交商店");
  await rec.frame(50);
  await rec.mark("three-in");
  await rec.page.evaluate(() => {
    const b = [...document.querySelectorAll("[role='dialog'] button")].find((x) =>
      (x.getAttribute("aria-label") || "").includes("完成")
    );
    b?.click();
  });
  await rec.frame(66); // 划线动画 + 徽标 3→2
  await rec.mark("checked");
  await rec.page.evaluate(() => {
    const boxes = [...document.querySelectorAll("[role='dialog'] button[role='checkbox']")];
    boxes.find((x) => x.getAttribute("aria-checked") === "false")?.click();
  });
  await rec.frame(66); // 第二条划线 + 徽标 2→1
  await rec.over("[role='dialog'] li", true, 0, 26); // 行悬停（删除键浮现）
  await rec.page.evaluate(() => {
    const b = [...document.querySelectorAll("[role='dialog'] button")].find((x) =>
      x.textContent.includes("清除已完成")
    );
    b?.click();
  });
  await rec.frame(76); // 级联退场 + 清除按钮消失
  await rec.mark("cleared");
  await add("写周报");
  await rec.frame(56);
  await rec.key("Escape");
  await rec.frame(30);
}
