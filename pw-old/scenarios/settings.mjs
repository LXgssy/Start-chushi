// 设置面板全控件巡礼（Segmented layoutId 滑块 + Switch 弹簧 + 强调色 + 掠影图库）：
// 主题 深色→浅色 → 背景 辉光→掠影（区块雾化展开 + 壁纸缩略图 + Ken Burns）→
// 每日一图 on→off → 辉光 → 强调色 紫罗兰→青碧 → 时制 12 时（时钟全字符翻转）→
// 秒针 显示（秒位跳动）→ 图标风格 站点图标（磁贴形变）→ 称呼（问候语实时更名）→
// 搜索建议 显示 → 滚到底部 → 收起
import { patchSettings, dockClick, jsclick, setCJK } from "./helpers.mjs";
export async function prepare(page) {
  await patchSettings(page, {
    themeMode: "light",
    background: "glow",
    hour12: false,
    showSeconds: false,
    iconStyle: "letter",
    userName: "",
    searchSuggest: false,
  });
}
async function seg(page, label, text) {
  await page.evaluate(
    ({ label, text }) => {
      const group = document.querySelector(`[role='radiogroup'][aria-label='${label}']`);
      const b = [...(group?.querySelectorAll("button") ?? [])].find(
        (x) => x.textContent.trim() === text
      );
      b?.click();
    },
    { label, text }
  );
}
export async function run(page) {
  await dockClick(page, 5); // 设置面板
  await page.waitForTimeout(1500);
  await seg(page, "主题", "深色");
  await page.waitForTimeout(1600); // 全页色彩过渡
  await seg(page, "主题", "浅色");
  await page.waitForTimeout(1200);
  await seg(page, "背景", "掠影");
  await page.waitForTimeout(2600); // 区块雾化展开 + 缩略图 + Ken Burns
  await page.evaluate(() => {
    const all = [...document.querySelectorAll("[role='dialog'] button[aria-pressed]")].filter(
      (x) => x.closest("span")?.querySelector("img") || x.querySelector("img")
    );
    all[1]?.click(); // 第二张官方图库壁纸 → 选中环 + Ken Burns 起幅
  });
  await page.waitForTimeout(2200); // 换壁纸 Ken Burns 起幅
  await jsclick(page, "[role='switch'][aria-label='每日一图']");
  await page.waitForTimeout(1800); // 每日一图 on
  await jsclick(page, "[role='switch'][aria-label='每日一图']");
  await page.waitForTimeout(1000); // off
  await seg(page, "背景", "辉光");
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const b =
      [...document.querySelectorAll("button")].find(
        (x) => x.getAttribute("aria-label") === "强调色 青碧"
      );
    b?.click();
  });
  await page.waitForTimeout(1000); // 强调色全站换色（开关/选中环/进度条）
  await seg(page, "时制", "12 时");
  await page.waitForTimeout(1700); // 时钟全字符翻转
  await seg(page, "秒针", "显示");
  await page.waitForTimeout(1600); // 秒位跳动
  await seg(page, "图标风格", "站点图标");
  await page.waitForTimeout(1900); // 磁贴形变 + favicon 加载
  const nameInput = page.locator("input[aria-label='称呼']");
  await nameInput.focus();
  await setCJK(page, "input[aria-label='称呼']", "阿宇"); // 问候语实时更名
  await page.waitForTimeout(900);
  await seg(page, "搜索建议", "显示");
  await page.waitForTimeout(900);
  // 面板内滚动到底（数据区在镜）
  await page.evaluate(async () => {
    const el = document.querySelector("[role='dialog'] .slim-scroll, [role='dialog'] [class*='overflow']");
    if (!el) return;
    for (let i = 0; i < 16; i++) {
      el.scrollTop += 26;
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  await page.waitForTimeout(1200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
}
