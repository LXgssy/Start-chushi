// 时钟逐字符翻转：设置面板打开 → 12 时 ↔ 24 时全字符重排翻转 → Esc
import { mockWeather } from "./helpers.mjs";
export const route = (page) => mockWeather(page, 26, 24);

export const seedSettings = { themeMode: "light", background: "glow", hour12: false };
export async function run(rec) {
  await rec.frame(18);
  await rec.mark("before");
  await rec.jsclick("button[aria-label='设置']");
  await rec.frame(26);
  await rec.mark("panel-open");
  await rec.jsclick("button", "12 时");
  await rec.frame(80); // 翻转全程
  await rec.mark("12h");
  await rec.jsclick("button", "24 时");
  await rec.frame(80);
  await rec.mark("24h");
  await rec.key("Escape");
  await rec.frame(24);
}
