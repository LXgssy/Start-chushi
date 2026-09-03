// v1.6.0 全链路验证 —— 玻璃游乐场完整移植（整个 liquid-glass-webgl 仓库体系）
// 出处：https://github.com/martin65536/liquid-glass-webgl（作者 martin65536，Apache-2.0；原型 Kyant0）
// ① 引擎激活 + 边缘折射带 alpha 掩膜（画布内部透明 = 玻璃体让位 CSS 磨砂）
// ② 组件透见：面板玻璃身后 DOM 组件可见（backdrop-filter 磨砂体 + 0.4 表面色）
// ③ 常显指示器：面板未开也有胶囊（宽>0、transform 对齐）
// ④ 拖拽物理：按住滑动 → 指示器放大 + 速度拉伸；【拖出 nav 外松手】松手必回弹（v1.5.0 卡死回归）
// ⑤ tab 组按压：内容 1.2× 缩放 + 容器缩放；tab 按钮豁免自身按压（无双重放大）
// ⑥ 全局按钮按压：⌘K 动作按钮 data-lg-press + --press-p；松手清零
// ⑦ 游乐场设置面板：模糊半径/折射高度/折射量/色差/覆盖范围 五控件 + blur 热调像素差
// ⑧ 非玻璃模式：删预设 → 指示器消失、framer 药丸回归、拖拽/按压全静默（新动效只给玻璃用）
// ⑨ 回归：⌘K 外点关闭、pageerror=0
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
await page.waitForTimeout(1000);
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
if (!photoOn.mode || !photoOn.wp) fail("photo 模式未生效");
else ok("photo 模式壁纸在位");

/* ---------- ① 导入预设 + 引擎激活 + 带掩膜画布 ---------- */
console.log("[1] 引擎激活 + 边缘折射带 alpha 掩膜");
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
    return c ? { w: c.width, h: c.height } : null;
  };
  return {
    lgRoot: !!document.getElementById("chushi-lg-root"),
    marks: marked.map((m) => m.dataset.lgRole).join(","),
    pillCanvas: ov(".search-pill"),
    dockCanvas: ov(".cl-dock"),
    pillBf: pill ? getComputedStyle(pill).backdropFilter : "",
    pillBg: pill ? getComputedStyle(pill).backgroundColor : "",
    dockBg: dock ? getComputedStyle(dock).backgroundColor : "",
    rootVar: getComputedStyle(document.documentElement).getPropertyValue("--lg-blur"),
    lgOnTab: !!q('nav[aria-label="快捷操作"] button[data-lg-tab]'),
    cmdkLiquid: !!q('nav[aria-label="快捷操作"] button[aria-label="指令 ⌘K"].liquid-btn'),
    indicator: (() => {
      const i = q(".cl-dock-indicator");
      return i ? { w: i.style.width, tf: i.style.transform, cv: !!i.querySelector(":scope > .lg-ov") } : null;
    })(),
  };
});
console.log("  角色标记:", st.marks);
if (!st.lgRoot) fail("引擎容器未创建");
else ok("引擎容器创建（lgOn=true）");
if (!st.pillCanvas || st.pillCanvas.w < 10) fail("search 叠层画布缺失");
else ok("search 叠层画布挂载（" + st.pillCanvas.w + "x" + st.pillCanvas.h + "）");
const bf = (st.pillBf || "").replace(/"/g, "");
if (!bf.includes("blur")) fail("玻璃体 backdrop-filter 缺失（组件透见靠它）bf=" + bf);
else ok("玻璃体 CSS 磨砂在位（" + bf.slice(0, 60) + "）");
if (!/rgba\(18, 18, 24, 0\.3\)|rgba\(250, 250, 250, 0\.3\)|rgba\(255, 255, 255, 0\.3\)/.test(st.pillBg))
  fail("search 表面色未按游乐场覆盖 bg=" + st.pillBg);
else ok("search 表面色 = 游乐场 buttonSurface 0.3 体系（" + st.pillBg + "）");
if ((st.rootVar || "").trim() !== "8px") fail(":root --lg-blur 应为 8px，实为 " + st.rootVar);
else ok(":root --lg-blur=8px（cfg 驱动）");
if (!st.lgOnTab) fail("tab 按钮缺 data-lg-tab 标记");
else ok("tab 按钮 data-lg-tab 在位（豁免自身按压）");
if (!st.cmdkLiquid) fail("⌘K 动作按钮缺 liquid-btn（全局按压目标）");
else ok("⌘K 动作按钮 liquid-btn 在位");

/* 带掩膜画布：内部 alpha≈0，边缘带 alpha>0 */
await page.waitForTimeout(700);
const band = await page.evaluate(() => {
  const cv = document.querySelector(".search-pill > .lg-ov");
  if (!cv) return null;
  const ctx = cv.getContext("2d");
  const w = cv.width;
  const h = cv.height;
  const at = (x, y) => ctx.getImageData(x, y, 1, 1).data[3];
  let edgeSum = 0;
  const n = 24;
  for (let i = 0; i < n; i++) {
    edgeSum += at(Math.round((w - 1) * (i / (n - 1))), 2);
    edgeSum += at(Math.round((w - 1) * (i / (n - 1))), h - 3);
  }
  return { center: at(Math.round(w / 2), Math.round(h / 2)), edgeAvg: edgeSum / (2 * n), w, h };
});
if (!band) fail("画布采样失败");
else if (band.center > 26) fail("画布中心不透明（掩膜未生效，组件仍会被抹掉）center=" + band.center);
else if (band.edgeAvg < 24) fail("边缘折射带无像素 edgeAvg=" + band.edgeAvg.toFixed(1));
else ok(`折射带掩膜生效：中心 alpha=${band.center}（透明，让位 CSS 磨砂），边缘带均值 alpha=${band.edgeAvg.toFixed(0)}`);
await page.screenshot({ path: `${OUT}/v16-1-engine.png` });

/* ---------- ② 组件透见：面板盖住搜索条，搜索条透过玻璃可见 ---------- */
console.log("[2] 组件透见（玻璃身后 DOM 组件可见）");
/* 搜索条在页面上部，设置面板从中部弹出 —— 先量搜索条位置 */
const pillBox = await page.locator(".search-pill").boundingBox();
await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(1000);
const seeThrough = await page.evaluate(() => {
  const p = document.querySelector(".cl-panel");
  if (!p) return null;
  const cs = getComputedStyle(p);
  return {
    bg: cs.backgroundColor,
    bf: cs.backdropFilter.replace(/"/g, ""),
    marked: !!p.dataset.lg,
    canvas: !!p.querySelector(":scope > .lg-ov"),
  };
});
if (!seeThrough) fail("面板未打开");
else {
  if (!seeThrough.marked) fail("面板未打标");
  else ok("面板玻璃在位（bg=" + seeThrough.bg + " bf=" + seeThrough.bf.slice(0, 40) + "）");
  if (!/rgba\(18, 18, 24, 0\.4\)|rgba\(250, 250, 250, 0\.4\)/.test(seeThrough.bg))
    fail("面板表面色应为 0.4 透面（游乐场 tabsContainer）bg=" + seeThrough.bg);
  else ok("面板表面色 0.4（组件透见主因：不再 0.92 近实心）");
  if (!seeThrough.bf.includes("blur")) fail("面板 backdrop-filter 缺失");
  else ok("面板磨砂体在位（身后组件经真实背景采样可见）");
}
await page.screenshot({ path: `${OUT}/v16-2-seethrough.png` });
console.log("  → 人工核对截图：面板后应隐约可见搜索条/磁贴（v16-2-seethrough.png），搜索条位于",
  JSON.stringify(pillBox));

/* ---------- ③ 常显指示器 ---------- */
console.log("[3] 常显指示器（面板未开也有胶囊）");
await page.keyboard.press("Escape");
await page.waitForTimeout(600);
const ind0 = await page.evaluate(() => {
  const i = document.querySelector(".cl-dock-indicator");
  if (!i) return null;
  return { w: parseFloat(i.style.width) || 0, tf: i.style.transform, op: getComputedStyle(i).opacity };
});
if (!ind0) fail("指示器元素缺失（非玻璃态？）");
else if (ind0.w < 20 || !ind0.tf) fail("指示器未对齐：w=" + ind0.w + " tf=" + ind0.tf);
else ok(`指示器常显且对齐（宽 ${ind0.w}px，tf=${ind0.tf.slice(0, 46)}）`);
await page.screenshot({ path: `${OUT}/v16-3-indicator.png` });

/* ---------- ④ 拖拽物理 + 卡死回归 ---------- */
console.log("[4] 拖拽物理（放大/速度拉伸/拖出 nav 外松手必回弹）");
const navBox = await page.locator('nav[aria-label="快捷操作"]').boundingBox();
const todoBtn = await page.locator('nav[aria-label="快捷操作"] button[aria-label="待办"]').boundingBox();
/* 按住待办，向右拖 60px（>8px 阈值触发拖拽），中途采样 */
await page.mouse.move(todoBtn.x + todoBtn.width / 2, todoBtn.y + todoBtn.height / 2);
await page.mouse.down();
await page.mouse.move(todoBtn.x + todoBtn.width / 2 + 30, todoBtn.y + todoBtn.height / 2, { steps: 4 });
await page.waitForTimeout(120);
const dragMid = await page.evaluate(() => {
  const i = document.querySelector(".cl-dock-indicator");
  const row = document.querySelector('nav[aria-label="快捷操作"] > div:nth-child(2)');
  const nav = document.querySelector('nav[aria-label="快捷操作"]');
  const m = (t) => {
    const mm = /scale\(([\d.]+)[,)]\s*([\d.]+)\)/.exec(t || "");
    return mm ? { x: parseFloat(mm[1]), y: parseFloat(mm[2]) } : null;
  };
  return {
    ind: i ? m(i.style.transform) : null,
    indTf: i?.style.transform || "",
    pressP: i ? parseFloat(i.style.getPropertyValue("--press-p") || "0") : 0,
    rowScale: row ? m(row.style.transform) : null,
    navScale: nav ? m(nav.style.transform) : null,
    dragging: !!i?.style.transform,
  };
});
/* 拖出 nav 外松手（v1.5.0 卡死路径） */
await page.mouse.move(navBox.x + navBox.width / 2, 80, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(1300);
const dragEnd = await page.evaluate(() => {
  const i = document.querySelector(".cl-dock-indicator");
  if (!i) return null;
  const mm = /scale\(([\d.]+)[,)]\s*([\d.]+)\)/.exec(i.style.transform || "");
  return {
    scale: mm ? Math.max(parseFloat(mm[1]), parseFloat(mm[2])) : 1,
    tf: i.style.transform,
    pressP: parseFloat(i.style.getPropertyValue("--press-p") || "0"),
  };
});
if (!dragMid || !dragEnd) fail("拖拽状态读取失败");
else {
  const grew = dragMid.ind && dragMid.ind.x > 1.15 && dragMid.ind.y > 1.15;
  if (!grew) fail("拖拽中指示器未放大（长按拖拽「边框不变」病根）ind=" + JSON.stringify(dragMid.ind));
  else ok(`拖拽中指示器放大（scale=${dragMid.ind.x.toFixed(2)},${dragMid.ind.y.toFixed(2)} 目标 78/56≈1.39 + 速度拉伸）`);
  if (dragMid.pressP < 0.3) fail("拖拽中按压进度未起来 p=" + dragMid.pressP);
  else ok("拖拽中按压进度 p=" + dragMid.pressP.toFixed(2));
  if (!dragMid.rowScale || dragMid.rowScale.x < 1.05) fail("拖拽中内容行未放大（1.2×press）");
  else ok(`内容行缩放 ${dragMid.rowScale.x.toFixed(2)}（1+0.2×press 律）`);
  if (!dragMid.navScale || dragMid.navScale.x < 1.005) ok("容器缩放微小（16dp/W×press，采样窗口内可忽略）");
  else ok(`容器缩放 ${dragMid.navScale.x.toFixed(3)}`);
  if (dragEnd.scale > 1.06 || dragEnd.pressP > 0.06)
    fail(`拖出 nav 外松手后指示器未回弹（卡死复现！）scale=${dragEnd.scale} p=${dragEnd.pressP}`);
  else ok(`拖出 nav 外松手 → 指示器回弹（scale=${dragEnd.scale.toFixed(3)}, p=${dragEnd.pressP.toFixed(3)}）= 卡死修复`);
}
await page.waitForTimeout(400);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/v16-4-drag.png` });

/* ---------- ⑤ tab 组按压（豁免自身按压） ---------- */
console.log("[5] tab 组按压（内容 1.2×；tab 按钮自身零变换）");
const weatherBtn = await page.locator('nav[aria-label="快捷操作"] button[aria-label*="天气"]').boundingBox();
await page.mouse.move(weatherBtn.x + weatherBtn.width / 2, weatherBtn.y + weatherBtn.height / 2);
await page.mouse.down();
await page.waitForTimeout(160);
const tabPress = await page.evaluate(() => {
  const b = [...document.querySelectorAll('nav[aria-label="快捷操作"] button')].find((x) =>
    (x.getAttribute("aria-label") || "").includes("天气")
  );
  const row = document.querySelector('nav[aria-label="快捷操作"] > div:nth-child(2)');
  const mm = row ? /scale\(([\d.]+)/.exec(row.style.transform || "") : null;
  return {
    btnPress: b?.hasAttribute("data-lg-press"),
    btnTf: b?.style.transform || "",
    rowScale: mm ? parseFloat(mm[1]) : 1,
  };
});
await page.mouse.up();
await page.waitForTimeout(700);
if (tabPress.btnPress) fail("tab 按钮被全局控制器接管（应豁免，防双重放大）");
else if (tabPress.btnTf) fail("tab 按钮自身有 transform（双重放大病根未除）");
else ok("tab 按钮零自身变换（组按压接管）");
if (tabPress.rowScale < 1.05) fail("组按压内容缩放未生效 row=" + tabPress.rowScale);
else ok(`组按压内容缩放生效（row scale=${tabPress.rowScale.toFixed(2)}）`);

/* ---------- ⑥ 全局按钮按压（动作按钮） ---------- */
console.log("[6] 全局 LiquidButton 按压（覆盖全部按钮）");
const cmdk = await page.locator('nav[aria-label="快捷操作"] button[aria-label="指令 ⌘K"]').boundingBox();
await page.mouse.move(cmdk.x + cmdk.width / 2, cmdk.y + cmdk.height / 2);
await page.mouse.down();
await page.waitForTimeout(160);
const gPress = await page.evaluate(() => {
  const b = [...document.querySelectorAll('nav[aria-label="快捷操作"] button')].find(
    (x) => x.getAttribute("aria-label") === "指令 ⌘K"
  );
  return b
    ? { press: b.hasAttribute("data-lg-press"), p: parseFloat(b.style.getPropertyValue("--press-p") || "0"), tf: b.style.transform.slice(0, 40) }
    : null;
});
await page.mouse.up();
await page.waitForTimeout(2000); /* 无头 rAF 节流 ~13fps，弹簧仿真需 ~1s；真机 60fps ≈0.3s */
const gRelease = await page.evaluate(() => {
  const b = [...document.querySelectorAll('nav[aria-label="快捷操作"] button')].find(
    (x) => x.getAttribute("aria-label") === "指令 ⌘K"
  );
  return b ? { press: b.hasAttribute("data-lg-press"), tf: b.style.transform } : null;
});
if (!gPress || !gPress.press || gPress.p < 0.1) fail("⌘K 按压未走全局控制器 " + JSON.stringify(gPress));
else ok(`⌘K 全局按压生效（p=${gPress.p.toFixed(2)} tf=${gPress.tf}）`);
if (!gRelease || gRelease.press || gRelease.tf) fail("⌘K 松手未复位 " + JSON.stringify(gRelease));
else ok("⌘K 松手复位（内联样式清零）");
/* 副作用清理：按 ⌘K 的 click 会打开指令面板，关掉再继续 */
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
const paletteGone = await page.evaluate(() => !document.querySelector("[role=dialog][aria-label='指令面板']"));
if (!paletteGone) await page.mouse.click(60, 160);
await page.waitForTimeout(400);

/* ---------- ⑦ 游乐场设置面板（五控件 + 热调） ---------- */
console.log("[7] 游乐场设置面板（除圆角半径外全部控件）");
await page.locator('nav[aria-label="快捷操作"] button[aria-label="设置"]').click();
await page.waitForTimeout(900);
const sec = await page.evaluate(() => {
  const labels = ["模糊半径", "折射高度", "折射量", "色差", "覆盖范围"];
  const found = {};
  for (const l of labels) {
    const inp = document.querySelector(`input[type="range"][aria-label="${l}"]`);
    found[l] = inp ? "slider" : [...document.querySelectorAll("main *, body *")].some((el) => el.textContent === l && el.children.length === 0) ? "label" : false;
  }
  const sliders = [...document.querySelectorAll(".cl-panel input[type=range]")].map((i) => i.getAttribute("aria-label"));
  return { found, sliders };
});
ok("设置面板滑杆清单: " + sec.sliders.join(" / "));
for (const l of ["模糊半径", "折射高度", "折射量", "色差"]) {
  if (sec.found[l] === "slider") ok(`「${l}」滑杆在位`);
  else fail(`「${l}」滑杆缺失（游乐场控件未移植全）`);
}
if (sec.found["覆盖范围"] === false) fail("「覆盖范围」选择器缺失");
else ok("「覆盖范围」在位（应用特有）");
/* blur 热调像素差 */
const snapA = await page.evaluate(() => {
  const cv = document.querySelector(".search-pill > .lg-ov");
  const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  return { s, blur: getComputedStyle(document.documentElement).getPropertyValue("--lg-blur") };
});
await page.locator('input[type="range"][aria-label="模糊半径"]').evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, "24");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(1100);
const snapB = await page.evaluate(() => {
  const cv = document.querySelector(".search-pill > .lg-ov");
  const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  return { s, blur: getComputedStyle(document.documentElement).getPropertyValue("--lg-blur") };
});
if (snapB.blur.trim() !== "24px") fail("blur 热调未写 :root 变量 " + snapB.blur);
else ok("blur 8→24 热调：:root --lg-blur=24px");
if (snapA.s === snapB.s) fail("blur 热调后画布无像素差（重绘失效）");
else ok(`blur 热调画布重绘（像素差 ${Math.abs(snapB.s - snapA.s)}）`);
/* 色差滑杆热调（chromatic % → 0..1） */
await page.locator('input[type="range"][aria-label="色差"]').evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, "80");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(900);
const chromaCfg = await page.evaluate(() => window.__chushiLG?.()?.cfg?.chromatic);
if (chromaCfg === undefined) fail("引擎探针不可用");
else if (Math.abs(chromaCfg - 0.8) > 0.01) fail("色差 80% 未换算为 0.8 cfg=" + chromaCfg);
else ok("色差 80% → cfg.chromatic=0.8（% → 0..1 换算律）");
await page.screenshot({ path: `${OUT}/v16-5-settings.png` });
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

/* ---------- ⑧ 非玻璃模式：删预设 → 新动效全静默 ---------- */
console.log("[8] 非玻璃模式（新动效只给玻璃用）");
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.getByText("管理预设", { exact: true }).click();
await page.waitForTimeout(600);
const delBtn = page.getByRole("button", { name: /删除|移除/ }).first();
if (await delBtn.isVisible().catch(() => false)) {
  await delBtn.click();
  await page.waitForTimeout(500);
  const confirmBtn = page.getByRole("button", { name: /确认|删除/ }).last();
  if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click().catch(() => {});
  await page.waitForTimeout(1000);
}
const off = await page.evaluate(() => ({
  lgRoot: !!document.getElementById("chushi-lg-root"),
  indicator: !!document.querySelector(".cl-dock-indicator"),
  marks: document.querySelectorAll("[data-lg]").length,
  lgTab: document.querySelectorAll("[data-lg-tab]").length,
}));
if (off.lgRoot || off.marks > 0) fail("引擎/打标未回收 " + JSON.stringify(off));
else ok("引擎全回收（lgOn=false）");
if (off.indicator) fail("非玻璃模式仍渲染玻璃指示器");
else ok("玻璃指示器已卸载");
if (off.lgTab > 0) fail("data-lg-tab 残留");
else ok("data-lg-tab 清除");
/* framer 药丸回归：打开待办 → button 内出现 layoutId 药丸 */
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.locator('nav[aria-label="快捷操作"] button[aria-label="待办"]').click();
await page.waitForTimeout(700);
const pillBack = await page.evaluate(() => {
  const b = [...document.querySelectorAll('nav[aria-label="快捷操作"] button')].find(
    (x) => (x.getAttribute("aria-label") || "") === "待办"
  );
  const pill = b?.querySelector("span.absolute.inset-0");
  return { pill: !!pill, bg: pill ? getComputedStyle(pill).backgroundColor : "", liquid: b?.classList.contains("liquid-btn") };
});
if (!pillBack.pill) fail("非玻璃模式活动药丸未回归（framer layoutId）");
else ok("原版 framer 活动药丸回归（bg=" + pillBack.bg + "）");
if (pillBack.liquid) fail("非玻璃模式按钮仍带 liquid-btn");
else ok("按钮 liquid-btn 已摘除");
/* 非玻璃按压静默：按 ⌘K 按钮无 data-lg-press */
const cmdk2 = await page.locator('nav[aria-label="快捷操作"] button[aria-label="指令 ⌘K"]').boundingBox();
await page.mouse.move(cmdk2.x + cmdk2.width / 2, cmdk2.y + cmdk2.height / 2);
await page.mouse.down();
await page.waitForTimeout(160);
const offPress = await page.evaluate(() => {
  const b = [...document.querySelectorAll('nav[aria-label="快捷操作"] button')].find(
    (x) => x.getAttribute("aria-label") === "指令 ⌘K"
  );
  return { press: b?.hasAttribute("data-lg-press"), tf: b?.style.transform || "" };
});
await page.mouse.up();
if (offPress.press || offPress.tf) fail("非玻璃模式按钮仍被按压控制器触碰 " + JSON.stringify(offPress));
else ok("非玻璃模式按压全静默（零 transform/零标记）");
/* 非玻璃 nav 拖拽静默（拖动不产生任何指示器/容器变换） */
const navB = await page.locator('nav[aria-label="快捷操作"]').boundingBox();
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
await page.mouse.move(navB.x + 40, navB.y + navB.height / 2);
await page.mouse.down();
await page.mouse.move(navB.x + 160, navB.y + navB.height / 2, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);
const offDrag = await page.evaluate(() => {
  const nav = document.querySelector("nav[aria-label='快捷操作']");
  return { navTf: nav?.style.transform || "" };
});
if (offDrag.navTf) fail("非玻璃模式 nav 被拖拽逻辑触碰 " + offDrag.navTf);
else ok("非玻璃模式 nav 拖拽全静默");
await page.screenshot({ path: `${OUT}/v16-6-offmode.png` });

/* ---------- ⑨ 回归 ---------- */
console.log("[9] 回归");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.keyboard.press("Control+k");
await page.waitForTimeout(600);
await page.mouse.click(60, 160);
await page.waitForTimeout(500);
const cmdkClosed = await page.evaluate(() => !document.querySelector("[data-cmdk-root]"));
if (!cmdkClosed) fail("⌘K 外点关闭回归失败");
else ok("⌘K 外点关闭回归通过");
if (errors.length) fail("pageerror/console: " + errors.join(" | "));
else ok("0 pageerror / 0 [lg] warning");

await browser.close();
console.log(process.exitCode ? "\n✗ 存在失败项" : "\n✓ v1.6.0 全链路验证通过");
