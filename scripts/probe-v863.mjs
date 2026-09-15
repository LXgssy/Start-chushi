// v8.6.3 探针——抽屉四修：①退场图标随纱罩同步淡出（cs-drawer-closing/cl-fade-leaf）
// ②抖动上移整单元（图标+名称一起摆，添加位同频）③抽屉内批量管理 pill 移除
// ④右键磁贴进编辑不再弹「初始」菜单。承 probe-v862.mjs 骨架。
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "fs";

const ROOT = "/tmp/ext-v863";
const ZIP = "/tmp/my-project/download/v8.6.3/ChuShi-NewTab-v8.6.3.zip";
const MOCK = "/tmp/v863-mock";
const PORT = 26997;
const SHOTS = "/tmp/probe-v863-shots";

rmSync(ROOT, { recursive: true, force: true });
rmSync(MOCK, { recursive: true, force: true });
rmSync("/tmp/ext-v863-profile", { recursive: true, force: true });
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
writeVer("8.6.3");
const httpSrv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: MOCK, stdio: "ignore" });
process.on("exit", () => { try { httpSrv.kill(); } catch { } });
console.log("stage: mock 镜像就绪（v8.6.3 地板）");

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, tag) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${tag}`)), ms))]);

const browser = await withTimeout(
  chromium.launchPersistentContext("/tmp/ext-v863-profile", {
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

/* 磨砂存续采样：磁贴玻璃的【祖先链】不得出现 opacity<1 / filter≠none */
const FROST_SNIPPET = `
  (() => {
    const glass = document.querySelector('[data-cl-tile="1"] .cl-fade-leaf') ||
      document.querySelector('[data-cl-tile="1"] span span');
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
  gate("T1b 刷新路由落点 = shell.html", topUrl.endsWith("shell.html") && !topUrl.endsWith("index.html"), topUrl);

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
      addTile: !!document.querySelector('button[data-cl-tile="add"]'),
      htmlClass: document.documentElement.classList.contains("cs-drawer"),
      searchGone: !document.querySelector('section[aria-label="搜索"]'),
    };
  });
  gate("T2a 中键唤出（磁贴墙+cs-drawer+添加位）",
    open1 && veilState.veil && veilState.tiles > 0 && veilState.htmlClass && veilState.addTile,
    `tiles=${veilState.tiles} add=${veilState.addTile}`);
  gate("T2b 纱罩整页高斯模糊（blur 28px）", /blur\(28px\)/.test(veilState.bf || ""), veilState.bf);
  gate("T2c 搜索区不再被卸载/雾化", veilState.searchGone === false);

  /* ---------- T3 磨砂恒定在线：入场动画中 + 稳态双采样 ---------- */
  await page.keyboard.press("Escape");
  await sleep(600);
  await page.mouse.click(90, 620, { button: "middle" });
  await sleep(120);
  const midFrost = await af.evaluate(FROST_SNIPPET);
  await sleep(700);
  const steadyFrost = await af.evaluate(FROST_SNIPPET);
  gate("T3a 入场动画中磁贴祖先零 opacity/filter（backdrop root 不出现）",
    midFrost.glass && midFrost.ancestorsBad.length === 0,
    midFrost.ancestorsBad.join("|").slice(0, 100) || "clean");
  gate("T3b 稳态磁贴磨砂在线（blur(14px) saturate(1.6)）",
    steadyFrost.glass && /blur\(14px\)\s+saturate\(1\.6\)/.test(steadyFrost.glassBF || ""),
    steadyFrost.glassBF);
  gate("T3c 搜索栏磨砂在线", await af.evaluate(() => {
    const p = document.querySelector(".search-pill");
    if (!p) return false;
    return /blur\(/.test(getComputedStyle(p).backdropFilter || "");
  }));
  await page.screenshot({ path: SHOTS + "/01-drawer-open.png" });

  /* ---------- T4 批量管理：pill 移除 + 抖动整单元 ---------- */
  await af.evaluate(() => window.dispatchEvent(new CustomEvent("start:links-manage")));
  await sleep(800);
  const jig = await af.evaluate(() => {
    const all = [...document.querySelectorAll(".cl-links .jiggle")];
    const even = document.querySelectorAll(".cl-links-grid > *:nth-child(even) .jiggle");
    const one = all[0] ? getComputedStyle(all[0]) : null;
    const ev = even[0] ? getComputedStyle(even[0]) : null;
    /* 整单元断言：jiggle 包裹层内同时含玻璃（.cl-fade-leaf）与名称（.tile-label） */
    const tileUnit = all.find((w) => w.querySelector(".tile-label") && w.querySelector(".cl-fade-leaf"));
    /* 添加位整单元：button[data-cl-tile=add] 内的 jiggle 包裹层含 +框与「添加」 */
    const addWrap = document.querySelector('button[data-cl-tile="add"] .jiggle');
    const addUnit = addWrap && addWrap.textContent.includes("添加") && addWrap.querySelector(".cl-fade-leaf");
    /* pill 移除断言：抽屉内不得再有「批量管理/完成」独立按钮 */
    const pill = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === "批量管理" || b.textContent.trim() === "完成");
    return {
      count: all.length,
      name: one?.animationName || "",
      dur: one?.animationDuration || "",
      evenCount: even.length,
      evenDir: ev?.animationDirection || "",
      tileUnit: !!tileUnit,
      addUnit: !!addUnit,
      pillGone: !pill,
    };
  });
  gate("T4a 编辑态抖动在位（所有磁贴 + 添加位）", jig.count >= 2, `jiggle=${jig.count}`);
  gate("T4b 抖动参数（name=jiggle, 0.28s）", jig.name === "jiggle" && jig.dur === "0.28s",
    `${jig.name}/${jig.dur}`);
  gate("T4c 偶数磁贴交替反向", jig.evenCount >= 1 && jig.evenDir === "reverse",
    `even=${jig.evenCount} dir=${jig.evenDir}`);
  gate("T4d 整单元抖动：名称在 jiggle 包裹层内（图标+名称一起摆）", jig.tileUnit);
  gate("T4e 添加位整单元抖动（+框与「添加」同频）", jig.addUnit);
  gate("T4f 抽屉内「批量管理/完成」pill 已移除", jig.pillGone);
  await page.screenshot({ path: SHOTS + "/02-edit-jiggle.png" });

  /* ---------- T5 ESC 退编辑 + 点纱罩收起 ---------- */
  await af.evaluate(() => window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await sleep(400);
  const afterEsc = await af.evaluate(() => document.querySelectorAll(".cl-links .jiggle").length);
  gate("T5a ESC → 抖动退场（pill 已删，ESC 即退编辑）", afterEsc === 0, `jiggle=${afterEsc}`);
  await page.mouse.click(90, 620);
  await sleep(600);
  gate("T5b 点纱罩空白收起", !(await drawerOpen(af)));

  /* ---------- T5c 关抽屉退场同步：磁贴叶随纱罩一同淡出（v8.6.3 核心） ---------- */
  await page.mouse.click(90, 620, { button: "middle" });
  await sleep(800); // 稳态（intro 结束）
  await page.mouse.click(90, 620, { button: "middle" }); // 中键再按 = 收起
  const exitSamples = [];
  for (let i = 0; i < 7; i++) {
    exitSamples.push(await af.evaluate(() => {
      const veil = document.querySelector(".cl-drawer-veil");
      const leaf = document.querySelector(".cl-links .cl-fade-leaf");
      const root = document.querySelector(".fixed.inset-0.z-\\[45\\]");
      /* 退场窗口内磁贴叶的祖先链必须保持 opacity=1（磨砂存活律） */
      let ancBad = false;
      if (leaf && root) {
        let el = leaf.parentElement;
        while (el && el !== document.documentElement) {
          if (parseFloat(getComputedStyle(el).opacity) < 1) { ancBad = true; break; }
          el = el.parentElement;
        }
      }
      return {
        veil: veil ? parseFloat(getComputedStyle(veil).opacity) : null,
        leaf: leaf && root ? parseFloat(getComputedStyle(leaf).opacity) : null,
        closing: document.documentElement.classList.contains("cs-drawer-closing"),
        ancBad,
      };
    }));
    await sleep(45);
  }
  const clsSeen = exitSamples.some((s) => s.closing);
  const leafMin = Math.min(...exitSamples.filter((s) => s.leaf !== null).map((s) => s.leaf));
  const veilMin = Math.min(...exitSamples.filter((s) => s.veil !== null).map((s) => s.veil));
  const ancClean = exitSamples.every((s) => !s.ancBad);
  gate("T5c-1 退场窗口挂 cs-drawer-closing", clsSeen);
  gate("T5c-2 磁贴叶随纱罩同步淡出（leaf 与 veil 同窗走低）",
    leafMin < 0.9 && veilMin < 0.9, `leafMin=${leafMin?.toFixed(3)} veilMin=${veilMin?.toFixed(3)}`);
  gate("T5c-3 退场全程祖先链零 opacity<1（磨砂存活律不破）", ancClean);
  await sleep(600);
  gate("T5c-4 退场收尾：抽屉完全关闭", !(await drawerOpen(af)));

  /* ---------- T6 右键磁贴：编辑对话框开、页面菜单不弹（v8.6.3 修④） ---------- */
  await page.mouse.click(90, 620, { button: "middle" });
  await sleep(800);
  const tilePos = await af.evaluate(() => {
    const t = document.querySelector('[data-cl-tile="1"]');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  let dlgOpened = false, menuSuppressed = false;
  if (tilePos) {
    await page.mouse.click(tilePos.x, tilePos.y, { button: "right" });
    await sleep(700);
    const ctxState = await af.evaluate(() => ({
      dlg: !!document.querySelector("[role='dialog']"),
      menu: !!document.querySelector("[role='menu']"),
    }));
    dlgOpened = ctxState.dlg;
    menuSuppressed = !ctxState.menu;
  }
  gate("T6a 右键磁贴 → 编辑对话框打开", dlgOpened);
  gate("T6b 右键磁贴 → 「初始」菜单不弹（修④）", menuSuppressed);
  await page.keyboard.press("Escape");
  await sleep(400);
  /* 非回归：空白右键菜单照常（批量管理入口仍在） */
  await page.mouse.click(400, 400, { button: "right" });
  await sleep(600);
  const blankMenu = await af.evaluate(() => {
    const m = document.querySelector("[role='menu']");
    if (!m) return null;
    return m.textContent.includes("批量管理磁贴") ? "with-manage" : "menu";
  });
  gate("T6c 空白右键菜单照常（批量管理入口保留）", blankMenu === "with-manage", String(blankMenu));
  await page.keyboard.press("Escape");
  await sleep(400);
  const drawerAfterCtx = await drawerOpen(af);
  if (!drawerAfterCtx) {
    await page.mouse.click(90, 620, { button: "middle" });
    await sleep(700);
  }

  /* ---------- T7 设置面板「快捷服务样式」选项在场 ---------- */
  await page.keyboard.press("Escape"); // 收抽屉
  await sleep(500);
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

  /* ---------- T8 切常驻 → reload → 内联网格（56px）+ 中键失效 ---------- */
  await af.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
    raw.linksForm = "docked";
    localStorage.setItem("start:settings", JSON.stringify(raw));
  });
  const af2 = await page.reload({ waitUntil: "load" }).then(() => bootNewTab(page));
  gate("T8a 刷新后 boot（linksForm=docked 持久化）", !!af2);
  if (!af2) throw new Error("reload 后 appFrame 未建立");
  await sleep(2000);
  const dockedState = await af2.evaluate(() => {
    const tiles = document.querySelectorAll('section[aria-label="快捷链接"] [data-cl-tile="1"]');
    const icon = document.querySelector('section[aria-label="快捷链接"] [data-cl-tile="1"] span span');
    const w = icon ? Math.round(icon.getBoundingClientRect().width) : 0;
    return { tiles: tiles.length, iconW: w };
  });
  gate("T8b 常驻形态：磁贴常驻（无抽屉、56px）",
    dockedState.tiles > 0 && dockedState.iconW === 56,
    `tiles=${dockedState.tiles} icon=${dockedState.iconW}px`);
  await page.mouse.click(90, 90, { button: "middle" });
  await sleep(600);
  gate("T8c 常驻形态中键不唤出抽屉",
    await af2.evaluate(() => !document.querySelector(".cl-drawer-veil")));
  await page.screenshot({ path: SHOTS + "/03-docked.png" });

  /* ---------- T9 流畅模式：纱罩模糊关停 + 抖动豁免 ---------- */
  await af2.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
    raw.perfLite = true;
    localStorage.setItem("start:settings", JSON.stringify(raw));
    window.dispatchEvent(new CustomEvent("start:links-manage"));
  });
  await sleep(700);
  const lite = await af2.evaluate(() => {
    const jig = document.querySelector(".cl-links .jiggle");
    const cs = jig ? getComputedStyle(jig) : null;
    return { jigName: cs?.animationName || "", jigDur: cs?.animationDuration || "" };
  });
  gate("T9a 流畅模式抖动豁免（0.28s）", lite.jigName === "jiggle" && lite.jigDur === "0.28s",
    `${lite.jigName}/${lite.jigDur}`);
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
  gate("T9b 流畅模式纱罩模糊关停", liteVeil === "none", String(liteVeil));
  await af3.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("start:settings") || "{}");
    raw.perfLite = false;
    localStorage.setItem("start:settings", JSON.stringify(raw));
  });

  /* ---------- T10 刷新路由回归 ---------- */
  gate("T10 reload → 落点仍 shell.html", page.url().endsWith("shell.html"), page.url());

  /* ---------- T11 更新日志首条 8.6.3 ---------- */
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
    const hit = dlgs.find((d) => d.textContent.includes("8.6.3"));
    return hit ? "8.6.3" : null;
  });
  gate("T11 更新日志首条 8.6.3", logFirst === "8.6.3", `first=${logFirst}`);

  /* ---------- T12 pageerror ---------- */
  gate("T12 pageerror=0", errors.length === 0, errors.join(" | ").slice(0, 120));
} catch (e) {
  fail++;
  console.log("  [FATAL]", e.message);
} finally {
  console.log(`\n===== v8.6.3 probe: ${pass} PASS / ${fail} FAIL =====`);
  await browser.close();
  try { httpSrv.kill(); } catch { }
  process.exit(fail ? 1 : 0);
}
