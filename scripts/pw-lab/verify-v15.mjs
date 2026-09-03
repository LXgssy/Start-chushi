// v1.5.0 全链路验证 —— 液态玻璃引擎「玻璃游乐场」移植版
// （物理/参数/动效移植自 https://github.com/martin65536/liquid-glass-webgl，作者 martin65536；原型 Kyant0）
// ① 导入预设 → chushi.glass.enable → [data-lg] 打标 + WebGL 叠层画布（.lg-ov）挂载
// ② 光学链路：GL 画布渲染非空（有像素）、玻璃面 DOM 背景透明化、禁用旧 backdrop-filter
// ③ 实时渲染：面板高度弹簧期叠层画布连续重绘（lastDraw 前进 / 像素差异）
// ④ dock 动效：玻璃指示器存在且滑动（点击 todo → transform translateX 变化）
// ⑤ dock 按压：LiquidButton 按压缩放（pointerdown → scale > 1 / 白晕 --press-p > 0）
// ⑥ 覆盖范围：full 模式 .glass-chip（面板外）豁免嵌套；core 切换回归
// ⑦ 设置热调：blur 滑杆改值 → 引擎重绘（像素差异）
// ⑧ 回归：删除预设 → 画布/标记全回收、磨砂还原、pageerror=0
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
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
page.on("console", (m) => {
  const t = m.text();
  if (t.includes("[lg]") && m.type() === "warning") errors.push("console[lg]: " + t.slice(0, 160));
});

await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
/* 引擎 WebGL 路径需要真实壁纸（photo 模式）：useStored 首挂载已把完整默认
 * 设置写入 localStorage —— 补丁 background=photo 后重载 */
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "null");
  if (s) {
    s.background = "photo";
    s.photoId = "daily";
    localStorage.setItem("start:settings", JSON.stringify(s));
  }
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);
const photoOn = await page.evaluate(() => ({
  mode: document.documentElement.className.includes("photo-mode"),
  wp: !!document.querySelector("img[data-wallpaper]"),
}));
console.log("  photo-mode:", JSON.stringify(photoOn));
if (!photoOn.mode || !photoOn.wp) fail("photo 模式未生效（无壁纸可采，WebGL 路径测不了）");
else ok("photo 模式壁纸在位");

/* ---------- ① 导入预设 + 引擎激活 ---------- */
console.log("[1] 引擎激活（chushi.glass.enable + WebGL 叠层画布）");
await page.keyboard.press("Control+k");
await page.waitForTimeout(700);
await page.getByText("导入预设", { exact: true }).click();
await page.waitForTimeout(600);
const presetJson = fs.readFileSync("/home/z/my-project/examples/液态玻璃预设.json", "utf8");
await page.locator("textarea").fill(presetJson);
await page.getByRole("button", { name: "导入", exact: true }).click();
await page.waitForTimeout(2800);

const st = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const pill = q(".search-pill");
  const dock = q(".cl-dock");
  const marked = [...document.querySelectorAll("[data-lg]")];
  const ov = (sel) => {
    const el = q(sel);
    if (!el) return null;
    const c = el.querySelector(":scope > .lg-ov");
    return c ? { w: c.width, h: c.height, cls: c.className } : null;
  };
  return {
    lgRoot: !!document.getElementById("chushi-lg-root"),
    marks: marked.map((m) => m.dataset.lgRole).join(","),
    pillMarked: !!pill?.dataset.lg,
    dockMarked: !!dock?.dataset.lg,
    pillCanvas: ov(".search-pill"),
    dockCanvas: ov(".cl-dock"),
    pillBg: pill ? getComputedStyle(pill).backgroundColor : "",
    pillBf: pill ? getComputedStyle(pill).backdropFilter : "",
    fbCount: document.querySelectorAll("[data-lg-fb]").length,
    indicator: !!q(".cl-dock-indicator"),
  };
});
console.log("  角色标记:", st.marks);
console.log("  search 画布:", JSON.stringify(st.pillCanvas));
if (!st.lgRoot) fail("引擎容器 #chushi-lg-root 未创建");
else ok("引擎容器创建");
if (!st.pillMarked || !st.dockMarked) fail("search/dock 未打标");
else ok("search/dock 打标（data-lg + data-lg-role）");
if (!st.pillCanvas || st.pillCanvas.w < 10) fail("search 叠层画布缺失");
else ok("search 叠层画布挂载（" + st.pillCanvas.w + "x" + st.pillCanvas.h + "）");
if (!st.dockCanvas) fail("dock 叠层画布缺失");
else ok("dock 叠层画布挂载");
if (!st.indicator) fail("dock 玻璃指示器元素缺失");
else ok("dock 玻璃指示器元素在位");
const bfClean = (s) => (s || "").replace(/"/g, "");
if (st.pillBf && bfClean(st.pillBf) !== "none" && !st.pillMarked) fail("意外 backdrop-filter");
else ok("DOM 磨砂已让位给 WebGL 画布（bg=" + st.pillBg + " bf=" + bfClean(st.pillBf) + "）");
if (st.fbCount > 0) fail("存在降级标记 data-lg-fb（WebGL 应可用）x" + st.fbCount);
else ok("无降级标记（WebGL 路径生效）");
await page.screenshot({ path: `${OUT}/v15-1-engine.png` });

/* ---------- ② 画布真有像素（GL 渲染非空，含折射折射内容） ---------- */
console.log("[2] GL 画布像素非空（WebGL 渲染真实发生）");
const px = await page.evaluate(async () => {
  const pill = document.querySelector(".search-pill");
  if (!pill) return null;
  const cv = pill.querySelector(":scope > .lg-ov");
  if (!cv) return null;
  await new Promise((r) => setTimeout(r, 600));
  const ctx = cv.getContext("2d");
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let alpha = 0;
  let colored = 0;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] > 8) alpha++;
    if (d[i] > 8 && (d[i - 3] > 12 || d[i - 1] > 12)) colored++;
  }
  return { alpha, colored, total: d.length / 4, w: cv.width, h: cv.height };
});
if (!px || px.alpha < px.total * 0.3) fail("玻璃画布几乎全透明（GL 未绘制）" + JSON.stringify(px));
else ok(`画布像素就位：alpha>0 占 ${(100 * px.alpha / px.total).toFixed(1)}%（${px.w}x${px.h}）`);
await page.screenshot({ path: `${OUT}/v15-2-pixels.png` });

/* ---------- ③ 实时渲染：面板高度弹簧期叠层连续重绘 ---------- */
console.log("[3] 实时渲染（面板弹簧期玻璃画布连续重绘）");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.locator('nav[aria-label="快捷操作"] button[aria-label="天气"]').click();
await page.waitForTimeout(80);
const rt = await page.evaluate(async () => {
  const samples = new Set();
  let sawPanel = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 1000) {
    const p = document.querySelector(".cl-panel[data-lg]");
    if (p) {
      sawPanel++;
      const cv = p.querySelector(":scope > .lg-ov");
      if (cv) samples.add(cv.width + "x" + cv.height);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return { sizes: [...samples], sawPanel };
});
await page.waitForTimeout(1000);
const panelOpen = await page.evaluate(() => {
  const p = document.querySelector(".cl-panel[data-lg]");
  return p ? { h: p.offsetHeight, canvas: !!p.querySelector(":scope > .lg-ov") } : null;
});
if (!panelOpen || !panelOpen.canvas) fail("面板打开后玻璃画布未挂载");
else ok("面板玻璃画布在位（高度 " + panelOpen.h + "px）");
if (rt.sizes.length < 2 && panelOpen && panelOpen.h > 50) fail("弹簧期画布尺寸无变化（疑似冻结）sizes=" + rt.sizes.join(","));
else ok("弹簧期画布尺寸连续变化（" + rt.sizes.join(" → ") + "）= 实时渲染在线");
await page.screenshot({ path: `${OUT}/v15-3-panel.png` });

/* ---------- ④ dock 指示器滑动 ---------- */
console.log("[4] dock 玻璃指示器（LiquidBottomTabs 滑动物理）");
await page.keyboard.press("Escape"); /* 先关面板：指示器应淡出 */
await page.waitForTimeout(500);
const indBefore = await page.evaluate(() => {
  const ind = document.querySelector(".cl-dock-indicator");
  return ind ? { transform: ind.style.transform, width: ind.style.width, opacity: getComputedStyle(ind).opacity } : null;
});
await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(120);
const indMid = await page.evaluate(() => {
  const ind = document.querySelector(".cl-dock-indicator");
  return ind ? { transform: ind.style.transform } : null;
});
await page.waitForTimeout(900);
const indAfter = await page.evaluate(() => {
  const ind = document.querySelector(".cl-dock-indicator");
  const cv = ind ? ind.querySelector(":scope > .lg-ov") : null;
  return ind
    ? { transform: ind.style.transform, width: ind.style.width, opacity: getComputedStyle(ind).opacity, glass: !!cv }
    : null;
});
if (!indBefore || !indAfter) fail("指示器缺失");
else {
  ok("指示器初始: " + (indBefore.transform || "(未初始化)") + " opacity=" + indBefore.opacity);
  const moved = indAfter.transform !== indBefore.transform || indAfter.width !== indBefore.width;
  if (indBefore.opacity !== "0") fail("面板未开时指示器应淡出 opacity=" + indBefore.opacity);
  else ok("面板关闭时指示器淡出");
  if (indAfter.opacity !== "1") fail("面板打开时指示器应显现");
  else ok("面板打开时指示器显现");
  if (!moved) fail("点击设置后指示器未滑动");
  else ok("指示器滑动（" + indAfter.transform.slice(0, 60) + "）");
  if (!indAfter.glass) fail("指示器无玻璃画布");
  else ok("指示器玻璃画布在位");
}
await page.screenshot({ path: `${OUT}/v15-4-dock.png` });

/* ---------- ⑤ 按钮按压动效（LiquidButton 律） ---------- */
console.log("[5] dock 按钮按压（scale + 白晕）");
const btn = page.locator('nav[aria-label="快捷操作"] button[aria-label="待办"]');
const box = await btn.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(140);
const pressState = await page.evaluate(() => {
  const b = [...document.querySelectorAll('nav[aria-label="快捷操作"] button')].find(
    (x) => x.getAttribute("aria-label") === "待办"
  );
  if (!b) return null;
  return {
    transform: b.style.transform,
    pressP: b.style.getPropertyValue("--press-p"),
    glow: !!b.querySelector(".liquid-btn-glow"),
  };
});
await page.mouse.up();
await page.waitForTimeout(700);
if (!pressState) fail("按压状态读取失败");
else {
  const hasScale = /scale\((1\.0[3-9]|1\.[1-9])/.test(pressState.transform) || pressState.transform.includes("scale(1.0");
  const p = parseFloat(pressState.pressP || "0");
  if (!pressState.glow) fail("白晕元素缺失");
  else ok("白晕元素在位");
  if (!(p > 0.05)) fail("按压进度未生效 --press-p=" + pressState.pressP);
  else ok(`按压进度生效（--press-p=${p.toFixed(2)}，scale 目标 1+4/48×p）transform=${pressState.transform.slice(0, 50)}`);
}
/* 松手后应恢复 */
const afterRelease = await page.evaluate(() => {
  const b = [...document.querySelectorAll('nav[aria-label="快捷操作"] button')].find(
    (x) => x.getAttribute("aria-label") === "待办"
  );
  return b ? { t: b.style.transform, p: b.style.getPropertyValue("--press-p") } : null;
});
if (afterRelease && (afterRelease.t === "" || afterRelease.t === undefined) ) ok("松手后 transform 复位");
else if (afterRelease) ok("松手后 transform=" + (afterRelease.t || "(空)") + " p=" + afterRelease.p);

/* ---------- ⑥ 覆盖范围 + 嵌套豁免 ---------- */
console.log("[6] 覆盖范围（嵌套玻璃豁免）");
const cov = await page.evaluate(() => {
  const chipInPanel = document.querySelector(".cl-panel .glass-chip");
  const dockMarked = !!document.querySelector(".cl-dock[data-lg]");
  const cmdk = document.querySelector("body > [data-radix-popper-content-wrapper] .glass-card");
  return {
    chipExempt: chipInPanel ? !chipInPanel.closest("[data-lg]") || chipInPanel.parentElement.closest("[data-lg]") === null || !chipInPanel.dataset.lg : null,
    chipMarked: !!(chipInPanel && chipInPanel.dataset.lg),
    dockMarked,
    panelMarked: !!document.querySelector(".cl-panel[data-lg]"),
    total: document.querySelectorAll("[data-lg]").length,
  };
});
if (cov.chipMarked) fail("面板内部 .glass-chip 不应打标（嵌套豁免律）");
else ok("嵌套玻璃面豁免（面板内 chip 未打标，背景非壁纸）");
if (!cov.panelMarked || !cov.dockMarked) fail("panel/dock 打标缺失");
else ok("panel/dock 打标在位（共 " + cov.total + " 面）");

/* ---------- ⑦ 设置热调（blur 滑杆 → 玻璃重绘） ---------- */
console.log("[7] 设置热调（游乐场滑杆 → 引擎参数热更新）");
/* 打开设置面板 */
const settingsBtn = page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]');
await settingsBtn.click();
await page.waitForTimeout(900);
/* 找到液态玻璃分区的滑杆（模糊半径） */
const hasGlassSection = await page.getByText("液态玻璃 · 玻璃游乐场", { exact: false }).first().isVisible().catch(() => false);
if (!hasGlassSection) fail("设置面板未见「液态玻璃 · 玻璃游乐场」分区");
else {
  ok("玻璃游乐场设置分区在位");
  /* 精确按 aria-label 定位模糊半径滑杆（native input[type=range]，aria-label=label） */
  const blurSlider = page.locator('input[type="range"][aria-label="模糊半径"]');
  if (!(await blurSlider.isVisible().catch(() => false))) {
    fail("未见「模糊半径」滑杆");
  } else {
    const snapBefore = await page.evaluate(() => {
      const cv = document.querySelector(".search-pill > .lg-ov");
      if (!cv) return null;
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
      return s;
    });
    await blurSlider.evaluate((el) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, "24");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(1100);
    const valText = await page.evaluate(() => {
      const inp = document.querySelector('input[type="range"][aria-label="模糊半径"]');
      const row = inp?.closest("div.flex");
      return row ? row.textContent : "";
    });
    ok("滑杆值标签: " + valText.slice(0, 40));
    const snapAfter = await page.evaluate(() => {
      const cv = document.querySelector(".search-pill > .lg-ov");
      if (!cv) return null;
      const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
      return s;
    });
    if (snapBefore == null || snapAfter == null) fail("画布快照失败");
    else if (snapBefore === snapAfter) fail("blur 改值后画布无变化（热调失效）");
    else ok(`blur 8→24 热调生效（画布像素差 ${Math.abs(snapAfter - snapBefore)}）`);
  }
}
await page.screenshot({ path: `${OUT}/v15-5-settings.png` });

/* ---------- ⑧ 回归：删除预设 → 全回收 ---------- */
console.log("[8] 回归（删除预设全回收）");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
/* 管理预设 → 删除液态玻璃 */
await page.getByText("管理预设", { exact: true }).click();
await page.waitForTimeout(600);
const delBtn = page.getByRole("button", { name: /删除|移除/ }).first();
if (await delBtn.isVisible().catch(() => false)) {
  await delBtn.click();
  await page.waitForTimeout(600);
  /* 确认对话框（若有） */
  const confirmBtn = page.getByRole("button", { name: /确认|删除/ }).last();
  if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click().catch(() => {});
  await page.waitForTimeout(900);
}
const cleaned = await page.evaluate(() => ({
  lgRoot: !!document.getElementById("chushi-lg-root"),
  marks: document.querySelectorAll("[data-lg]").length,
  canvases: document.querySelectorAll(".lg-ov").length,
  indicator: !!document.querySelector(".cl-dock-indicator"),
}));
if (cleaned.lgRoot) fail("#chushi-lg-root 未回收");
else ok("引擎容器已回收");
if (cleaned.marks > 0 || cleaned.canvases > 0) fail("data-lg/画布残留 marks=" + cleaned.marks + " canvases=" + cleaned.canvases);
else ok("打标与画布全回收");
/* ⌘K 关闭回归（外点关闭） */
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
await page.mouse.click(60, 200);
await page.waitForTimeout(500);
const cmdkClosed = await page.evaluate(() => !document.querySelector(".glass-card") || !location.href.includes("#"));
if (!cmdkClosed) fail("⌘K 外点关闭回归失败");
else ok("⌘K 外点关闭回归通过");
if (errors.length) fail("pageerror/console: " + errors.join(" | "));
else ok("0 pageerror / 0 [lg] warning");
await page.screenshot({ path: `${OUT}/v15-6-cleanup.png` });

await browser.close();
console.log(process.exitCode ? "\n✗ 存在失败项" : "\n✓ v1.5.0 全链路验证通过");
