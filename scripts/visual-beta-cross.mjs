/* beta 跨版本像素对照：v8.6.39（main）vs v8.7.0（beta 重写）
 * 状态集（纯色底 = 渲染确定性；极光 blob 持续动画不可作对照）：
 *   A home-dark    纯色深色主页（boot 排空后）
 *   B home-light   纯色浅色主页
 *   C settings     设置面板展开（深色）
 *   D todo         待办面板展开（深色）
 * 输出 PNG 对 + MAD 由 mad-beta-cross.py 计算。 */
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync } from "fs";

const PORT = 26993;
const SHOTS = "/tmp/beta-cross";
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const httpSrv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: SHOTS, stdio: "ignore" });
process.on("exit", () => { try { httpSrv.kill(); browser?.close(); } catch { } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bootExt(tag, root) {
  const EXT_ID = (() => {
    const h = crypto.createHash("sha256").update(Buffer.from(root)).digest("hex").slice(0, 32);
    return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
  })();
  const url = (p) => `chrome-extension://${EXT_ID}/${p}`;
  const ctx = await chromium.launchPersistentContext(`/tmp/beta-cross-${tag}-profile`, {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`,
      "--no-first-run", "--no-sandbox"],
  });
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url("shell.html"), { waitUntil: "load", timeout: 20000 });
  await page.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.endsWith("index.html");
  }, { timeout: 8000 }).catch(() => null);
  const af = page.frames().find((f) => f !== page.mainFrame() && /\/index\.html$/.test(f.url()));
  await af.waitForFunction(() => document.body && document.body.children.length > 0,
    { timeout: 15000 }).catch(() => false);
  return { ctx, page, af };
}

async function settle(af) {
  /* 排空入场动画 + 等字体/壁纸就位（纯色模式无网络壁纸） */
  await af.evaluate(async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 4000) {
      if (document.getAnimations().length === 0) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  await sleep(600);
}

async function shoot(tag, root, name, settingsPatch, thenFn) {
  const { af } = await bootExt(tag, root);
  if (settingsPatch) {
    await af.evaluate((patch) => {
      const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
      localStorage.setItem("start:settings", JSON.stringify({ ...raw, ...patch }));
    }, settingsPatch);
    /* 重载应用设置 */
    const pg = af.page ?? null;
  }
  await settle(af);
  if (thenFn) await thenFn(af);
  const path = `${SHOTS}/${name}.png`;
  await af.page ? null : null;
  /* page 对象从闭包外传入不便——用 browserContext.pages()[0] */
  return path;
}

/* —— 简化：每个状态独立 boot（避免状态串扰），page 由闭包返回 —— */
async function findAppFrame(pg) {
  let af = null;
  for (let i = 0; i < 40 && !af; i++) {
    await pg.waitForTimeout(250);
    af = pg.frames().find((f) => f !== pg.mainFrame() && /\/index\.html$/.test(f.url()));
  }
  if (!af) throw new Error("app frame not found");
  return af;
}

async function snap(tag, root, name, settingsPatch, openPanel) {
  const EXT_ID = (() => {
    const h = crypto.createHash("sha256").update(Buffer.from(root)).digest("hex").slice(0, 32);
    return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
  })();
  const url = (p) => `chrome-extension://${EXT_ID}/${p}`;
  const ctx = await chromium.launchPersistentContext(`${SHOTS}/${tag}-${name}-profile`, {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`,
      "--no-first-run", "--no-sandbox"],
  });
  const page = await ctx.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(url("shell.html"), { waitUntil: "load", timeout: 20000 });
  await page.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.endsWith("index.html");
  }, { timeout: 8000 }).catch(() => null);
  let af = await findAppFrame(page);
  await af.waitForFunction(() => document.body && document.body.children.length > 0,
    { timeout: 15000 }).catch(() => false);
  if (settingsPatch) {
    /* 先等首次水合完成（useStored 挂载回写结束），再写设置——否则回写覆盖补丁 */
    await af.waitForFunction(() => document.querySelector(".dock-btn"), { timeout: 15000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 1500));
    await af.evaluate((patch) => {
      const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
      localStorage.setItem("start:settings", JSON.stringify({ ...raw, ...patch }));
    }, settingsPatch);
    await page.reload({ waitUntil: "load" });
    af = await findAppFrame(page);
    await af.waitForFunction(() => document.body && document.body.children.length > 0,
      { timeout: 15000 }).catch(() => false);
  }
  await af.evaluate(async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 5000) {
      if (document.getAnimations().length === 0) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  if (openPanel) {
    await af.evaluate(async (label) => {
      const nf = () => new Promise((r) => requestAnimationFrame(r));
      let g = 0;
      while (!document.querySelector(".dock-btn") && g++ < 300) await nf();
      const btn = [...document.querySelectorAll(".dock-btn")].find((b) => b.getAttribute("aria-label") === label);
      btn?.click();
    }, openPanel);
    await af.evaluate(async () => {
      const t0 = performance.now();
      while (performance.now() - t0 < 3000) {
        if (document.querySelector(".glass-card.cl-panel")) break;
        await new Promise((r) => requestAnimationFrame(r));
      }
    });
    await sleep(1200); /* 弹簧落定 */
  } else {
    await sleep(400);
  }
  await page.screenshot({ path: `${SHOTS}/${name}-${tag}.png` });
  await ctx.close();
  console.log("shot:", name, tag);
}

const OLD = "/tmp/ext-v869";
const NEW = "/tmp/ext-beta";
for (const [tag, root] of [["v8639", OLD], ["v870", NEW]]) {
  await snap(tag, root, "home-dark", { background: "pure", themeMode: "dark" }, null);
  await snap(tag, root, "home-light", { background: "pure", themeMode: "light" }, null);
  await snap(tag, root, "settings", { background: "pure", themeMode: "dark" }, "设置");
  await snap(tag, root, "todo", { background: "pure", themeMode: "dark" }, "待办");
}
console.log("DONE ->", SHOTS);
process.exit(0);
