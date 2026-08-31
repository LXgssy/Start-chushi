// 时钟逐字符翻转：设置面板切 12 时↔24 时触发全字符重排翻转
import { patchSettings, jsclick } from "./helpers.mjs";
export async function prepare(page) {
  await patchSettings(page, { themeMode: "light", background: "glow", hour12: false });
}
export async function run(page) {
  await jsclick(page, "button[aria-label='设置']");
  await page.waitForTimeout(1000);
  await jsclick(page, "button", "12 时");
  await page.waitForTimeout(1500); // 翻转全程
  await jsclick(page, "button", "24 时");
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
}
