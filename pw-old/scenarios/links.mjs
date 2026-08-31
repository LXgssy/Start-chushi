// 快捷链接全动画：悬停浮起+铅笔浮现 → 编辑对话框弹簧 → 改名保存（磁贴 layout 弹簧 + toast）
// → 触摸长按进入编辑态（jiggle 抖动 + 红色删除角标）→ 删除一块（layout 弹簧重排）
// → 退出编辑态归位 → 加号新增「小红书」（新磁贴弹簧入场）→ 拖拽重排
import { patchSettings, setCJK } from "./helpers.mjs";
export async function prepare(page) {
  await patchSettings(page, { themeMode: "light", background: "glow" });
  await page.evaluate(() => localStorage.removeItem("start:links")); // 默认 6 链接
}
async function longPressTouch(page, ariaLabel) {
  await page.evaluate((label) => {
    const el = document.querySelector(`[aria-label='${label}']`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const opts = {
      bubbles: true,
      cancelable: true,
      pointerType: "touch",
      pointerId: 7,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      isPrimary: true,
    };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    setTimeout(
      () => el.dispatchEvent(new PointerEvent("pointerup", opts)),
      900
    );
  }, ariaLabel);
  await page.waitForTimeout(1500); // 420ms 阈值 → onEnterEdit
}
export async function run(page) {
  // 1) 悬停浮起 + 铅笔浮现
  const tile = page.locator("a[aria-label='哔哩哔哩']").first();
  await tile.hover().catch(() => {});
  await page.waitForTimeout(800);
  // 2) 铅笔 → 编辑对话框弹簧
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.getAttribute("aria-label") === "编辑 哔哩哔哩"
    );
    b?.click();
  });
  await page.waitForTimeout(1000);
  // 3) 改名保存
  const nameInput = page.locator("input[aria-label='链接名称']");
  await nameInput.focus();
  await page.evaluate(() => {
    const el = document.querySelector("input[aria-label='链接名称']");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, "");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await setCJK(page, "input[aria-label='链接名称']", "B站");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter"); // 保存 → toast + 磁贴标签更新
  await page.waitForTimeout(1300);
  // 4) 长按进入编辑态：jiggle + 删除角标
  await longPressTouch(page, "GitHub");
  // 5) 删除一块 → layout 弹簧重排
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => x.getAttribute("aria-label") === "删除 微博"
    );
    b?.click();
  });
  await page.waitForTimeout(1400);
  // 6) 退出编辑态（点击页面空白）
  await page.mouse.click(960, 180);
  await page.waitForTimeout(900);
  // 7) 加号新增
  await page.evaluate(() => {
    const add = [...document.querySelectorAll("button")].find(
      (x) => x.getAttribute("aria-label") === "添加快捷链接"
    );
    add?.click();
  });
  await page.waitForTimeout(900);
  await setCJK(page, "input[aria-label='链接名称']", "小红书");
  const ui = page.locator("input[aria-label='链接网址']");
  await ui.focus();
  await ui.pressSequentially("https://xiaohongshu.com", { delay: 20 });
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500); // 新磁贴弹簧入场
  // 8) 拖拽重排：GitHub → 知乎位置（HTML5 DnD）
  try {
    await page.dragAndDrop("a[aria-label='GitHub']", "a[aria-label='知乎']");
  } catch {}
  await page.waitForTimeout(1400);
}
