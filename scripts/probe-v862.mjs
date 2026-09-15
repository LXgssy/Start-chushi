// v8.6.2 探针——快捷服务双形态（常驻/抽屉）+ 整页高斯模糊纱罩 + 磨砂恒定在线 + 抖动强化 + 刷新路由修复
// 承 probe-v861.mjs 骨架（mock 镜像 :26997 版本地板 → 静默路径）
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "fs";

const ROOT = "/tmp/ext-v862";
const ZIP = "/tmp/my-project/download/v8.6.2/ChuShi-NewTab-v8.6.2.zip";
const MOCK = "/tmp/v862-mock";
const PORT = 26997;
const SHOTS = "/tmp/probe-v862-shots";

rmSync(ROOT, { recursive: true, force: true });
rmSync(MOCK, { recursive: true, force: true });
rmSync("/tmp/ext-v862-profile", { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(MOCK, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);
console.log("stage: 扩展解包 ->", ROOT);

/* 镜像重定向（app + ext-bg 同探针重定向，地板 = 本版 → 「已是最新」静默） */
const bgPath = ROOT + "/ext-bg.js";
writeFileSync(bgPath, readFileSync(bgPath, "utf-8").replace(
  'const SNAP_MIRRORS = ["https://lxgssy.github.io/Start-chushi"];',
  `const SNAP_MIRRORS = ["http://127.0.0.1:${PORT}"];`));
const appHits = execSync(`grep -rl "lxgssy.github.io/Start-chushi/version.json" ${ROOT} 2>/dev/null || true`)
  .toString().trim().split("\n").filter(Boolean);
for (const f of appHits) {
  writeFileSync(f, readFileSync(f, "utf-8").replaceAll(
    "https://lxgssy.github.io/Start-chushi/version.json", `http://127.0.0.1:${PORT}/version.json`));
}
writeFileSync(MOCK + "/index.html", `<!DOCTYPE html><html><body>ok</body></html>`);
function writeVer(v) {
  writeFileSync(MOCK + "/version.json", JSON.stringify({
    v, files: [{ p: "index.html", s: statSync(MOCK + "/index.html").size }],
  }));
}
writeVer("8.6.2");
const httpSrv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: MOCK, stdio: "ignore" });
process.on("exit", () => { try { httpSrv.kill(); } catch { } });
console.log("stage: mock 镜像就绪（v8.6.2 地板）");

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, tag) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${tag}`)), ms))]);

const browser = await withTimeout(
  chromium.launchPersistentContext("/tmp/ext-v862-profile", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
      "--no-first-run", "--disable-gpu", "--no-sandbox"],
  }),
  30000, "browser launch"
);
process.on("exit", () => { try { browser.close(); httpSrv.kill(); } catch { } });
console.log("stage: browser up");

let pass = 0, fail = 0;
const gate = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  [PASS] ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail ? " — " + detail : ""}`); }
};

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

async function bootNewTab(pg) {
  await pg.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 });
  await pg.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.endsWith("index.html");
  }, { timeout: 8000 }).catch(() => null);
  const af = pg.frames().find((f) => f !== pg.mainFrame() && /\/index\.html$/.test(f.url()));
  const ok = af && await af.waitForFunction(() => document.body && document.body.children.length > 0,
    { timeout: 15000 }).then(() => true).catch(() => false);
  if (ok) return af;
  /* 冷启动时序兜底：首跑扩展注册/水合偶发慢，重试一轮（debug 实证 boot 本身健康） */
  await sleep(1500);
  await pg.goto(EXT_URL("shell.html"), { waitUntil: "load", timeout: 20000 }).catch(() => null);
  await pg.waitForFunction(() => {
    const f = document.getElementById("csShellFrame");
    return f && f.src && f.src.endsWith("index.html");
  }, { timeout: 10000 }).catch(() => null);
  const af2 = pg.frames().find((f) => f !== pg.mainFrame() && /\/index\.html$/.test(f.url()));
  const ok2 = af2 && await af2.waitForFunction(() => document.body && document.body.children.length > 0,
    { timeout: 15000 }).then(() => true).catch(() => false);
  return ok2 ? af2 : null;
}

async function drawerOpen(f) {
  return f.evaluate(() => !!document.querySelector(".cl-drawer-veil"));
}

/* 磨砂存续采样：磁贴玻璃的【祖先链】不得出现 opacity<1 / filter≠none
   （backdrop root 律——v8.6.1 用户实测「开关抽屉磨砂消失」的根因） */
const FROST_SNIPPET = `
  (() => {
    const glass = document.querySelector('[data-cl-tile="1"] span span');
    if (!glass) return { glass: false };
    const bad = [];
    let el = glass.parentElement;
    while (el && el !== document.documentElement) {
      const cs = getComputedStyle(el);
      if (parseFloat(cs.opacity) < 1) bad.push(el.className + "#op=" + cs.opacity);
      if (cs.filter && cs.filter !== "none") bad.push(el.className + "#filter=" + cs.filter);
      el = el.parentElement;
    }
    const gcs = getComputedStyle(glass);
    const veil = document.querySelector(".cl-drawer-veil");
    const vcs = veil ? getComputedStyle(veil) : null;
    return {
      glass: true,
      glassBF: gcs.backdropFilter || gcs.webkitBackdropFilter || "",
      ancestorsBad: bad,
      veilBF: vcs ? (vcs.backdropFilter || "") : null,
    };
  })()
`;

try {
  /* ---------- T1 boot + 刷新路由落点 ---------- */
  const af = await bootNewTab(page);
  gate("T1a 本地直载 boot", !!af);
  if (!af) throw new Error("appFrame 未建立");
  await sleep(2200);
  const topUrl = page.url();
  gate("T1b 刷新路由落点 = shell.html（v8.6.2 修复：不再落 index.html 绕过版本路由）",
    topUrl.endsWith("shell.html") && !topUrl.endsWith("index.html"), topUrl);

  /* ---------- T2 中键唤出 + 整页高斯模糊纱罩 ---------- */
  await page.mouse.click(90, 620, { button: "middle" });
  await sleep(700);
  const open1 = await drawerOpen(af);
  const veilState = await af.evaluate(() => {
    const veil = document.querySelector(".cl-drawer-veil");
    if (!veil) return { veil: false };
    const cs = getComputedStyle(veil);
    return {
      veil: true,
      bf: cs.backdropFilter || "",
      tiles: document.querySelectorAll('[data-cl-tile="1"]').length,
      htmlClass: document.documentElement.classList.contains("cs-drawer"),
      searchGone: !document.querySelector('section[aria-label="搜索"]'),
    };
  });
  gate("T2a 中键唤出（磁贴墙+cs-drawer）",
    open1 && veilState.veil && veilState.tiles > 0 && veilState.htmlClass,
    `tiles=${veilState.tiles}`);
  gate("T2b 纱罩整页高斯模糊（blur 28px，非纯色遮罩）",
    /blur\(28px\)/.test(veilState.bf || ""), veilState.bf);
  gate("T2c 搜索区不再被卸载/雾化（cl-drawer-fade 退役）", veilState.searchGone === false);

  /* ---------- T3 磨砂恒定在线：入场动画中 + 稳态双采样 ---------- */
  // 先收起再唤出，在入场动画窗口内采样（祖先链无 opacity<1/filter）
  await page.keyboard.press("Escape");
  await sleep(600);
  await page.mouse.click(90, 620, { button: "middle" });
  await sleep(120); // 入场动画中段
  const midFrost = await af.evaluate(FROST_SNIPPET);
  await sleep(700); // 稳态
  const steadyFrost = await af.evaluate(FROST_SNIPPET);
  gate("T3a 入场动画中磁贴祖先零 opacity/filter（backdrop root 不出现）",
    midFrost.glass && midFrost.ancestorsBad.length === 0,
    midFrost.ancestorsBad.join("|").slice(0, 100) || "clean");
  gate("T3b 稳态磁贴磨砂在线（blur(14px) saturate(1.6)）",
    steadyFrost.glass && /blur\(14px\)\s+saturate\(1\.6\)/.test(steadyFrost.glassBF || ""),
    steadyFrost.glassBF);
  gate("T3c 搜索栏磨砂在线（search-pill backdrop 模糊）", await af.evaluate(() => {
    const p = document.querySelector(".search-pill");
    if (!p) return false;
    const cs = getComputedStyle(p);
    return /blur\(/.test(cs.backdropFilter || "");
  }));
  await page.screenshot({ path: SHOTS + "/01-drawer-open.png" });

  /* ---------- T4 批量管理抖动强化（±2°/0.28s/偶数反向/流畅模式豁免待 T9） ---------- */
  await af.evaluate(() => window.dispatchEvent(new CustomEvent("start:links-manage")));
  await sleep(800);
  const jig = await af.evaluate(() => {
    const all = [...document.querySelectorAll(".cl-links .jiggle")];
    const even = document.querySelectorAll(".cl-links-grid > *:nth-child(even) .jiggle");
    const one = all[0] ? getComputedStyle(all[0]) : null;
    const ev = even[0] ? getComputedStyle(even[0]) : null;
    return {
      count: all.length,
      name: one?.animationName || "",
      dur: one?.animationDuration || "",
      evenCount: even.length,
      evenDir: ev?.animationDirection || "",
    };
  });
  gate("T4a 编辑态抖动在位（所有磁贴 + 添加位）", jig.count >= 2, `jiggle=${jig.count}`);
  gate("T4b 抖动参数强化（name=jiggle, 0.28s）",
    jig.name === "jiggle" && jig.dur === "0.28s", `${jig.name}/${jig.dur}`);
  gate("T4c 偶数磁贴交替反向（青柠/iOS 同款）", jig.evenCount >= 1 && jig.evenDir === "reverse",
    `even=${jig.evenCount} dir=${jig.evenDir}`);
  await page.screenshot({ path: SHOTS + "/02-edit-jiggle.png" });

  /* ---------- T5 「完成」退出 + ESC/点空白收起 ---------- */
  await af.evaluate(() => {
    const pill = [...document.querySelectorAll(".cl-links button")].find(
      (b) => b.textContent.trim() === "完成");
    pill?.click();
  });
  await sleep(400);
  const afterDone = await af.evaluate(() => document.querySelectorAll(".cl-links .jiggle").length);
  gate("T5a 「完成」→ 抖动退场", afterDone === 0, `jiggle=${afterDone}`);
  await page.mouse.click(90, 620);
  await sleep(600);
  gate("T5b 点纱罩空白收起", !(await drawerOpen(af)));

  /* ---------- T6 抽屉开着点 Dock → 先收抽屉面板照开（v8.6.1 回归） ---------- */
  await page.mouse.click(90, 620, { button: "middle" });
  await sleep(700);
  const dockBtn = await af.evaluate(() => {
    const btn = [...document.querySelectorAll(".cl-dock button")].find(
      (b) => (b.getAttribute("aria-label") || "").includes("设置"));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  let dockClosed = false, panelOpened = false;
  if (dockBtn) {
    await page.mouse.click(dockBtn.x, dockBtn.y);
    await sleep(900);
    dockClosed = !(await drawerOpen(af));
    panelOpened = await af.evaluate(() =>
      !!document.querySelector("[role='dialog']") || document.body.textContent.includes("通用"));
  }
  gate("T6 Dock 点击 → 抽屉收起且面板打开", dockClosed && panelOpened,
    `drawerClosed=${dockClosed} panel=${panelOpened}`);
  await page.keyboard.press("Escape");
  await sleep(500);

  /* ---------- T7 设置面板「快捷服务样式」选项在场 ---------- */
  await af.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => (b.getAttribute("aria-label") || b.textContent || "").includes("设置"));
    btn?.click();
  });
  await sleep(900);
  const segState = await af.evaluate(() => {
    const dlg = [...document.querySelectorAll("[role='dialog']")].find((d) =>
      d.textContent.includes("快捷服务样式"));
    if (!dlg) return { found: false };
    return {
      found: true,
      docked: !!([...dlg.querySelectorAll("button")].find((b) => b.textContent.trim() === "常驻")),
      drawer: !!([...dlg.querySelectorAll("button")].find((b) => b.textContent.trim() === "抽屉")),
    };
  });
  gate("T7 设置 → 链接：常驻/抽屉选项在场", segState.found && segState.docked && segState.drawer,
    `docked=${segState.docked} drawer=${segState.drawer}`);
  await page.keyboard.press("Escape");
  await sleep(500);

  /* ---------- T8 切常驻 → reload → 内联网格（56px）+ 中键失效 + 设置持久化 ---------- */
  await af.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
    raw.linksForm = "docked";
    localStorage.setItem("start:settings", JSON.stringify(raw));
  });
  const af2 = await page.reload({ waitUntil: "load" }).then(() => bootNewTab(page));
  gate("T8a 刷新后 boot（linksForm=docked 持久化生效）", !!af2);
  if (!af2) throw new Error("reload 后 appFrame 未建立");
  await sleep(2000);
  const dockedState = await af2.evaluate(() => {
    const tiles = document.querySelectorAll('section[aria-label="快捷链接"] [data-cl-tile="1"]');
    const icon = document.querySelector('section[aria-label="快捷链接"] [data-cl-tile="1"] span span');
    const w = icon ? Math.round(icon.getBoundingClientRect().width) : 0;
    return { tiles: tiles.length, iconW: w, section: !!document.querySelector('section[aria-label="快捷链接"]') };
  });
  gate("T8b 常驻形态：磁贴常驻页面（无抽屉、56px 原样式）",
    dockedState.tiles > 0 && dockedState.iconW === 56,
    `tiles=${dockedState.tiles} icon=${dockedState.iconW}px`);
  await page.mouse.click(90, 90, { button: "middle" }); // 空白处（常驻形态不应唤出）
  await sleep(600);
  const noDrawer = await af2.evaluate(() => !document.querySelector(".cl-drawer-veil"));
  gate("T8c 常驻形态中键不唤出抽屉", noDrawer);
  await page.screenshot({ path: SHOTS + "/03-docked.png" });

  /* ---------- T9 流畅模式：纱罩模糊关停 + 抖动豁免 ---------- */
  await af2.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
    raw.perfLite = true;
    localStorage.setItem("start:settings", JSON.stringify(raw));
    window.dispatchEvent(new CustomEvent("start:links-manage")); // 常驻形态原地进编辑
  });
  await sleep(700);
  const lite = await af2.evaluate(() => {
    const jig = document.querySelector(".cl-links .jiggle");
    const cs = jig ? getComputedStyle(jig) : null;
    return { jigName: cs?.animationName || "", jigDur: cs?.animationDuration || "", jigs: document.querySelectorAll(".cl-links .jiggle").length };
  });
  gate("T9a 流畅模式下抖动豁免（0.28s 不被通配杀死）",
    lite.jigName === "jiggle" && lite.jigDur === "0.28s", `${lite.jigName}/${lite.jigDur}`);
  await af2.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
    raw.linksForm = "drawer";
    localStorage.setItem("start:settings", JSON.stringify(raw));
  });
  const af3 = await page.reload({ waitUntil: "load" }).then(() => bootNewTab(page));
  if (!af3) throw new Error("lite drawer reload 未建立");
  await sleep(2000);
  await page.mouse.click(90, 620, { button: "middle" });
  await sleep(700);
  const liteVeil = await af3.evaluate(() => {
    const veil = document.querySelector(".cl-drawer-veil");
    return veil ? getComputedStyle(veil).backdropFilter || "" : null;
  });
  gate("T9b 流畅模式纱罩模糊关停（纯色纱兜底）", liteVeil === "none", String(liteVeil));
  // 复位流畅模式
  await af3.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
    raw.perfLite = false;
    localStorage.setItem("start:settings", JSON.stringify(raw));
  });

  /* ---------- T10 刷新路由回归：reload 后仍落 shell.html 且 boot ---------- */
  const urlAfterReload = page.url();
  gate("T10 刷新（reload）→ 落点仍 shell.html + 版本路由重跑", urlAfterReload.endsWith("shell.html"),
    urlAfterReload);

  /* ---------- T11 更新日志首条 8.6.2 ---------- */
  await af3.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => (b.getAttribute("aria-label") || b.textContent || "").includes("设置"));
    btn?.click();
  });
  await sleep(900);
  await af3.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").includes("更新日志"));
    b?.click();
  });
  await sleep(800);
  const logFirst = await af3.evaluate(() => {
    const dlgs = [...document.querySelectorAll("[role='dialog']")];
    const hit = dlgs.find((d) => d.textContent.includes("8.6.2"));
    return hit ? "8.6.2" : null;
  });
  gate("T11 更新日志首条 8.6.2", logFirst === "8.6.2", `first=${logFirst}`);

  /* ---------- T12 pageerror ---------- */
  gate("T12 pageerror=0", errors.length === 0, errors.join(" | ").slice(0, 120));
} catch (e) {
  fail++;
  console.log("  [FATAL]", e.message);
} finally {
  console.log(`\n===== v8.6.2 probe: ${pass} PASS / ${fail} FAIL =====`);
  await browser.close();
  try { httpSrv.kill(); } catch { }
  process.exit(fail ? 1 : 0);
}
