// 扩展版演示：chrome-extension:// 直开（= 新标签页接管效果）
// 浅色辉光 + 干净态，录入场动画 + 搜索聚焦 + 天气面板（mock 天气）
import { patchSettings, mockWeather, typeInto } from "./helpers.mjs";
import { createHash } from "crypto";
export const target = (() => {
  const p = "/home/z/my-project/download/初始-Edge新标签页";
  const h = createHash("sha256").update(Buffer.from(p, "utf8")).digest("hex").slice(0, 32);
  return `chrome-extension://${h.split("").map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("")}/index.html`;
})();
export async function prepare(page) {
  await patchSettings(page, { themeMode: "light", background: "glow" });
  await mockWeather(page, 24, 24);
}
export async function run(page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600); // 入场动画
  await typeInto(page, "input[aria-label='搜索或输入网址']", "https://github.com", 70);
  await page.waitForTimeout(900); // 网址直达徽标
  for (let i = 0; i < 20; i++) await page.keyboard.press("Backspace");
  await page.waitForTimeout(500);
}
