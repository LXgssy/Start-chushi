// v8.7.13 视觉目检：
// N 组（本版核心）：音乐面板开合动画与内建全面同拍见证——
//   N1 开音乐（完整关闭后）：选框 Q 弹起跳（pillPop 认部件路径，v8.7.13 新）+
//      容器玻璃 panel-fade 凝入在飞 + iframe 聚拢在飞 + 伪 swapOut 残影退役
//      （closed 归属清零：glass.anim 全程 ≠ cl-panel-swapout-kf）
//   N2 关音乐：iframe 散场同拍 panel-content-out 0.18s（v8.7.13 新）+ 选框 exit 在飞
//   N3 开设置对照组：选框 Q 弹基线不回归
// G 组：互切玻璃背板恒定零回归（v8.7.11 TL41 行为面；凝入加入后 bgGlass 后段仍真）
// A 组：掠影开抽屉 scale 1.05 + 深纱无 sat 零回归
// H 组：凝聚三路径必现零回归（v8.7.12 animation 化）
// 坑录（v8.7.11/12 沉淀）：data-widget 双挂载须筛 .cl-dockwidget 类；widget key 为
// 复合键（presetId:widgetId）须后缀匹配；ESC 只退编辑态不关抽屉——click 序列以
// ensureClosed 关闭态确认为前提。
import { chromium } from "playwright-core";
import crypto from "crypto";
import { readFileSync } from "fs";

const ROOT = "/tmp/ext-beta";
const SHOTS = "/tmp/v8713-visual";
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

/* 注入官方音乐预设（raw 补 commands/links/dock 空数组——use-start-presets
   flatMap 硬依赖，缺字段=React 崩溃 nav 不挂载，dbg 实测坑录） */
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

/* dock 按钮点击（af 帧内） */
async function clickDock(label) {
  await af.evaluate((lb) => {
    [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === lb)?.click();
  }, label);
}

/* 通用动画窗采样：pill/玻璃卡/容器/iframe/高度盒 */
const SAMPLER = (win) => `(function() {
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
      if (p) { const cs = getComputedStyle(p); row.pill = { op: (+cs.opacity).toFixed(2), tf: cs.transform.slice(0, 44) }; } else row.pill = null;
      const g = glass();
      if (g) row.glassAnim = getComputedStyle(g).animationName.slice(0, 30);
      const wv = widgetView();
      if (wv) {
        const cs = getComputedStyle(wv);
        const fr = wv.querySelector("iframe");
        row.widget = {
          bg: cs.backgroundColor, anim: cs.animationName.slice(0, 30),
          frAnim: fr ? getComputedStyle(fr).animationName.slice(0, 30) : "NO-FR",
          frFilt: fr ? getComputedStyle(fr).filter.slice(0, 24) : "",
        };
      }
      const st = stage();
      if (st) row.h = Math.round(st.getBoundingClientRect().height);
      rows.push(row);
      if (performance.now() - t0 < ${win}) requestAnimationFrame(tick);
      else resolve(rows);
    };
    requestAnimationFrame(tick);
  });
})()`;

const pillScale = (tf) => { const m = /matrix\(([\d.]+)/.exec(tf || ""); return m ? +m[1] : 1; };

/* ================= N0/N0b：选框 Q 弹轻量会话（本版核心） =================
   headless 坑录律：重采样器（全量字段）首帧可能晚于 Q 弹收敛——pill 断言用
   只采 pill 的轻量采样器独立会话（dbg-pill 双路径实证法固化）；断言锚定
   「首帧 scale<0.95 起跳 + 过冲回弹(scale>1.03)出现」对采样密度鲁棒。 */
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
console.log("===== N0 点音乐选框 Q 弹（轻量会话）=====");
await ensureNoPanel();
const n0 = await pillLightProbe("音乐");
const n0P = n0.filter((r) => r.tf);
const n0Judge = {
  n: n0.length,
  firstScale: n0P.length ? scaleOf(n0P[0].tf) : "NO-PILL",
  popSeen: n0P.some((r) => scaleOf(r.tf) < 0.95),
  overshootSeen: n0P.some((r) => scaleOf(r.tf) > 1.03),
  firstT: n0P[0]?.t ?? null,
};
console.log(JSON.stringify(n0Judge));
console.log("N0 期望: popSeen=true（首帧 scale≈0.6 起跳=v8.7.13 新律）/ overshootSeen=true（Q 弹过冲回弹）");
await ensureNoPanel();
console.log("===== N0b 点设置内建基线（轻量会话）=====");
const n0b = await pillLightProbe("设置");
const n0bP = n0b.filter((r) => r.tf);
const n0bJudge = {
  n: n0b.length,
  firstScale: n0bP.length ? scaleOf(n0bP[0].tf) : "NO-PILL",
  popSeen: n0bP.some((r) => scaleOf(r.tf) < 0.95),
  overshootSeen: n0bP.some((r) => scaleOf(r.tf) > 1.03),
};
console.log(JSON.stringify(n0bJudge));
console.log("N0b 期望: popSeen=true + overshootSeen=true（内建基线不回归）——N0 与 N0b 同语言=首开对齐律实证");
await ensureNoPanel();

/* ================= N1：完整关闭后开音乐（本版核心） ================= */
await ensureNoPanel();
console.log("===== N1 完整关闭后开音乐 =====");
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
        row.widget = { bg: cs.backgroundColor, anim: cs.animationName.slice(0, 30), frAnim: fr ? getComputedStyle(fr).animationName.slice(0, 30) : "NO-FR" };
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
const n1Pill = n1.filter((r) => r.pill);
const n1W = n1.filter((r) => r.widget);
const n1Judge = {
  n: n1.length,
  widgetRiseSeen: n1W.some((r) => r.widget.anim === "panel-fade"),
  focusSeen: n1W.some((r) => r.widget.frAnim === "content-focus-solid-kf"),
  swapOutGone: n1.every((r) => r.glassAnim !== "cl-panel-swapout-kf"),
  steadyH: n1[n1.length - 1]?.h,
};
console.log(JSON.stringify(n1Judge));
console.log("N1 期望: widgetRiseSeen=true（玻璃凝入）/ focusSeen=true（聚拢）/ swapOutGone=true（伪残影退役）/ steadyH≈128——选框 Q 弹见 N0 轻量会话（headless 重采样器首帧盲区坑录，断言与采样密度解耦）");
await page.screenshot({ path: `${SHOTS}/N1-music-open-mid.png` });
await sleep(700);

/* ================= N2：关音乐（散场同拍） ================= */
console.log("===== N2 关音乐 =====");
await af.evaluate(() => document.querySelector(".fixed.inset-0.z-30")?.click());
const n2 = await af.evaluate(SAMPLER(500));
const n2W = n2.filter((r) => r.widget);
const n2Pill = n2.filter((r) => r.pill);
const n2Judge = {
  n: n2.length,
  defocusGone: n2W.every((r) => r.widget.frAnim !== "content-defocus"),
  outSeen: n2W.some((r) => r.widget.frAnim === "panel-content-out"),
  pillExitSeen: n2Pill.some((r) => +r.pill.op < 0.99 && +r.pill.op > 0.05),
  closedH: n2[n2.length - 1]?.h,
};
console.log(JSON.stringify(n2Judge));
console.log("N2 期望: defocusGone=true（blur 散场退役）/ outSeen=true（panel-content-out 0.18s 同拍=v8.7.13 新律）/ pillExitSeen=true（exit 在飞）/ closedH=0");
await sleep(700);

/* ================= N3：开设置对照组（内建 Q 弹基线） ================= */
console.log("===== N3 开设置对照组 =====");
const n3 = await af.evaluate(`(function() {
  [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === "设置")?.click();
  const pill = () => document.querySelector('nav[aria-label="快捷操作"] > span.pointer-events-none');
  const glass = () => document.querySelector(".glass-card.cl-panel");
  return new Promise((resolve) => {
    const t0 = performance.now();
    const rows = [];
    const tick = () => {
      const row = { t: Math.round(performance.now() - t0) };
      const p = pill();
      if (p) { const cs = getComputedStyle(p); row.pill = { op: cs.opacity, tf: cs.transform.slice(0, 44) }; } else row.pill = null;
      const g = glass();
      if (g) row.glassAnim = getComputedStyle(g).animationName.slice(0, 30);
      rows.push(row);
      if (performance.now() - t0 < 900) requestAnimationFrame(tick);
      else resolve(rows);
    };
    requestAnimationFrame(tick);
  });
})()`);
const n3Pill = n3.filter((r) => r.pill);
const n3Judge = {
  n: n3.length,
  riseSeen: n3.some((r) => r.glassAnim === "panel-fade"),
};
console.log(JSON.stringify(n3Judge));
console.log("N3 期望: riseSeen=true（玻璃凝入基线）——与 N1 同语言（选框 Q 弹见 N0/N0b）");
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
          bf: cs.backdropFilter, bg: cs.backgroundColor,
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
};
console.log(JSON.stringify(gJudged));
console.log("G 期望: bfSteadyAll=true / bgNeverBoot=true / bgGlass=true（凝入后段满值）/ focusInFlight=true / riseInFlight=true（v8.7.13 互切玻璃同拍凝入）");
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

/* ================= A 组：掠影开抽屉（零回归） ================= */
await page.mouse.click(90, 620, { button: "middle" });
await sleep(1000);
const aState = await af.evaluate(() => {
  const veil = document.querySelector(".cl-drawer-veil");
  const wp = document.querySelector(".wallpaper-layer");
  const bf = veil ? getComputedStyle(veil).backdropFilter : "NO-VEIL";
  return {
    veilDisplay: veil ? getComputedStyle(veil, "::before").display : "NO-VEIL",
    veilBf: bf,
    satFree: !/saturate/.test(bf),
    wpTransform: wp ? getComputedStyle(wp).transform : "NO-WP",
  };
});
console.log("A 掠影抽屉稳态:", JSON.stringify(aState));
console.log("A 期望: veilDisplay=none / veilBf=blur(14px) satFree=true / wpTransform 含 1.05");
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
