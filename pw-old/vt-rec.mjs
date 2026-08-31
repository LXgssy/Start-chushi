// 虚拟时钟逐帧录制器 v4 —— 根治宣传片卡顿：
//   CDP Emulation.setVirtualTimePolicy 把页面时间冻结为 1/60s 步进，
//   每步推进后由 captureScreenshot 强制完整绘制一帧 —— 每帧都是全渲染帧，
//   动画帧率与沙箱 CPU 性能完全解耦（老管线 x11grab 实录 + 剪辑加速是卡顿根因）。
// 配套：合成光标（缓动滑行+点击涟漪）、静止段硬链接跳帧、audit 抽帧复查。
// 用法: bun vt-rec.mjs <场景名>   场景 = vt-scenarios/<名>.mjs
import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync, linkSync, appendFileSync } from "fs";
import path from "path";

const FPS = 60;
const STEP = 1000 / FPS;
const OUT_ROOT = "/tmp/rec";
const AUDIT = "/home/z/my-project/download/rec/audit-vt";
const SHELL =
  "/home/z/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell";
const BASE = process.env.REC_TARGET || "http://localhost:3210";

const scene = process.argv[2];
if (!scene) {
  console.error("用法: bun vt-rec.mjs <场景名>");
  process.exit(1);
}
const sc = await import(`./vt-scenarios/${scene}.mjs`);

const OUT = path.join(OUT_ROOT, scene);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(AUDIT, { recursive: true });

const [W, H] = (sc.win ?? "1920x1080").split("x").map(Number);
const t0 = Date.now();
let warnings = 0;

const browser = await chromium.launch({
  headless: true,
  executablePath: SHELL,
  args: [
    "--hide-scrollbars",
    "--lang=zh-CN",
    "--force-color-profile=srgb",
    "--disable-lcd-text",
    "--font-render-hinting=none",
  ],
});
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  locale: "zh-CN",
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 虚拟推进暖机：不截图（无绘制开销），每 chunk 检查一次就绪条件 */
async function warmTo(condSource, chunkMs, maxVirtualMs = 30000) {
  let advanced = 0;
  while (advanced < maxVirtualMs) {
    const ok = await page.evaluate(condSource).catch(() => false);
    if (ok) return advanced;
    const expired = new Promise((r) => cdp.once("Emulation.virtualTimeBudgetExpired", r));
    await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: chunkMs });
    await expired;
    advanced += chunkMs;
  }
  warnings++;
  console.warn(`[warn] ${scene} 暖机达上限 ${maxVirtualMs}ms`);
  return advanced;
}

// —— 流程：所有种子走 addInitScript（页面脚本执行前落盘，挂载即读到，无竞态）；
//    route(page) 在 goto 前注册 mock；goto → pause → reload（文档冻结在 t=0）→
//    虚拟推进“暖机”到就绪（不截图）→ 步进录制；introFlow：commit 即 pause，16.67ms
//    步进暖到水合完成的第一帧立即开录（入场零丢失）——
const t1 = Date.now();
if (sc.introFlow) {
  if (sc.initScript) await context.addInitScript(sc.initScript);
  await page.goto(sc.target ?? BASE, { waitUntil: "commit" });
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  await warmTo(
    () =>
      document.readyState !== "loading" &&
      !!document.querySelector("main") &&
      (() => {
        const n = new Date();
        return (document.querySelector("main")?.innerText || "").replace(/\D/g, "").includes(
          String(n.getHours()).padStart(2, "0") + String(n.getMinutes()).padStart(2, "0")
        );
      })(),
    16.67
  );
} else {
  if (sc.seedSettings || sc.seedExtra) {
    await context.addInitScript(`
      try {
        localStorage.setItem("start:seen", "1");
        var __s = {};
        try { __s = JSON.parse(localStorage.getItem("start:settings") || "{}"); } catch {}
        localStorage.setItem("start:settings", JSON.stringify({ ...__s, ...${JSON.stringify(sc.seedSettings ?? {})} }));
        ${sc.seedExtra ?? ""}
      } catch {}
    `);
  }
  if (sc.route) await sc.route(page);
  await page.goto(sc.target ?? BASE, { waitUntil: "domcontentloaded" });
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await warmTo(() => document.readyState === "complete" && !!document.querySelector("main"), 250);
  // 暖机余量：入场动画走完 + mock 数据渲染（不截图，虚拟时间瞬间流过）
  const exp = new Promise((r) => cdp.once("Emulation.virtualTimeBudgetExpired", r));
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: 3500 });
  await Promise.race([exp, sleep(8000)]);
  await sleep(800); // 真实时间静置：网络响应/字体落定
}
console.log(`[warm] ${scene} 虚拟暖机 ${Date.now() - t1}ms`);

// —— 合成光标 + 涟漪（触屏/入场场景 noCursor）——
if (!sc.noCursor)
  await page.evaluate(() => {
    if (window.__vt) return;
    const mk = (html) => {
      const d = document.createElement("div");
      d.innerHTML = html;
      return d.firstElementChild;
    };
    const cur = mk(
      `<div style="position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform;filter:drop-shadow(0 1px 2.5px rgba(0,0,0,.4));display:none">
        <svg width="26" height="30" viewBox="0 0 26 30">
          <path d="M4 1 L4 22.5 L9.6 17.6 L13.2 25.8 L17.4 24 L13.8 15.9 L21.4 15.2 Z"
                fill="#ffffff" stroke="#1c1c1c" stroke-width="1.6" stroke-linejoin="round"/>
        </svg>
      </div>`
    );
    document.body.appendChild(cur);
    const pool = [];
    for (let i = 0; i < 4; i++) {
      const r = mk(
        `<div style="position:fixed;z-index:2147483646;pointer-events:none;display:none;border-radius:9999px;border:1.5px solid rgba(250,250,250,.95);box-shadow:0 0 0 1px rgba(0,0,0,.30), inset 0 0 0 1px rgba(0,0,0,.16)"></div>`
      );
      document.body.appendChild(r);
      pool.push(r);
    }
    window.__vt = {
      cursor(x, y) {
        cur.style.display = "block";
        cur.style.transform = `translate(${x - 4}px,${y - 1}px)`;
      },
      ripples(rs) {
        pool.forEach((el, i) => {
          const r = rs[i];
          if (!r) {
            el.style.display = "none";
            return;
          }
          const e = 1 - (1 - r.p) * (1 - r.p);
          const size = 16 + 46 * e;
          el.style.display = "block";
          el.style.left = r.x - size / 2 + "px";
          el.style.top = r.y - size / 2 + "px";
          el.style.width = size + "px";
          el.style.height = size + "px";
          el.style.opacity = String(0.5 * (1 - r.p));
        });
      },
    };
  });

// —— rec DSL ——
let no = 0;
const cursor = { x: W / 2, y: H - 90, tween: null };
const ripples = [];
const fp = (n) => path.join(OUT, `f_${String(n).padStart(5, "0")}.jpg`);

async function applyVisual() {
  if (!sc.noCursor) {
    let cx = cursor.x,
      cy = cursor.y;
    if (cursor.tween) {
      const t = cursor.tween;
      t.i++;
      const p = Math.min(1, t.i / t.frames);
      const e = 1 - Math.pow(1 - p, 3);
      cx = t.x0 + (t.x1 - t.x0) * e;
      cy = t.y0 + (t.y1 - t.y0) * e;
      cursor.x = cx;
      cursor.y = cy;
      if (p >= 1) cursor.tween = null;
    }
    await page.evaluate((p) => window.__vt && window.__vt.cursor(p.x, p.y), { x: cx, y: cy });
  }
  if (ripples.length) {
    for (const r of ripples) r.i++;
    for (let i = ripples.length - 1; i >= 0; i--)
      if (ripples[i].i > ripples[i].frames) ripples.splice(i, 1);
    await page.evaluate(
      (rs) => window.__vt && window.__vt.ripples(rs),
      ripples.map((r) => ({ x: r.x, y: r.y, p: Math.min(1, r.i / r.frames) }))
    );
  }
}

async function shot(jpeg = true) {
  const expired = new Promise((r) => cdp.once("Emulation.virtualTimeBudgetExpired", r));
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: STEP });
  const ok = await Promise.race([expired, sleep(6000).then(() => false)]);
  if (!ok) {
    warnings++;
    console.warn(`[warn] ${scene} f${no} budget 未过期，强制继续`);
  }
  await applyVisual();
  const s = await cdp.send(
    "Page.captureScreenshot",
    jpeg ? { format: "jpeg", quality: 85 } : { format: "png" }
  );
  return Buffer.from(s.data, "base64");
}

async function capture() {
  no++;
  writeFileSync(fp(no), await shot());
}
async function hold(n) {
  no++;
  writeFileSync(fp(no), await shot());
  for (let i = 1; i < n; i++) {
    no++;
    linkSync(fp(no - 1), fp(no));
  }
}

async function center(sel, text) {
  return page.evaluate(
    ({ sel, txt }) => {
      let el = null;
      if (txt != null) {
        const all = [...document.querySelectorAll(sel)];
        el = all.find((b) => b.textContent.trim() === txt) ?? all.find((b) => b.textContent.includes(txt));
      } else {
        el = document.querySelector(sel);
      }
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    { sel, txt: text ?? null }
  );
}
async function warnMiss(sel, text) {
  warnings++;
  console.warn(`[warn] ${scene} 找不到元素 ${sel} ${text ?? ""}`);
}

const rec = {
  page,
  context,
  W,
  H,
  async frame(n = 1) {
    for (let i = 0; i < n; i++) await capture();
  },
  hold,
  async each(n, fn) {
    for (let i = 0; i < n; i++) {
      await fn(i);
      await capture();
    }
  },
  async move(x, y, frames = 8) {
    cursor.tween = { x0: cursor.x, y0: cursor.y, x1: x, y1: y, i: 0, frames };
    for (let i = 0; i < frames; i++) await capture();
  },
  async glideTo(x, y, frames = 8) {
    cursor.tween = { x0: cursor.x, y0: cursor.y, x1: x, y1: y, i: 0, frames };
    for (let i = 0; i < frames; i++) await capture();
  },
  async move(x, y, frames = 8) {
    await this.glideTo(x, y, frames);
  },
  async rippleAt(x, y, ripple = 9) {
    ripples.push({ x, y, i: 0, frames: 12 });
    for (let i = 0; i < ripple; i++) await capture();
  },
  async clickXY(x, y, { glide = 8, ripple = 9, real = true } = {}) {
    await this.glideTo(x, y, glide);
    ripples.push({ x, y, i: 0, frames: 12 });
    if (real) {
      await page.mouse.move(x, y);
      await page.mouse.click(x, y);
    } else {
      await page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          if (!el) return false;
          const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y };
          for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
            el.dispatchEvent(
              type.startsWith("pointer")
                ? new PointerEvent(type, { ...opts, pointerType: "mouse", isPrimary: true })
                : new MouseEvent(type, opts)
            );
          }
          return true;
        },
        { x, y }
      );
    }
    for (let i = 0; i < ripple; i++) await capture();
  },
  async click(sel, text) {
    let pt = await center(sel, text);
    if (!pt) return warnMiss(sel, text);
    await this.glideTo(pt.x, pt.y);
    pt = await center(sel, text); // 滑行后重测（dock 重排/布局位移防御）
    if (!pt) return warnMiss(sel, text);
    ripples.push({ x: pt.x, y: pt.y, i: 0, frames: 12 });
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.click(pt.x, pt.y);
    for (let i = 0; i < 9; i++) await capture();
  },
  async jsclick(sel, text) {
    let pt = await center(sel, text);
    if (!pt) return warnMiss(sel, text);
    await this.glideTo(pt.x, pt.y);
    pt = await center(sel, text); // 重测坐标仅驱动视觉；事件改元素直派发（免命中坐标依赖）
    if (!pt) return warnMiss(sel, text);
    ripples.push({ x: pt.x, y: pt.y, i: 0, frames: 12 });
    const tag = await page.evaluate(
      ({ sel, txt }) => {
        const all = [...document.querySelectorAll(sel)];
        const el =
          (txt != null
            ? all.find((b) => b.textContent.trim() === txt) ?? all.find((b) => b.textContent.includes(txt))
            : all[0]);
        if (!el) return null;
        const opts = { bubbles: true, cancelable: true };
        for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
          el.dispatchEvent(
            type.startsWith("pointer")
              ? new PointerEvent(type, { ...opts, pointerType: "mouse", isPrimary: true })
              : new MouseEvent(type, opts)
          );
        }
        return el.tagName;
      },
      { sel, txt: text ?? null }
    );
    if (!tag) return warnMiss(sel, text);
    for (let i = 0; i < 9; i++) await capture();
  },
  async hover(sel, frames = 14) {
    let pt = await center(sel);
    if (!pt) return warnMiss(sel);
    await this.glideTo(pt.x, pt.y, frames);
    pt = await center(sel); // 重测后真实 hover
    if (!pt) return warnMiss(sel);
    await page.mouse.move(pt.x, pt.y);
    await capture();
  },
  async hoverAt(sel, text, frames = 14) {
    const pt = await center(sel, text);
    if (!pt) return warnMiss(sel, text);
    await this.move(pt.x, pt.y, frames);
    await page.mouse.move(pt.x, pt.y);
    await capture();
  },
  async key(key, frames = 3) {
    await page.keyboard.press(key);
    for (let i = 0; i < frames; i++) await capture();
  },
  async insert(text, frames = 3) {
    await page.keyboard.insertText(text);
    for (let i = 0; i < frames; i++) await capture();
  },
  async setCJK(sel, text, frames = 4) {
    await page.evaluate(
      ({ sel, txt }) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.focus();
        const proto =
          el.tagName === "TEXTAREA"
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, txt);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      },
      { sel, txt: text }
    );
    for (let i = 0; i < frames; i++) await capture();
  },
  /** 鼠标悬停式 mouseover（React onMouseEnter 类合成事件的旧法兼容） */
  async over(sel, all, idx = 0, frames = 6) {
    await page.evaluate(
      ({ sel, all, idx }) => {
        const els = all ? [...document.querySelectorAll(sel)] : [document.querySelector(sel)];
        els[idx]?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      },
      { sel, all, idx }
    );
    for (let i = 0; i < frames; i++) await capture();
  },
  async dock(i, frames = 8) {
    let pt = await page.evaluate((idx) => {
      const b = document.querySelectorAll("nav[aria-label='快捷操作'] button")[idx];
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, i);
    if (!pt) return warnMiss(`dock#${i}`);
    await this.glideTo(pt.x, pt.y);
    pt = await page.evaluate((idx) => {
      const b = document.querySelectorAll("nav[aria-label='快捷操作'] button")[idx];
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, i);
    if (!pt) return warnMiss(`dock#${i}`);
    ripples.push({ x: pt.x, y: pt.y, i: 0, frames: 12 });
    // 元素直派发（dock 重排防御：坐标只驱动光标/涟漪，不参与命中）
    const ok = await page.evaluate((idx) => {
      const b = document.querySelectorAll("nav[aria-label='快捷操作'] button")[idx];
      if (!b) return false;
      const opts = { bubbles: true, cancelable: true };
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        b.dispatchEvent(
          type.startsWith("pointer")
            ? new PointerEvent(type, { ...opts, pointerType: "mouse", isPrimary: true })
            : new MouseEvent(type, opts)
        );
      }
      return true;
    }, i);
    if (!ok) return warnMiss(`dock#${i}`);
    for (let j = 0; j < 9; j++) await capture();
    for (let j = 0; j < frames; j++) await capture();
  },
  async seg(label, text, frames = 8) {
    await this.jsclick(`[role='radiogroup'][aria-label='${label}'] button`, text);
    for (let i = 0; i < frames; i++) await capture();
  },
  async mark(name) {
    writeFileSync(path.join(AUDIT, `${scene}-${name}.png`), await shot(false));
  },
  sleepReal: sleep,
};

// —— 跑场景 ——
await sc.run(rec);

writeFileSync(
  path.join(OUT, "meta.json"),
  JSON.stringify({ scene, frames: no, warnings, realMs: Date.now() - t0, fps: FPS })
);
appendFileSync(
  path.join(OUT_ROOT, "progress.log"),
  `VT-REC-OK ${scene} frames=${no} realMs=${Date.now() - t0} warns=${warnings}\n`
);
console.log(`VT-REC-OK ${scene}: ${no} 帧 (${(no / FPS).toFixed(1)}s) realMs=${Date.now() - t0} warns=${warnings}`);
await browser.close();
