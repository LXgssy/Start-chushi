// 入场动画全景：run 里 reload 触发 intro-rise 序列（时钟/搜索/链接/dock 依次上浮）
import { patchSettings, jsclick } from "./helpers.mjs";
export async function prepare(page) {
  await patchSettings(page, { themeMode: "light", background: "glow" });
  await page.evaluate(() => {
    localStorage.removeItem("start:weather-last");
    localStorage.removeItem("start:links");
    localStorage.removeItem("start:todos");
    localStorage.removeItem("start:note");
  });
}
export async function run(page) {
  await jsclick(page, "body"); // noop 保持框架一致
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3200);
}
