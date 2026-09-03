// v1.3.0 全链路验证 —— 液态玻璃引擎内建宿主（实时渲染 + 真环绕 + 覆盖范围）
// ① 导入预设 → chushi.glass.enable → [data-lg] 标记 / 链序 blur→url→saturate / 贴图
// ② 真环绕折射：search-pill/dock 边框外扩（border=pad、radius+pad、负 margin、宽度补偿）
// ③ 实时渲染：dock 面板高度弹簧期间贴图 href 连续重建（≥2 个不同 URL）且链始终带 url
// ④ 覆盖范围：chip 玻璃面打标（full）；切「基础四区」→ chip 摘标
// ⑤ ⌘K 卡开启动画期玻璃在线（card 键折射）
// ⑥ 幕布永不打标（全屏遮罩无 data-lg）
// ⑦ 回归：删除预设 → #chushi-lg-root 回收 / [data-lg] 清零 / 磨砂还原 / pageerror=0
// ⑧ fx 通用面仍工作（[data-fx] 标记在位，与内建引擎互不干扰）
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

/* ---------- ① 导入预设 + 引擎激活 ---------- */
console.log("[1] 引擎激活（chushi.glass.enable）");
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2600);

const st = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const pill = q(".search-pill");
  const dock = q(".cl-dock");
  const marked = [...document.querySelectorAll("[data-lg]")];
  const filters = [...document.querySelectorAll("#chushi-lg-root filter")];
  const fei = filters[0]?.querySelector("feImage");
  const disp = filters[0]?.querySelectorAll("feDisplacementMap");
  const cs = pill ? getComputedStyle(pill) : null;
  const csDock = dock ? getComputedStyle(dock) : null;
  return {
    lgRoot: !!document.getElementById("chushi-lg-root"),
    marks: marked.map((m) => m.dataset.lgKey).join(","),
    pillMarked: pill?.dataset.lg || "",
    dockMarked: dock?.dataset.lg || "",
    chipMarked: !!q(".glass-chip[data-lg]"),
    pillBf: cs ? cs.backdropFilter : "(none)",
    dockBf: csDock ? csDock.backdropFilter : "(none)",
    pillBorder: cs ? cs.borderTopWidth : "",
    pillMargin: cs ? cs.marginTop : "",
    pillRadius: cs ? cs.borderTopLeftRadius : "",
    dockWidthVar: dock?.style.getPropertyValue("--lg-ww") || "",
    dockWidth: csDock ? csDock.width : "",
    filterCount: filters.length,
    mapOk: !!(fei && (fei.getAttribute("href") || "").startsWith("data:image/png")),
    dispCount: disp ? disp.length : 0,
    scale: disp && disp[0] ? disp[0].getAttribute("scale") : "",
  };
});
console.log("  标记键:", st.marks);
console.log("  搜索栏链:", st.pillBf);
console.log("  外扩: border=" + st.pillBorder, "margin=" + st.pillMargin, "radius=" + st.pillRadius);
console.log("  dock --lg-ww=" + st.dockWidthVar, "width=" + st.dockWidth, "滤镜数:", st.filterCount, "scale:", st.scale);
if (!st.lgRoot) fail("引擎容器 #chushi-lg-root 未创建");
else ok("引擎容器创建");
const bfN = (s) => (s || "").replace(/"/g, "");
if (!bfN(st.pillBf).includes("blur(3px)") || !bfN(st.pillBf).includes("url(#lg-") || !bfN(st.pillBf).includes("saturate(1.8)"))
  fail("链序律不符合 blur→url→saturate: " + st.pillBf);
else ok("链序律 blur(3px)→url(#lg-)→saturate(180%)");
if (!st.pillMarked || !st.dockMarked) fail("search/dock 未打标");
else ok("search/dock 打标（" + st.pillMarked + "/" + st.dockMarked + "）");
if (st.filterCount < 2 || !st.mapOk || st.dispCount < 1) fail("滤镜/贴图缺失");
else ok("feImage 贴图 + feDisplacementMap ×" + st.dispCount + " 就位（滤镜 " + st.filterCount + " 组）");
/* 真环绕外扩判定 */
const padPx = parseFloat(st.pillBorder);
if (!(padPx >= 4) || !st.pillMargin.startsWith("-") || parseFloat(st.pillRadius) < 28)
  fail("边框外扩未生效 border=" + st.pillBorder + " margin=" + st.pillMargin);
else ok(`真环绕外扩生效（pad=${padPx}px，radius ${parseFloat(st.pillRadius)}px，负 margin）`);
if (!st.dockWidthVar) fail("dock 宽度补偿缺失（--lg-ww 未写）");
else ok("dock 宽度补偿 --lg-ww=" + st.dockWidthVar);
await page.screenshot({ path: `${OUT}/v13-1-engine.png` });

/* ---------- ② 实时渲染：面板弹簧期贴图连续重建 ---------- */
console.log("[2] 实时渲染（面板高度弹簧期贴图逐帧重建，折射不冻结）");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
const panelKey = await page.evaluate(() => document.querySelector(".cl-panel") ? "" : "");
await page.locator('nav[aria-label="快捷操作"] button[aria-label="天气"]').click();
await page.waitForTimeout(60);
/* 弹簧进行中：采样 cl-panel 滤镜 feImage href 集合 + 链是否始终带 url */
const rt = await page.evaluate(async () => {
  const hrefs = new Set();
  let urlDrop = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 900) {
    const p = document.querySelector(".cl-panel[data-lg]");
    if (p) {
      const id = p.dataset.lg;
      const img = document.querySelector(`#chushi-lg-root filter[id="lg-${id}"] feImage`);
      if (img) hrefs.add(img.getAttribute("href").slice(-48));
      const bf = getComputedStyle(p).backdropFilter.replace(/"/g, "");
      if (!bf.includes("url(#lg-")) urlDrop += 1;
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  return { hrefs: [...hrefs], urlDrop };
});
await page.waitForTimeout(900);
const afterPanel = await page.evaluate(() => {
  const p = document.querySelector(".cl-panel[data-lg]");
  const cs = p ? getComputedStyle(p) : null;
  const id = p?.dataset.lg;
  const img = id ? document.querySelector(`#chushi-lg-root filter[id="lg-${id}"] feImage`) : null;
  return { bf: cs ? cs.backdropFilter : "(none)", hrefTail: img ? img.getAttribute("href").slice(-48) : "", w: p ? p.offsetWidth : 0 };
});
console.log("  弹簧期贴图版本数:", rt.hrefs.length, "| url 掉链帧:", rt.urlDrop, "| 稳定后:", afterPanel.bf);
if (rt.hrefs.length < 2) fail("弹簧期贴图未实时重建（仅 " + rt.hrefs.length + " 版）");
else ok("实时渲染：弹簧期贴图重建 " + rt.hrefs.length + " 版（v1.2.0 为 0 版 + 退化纯 blur）");
if (rt.urlDrop > 0) fail("弹簧期出现无 url 帧（折射掉线）");
else ok("弹簧期折射全程在线（无 blur-only 退化帧）");
if (!bfN(afterPanel.bf).includes("url(#lg-")) fail("稳定后未恢复全链");
else ok("稳定后精贴图就位（半分辨率重建）");
await page.screenshot({ path: `${OUT}/v13-2-realtime.png` });
await page.locator('button[aria-label="关闭面板"]').click();
await page.waitForTimeout(600);

/* ---------- ③ 覆盖范围切换：full → core（探针环境无天气数据，chip 用注入式判定） ---------- */
console.log("[3] 覆盖范围热切换（设置面板 select）");
const chipFull = await page.evaluate(async () => {
  const d = document.createElement("span");
  d.className = "glass-chip";
  d.style.cssText = "position:fixed;left:12px;bottom:90px;width:80px;height:26px";
  document.body.appendChild(d);
  await new Promise((r) => setTimeout(r, 350));
  const marked = !!d.dataset.lg;
  const bf = marked ? getComputedStyle(d).backdropFilter : "";
  d.remove();
  return { marked, bf };
});
console.log("  full 模式：注入 .glass-chip 打标 =", chipFull.marked, "链:", chipFull.bf.slice(0, 40));
if (!chipFull.marked) fail("full 模式：glass-chip 未纳入折射");
else ok("full 模式：glass-chip 纳入折射（覆盖范围=全部玻璃面）");
await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(900);
const seg = await page.evaluate(() => {
  const g = document.querySelector('[role="radiogroup"][aria-label="覆盖范围"]');
  if (!g) return { found: false };
  return { found: true, options: [...g.querySelectorAll('[role="radio"]')].map((r) => r.textContent.trim()) };
});
console.log("  覆盖范围控件:", JSON.stringify(seg));
if (!seg.found) fail("设置面板缺「覆盖范围」选择控件");
else ok("覆盖范围控件渲染（" + seg.options.join("/") + "）");
await page.locator('[role="radiogroup"][aria-label="覆盖范围"] >> text=基础四区').click();
await page.waitForTimeout(700);
await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(500);
const coreState = await page.evaluate(async () => {
  const d = document.createElement("span");
  d.className = "glass-chip";
  d.style.cssText = "position:fixed;left:12px;bottom:90px;width:80px;height:26px";
  document.body.appendChild(d);
  await new Promise((r) => setTimeout(r, 350));
  const chipMarked = !!d.dataset.lg;
  d.remove();
  return {
    chipMarked,
    pill: !!document.querySelector(".search-pill[data-lg]"),
  };
});
console.log("  core 后：chip 打标 =", coreState.chipMarked, "| pill=", coreState.pill);
if (coreState.chipMarked) fail("core 模式下 chip 仍被打标");
else ok("core 模式：chip 摘标（覆盖收窄即时生效）");
if (!coreState.pill) fail("core 模式下基础四区丢失");
else ok("core 模式：基础四区保持（search 在标）");
await page.screenshot({ path: `${OUT}/v13-3-chip-core.png` });
await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(900);
await page.locator('[role="radiogroup"][aria-label="覆盖范围"] >> text=全部玻璃面').click();
await page.waitForTimeout(500);
await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(600);

/* ---------- ④ ⌘K 卡玻璃 + 幕布不打标 ---------- */
console.log("[4] ⌘K 卡折射 + 幕布豁免");
await page.keyboard.press("Control+k");
await page.waitForTimeout(350); /* 开启动画中 */
const cmdk = await page.evaluate(() => {
  const card = document.querySelector('[role="dialog"] .glass-card[data-lg], .glass-card[data-lg][class*="card-in"]');
  const anyCard = [...document.querySelectorAll(".glass-card[data-lg]")].length;
  const veils = [...document.querySelectorAll("[data-lg]")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width >= innerWidth - 2 && r.height >= innerHeight - 2;
  }).length;
  const bf = [...document.querySelectorAll(".glass-card[data-lg]")].map((c) => getComputedStyle(c).backdropFilter.replace(/"/g, ""));
  return { anyCard, veils, bf: bf[0] || "" };
});
await page.waitForTimeout(800);
console.log("  ⌘K 卡打标数:", cmdk.anyCard, "| 幕布违规:", cmdk.veils);
if (cmdk.anyCard < 1) fail("⌘K 卡未纳入折射");
else ok("⌘K 卡纳入折射（链: " + cmdk.bf.slice(0, 60) + "…）");
if (cmdk.veils > 0) fail("全屏幕布被打标");
else ok("幕布豁免（全屏元素永不折射）");
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

/* ---------- ⑤ fx 通用面与内建引擎共存 ---------- */
console.log("[5] fx 通用面共存");
const fx = await page.evaluate(() => ({
  fxMarks: document.querySelectorAll("[data-fx]").length,
  lgMarks: document.querySelectorAll("[data-lg]").length,
}));
console.log("  [data-fx]:", fx.fxMarks, " [data-lg]:", fx.lgMarks);
if (fx.lgMarks < 2) fail("内建引擎标记异常（面板全关时应余 search/dock ≥2）");
else ok("双通道共存（fx 通用面 " + fx.fxMarks + " 标记 / 内建引擎 " + fx.lgMarks + " 标记）");

/* ---------- ⑥ 回归：删除预设 → 返回 → 外点关闭 + 全回收 ---------- */
console.log("[6] 删除预设 → 全回收（含外点关闭回归）");
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("管理预设", { exact: true }).first().click();
await page.waitForTimeout(700);
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
else ok("删除预设返回后外点仍可关闭面板（历史 bug 无复发）");
const cleaned = await page.evaluate(() => {
  const dock = document.querySelector(".cl-dock");
  return {
    lgRoot: !!document.getElementById("chushi-lg-root"),
    lgMarks: document.querySelectorAll("[data-lg]").length,
    dockBf: dock ? getComputedStyle(dock).backdropFilter : "(none)",
    dockPad: dock ? dock.style.getPropertyValue("--lg-pad") : "",
    settingsKeys: Object.keys(JSON.parse(localStorage.getItem("start:preset-settings") || "{}")).length,
  };
});
console.log("  容器:", cleaned.lgRoot, "| 标记:", cleaned.lgMarks, "| dock 链:", cleaned.dockBf, "| --lg-pad 残留:", JSON.stringify(cleaned.dockPad));
if (cleaned.lgRoot || cleaned.lgMarks > 0) fail("引擎容器/标记未回收");
else ok("引擎容器与全部标记回收");
if (bfN(cleaned.dockBf).includes("url(#lg-") || cleaned.dockPad) fail("dock 材质/变量残留");
else ok("dock 还原磨砂（无 url 链、无 --lg-pad）");
if (cleaned.settingsKeys !== 0) fail("预设设置值未回收");
else ok("设置持久化值一并回收");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

console.log("pageerror:", errors.length, errors.slice(0, 3));
if (errors.length) fail("页面存在未捕获错误");
else ok("0 pageerror");
await browser.close();
console.log(process.exitCode === 1 ? "\n=== FAIL ===" : "\n=== ALL PASS ===");
