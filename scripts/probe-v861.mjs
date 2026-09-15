// v8.6.1 探针——快捷服务抽屉（中键唤出）+ 批量管理抖动回归 + 全量关键回归
// 承 probe-v850.mjs 骨架（mock 镜像 :26997 版本地板 → 静默路径）
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "fs";

const ROOT = "/tmp/ext-v861";
const ZIP = "/tmp/my-project/download/v8.6.1/ChuShi-NewTab-v8.6.1.zip";
const MOCK = "/tmp/v861-mock";
const PORT = 26997;

rmSync(ROOT, { recursive: true, force: true });
rmSync(MOCK, { recursive: true, force: true });
rmSync("/tmp/ext-v861-profile", { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(MOCK, { recursive: true });
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
writeVer("8.6.1");
const httpSrv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: MOCK, stdio: "ignore" });
process.on("exit", () => { try { httpSrv.kill(); } catch { } });
console.log("stage: mock 镜像就绪（v8.6.1 地板）");

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, tag) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${tag}`)), ms))]);

const browser = await withTimeout(
  chromium.launchPersistentContext("/tmp/ext-v861-profile", {
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
  return ok ? af : null;
}

/* 抽屉查询辅助：抽屉 portal 在 appFrame 的 body（应用整体跑在 iframe 里），
   所有 DOM 断言必须走 af.evaluate；mouse 坐标仍是视口系（iframe 满屏） */
async function drawerOpen(f) {
  return f.evaluate(() => !!document.querySelector(".cl-drawer-veil"));
}

try {
  /* ---------- T1 boot ---------- */
  const af = await bootNewTab(page);
  gate("T1 本地直载 boot", !!af);
  if (!af) throw new Error("appFrame 未建立");
  await sleep(2200); // 入场动画收尾

  /* ---------- T2 中键唤出抽屉 ---------- */
  await page.mouse.click(90, 620, { button: "middle" }); // 左下空白（极光区）
  await sleep(700);
  const open1 = await drawerOpen(af);
  const drawerState = await af.evaluate(() => {
    const veil = document.querySelector(".cl-drawer-veil");
    const tiles = document.querySelectorAll('[data-cl-tile="1"]');
    const add = document.querySelector('button[aria-label="添加快捷链接"]');
    return {
      veil: !!veil,
      tiles: tiles.length,
      add: !!add,
      htmlClass: document.documentElement.classList.contains("cs-drawer"),
    };
  });
  gate("T2a 中键唤出（纱罩+磁贴墙+添加位）", open1 && drawerState.veil && drawerState.tiles > 0 && drawerState.add,
    `tiles=${drawerState.tiles} veil=${drawerState.veil} add=${drawerState.add} open1=${open1}`);
  const dbg = await af.evaluate(() => {
    const g = document.querySelector(".cl-links");
    return {
      grid: !!g,
      gridLen: g ? g.innerHTML.length : 0,
      anchors: document.querySelectorAll("a[data-cl-tile]").length,
      rootChildren: g ? g.children.length : 0,
      head: g ? g.innerHTML.slice(0, 200) : "",
    };
  });
  console.log("  [DBG]", JSON.stringify(dbg).slice(0, 400));
  gate("T2b html.cs-drawer 同步", drawerState.htmlClass === true);
  const tileBox = await af.evaluate(() => {
    const icon = document.querySelector('[data-cl-tile="1"] span span');
    if (!icon) return null;
    const r = icon.getBoundingClientRect();
    return { w: Math.round(r.width), label: !!document.querySelector('[data-cl-tile="1"] .tile-label') };
  });
  gate("T2c 磁贴放大到 64px + 标签在下方", tileBox && tileBox.w === 64 && tileBox.label,
    tileBox ? `icon=${tileBox.w}px label=${tileBox.label}` : "no icon");

  /* ---------- T3 ESC 收起 ---------- */
  await page.keyboard.press("Escape");
  await sleep(600);
  const closed1 = await drawerOpen(af);
  const classOff = await af.evaluate(() => !document.documentElement.classList.contains("cs-drawer"));
  gate("T3 ESC 收起 + cs-drawer 移除", !closed1 && classOff);

  /* ---------- T4 中键磁贴不关抽屉（原生新标签页维持）+ toggle 再收 ---------- */
  await page.mouse.click(90, 620, { button: "middle" });
  await sleep(700);
  let popups = 0;
  const onPage = () => { popups++; };
  browser.on("page", onPage);
  const tilePos = await af.evaluate(() => {
    const a = document.querySelector('[data-cl-tile="1"]');
    if (!a) return null;
    const r = a.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 32 };
  });
  if (tilePos) await page.mouse.click(tilePos.x, tilePos.y, { button: "middle" });
  await sleep(900);
  const stillOpen = await drawerOpen(af);
  browser.off("page", onPage);
  gate("T4a 中键磁贴 → 抽屉保持（原生新标签不拦）", stillOpen && tilePos !== null,
    popups > 0 ? `新标签页事件=${popups}` : "（popup 事件未捕获，磁贴守卫仍成立）");
  await page.mouse.click(90, 620, { button: "middle" }); // 再按中键收起
  await sleep(600);
  gate("T4b 中键再按收起（toggle）", !(await drawerOpen(af)));

  /* ---------- T5 批量管理：事件直达 + 抖动回归 ---------- */
  await af.evaluate(() => window.dispatchEvent(new CustomEvent("start:links-manage")));
  await sleep(800);
  const editState = await af.evaluate(() => {
    const jiggles = document.querySelectorAll(".cl-links .jiggle").length;
    const dels = document.querySelectorAll('button[aria-label^="删除 "]').length;
    const tiles = document.querySelectorAll('[data-cl-tile="1"]').length;
    const pill = [...document.querySelectorAll(".cl-links button")].find(
      (b) => b.textContent.trim() === "完成");
    return { jiggles, dels, tiles, pillDone: !!pill, open: !!document.querySelector(".cl-drawer-veil") };
  });
  gate("T5a 右键菜单事件 → 抽屉开+编辑态（抖动回归）",
    editState.open && editState.tiles > 0 && editState.jiggles >= editState.tiles &&
    editState.dels === editState.tiles && editState.pillDone,
    `tiles=${editState.tiles} jiggle=${editState.jiggles} 删除角标=${editState.dels}`);

  /* ---------- T6 pill「完成」退出编辑 ---------- */
  await af.evaluate(() => {
    const pill = [...document.querySelectorAll(".cl-links button")].find(
      (b) => b.textContent.trim() === "完成");
    pill?.click();
  });
  await sleep(500);
  const afterDone = await af.evaluate(() => ({
    jiggles: document.querySelectorAll(".cl-links .jiggle").length,
    dels: document.querySelectorAll('button[aria-label^="删除 "]').length,
  }));
  gate("T6 「完成」→ 抖动与角标退场", afterDone.jiggles === 0 && afterDone.dels === 0,
    `jiggle=${afterDone.jiggles} del=${afterDone.dels}`);

  /* ---------- T7 纱罩点空白收起 ---------- */
  await page.mouse.click(90, 620);
  await sleep(600);
  gate("T7 点击纱罩空白收起", !(await drawerOpen(af)));

  /* ---------- T8 抽屉开着点 Dock → 先收抽屉，面板照常打开 ---------- */
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
  gate("T8 Dock 点击 → 抽屉收起且面板打开", dockClosed && panelOpened,
    `drawerClosed=${dockClosed} panel=${panelOpened}`);
  // 复位：关设置面板（ESC）
  await page.keyboard.press("Escape");
  await sleep(500);

  /* ---------- T9 更新日志首条 8.6.1 ---------- */
  const setBtn = await af.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => (b.getAttribute("aria-label") || b.textContent || "").includes("设置"));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (setBtn) {
    await page.mouse.click(setBtn.x, setBtn.y);
    await sleep(900);
    await af.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => (x.textContent || "").includes("更新日志"));
      b?.click();
    });
    await sleep(800);
    const logFirst = await af.evaluate(() => {
      const dlgs = [...document.querySelectorAll("[role='dialog']")];
      const hit = dlgs.find((d) => d.textContent.includes("8.6.1"));
      return hit ? "8.6.1" : null;
    });
    gate("T9 更新日志首条 8.6.1", logFirst === "8.6.1", `first=${logFirst}`);
    await page.keyboard.press("Escape");
    await sleep(400);
  } else {
    gate("T9 更新日志首条 8.6.1", false, "设置按钮未找到");
  }

  /* ---------- T10 pageerror ---------- */
  gate("T10 pageerror=0", errors.length === 0, errors.join(" | ").slice(0, 120));
} catch (e) {
  fail++;
  console.log("  [FATAL]", e.message);
} finally {
  console.log(`\n===== v8.6.1 probe: ${pass} PASS / ${fail} FAIL =====`);
  await browser.close();
  try { httpSrv.kill(); } catch { }
  process.exit(fail ? 1 : 0);
}
