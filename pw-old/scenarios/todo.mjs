// 待办全动画：面板入场 → 三条错峰入场 → 勾选（划线 scaleX 动画 + 徽标递减）
// → 再勾一条 → 悬停已完成行（删除键浮现）→ 清除已完成（级联退场）
// → 再加一条（入场）→ Esc 收场
import { dockClick, patchSettings } from "./helpers.mjs";
export async function prepare(page) {
  await patchSettings(page, { themeMode: "light", background: "glow" });
  await page.evaluate(() => localStorage.setItem("start:todos", "[]"));
}
export async function run(page) {
  await dockClick(page, 1);
  await page.waitForTimeout(1900);
  await page.evaluate(async () => {
    const inp = document.querySelector("input[aria-label='添加待办']");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const add = async (text) => {
      setter.call(inp, text);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      await raf2();
      inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await raf2();
    };
    await add("整理季度复盘");
    await new Promise((r) => setTimeout(r, 550));
    await add("回看宣传片脚本");
    await new Promise((r) => setTimeout(r, 550));
    await add("给 v1.0.2 提交商店");
  });
  await page.waitForTimeout(1600); // 三条入场完毕
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("[role='dialog'] button")].find((x) => (x.getAttribute("aria-label") || "").includes("完成"));
    b?.click();
  });
  await page.waitForTimeout(1400); // 划线动画 + 徽标 3→2
  await page.evaluate(() => {
    const boxes = [...document.querySelectorAll("[role='dialog'] button[role='checkbox']")];
    boxes.find((x) => x.getAttribute("aria-checked") === "false")?.click();
  });
  await page.waitForTimeout(1400); // 第二条划线 + 徽标 2→1
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("[role='dialog'] li")].find((x) => x.querySelector("[aria-checked='true']"));
    row?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  await page.waitForTimeout(700); // 行悬停（删除键浮现）
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("[role='dialog'] button")].find((x) => x.textContent.includes("清除已完成"));
    b?.click();
  });
  await page.waitForTimeout(1500); // 级联退场 + 清除按钮消失
  await page.evaluate(async () => {
    const inp = document.querySelector("input[aria-label='添加待办']");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    setter.call(inp, "写周报");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    await raf2();
    inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await page.waitForTimeout(1200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
}
