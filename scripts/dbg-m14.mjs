// v8.7.14 侦查实测：音乐面板（dock 部件弹出面板）打开动画卡顿根因 + 顶角直角见证
// 用户报告：①打开动画严重卡顿感 ②上边两个角直角非圆角 ③动画不是其它面板的弹簧动画
// 方法论：rAF 帧间隔采样（dt>25ms=掉帧、>40ms=严重掉帧），嫌疑 toggle 逐个排除：
//   T1 容器 panel-rise(panel-fade 纯绘制动画) / T2 容器 backdrop-filter /
//   T3 iframe content-focus-solid(filter 聚拢) / T4 全关
//   + 顶角直角 A/B：radius 0(现状) vs 16(自圆假说) 动画中途+稳态截图
// 坑录沿用：data-widget 双挂载须筛 .cl-dockwidget；click 序列以关闭态为前提；
//   采样器须在 click 前启动（rAF 循环内 t=60ms 自触发 click）。
import { chromium } from "playwright-core";
import crypto from "crypto";
import { readFileSync } from "fs";

const ROOT = "/tmp/ext-beta";
const SHOTS = "/tmp/v8714-dbg";
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

/* 注入官方音乐预设（raw 补 commands/links/dock 空数组——flatMap 硬依赖坑录） */
const official = JSON.parse(readFileSync("/tmp/beta-wt/src/lib/startpage/official-presets.json", "utf8"));
await af.evaluate((raw) => {
  localStorage.setItem("start:presets", JSON.stringify([
    { id: "official-smtc-v13", name: raw.name, installedAt: Date.now(), raw },
  ]));
}, JSON.parse(JSON.stringify({ ...official.presets[1].manifest, commands: [], links: [], dock: [] })));
await page.reload({ waitUntil: "load" });
await page.waitForFunction(() => {
  const f = document.getElementById("csShellFrame");
  return f && f.src && f.src.endsWith("index.html");
}, { timeout: 8000 });
af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
await af.waitForFunction(() => document.body && document.body.children.length > 0, { timeout: 15000 });
await sleep(4000);

/* ---------- 帧间隔采样器：rAF 循环 t=60ms 自触发 click，采 dt + 每3帧轻量状态 ---------- */
const JANK = (label, win) => `
  (function() {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const frames = [];
      let clicked = false;
      let prev = t0;
      const btn = [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === ${JSON.stringify(label)});
      const wv = () => [...document.querySelectorAll('[data-widget$=":music"]')].find((el) => el.classList.contains("cl-dockwidget"));
      const tick = () => {
        const now = performance.now();
        const dt = now - prev;
        prev = now;
        const t = Math.round(now - t0);
        const row = { t, dt: Math.round(dt) };
        if (frames.length % 3 === 0) {
          const st = document.querySelector(".cl-stage > div");
          row.h = st ? Math.round(st.getBoundingClientRect().height) : -1;
          const w = wv();
          if (w) {
            const cs = getComputedStyle(w);
            const r = w.getBoundingClientRect();
            row.wv = [Math.round(r.width), Math.round(r.height)];
            row.anim = cs.animationName.slice(0, 24);
            row.rad = cs.borderRadius;
          }
        }
        frames.push(row);
        if (!clicked && t >= 60) { clicked = true; if (btn) btn.click(); }
        if (t < ${win}) requestAnimationFrame(tick);
        else resolve(frames);
      };
      requestAnimationFrame(tick);
    });
  })()
`;

/* 指标：click(t≈60) 后 650ms 窗口内 dt 统计 + h 曲线压缩 */
const report = (name, frames) => {
  const c = frames.filter((f) => f.t >= 60 && f.t < 710);
  const dts = c.map((f) => f.dt);
  const max = Math.max(...dts);
  const mean = (dts.reduce((a, b) => a + b, 0) / dts.length).toFixed(1);
  const j25 = dts.filter((d) => d > 25).length;
  const j40 = dts.filter((d) => d > 40).length;
  const hMax = Math.max(...c.map((f) => f.h ?? 0));
  const curve = c.filter((f) => f.h !== undefined).map((f) => `${f.t}:${f.h}`).join(" ");
  console.log(`[${name}] frames=${c.length} mean=${mean}ms max=${max}ms jank>25=${j25} jank>40=${j40} hMax=${hMax}`);
  console.log(`  hCurve: ${curve}`);
};

const closeAll = async () => {
  await af.evaluate(() => document.querySelector(".fixed.inset-0.z-30")?.click());
  await sleep(750);
  const st = await af.evaluate(() => ({
    h: document.querySelector(".cl-stage > div")?.getBoundingClientRect().height ?? 0,
    glass: !!document.querySelector(".glass-card.cl-panel"),
  }));
  if (st.h > 0 || st.glass) { await sleep(600); }
};

const injectCss = async (css) => {
  await af.evaluate((c) => {
    let s = document.getElementById("dbg-m14-style");
    if (!s) { s = document.createElement("style"); s.id = "dbg-m14-style"; document.head.appendChild(s); }
    s.textContent = c;
  }, css);
};

/* 静态见证：容器 computed style（radius/bf/anim）+ iframe anim */
const staticWitness = async (tag) => {
  const w = await af.evaluate(() => {
    const el = [...document.querySelectorAll('[data-widget$=":music"]')].find((e) => e.classList.contains("cl-dockwidget"));
    if (!el) return null;
    const cs = getComputedStyle(el);
    const fr = el.querySelector("iframe");
    return {
      radius: cs.borderRadius, bf: cs.backdropFilter.slice(0, 40), anim: cs.animationName.slice(0, 30),
      bg: cs.backgroundColor, overflow: cs.overflow,
      frAnim: fr ? getComputedStyle(fr).animationName.slice(0, 30) : "NO-FR",
      shellRad: getComputedStyle(document.querySelector(".cl-stage")).borderRadius,
      shellOv: getComputedStyle(document.querySelector(".cl-stage")).overflow,
    };
  });
  console.log(`  [witness:${tag}]`, JSON.stringify(w));
};

/* ============ A 组：基线帧间隔（各开两次=冷/热） ============ */
console.log("===== A1 待办（内建基线） 冷 =====");
await af.evaluate(JANK("待办", 950));
const a1 = await af.evaluate(JANK("待办", 950));
report("A1-todo-cold", a1);
await closeAll();

console.log("===== A1b 待办 热 =====");
const a1b = await af.evaluate(JANK("待办", 950));
report("A1b-todo-warm", a1b);
await closeAll();

console.log("===== A2 音乐部件 冷 =====");
await staticWitness("pre-open");
const a2 = await af.evaluate(JANK("音乐", 950));
report("A2-music-cold", a2);
await staticWitness("post-open");
await closeAll();

console.log("===== A2b 音乐部件 热 =====");
const a2b = await af.evaluate(JANK("音乐", 950));
report("A2b-music-warm", a2b);
await closeAll();

/* ============ T 组：嫌疑逐个排除 ============ */
console.log("===== T1 容器 panel-rise 关 =====");
await injectCss(`.cl-dockwidget.panel-rise { animation: none !important; }`);
const t1 = await af.evaluate(JANK("音乐", 950));
report("T1-no-rise", t1);
await closeAll();

console.log("===== T2 容器 backdrop-filter 关 =====");
await injectCss(`.cl-dockwidget { backdrop-filter: none !important; }`);
const t2 = await af.evaluate(JANK("音乐", 950));
report("T2-no-bf", t2);
await closeAll();

console.log("===== T3 iframe 聚拢 filter 关 =====");
await injectCss(`
  .cl-dockwidget { backdrop-filter: none !important; }
  .cl-dockwidget iframe.content-focus-solid { animation: none !important; }
`);
const t3 = await af.evaluate(JANK("音乐", 950));
report("T3-no-focus", t3);
await closeAll();

console.log("===== T4 全关（纯弹簧地板） =====");
await injectCss(`
  .cl-dockwidget.panel-rise { animation: none !important; }
  .cl-dockwidget { backdrop-filter: none !important; }
  .cl-dockwidget iframe.content-focus-solid { animation: none !important; }
`);
const t4 = await af.evaluate(JANK("音乐", 950));
report("T4-floor", t4);
await injectCss(``);
await closeAll();

/* ============ C 组：顶角直角 A/B 截图 ============ */
console.log("===== C1 现状(radius 0) 动画中途截图 =====");
await af.evaluate(JANK("音乐", 950));
await sleep(120);
await page.screenshot({ path: `${SHOTS}/c1-radius0-mid.png` });
await sleep(1200);
await page.screenshot({ path: `${SHOTS}/c2-radius0-rest.png` });
await closeAll();

console.log("===== C2 自圆假说(radius 16px) 动画中途截图 =====");
await injectCss(`.cl-dockwidget { border-radius: 16px; }`);
await af.evaluate(JANK("音乐", 950));
await sleep(120);
await page.screenshot({ path: `${SHOTS}/c3-radius16-mid.png` });
await sleep(1200);
await page.screenshot({ path: `${SHOTS}/c4-radius16-rest.png` });
await injectCss(``);
await closeAll();

await ctx.close();
console.log("DONE shots=" + SHOTS);
