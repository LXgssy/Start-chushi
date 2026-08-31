// 快捷链接全动画：悬停浮起+铅笔浮现 → 编辑对话框弹簧 → 改名保存（磁贴 layout 弹簧 + toast）
// → 触摸长按进入编辑态（jiggle + 红色删除角标）→ 删除一块（layout 弹簧重排）
// → 退出编辑态归位 → 加号新增「小红书」（新磁贴弹簧入场）→ 拖拽重排
import { mockWeather } from "./helpers.mjs";
export const route = (page) => mockWeather(page, 26, 24);

export const seedSettings = { themeMode: "light", background: "glow" };
export const seedExtra = `localStorage.removeItem("start:links");`; // 默认 6 链接
export async function run(rec) {
  // 1) 悬停浮起 + 铅笔浮现（真实 hover 触发 CSS 过渡）
  await rec.hover("a[aria-label='哔哩哔哩']", 16);
  await rec.frame(34);
  await rec.mark("hover-lift");
  // 2) 铅笔 → 编辑对话框弹簧
  await rec.jsclick("button[aria-label='编辑 哔哩哔哩']");
  await rec.frame(50);
  await rec.mark("dialog");
  // 3) 改名保存
  await rec.setCJK("input[aria-label='链接名称']", "");
  await rec.setCJK("input[aria-label='链接名称']", "B站");
  await rec.frame(18);
  await rec.key("Enter"); // 保存 → toast + 磁贴标签更新
  await rec.frame(64);
  await rec.mark("renamed");
  // 4) 长按进入编辑态：jiggle + 删除角标（合成触摸长按，420ms 阈值）
  await rec.page.evaluate(() => {
    const el = document.querySelector("[aria-label='GitHub']");
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
  });
  await rec.frame(56); // 933ms 虚拟时长 > 420ms 阈值 → onEnterEdit
  await rec.page.evaluate(() => {
    const el = document.querySelector("[aria-label='GitHub']");
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        pointerType: "touch",
        pointerId: 7,
        clientX: r.left + r.width / 2,
        clientY: r.top + r.height / 2,
        isPrimary: true,
      })
    );
  });
  await rec.frame(14);
  await rec.mark("jiggle");
  // 5) 删除一块 → layout 弹簧重排
  await rec.jsclick("button[aria-label='删除 微博']");
  await rec.frame(68);
  await rec.mark("removed");
  // 6) 退出编辑态（点击页面空白）
  await rec.clickXY(rec.W / 2, 150, { real: false, glide: 5, ripple: 5 });
  await rec.frame(40);
  // 7) 加号新增
  await rec.jsclick("button[aria-label='添加快捷链接']");
  await rec.frame(40);
  await rec.setCJK("input[aria-label='链接名称']", "小红书");
  await rec.page.evaluate(() => {
    const el = document.querySelector("input[aria-label='链接网址']");
    el?.focus();
  });
  for (const ch of "https://xiaohongshu.com") await rec.insert(ch, 0);
  await rec.frame(14);
  await rec.key("Enter");
  await rec.frame(72); // 新磁贴弹簧入场
  await rec.mark("added");
  // 8) 拖拽重排：GitHub → 知乎位置（HTML5 DnD）
  try {
    await rec.page.dragAndDrop("a[aria-label='GitHub']", "a[aria-label='知乎']");
  } catch {}
  await rec.frame(66); // 落位弹簧
  await rec.mark("reordered");
}
