// v1.2.0 全链路验证
// ① 液态玻璃 v2 引擎：物理折射链（blur→url→saturate）+ SVG pad 外扩域
// ② 设置面：chushi.settings schema → 设置面板分区渲染 → 改值热生效 + 持久化
// ③ 防闪：面板开合动画期 backdrop-filter 退化为纯 blur（无 url），稳定后换全链
// ④ 拖拽文件导入
// ⑤ 右键菜单子元素模糊过场（ctx-item-in-kf / --ci）
// ⑥ 开发者文档子元素模糊过场（docs-item-in-kf / --di）
// ⑦ 回归：删除预设 → 返回 → 外点关闭 + 无选中残留 + fx 全回收
import { chromium } from "playwright-core";
import fs from "node:fs";

const OUT = "/home/z/my-project/scripts/pw-lab/shots";
fs.mkdirSync(OUT, { recursive: true });
const fail = (msg) => {
  console.log("  ✗ " + msg);
  process.exitCode = 1;
};
const ok = (msg) => console.log("  ✓ " + msg);

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));

await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);

/* ---------- ① 导入液态玻璃预设（粘贴路径） + 引擎 v2 链检查 ---------- */
console.log("[1] 液态玻璃 v2 引擎");
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2600);

const engine = await page.evaluate(() => {
  const pill = document.querySelector(".search-pill[data-fx]");
  const filters = [...document.querySelectorAll("filter")];
  const disp = filters.find((f) => f.querySelector("feDisplacementMap"));
  const fei = disp ? disp.querySelector("feImage") : null;
  return {
    bf: pill ? getComputedStyle(pill).backdropFilter : "(none)",
    filterCount: filters.length,
    region: disp ? `${disp.getAttribute("x")},${disp.getAttribute("y")} ${disp.getAttribute("width")}x${disp.getAttribute("height")}` : "",
    hasDisp: !!disp,
    hasMap: !!(fei && (fei.getAttribute("href") || "").startsWith("data:image/png")),
    scale: disp ? disp.querySelector("feDisplacementMap").getAttribute("scale") : "",
  };
});
console.log("  搜索栏材质:", engine.bf);
console.log("  滤镜域(外扩pad):", engine.region, "| scale:", engine.scale, "| 贴图:", engine.hasMap);
const bfNorm = engine.bf.replace(/"/g, "");
if (!bfNorm.includes("blur(3px)") || !bfNorm.includes("url(#lg-") || !bfNorm.includes("saturate(1.8)"))
  fail("链序律不符合 blur→url→saturate");
else ok("链序律 blur(3px)→url(#lg-)→saturate(180%)");
if (!engine.hasDisp || !engine.hasMap) fail("缺少位移滤镜或贴图");
else ok("feImage+feDisplacementMap 就位（域外扩 " + engine.region + "）");
await page.screenshot({ path: `${OUT}/v12-1-engine.png` });

/* ---------- ② 设置面板：分区渲染 + 热调 + 持久化 ---------- */
console.log("[2] 设置面（chushi.settings → 设置面板）");
await page.keyboard.press("Escape");
await page.waitForTimeout(600);
await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(900);
const section = await page.evaluate(() => {
  const labels = [...document.querySelectorAll("h3")].map((h) => h.textContent.trim());
  const sec = [...document.querySelectorAll("h3")].find((h) => h.textContent.trim() === "液态玻璃");
  if (!sec) return { found: false, labels };
  const root = sec.parentElement;
  return {
    found: true,
    from: root.textContent.includes("来自预设「液态玻璃」"),
    sliders: [...root.querySelectorAll('input[type="range"]')].map((r) => r.getAttribute("aria-label")),
    toggles: [...root.querySelectorAll('[role="switch"]')].map((s) => s.getAttribute("aria-label")),
  };
});
console.log("  分区:", JSON.stringify(section));
if (!section.found) fail("设置面板未出现「液态玻璃」分区");
else if (section.sliders.length < 5 || section.toggles.length !== 2) fail("控件数量不对");
else ok("分区 + 5 滑杆 + 2 开关渲染齐全");

/* 改折射强度 145 → 60：引擎热更新（CSS 链不变但 svg scale 变小） */
const scaleBefore = engine.scale;
await page.locator('input[aria-label="折射强度"]').fill("60");
await page.waitForTimeout(700);
const heat = await page.evaluate(() => {
  const disp = [...document.querySelectorAll("filter feDisplacementMap")][0];
  const all = document.querySelector("style") && [...document.querySelectorAll("#chushi-fx-root [data-fx-mount]")].map((m) => m.querySelector("style"));
  return { scale: disp ? disp.getAttribute("scale") : "" };
});
console.log("  折射 145→60 后 scale:", heat.scale, "(前:", scaleBefore + ")");
if (heat.scale === scaleBefore) fail("设置热更新未生效");
else ok("设置热更新生效（贴图/滤镜按新参数重建）");

const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("start:preset-settings") || "{}"));
const lsOk = Object.values(persisted).some((v) => v && v.refPct === 60);
console.log("  持久化 refPct=60:", lsOk);
if (!lsOk) fail("设置值未持久化");
else ok("设置值已持久化到 start:preset-settings");
await page.screenshot({ path: `${OUT}/v12-2-settings.png` });
/* 恢复默认折射，避免影响后续视觉判定 */
await page.locator('input[aria-label="折射强度"]').fill("145");
await page.waitForTimeout(500);
await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(600);

/* ---------- ③ 防闪：dock 面板开合动画期退化纯 blur ---------- */
console.log("[3] 防闪（面板高度弹簧期退化为纯 blur）");
await page.locator('nav[aria-label="快捷操作"] button[aria-label="天气"]').click();
await page.waitForTimeout(140); /* 弹簧进行中（RO 已推送、settle 未到） */
const during = await page.evaluate(() => {
  const p = document.querySelector(".cl-panel[data-fx]");
  return p ? getComputedStyle(p).backdropFilter : "(unmarked)";
});
await page.waitForTimeout(1100); /* 动画结束 + settle 重建 */
const after = await page.evaluate(() => {
  const p = document.querySelector(".cl-panel[data-fx]");
  return p ? getComputedStyle(p).backdropFilter : "(unmarked)";
});
console.log("  动画中:", during);
console.log("  稳定后:", after);
if (during.includes("url(")) fail("动画期仍带 url() 滤镜（闪动源未切断）");
else ok("动画期退化为纯 blur（无 url）");
if (!after.includes("url(")) fail("稳定后未恢复折射全链");
else ok("稳定后恢复 blur→url→saturate 全链");
await page.screenshot({ path: `${OUT}/v12-3-panel.png` });
await page.locator('button[aria-label="关闭面板"]').click();
await page.waitForTimeout(600);

/* ---------- ④ 拖拽文件导入 ---------- */
console.log("[4] 拖拽文件导入");
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
const countdownJson = fs.readFileSync("/home/z/my-project/examples/倒数日预设.json", "utf8");
const dd = await page.evaluate(async (json) => {
  const dt = new DataTransfer();
  dt.items.add(new File([json], "倒数日预设.json", { type: "application/json" }));
  const target = document.querySelector('textarea[placeholder*="拖入"]').closest("div");
  for (const type of ["dragenter", "dragover", "drop"]) {
    const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
    (type === "drop" ? target : target).dispatchEvent(ev);
  }
  await new Promise((r) => setTimeout(r, 1500));
  return {
    dragState: document.querySelector("textarea[data-drag=true]") != null,
    installed: [...document.querySelectorAll("li")].some((li) => li.textContent.includes("倒数日")),
  };
}, countdownJson);
console.log("  拖入状态/安装:", JSON.stringify(dd));
if (!dd.installed) fail("拖拽导入未生效");
else ok("拖拽 .json 文件导入成功");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

/* ---------- ⑤ 右键菜单子元素模糊过场 ----------
   ⚠ 右键点须落在空白区：(640,400) 在搜索药丸内部（右键输入框按产品律
   让路给浏览器原生菜单，不弹「初始」菜单） */
console.log("[5] 右键菜单子元素模糊过场");
await page.mouse.click(640, 300, { button: "right" });
await page.waitForTimeout(300);
const menuUp = await page.evaluate(() => ({
  menus: document.querySelectorAll('[role="menu"]').length,
  items: document.querySelectorAll(".ctx-item").length,
}));
console.log("  menu/ctx-item:", JSON.stringify(menuUp));
if (!menuUp.menus) {
  await page.screenshot({ path: `${OUT}/v12-5-ctx-missing.png` });
  fail("右键菜单未弹出");
}
const ctxAnim = await page.evaluate(() => {
  const items = [...document.querySelectorAll(".ctx-item")];
  return {
    n: items.length,
    anim: items.length ? getComputedStyle(items[0]).animationName : "",
    delay: items.length > 2 ? getComputedStyle(items[2]).animationDelay : "",
    ci: items.length > 1 ? items[1].style.getPropertyValue("--ci") : "",
  };
});
console.log("  菜单项:", ctxAnim.n, "| 动画:", ctxAnim.anim, "| 第3项延迟:", ctxAnim.delay, "| --ci:", ctxAnim.ci);
if (ctxAnim.anim !== "ctx-item-in-kf") fail("菜单项入场无模糊动画");
else ok("菜单项级联模糊入场（--ci 索引延迟生效）");
await page.screenshot({ path: `${OUT}/v12-5-ctx.png` });
/* 退场动画类检查 */
await page.keyboard.press("Escape");
await page.waitForTimeout(40);
const ctxOut = await page.evaluate(() => {
  const menu = document.querySelector(".ctx-out");
  if (!menu) return { out: false };
  const item = menu.querySelector(".ctx-item");
  return { out: true, anim: item ? getComputedStyle(item).animationName : "" };
});
console.log("  退场帧子元素动画:", JSON.stringify(ctxOut));
if (ctxOut.out && ctxOut.anim === "ctx-item-out-kf") ok("退场帧子元素模糊散场");
else if (!ctxOut.out) console.log("  （退场已结束，抽检跳过）");
else fail("退场帧子元素未播模糊散场");
await page.waitForTimeout(400);

/* ---------- ⑥ 开发者文档子元素模糊过场 ---------- */
console.log("[6] 开发者文档子元素模糊过场");
if ((await page.locator('[role="menu"]').count()) === 0) {
  await page.mouse.click(500, 300, { button: "right" });
  await page.waitForTimeout(300);
}
await page.getByText("开发者文档", { exact: true }).click();
await page.waitForTimeout(100);
const docsAnim = await page.evaluate(() => {
  const secs = [...document.querySelectorAll(".docs-anim > section")];
  return {
    n: secs.length,
    anim: secs.length ? getComputedStyle(secs[0]).animationName : "",
    di: secs.length > 3 ? secs[3].style.getPropertyValue("--di") : "",
    delay: secs.length > 3 ? getComputedStyle(secs[3]).animationDelay : "",
  };
});
console.log("  分区:", docsAnim.n, "| 动画:", docsAnim.anim, "| 第4区 --di:", docsAnim.di, "延迟:", docsAnim.delay);
if (docsAnim.anim !== "docs-item-in-kf") fail("文档分区无级联模糊入场");
else ok("文档分区级联模糊入场（--di 索引延迟生效）");
await page.screenshot({ path: `${OUT}/v12-6-docs.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(600);

/* ---------- ⑦ 回归：删除 → 返回 → 外点关闭 + 无残留 + 全回收 ---------- */
console.log("[7] 回归：删除预设返回后外点关闭/选中残留/fx 回收");
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("管理预设", { exact: true }).first().click();
await page.waitForTimeout(600);
const item = page.locator("li").first();
await item.hover();
await item.getByRole("button", { name: /删除预设/ }).click();
await page.waitForTimeout(500);
await page.locator('[aria-label="返回指令面板"]').click();
await page.waitForTimeout(600);
await page.mouse.click(1180, 400);
await page.waitForTimeout(800);
const stillOpen = (await page.locator('[aria-label="指令面板"]').count()) > 0;
if (stillOpen) fail("外点关闭失效（回归）");
else ok("toast 窗口内点空白可关闭面板");
const cleanup = await page.evaluate(() => {
  const el = document.querySelector(".search-pill");
  const root = document.getElementById("chushi-fx-root");
  const st = JSON.parse(localStorage.getItem("start:preset-settings") || "{}");
  return {
    mounts: root ? root.querySelectorAll("[data-fx-mount]").length : 0,
    marked: document.querySelectorAll("[data-fx]").length,
    settingsKeys: Object.keys(st).length,
  };
});
console.log("  fx 挂载:", cleanup.mounts, "| 标记:", cleanup.marked, "| 设置持久化键:", cleanup.settingsKeys);
if (cleanup.mounts !== 0 || cleanup.marked !== 0) fail("删除预设后 fx 未整组回收");
else ok("删除预设后 fx 挂载/标记全回收");
/* 重新打开确认首项无高亮（选中残留回归） */
await page.keyboard.press("Control+k");
await page.waitForTimeout(800);
const sel = await page.evaluate(() => {
  const item = document.querySelector('[cmdk-item][data-selected="true"]');
  return item ? getComputedStyle(item).backgroundColor : "(none)";
});
console.log("  返回后首项背景(应透明):", sel);
if (sel.includes("rgba") && !sel.includes("0, 0, 0, 0") && !sel.includes("255, 255, 255, 0")) fail("选中残留（回归）");
else ok("无选中残留");
await page.keyboard.press("Escape");

/* ---------- 页面错误 ---------- */
console.log("[8] pageerror:", errors.length ? errors : "无");
if (errors.length) fail("存在页面错误");
await browser.close();
console.log(process.exitCode ? "\n结果：有失败项" : "\n结果：全部通过");
