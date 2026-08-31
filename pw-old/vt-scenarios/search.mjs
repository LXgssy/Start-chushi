import { mockWeather } from "./helpers.mjs";
// 搜索全动画（主角）：聚焦缩放+光环 → CJK 落字 → 提示语上浮 + 建议下拉「生长」+ 级联雾化
// → ↓↓ 高亮位移 → 悬停高亮 → 追加输入列表刷新 → Esc 收起回落
// → 网址直达提示 + 提交按钮浮现 → 清空 → 引擎 Popover 缩放弹出/切换形变
export const seedSettings = { themeMode: "light", background: "glow", searchSuggest: true };
export const route = async (page) => {
  await mockWeather(page, 26, 24);
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
};
export async function run(rec) {
  const SEL = "input[aria-label='搜索或输入网址']";
  await rec.frame(22);
  await rec.setCJK(SEL, "云"); // setCJK 自带 focus（聚焦缩放+光环先入镜）
  await rec.frame(116); // 提示语上浮 + 下拉生长 + 级联
  await rec.mark("dropdown");
  await rec.key("ArrowDown");
  await rec.frame(30); // 高亮第 1 行
  await rec.key("ArrowDown");
  await rec.frame(30); // 高亮位移第 2 行
  await rec.over("[role='option']", true, 3, 30); // 悬停高亮
  await rec.mark("hover");
  await rec.setCJK(SEL, "云计算");
  await rec.frame(100); // 列表刷新（新词组级联）
  await rec.mark("refresh");
  await rec.key("Escape");
  await rec.frame(40); // 收起回落
  await rec.setCJK(SEL, "github.com");
  await rec.frame(62); // 提示变「该网址」+ 箭头按钮浮现
  await rec.mark("url");
  await rec.setCJK(SEL, "");
  await rec.frame(26); // 清空（按钮隐没）
  await rec.jsclick("button[aria-label='切换搜索引擎']");
  await rec.frame(44); // Popover zoom-in
  await rec.mark("engine-pop");
  await rec.jsclick("[data-radix-popper-content-wrapper] button", "必应");
  await rec.frame(44); // 收起 + 引擎名形变
  await rec.mark("engine-switched");
  await rec.key("Escape");
  await rec.frame(24);
}
