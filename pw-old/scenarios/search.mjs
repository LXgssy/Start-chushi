// 搜索全动画（本轮主角之一，上轮被否的「搜索关联动画」全在这）：
// 聚焦缩放+光环 → 落字 → 提示语上浮 + 建议下拉「生长」（56→58+n×40 + 级联雾化）
// → ↑↓ 高亮位移 → 悬停高亮 → 追加输入列表刷新 → Esc 收起回落
// → 网址直达提示（该网址）+ 提交按钮浮现 → 引擎 Popover 缩放弹出/切换形变
// 注：CJK 一律 setCJK 整串落框（pressSequentially 节奏不可控，会挤掉尾段）
import { patchSettings, jsclick, setCJK } from "./helpers.mjs";
export async function prepare(page) {
  await patchSettings(page, { themeMode: "light", background: "glow", searchSuggest: true });
  await page.route("**/www.baidu.com/sugrec*", (route) => {
    const url = route.request().url();
    const q = decodeURIComponent(url.match(/wd=([^&]*)/)?.[1] ?? "");
    const cb = url.match(/cb=([^&]*)/)?.[1] ?? "cb";
    const pool = {
      云: ["云计算", "云盘", "云音乐", "云海", "云顶之弈"],
      云计算: ["云计算是什么", "云计算培训", "云计算就业前景", "云计算架构", "云计算技术"],
    };
    const list = pool[q] ?? [];
    return route.fulfill({
      contentType: "text/javascript",
      body: `${cb}({"q":"${q}","g":[${list.map((s) => `{"q":"${s}"}`).join(",")}]})`,
    });
  });
}
export async function run(page) {
  const SEL = "input[aria-label='搜索或输入网址']";
  await page.waitForTimeout(400);
  await setCJK(page, SEL, "云"); // setCJK 自带 focus（聚焦缩放+光环先入镜）
  await page.waitForTimeout(2300); // 提示语上浮 + 下拉生长 + 级联
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(650); // 高亮第 1 行
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(650); // 高亮位移第 2 行
  await page.evaluate(() => {
    const rows = document.querySelectorAll("[role='option']");
    rows[3]?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
  await page.waitForTimeout(650); // 悬停高亮
  await setCJK(page, SEL, "云计算");
  await page.waitForTimeout(2000); // 列表刷新（新词组级联）
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800); // 收起回落
  await setCJK(page, SEL, "github.com");
  await page.waitForTimeout(1400); // 提示变「该网址」+ 箭头按钮浮现
  await setCJK(page, SEL, "");
  await page.waitForTimeout(600); // 清空（按钮隐没）
  await jsclick(page, "button[aria-label='切换搜索引擎']");
  await page.waitForTimeout(1100); // Popover zoom-in
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("[data-radix-popper-content-wrapper] button")].find((x) => x.textContent.includes("必应"));
    if (b) b.click();
  });
  await page.waitForTimeout(1100); // 收起 + 引擎名形变
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.waitForTimeout(900); // 尾部余量
}
