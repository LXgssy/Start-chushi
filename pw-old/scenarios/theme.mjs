// 主题与背景切换（材质展示）：浅→深全页过渡；辉光→掠影（Ken Burns）→辉光→浅
import { patchSettings, jsclick } from "./helpers.mjs";
export async function prepare(page) {
  await patchSettings(page, { themeMode: "light", background: "glow" });
}
export async function run(page) {
  await jsclick(page, "button[aria-label='设置']");
  await page.waitForTimeout(1000);
  await jsclick(page, "button", "深色");
  await page.waitForTimeout(1800); // 全页色彩过渡
  await jsclick(page, "button", "掠影");
  await page.waitForTimeout(3500); // 雾化进出场 + Ken Burns + 壁纸加载
  await jsclick(page, "button", "辉光");
  await page.waitForTimeout(1800);
  await jsclick(page, "button", "浅色");
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}
