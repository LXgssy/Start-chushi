// v8.7.14 视觉目检：
// N 组（本版核心）：音乐面板开合动画重写见证——
//   N1 开音乐（完整关闭后）：定高揭示律（弹簧期 iframe 布局高恒 h=OOPIF 零逐帧
//      重排=真机卡顿根修的结构性证据）+ 容器自圆律（borderRadius=16px=顶角
//      直角根修）+ 玻璃凝入/聚拢/伪 swapOut 退役（v8.7.13 律零回归）
//      + 动画中途/稳态双截图（顶角圆角目检）
//   N0/N0b 选框 Q 弹双路径（v8.7.13 律零回归）
//   N2 关音乐散场同拍 + N3 内建基线（零回归）
// G 组：互切玻璃背板恒定（零回归；注入探针部件同样走定高揭示新路径）
// A 组：掠影开抽屉 scale 1.08（v8.7.14 升档）+ 深纱无 sat 零回归
// H 组：凝聚三路径必现（v8.7.12 律零回归）
// 坑录沿用：data-widget 双挂载须筛 .cl-dockwidget 类；widget key 为复合键须
// 后缀匹配；ESC 只退编辑态不关抽屉——click 序列以 ensureClosed/ensureNoPanel
// 关闭态确认为前提；headless 重采样器首帧盲区——pill 断言用轻量采样器。
import { chromium } from "playwright-core";
import crypto from "crypto";
import { readFileSync } from "fs";

const ROOT = "/tmp/ext-beta";
const SHOTS = "/tmp/v8714-visual";
const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
const EXT_ID = [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import { mkdirSync, rmSync } from "fs";
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const ctx = await chromium.launchPersistentContext("/tmp/v8711-profile", {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--no-sandbox"],
});
const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 });
let af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await sleep(4000);

/* settings 原位改写 + reload（v8.7.8 同款语义） */
async function presetSettings(mut, ...args) {
  await af.evaluate(mut, ...args);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.endsWith("index.html");
  }, { timeout: 8000 });
  af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
  await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
  await sleep(4000);
}

/* 注入官方音乐预设（raw 补 commands/links/dock 空数组——flatMap 硬依赖坑录） */
const official = JSON.parse(readFileSync("/tmp/beta-wt/src/lib/startpage/official-presets.json", "utf8"));
await af.evaluate((raw) => {
  localStorage.setItem("start:presets", JSON.stringify([
    { id: "official-smtc-v13", name: raw.name, installedAt: Date.now(), raw },
  ]));
}, JSON.parse(JSON.stringify({ ...official.presets[1].manifest, commands: [], links: [], dock: [] })));
await presetSettings(() => {});

/* 采样前关闭态确认（坑录律：click 序列以关闭态为前提） */
async function ensureNoPanel() {
  await af.evaluate(() => document.querySelector(".fixed.inset-0.z-30")?.click());
  await sleep(600);
  const st = await af.evaluate(() => ({
    glass: !!document.querySelector(".glass-card.cl-panel"),
    h: document.querySelector(".cl-stage > div")?.getBoundingClientRect().height ?? 0,
  }));
  if (st.glass || st.h > 0) { await sleep(800); }
}

/* 选框 Q 弹轻量采样（断言与重采样密度解耦，v8.7.13 坑录律） */
async function pillLightProbe(label) {
  return await af.evaluate(`(function() {
    [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === ${JSON.stringify(label)})?.click();
    const pill = () => document.querySelector('nav[aria-label="快捷操作"] > span.pointer-events-none');
    return new Promise((resolve) => {
      const t0 = performance.now();
      const rows = [];
      const tick = () => {
        const p = pill();
        const t = Math.round(performance.now() - t0);
        rows.push({ t, tf: p ? getComputedStyle(p).transform : "", op: p ? getComputedStyle(p).opacity : "" });
        if (t < 800) requestAnimationFrame(tick);
        else resolve(rows);
      };
      requestAnimationFrame(tick);
    });
  })()`);
}
const scaleOf = (tf) => { const m = /matrix\(([-\d.]+)/.exec(tf || ""); return m ? +m[1] : 1; };

/* ================= N0/N0b：选框 Q 弹双路径（零回归） ================= */
console.log("===== N0 点音乐选框 Q 弹（轻量会话）=====");
await ensureNoPanel();
const n0 = await pillLightProbe("音乐");
const n0P = n0.filter((r) => r.tf);
const n0Judge = {
  n: n0.length,
  firstScale: n0P.length ? scaleOf(n0P[0].tf) : "NO-PILL",
  popSeen: n0P.some((r) => scaleOf(r.tf) < 0.95),
  overshootSeen: n0P.some((r) => scaleOf(r.tf) > 1.03),
};
console.log(JSON.stringify(n0Judge));
console.log("N0 期望: popSeen=true / overshootSeen=true（v8.7.13 选框对齐律零回归）");
await ensureNoPanel();
console.log("===== N0b 点设置内建基线（轻量会话）=====");
const n0b = await pillLightProbe("设置");
const n0bP = n0b.filter((r) => r.tf);
const n0bJudge = {
  popSeen: n0bP.some((r) => scaleOf(r.tf) < 0.95),
  overshootSeen: n0bP.some((r) => scaleOf(r.tf) > 1.03),
};
console.log(JSON.stringify(n0bJudge));
console.log("N0b 期望: popSeen=true + overshootSeen=true（内建基线）");
await ensureNoPanel();

/* ================= N1：完整关闭后开音乐（本版核心：定高揭示+自圆） ================= */
console.log("===== N1 完整关闭后开音乐（定高揭示+自圆见证）=====");
await ensureNoPanel();
const n1 = await af.evaluate(`(function() {
  [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "音乐")?.click();
  const pill = () => document.querySelector('nav[aria-label="快捷操作"] > span.pointer-events-none');
  const glass = () => document.querySelector(".glass-card.cl-panel");
  const widgetView = () => [...document.querySelectorAll('[data-widget$=":music"]')].find((el) => el.classList.contains("cl-dockwidget"));
  const stage = () => document.querySelector(".cl-stage > div");
  return new Promise((resolve) => {
    const t0 = performance.now();
    const rows = [];
    const tick = () => {
      const row = { t: Math.round(performance.now() - t0) };
      const p = pill();
      if (p) { const cs = getComputedStyle(p); row.pill = { op: cs.opacity, tf: cs.transform.slice(0, 44) }; } else row.pill = null;
      const g = glass();
      if (g) row.glassAnim = getComputedStyle(g).animationName.slice(0, 30);
      const wv = widgetView();
      if (wv) {
        const cs = getComputedStyle(wv);
        const fr = wv.querySelector("iframe");
        row.widget = {
          bg: cs.backgroundColor, anim: cs.animationName.slice(0, 30),
          radius: cs.borderRadius,
          wvH: Math.round(wv.getBoundingClientRect().height),
          frH: fr ? Math.round(fr.getBoundingClientRect().height) : -1,
          frAnim: fr ? getComputedStyle(fr).animationName.slice(0, 30) : "NO-FR",
        };
      }
      const st = stage();
      if (st) row.h = Math.round(st.getBoundingClientRect().height);
      rows.push(row);
      if (performance.now() - t0 < 900) requestAnimationFrame(tick);
      else resolve(rows);
    };
    requestAnimationFrame(tick);
  });
})()`);
const n1W = n1.filter((r) => r.widget);
const n1Wv = n1W.filter((r) => r.widget.wvH > 0);
const wvHs = [...new Set(n1Wv.map((r) => r.widget.wvH))];
const frHs = [...new Set(n1Wv.map((r) => r.widget.frH))];
const radii = [...new Set(n1Wv.map((r) => r.widget.radius))];
const n1Judge = {
  n: n1.length,
  /* 定高揭示律结构证据：弹簧期容器高多变（压缩揭示窗 2→128）而 iframe 高
     恒在满高附近（≤2 值=一次性自报校准，绝不入压缩区间）——旧压扁路径
     会呈 frH==wvH 连续跟踪（十余值） */
  wvHDistinct: wvHs.length, wvHRange: wvHs.length ? [Math.min(...wvHs), Math.max(...wvHs)] : null,
  frHDistinct: frHs.length, frHValues: frHs,
  fixedHReveal: frHs.length <= 2 && Math.min(...frHs) >= Math.max(...wvHs) - 2 && wvHs.length >= 6,
  /* 自圆律：容器 computed borderRadius 全程 16px */
  radii, selfRound: radii.length === 1 && radii[0] === "16px",
  /* v8.7.13 律零回归 */
  widgetRiseSeen: n1W.some((r) => r.widget.anim === "panel-fade"),
  focusSeen: n1W.some((r) => r.widget.frAnim === "content-focus-solid-kf"),
  swapOutGone: n1.every((r) => r.glassAnim !== "cl-panel-swapout-kf"),
  steadyH: n1[n1.length - 1]?.h,
};
console.log(JSON.stringify(n1Judge));
console.log("N1 期望: fixedHReveal=true（iframe 定高恒值+容器压缩窗多变=卡顿根修结构证据）/ selfRound=true（自圆律）/ widgetRiseSeen+focusSeen+swapOutGone=true / steadyH≈128");
await page.screenshot({ path: `${SHOTS}/N1a-music-open-mid.png` });
await sleep(700);
await page.screenshot({ path: `${SHOTS}/N1b-music-open-rest.png` });

/* ================= N2：关音乐（散场同拍零回归） ================= */
console.log("===== N2 关音乐 =====");
await af.evaluate(() => document.querySelector(".fixed.inset-0.z-30")?.click());
const n2 = await af.evaluate(`(function() {
  const widgetView = () => [...document.querySelectorAll('[data-widget$=":music"]')].find((el) => el.classList.contains("cl-dockwidget"));
  const pill = () => document.querySelector('nav[aria-label="快捷操作"] > span.pointer-events-none');
  const stage = () => document.querySelector(".cl-stage > div");
  return new Promise((resolve) => {
    const t0 = performance.now();
    const rows = [];
    const tick = () => {
      const row = { t: Math.round(performance.now() - t0) };
      const wv = widgetView();
      if (wv) {
        const fr = wv.querySelector("iframe");
        row.widget = { anim: fr ? getComputedStyle(fr).animationName.slice(0, 30) : "NO-FR" };
      }
      const p = pill();
      if (p) row.pillOp = +getComputedStyle(p).opacity;
      const st = stage();
      if (st) row.h = Math.round(st.getBoundingClientRect().height);
      rows.push(row);
      if (performance.now() - t0 < 500) requestAnimationFrame(tick);
      else resolve(rows);
    };
    requestAnimationFrame(tick);
  });
})()`);
const n2W = n2.filter((r) => r.widget);
const n2Judge = {
  n: n2.length,
  defocusGone: n2W.every((r) => r.widget.anim !== "content-defocus"),
  outSeen: n2W.some((r) => r.widget.anim === "panel-content-out"),
  pillExitSeen: n2.some((r) => r.pillOp !== undefined && r.pillOp < 0.99 && r.pillOp > 0.05),
  closedH: n2[n2.length - 1]?.h,
};
console.log(JSON.stringify(n2Judge));
console.log("N2 期望: defocusGone=true / outSeen=true（散场同拍零回归）/ pillExitSeen=true / closedH=0");
await sleep(700);

/* ================= N3：开设置对照组（内建基线零回归） ================= */
console.log("===== N3 开设置对照组 =====");
const n3 = await pillLightProbe("设置");
const n3P = n3.filter((r) => r.tf);
console.log(JSON.stringify({
  popSeen: n3P.some((r) => scaleOf(r.tf) < 0.95),
  overshootSeen: n3P.some((r) => scaleOf(r.tf) > 1.03),
}));
await page.screenshot({ path: `${SHOTS}/N3-settings-open.png` });
await ensureNoPanel();

/* ================= G 组：互切玻璃背板恒定（零回归，注入探针部件） ================= */
console.log("===== G 互切玻璃背板零回归 =====");
await af.evaluate(() => {
  const preset = [{
    id: "probe-widget-g", name: "探针部件G", installedAt: Date.now(),
    raw: {
      name: "探针部件G", commands: [], links: [], dock: [],
      widgets: [{
        id: "w-g11", name: "测试面板", surface: "dock",
        width: 320, height: 380,
        html: '<div style="width:100%;height:100vh;background:linear-gradient(160deg,#4f6ef7,#8b5cf6);color:#fff;font:15px sans-serif;padding:18px;box-sizing:border-box">预设部件（G组）</div>',
      }],
    },
  }];
  localStorage.setItem("start:presets", JSON.stringify(preset));
});
await presetSettings(() => {});
await af.evaluate(async () => {
  const nf = () => new Promise((r) => requestAnimationFrame(r));
  const t0w = performance.now();
  while (performance.now() - t0w < 8000) {
    if (document.querySelector('.dock-btn[aria-label="设置"]')
      && document.querySelector('.cl-dock button[aria-label="测试面板"]')) break;
    await nf();
  }
  const sb = () => [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "设置");
  const wb = () => [...document.querySelectorAll(".cl-dock button")].find((b) => b.getAttribute("aria-label") === "测试面板");
  sb().click();
  let g = 0;
  while (!document.querySelector(".glass-card.cl-panel") && g++ < 300) await nf();
  await new Promise((r) => setTimeout(r, 900));
  wb().click();
});
const gRows = await af.evaluate(`(function() {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const rows = [];
    const tick = () => {
      const wv = [...document.querySelectorAll('[data-widget$=":w-g11"]')].find((el) => el.classList.contains("cl-dockwidget"));
      if (wv) {
        const cs = getComputedStyle(wv);
        const fr = wv.querySelector("iframe");
        rows.push({
          t: Math.round(performance.now() - t0),
          bf: cs.backdropFilter, bg: cs.backgroundColor, radius: cs.borderRadius,
          anim: fr ? getComputedStyle(fr).animationName : "NO-FRAME",
          rise: cs.animationName,
        });
      }
      if (performance.now() - t0 < 800) requestAnimationFrame(tick);
      else resolve(rows);
    };
    requestAnimationFrame(tick);
  });
})()`);
const gJudged = {
  n: gRows.length,
  bfSteadyAll: gRows.every((x) => /blur\(20px\)\s*saturate\(1\.5\)/.test(x.bf)),
  bgNeverBoot: gRows.every((x) => !/rgba\(24,\s*24,\s*28,\s*1\)/.test(x.bg) && !/rgb\(255,\s*255,\s*255\)/.test(x.bg)),
  bgGlass: gRows.filter((x) => /0\.6/.test(x.bg)).length > 0,
  focusInFlight: gRows.some((x) => x.anim === "content-focus-solid-kf"),
  riseInFlight: gRows.some((x) => x.rise === "panel-fade"),
  selfRound: gRows.every((x) => x.radius === "16px"),
};
console.log(JSON.stringify(gJudged));
console.log("G 期望: bfSteadyAll=true / bgNeverBoot=true / bgGlass=true / focusInFlight=true / riseInFlight=true / selfRound=true（自圆律新路径同样在位）");
await page.screenshot({ path: `${SHOTS}/G1-widget-glass-mid.png` });
await ensureNoPanel();

/* ================= 掠影模式预置（A/H 组前提） ================= */
const WALLPAPER = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='800'>` +
  `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
  `<stop offset='0' stop-color='#1e3a5f'/><stop offset='0.5' stop-color='#2d4a73'/>` +
  `<stop offset='1' stop-color='#0f2438'/></linearGradient></defs>` +
  `<rect width='1280' height='800' fill='url(#g)'/>` +
  `${[...Array(17)].map((_, i) => `<line x1='${i * 80}' y1='0' x2='${i * 80}' y2='800' stroke='rgba(255,255,255,0.18)' stroke-width='1.5'/>`).join("")}` +
  `${[...Array(11)].map((_, i) => `<line x1='0' y1='${i * 80}' x2='1280' y2='${i * 80}' stroke='rgba(255,255,255,0.18)' stroke-width='1.5'/>`).join("")}` +
  `</svg>`
);
await presetSettings((wp) => {
  const raw = localStorage.getItem("start:settings");
  const obj = raw ? JSON.parse(raw) : {};
  obj.background = "photo";
  obj.photoId = "custom";
  obj.wallpaperUrl = wp;
  obj.wallpaperRev = (obj.wallpaperRev || 0) + 1;
  localStorage.setItem("start:settings", JSON.stringify(obj));
}, WALLPAPER);
console.log("photo-mode 挂载:", await af.evaluate(() => document.documentElement.classList.contains("photo-mode")));

/* ================= A 组：掠影开抽屉（v8.7.14 scale 1.08） ================= */
await page.mouse.click(90, 620, { button: "middle" });
await sleep(1000);
const aState = await af.evaluate(() => {
  const veil = document.querySelector(".cl-drawer-veil");
  const wp = document.querySelector(".wallpaper-layer");
  const bf = veil ? getComputedStyle(veil).backdropFilter : "NO-VEIL";
  return {
    veilBf: bf,
    satFree: !/saturate/.test(bf),
    wpTransform: wp ? getComputedStyle(wp).transform : "NO-WP",
  };
});
const aScale = /matrix\(([\d.]+)/.exec(aState.wpTransform);
console.log("A 掠影抽屉稳态:", JSON.stringify({ ...aState, scale: aScale ? +aScale[1] : null }));
console.log("A 期望: veilBf=blur(14px) satFree=true / scale≈1.08（v8.7.14 升档）");
await page.screenshot({ path: `${SHOTS}/A-photo-drawer-open.png` });
await page.mouse.click(90, 620, { button: "middle" });
await sleep(1100);

/* ================= H 组：凝聚三路径（零回归，v8.7.12 律） ================= */
async function ensureClosed() {
  await af.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await sleep(1050);
  let still = await af.evaluate(() => document.documentElement.classList.contains("cs-drawer"));
  if (still) {
    await page.mouse.click(90, 620, { button: "middle" });
    await sleep(1100);
  }
  return await af.evaluate(() => !document.documentElement.classList.contains("cs-drawer"));
}
console.log("===== H 完整关闭→重开凝聚 =====");
const h1Closed = await ensureClosed();
await page.mouse.click(90, 620, { button: "middle" });
const h1 = await af.evaluate(`(function() {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const vals = [];
    const tick = () => {
      const el = document.querySelector(".cl-drawer-veil");
      if (el) {
        const bf = getComputedStyle(el).backdropFilter;
        const m = /blur\\((\\d+(?:\\.\\d+)?)px\\)/.exec(bf);
        if (m) vals.push({ t: Math.round(performance.now() - t0), px: +m[1] });
      }
      if (performance.now() - t0 < 900) requestAnimationFrame(tick);
      else resolve(vals);
    };
    requestAnimationFrame(tick);
  });
})()`);
const h1Px = h1.map((x) => x.px);
const h1Judge = {
  closed: h1Closed,
  n: h1Px.length,
  rising: h1Px.length >= 2 && h1Px[h1Px.length - 1] > h1Px[0],
  animInFlight: await af.evaluate(() => {
    const el = document.querySelector(".cl-drawer-veil");
    return el ? getComputedStyle(el).animationName : "NO-VEIL";
  }),
  first: h1Px[0] ?? null,
  last: h1Px[h1Px.length - 1] ?? null,
};
console.log(JSON.stringify(h1Judge));
console.log("H 期望: closed=true / animInFlight=dv-open-kf / rising=true（凝聚渐进）/ last≈14");
await ensureClosed();

await ctx.close();
console.log("DONE");
