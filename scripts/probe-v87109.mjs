// v8.7.109 运行时终验探针——用户两项指令：
// ①「不要底部羽化遮罩，删掉这个」→ 常驻模式 .cl-fade-veil-bottom 实例退役
//   （差分断言：常驻 0 枚 / 抽屉保留；scrollable 时也不出现）
// ②「下方遮罩层再下移一点，入场动画 1~2 行图标被挡」→ 根因=容器贴内容高+
//   入场 intro-tile-rise +26px 上浮（裁切线落在最后一行 + scrollHeight 被变换
//   撑大令 fade.bottom 误显影驻留）；修复=paddingBottom:40 预留。
//   断言：1 行容器 paddingBottom=40 / 入场全程磁贴底 ≤ 容器底（不裁）/
//   scrollHeight==clientHeight（无变换膨胀泄漏）/ 多行滚动回归（底缘=Dock 顶、
//   滚到底逐磁贴≤Dock 顶、resize 跟随）/ 抽屉两枚遮罩回归。
// 承 v8.7.108 全部回归门（下边界跟随律/hover 不动此版零触）。
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync, spawn } from "child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, statSync } from "fs";

const ROOT = "/tmp/ext-v87109";
const ZIP = "/home/z/beta-wt/download/v8.7.109/ChuShi-NewTab-v8.7.109.zip";
const MOCK = "/tmp/v87109-mock";
const PORT = 26991;
const SHOTS = "/tmp/probe-v87109-shots";
const PROFILE = "/tmp/ext-v87109-profile";

rmSync(ROOT, { recursive: true, force: true });
rmSync(MOCK, { recursive: true, force: true });
rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(MOCK, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
execSync(`cd ${ROOT} && unzip -o -q ${ZIP}`);
console.log("stage: 扩展解包 ->", ROOT);

// mock 云镜像（断网更新检查噪声消除，同 v8.6.25 探针先例）
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
writeFileSync(MOCK + "/version.json", JSON.stringify({
  v: "8.7.109", files: [{ p: "index.html", s: statSync(MOCK + "/index.html").size }],
}));
// v8.7.109 实测：无 mock 服务器应用照常 boot（连接拒绝→更新检查静默跳过，
// diag2 证明 mock http.server 反而诱发挂起）——不设服务器。
console.log("stage: 跳过 mock 镜像（直连失败即静默跳过）");

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, tag) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`TIMEOUT ${tag}`)), ms))]);

const browser = await withTimeout(
  chromium.launchPersistentContext(PROFILE, {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
      "--no-first-run", "--no-sandbox"],
  }), 30000, "launch");
console.log("stage: chromium 启动（EXT_ID=" + EXT_ID.slice(0, 8) + "…）");

let ok = 0; const bad = [];
function gate(name, cond, detail = "") {
  if (cond) { ok++; console.log(`  [OK] ${name}${detail ? " | " + detail : ""}`); }
  else { bad.push(name + (detail ? " | " + detail : "")); console.log(`  [FAIL] ${name}${detail ? " | " + detail : ""}`); }
}

// 种子注入：live 页 evaluate 写入（必须等应用 boot 写回落定后再写，否则被覆盖
// ——FAIL DUMP 实证 linksN=6 默认值回写）。写入后 reload，应用 boot 读取种子值。
const LINKS = (n) => JSON.stringify(
  Array.from({ length: n }, (_, i) => ({ id: "t" + i, name: "站点" + (i + 1), url: "https://example" + (i + 1) + ".com" })));
const seed = async (n, form) => {
  await page.evaluate(([links, form2]) => {
    localStorage.setItem("start:settings", JSON.stringify(Object.assign(
      JSON.parse(localStorage.getItem("start:settings") || "{}"), { linksForm: form2, showDock: true })));
    localStorage.setItem("start:links", links);
  }, [LINKS(n), form]);
};

const page = await withTimeout(browser.newPage(), 15000, "newPage");
await withTimeout(page.goto(EXT_URL("index.html")), 30000, "goto");
await page.waitForTimeout(1500); // 首次 boot（默认值写回）落定，防种子被覆盖
await seed(3, "docked");
await page.reload();
try {
  await page.waitForSelector('.cl-links-docked', { timeout: 20000, state: "visible" });
} catch {
  const dump = await page.evaluate(() => ({
    settings: (localStorage.getItem("start:settings") || "").slice(0, 300),
    linksN: JSON.parse(localStorage.getItem("start:links") || "[]").length,
    docked: document.querySelectorAll(".cl-links-docked").length,
    ghost: document.querySelectorAll(".cl-layout-ghost").length,
    realSec: !!document.querySelector('section[aria-label="快捷链接"]'),
    zenSec: document.querySelectorAll(".zen-gone").length,
    vis: [...document.querySelectorAll(".cl-links-docked")].map((e) => getComputedStyle(e).visibility),
  }));
  console.log("FAIL DUMP:", JSON.stringify(dump, null, 1));
  await page.screenshot({ path: "/tmp/probe-v87109-shots/fail-A.png" });
  throw new Error("A 场景 .cl-links-docked 未可见");
}
console.log("== A. 常驻 1 行（3 磁贴）==");

// A1 底部遮罩退役 + 顶部遮罩在位
const veils = await page.evaluate(() => ({
  dockedBottom: document.querySelectorAll(".cl-links-docked .cl-fade-veil-bottom").length,
  dockedTop: document.querySelectorAll(".cl-links-docked .cl-fade-veil-top").length,
  veilOnCount: document.querySelectorAll(".cl-links-docked .cl-fade-veil-on").length,
}));
gate("A1 常驻底部羽化遮罩退役（0 枚）", veils.dockedBottom === 0, `got ${veils.dockedBottom}`);
gate("A2 常驻顶部羽化遮罩在位（1 枚）", veils.dockedTop === 1, `got ${veils.dockedTop}`);

// A3 下缘预留 paddingBottom=40 + 无滚动
await page.waitForTimeout(1800); // 入场动画（0.24s 延迟 + 0.95s）完整落定
const m1 = await page.evaluate(() => {
  const el = document.querySelector(".cl-links-docked .cl-links-scroll");
  const cs = getComputedStyle(el);
  return {
    pb: cs.paddingBottom, st: cs.scrollTop,
    sh: el.scrollHeight, ch: el.clientHeight,
    rect: el.getBoundingClientRect().bottom,
  };
});
gate("A3 容器 paddingBottom=40px（下缘预留）", m1.pb === "40px", `got ${m1.pb}`);
gate("A4 一行无滚动 scrollHeight==clientHeight", Math.abs(m1.sh - m1.ch) <= 0, `sh=${m1.sh} ch=${m1.ch}`);

// A5 入场动画全程磁贴不被裁：动画窗口内采样磁贴底 vs 容器底
// （重载触发入场，入场 delay 0.24s + 0.95s；在 0.30s~1.10s 之间密集采样）
await seed(3, "docked");
await page.reload();
await page.waitForSelector(".cl-links-docked .cl-links-grid a, .cl-links-docked .cl-links-grid [data-cl-tile], .cl-links-docked", { timeout: 20000 });
const samples = [];
for (let t = 0; t < 16; t++) {
  const s = await page.evaluate(() => {
    const c = document.querySelector(".cl-links-docked .cl-links-scroll");
    const tiles = document.querySelectorAll(".cl-links-docked .cl-links-grid > div");
    let maxBottom = -1;
    tiles.forEach((tl) => { const r = tl.getBoundingClientRect(); if (r.height > 0) maxBottom = Math.max(maxBottom, r.bottom); });
    return { tileBottom: maxBottom, contBottom: c.getBoundingClientRect().bottom, veilOn: document.querySelectorAll(".cl-links-docked .cl-fade-veil-on").length };
  });
  samples.push(s);
  await sleep(55);
}
const worst = samples.reduce((a, b) => (b.tileBottom - b.contBottom > a.tileBottom - a.contBottom ? b : a));
gate("A5 入场全程磁贴底 ≤ 容器底（无裁切）", worst.tileBottom <= worst.contBottom + 0.5,
  `worst overflow=${(worst.tileBottom - worst.contBottom).toFixed(1)}px`);
gate("A6 入场全程无遮罩显影（fade 误显影根治）", samples.every((s) => s.veilOn === 0),
  `max veilOn=${Math.max(...samples.map((s) => s.veilOn))}`);
await page.screenshot({ path: SHOTS + "/docked-1row.png" });

// == B. 常驻多行滚动回归（40 磁贴）==
await seed(40, "docked");
await page.reload();
await page.waitForSelector(".cl-links-docked .cl-links-scroll", { timeout: 20000 });
await page.waitForTimeout(1600);
console.log("== B. 常驻多行滚动回归（40 磁贴）==");
const m2 = await page.evaluate(() => {
  const el = document.querySelector(".cl-links-docked .cl-links-scroll");
  const dock = document.querySelector(".cl-dock");
  return {
    pb: getComputedStyle(el).paddingBottom,
    sh: el.scrollHeight, ch: el.clientHeight,
    contBottom: el.getBoundingClientRect().bottom,
    dockTop: dock.offsetTop,
    dockedBottomVeil: document.querySelectorAll(".cl-links-docked .cl-fade-veil-bottom").length,
  };
});
gate("B1 多行可滚动", m2.sh > m2.ch + 4, `sh=${m2.sh} ch=${m2.ch}`);
gate("B2 底缘=Dock 顶（跟随律回归）", Math.abs(m2.contBottom - m2.dockTop) <= 2,
  `cont=${m2.contBottom.toFixed(1)} dockTop=${m2.dockTop}`);
gate("B3 多行底部遮罩仍退役（0 枚）", m2.dockedBottomVeil === 0, `got ${m2.dockedBottomVeil}`);
// 滚到底：逐磁贴 ≤ Dock 顶（v8.7.108 律回归）
const b3 = await page.evaluate(() => {
  const el = document.querySelector(".cl-links-docked .cl-links-scroll");
  el.scrollTop = el.scrollHeight;
  return new Promise((res) => setTimeout(() => {
    const dock = document.querySelector(".cl-dock");
    const dockTop = dock.offsetTop;
    const tiles = [...document.querySelectorAll(".cl-links-docked .cl-links-grid > div")];
    const maxB = Math.max(...tiles.map((t) => t.getBoundingClientRect().bottom));
    const topVeilOn = document.querySelectorAll(".cl-links-docked .cl-fade-veil-top.cl-fade-veil-on").length;
    res({ maxB, dockTop, topVeilOn });
  }, 120));
});
gate("B4 滚到底逐磁贴 ≤ Dock 顶", b3.maxB <= b3.dockTop + 1, `maxTile=${b3.maxB.toFixed(1)} dockTop=${b3.dockTop}`);
gate("B5 滚动后顶部遮罩显影（fade.top 通道存活）", b3.topVeilOn === 1, `got ${b3.topVeilOn}`);
// resize 跟随（上行 900：地板不触发区间验跟随；diag3 实证 590 矮视口触发
// 188px 地板（LINKS_ZONE_H，v8.7.105 设计，先于本版存在）→ 容器按 220px 高
// 必然越过 Dock 顶 28.8px——地板律优先于跟随律，非本版回归，单列地板断言）
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(350);
const m3 = await page.evaluate(() => {
  const el = document.querySelector(".cl-links-docked .cl-links-scroll");
  const dock = document.querySelector(".cl-dock");
  return { contBottom: el.getBoundingClientRect().bottom, dockTop: dock.offsetTop };
});
gate("B6 上行 resize 后底缘仍=Dock 顶", Math.abs(m3.contBottom - m3.dockTop) <= 2,
  `cont=${m3.contBottom.toFixed(1)} dockTop=${m3.dockTop}`);
await page.setViewportSize({ width: 1280, height: 590 });
await page.waitForTimeout(350);
const m4 = await page.evaluate(() => ({
  maxH: getComputedStyle(document.querySelector(".cl-links-docked .cl-links-scroll")).maxHeight,
}));
gate("B7 矮视口触发 188px 地板（v8.7.105 设计律）", m4.maxH === "220px", `maxH=${m4.maxH}`);
await page.setViewportSize({ width: 1280, height: 800 });
await page.waitForTimeout(350);
await page.screenshot({ path: SHOTS + "/docked-40row.png" });

// == C. 抽屉回归（两枚遮罩保留 + 滚动显影）==
await seed(60, "drawer");
await page.reload();
await page.waitForSelector("main", { timeout: 20000 });
await page.waitForTimeout(900);
console.log("== C. 抽屉回归（60 磁贴）==");
// 中键唤出抽屉
await page.mouse.click(640, 560, { button: "middle" });
await page.waitForSelector(".cl-drawer-veil", { timeout: 8000 });
await page.waitForTimeout(800);
const c1 = await page.evaluate(() => {
  const notGhost = (el) => !el.closest(".cl-layout-ghost");
  const topV = [...document.querySelectorAll(".cl-fade-veil-top")].filter(notGhost).length;
  const botV = [...document.querySelectorAll(".cl-fade-veil-bottom")].filter(notGhost).length;
  const sc = [...document.querySelectorAll(".cl-links-scroll")].filter(notGhost)[0];
  return { topV, botV, sh: sc ? sc.scrollHeight : -1, ch: sc ? sc.clientHeight : -1 };
});
gate("C1 抽屉顶部遮罩在位（1 枚）", c1.topV === 1, `got ${c1.topV}`);
gate("C2 抽屉底部遮罩保留（1 枚）", c1.botV === 1, `got ${c1.botV}`);
gate("C3 抽屉 60 磁贴可滚动", c1.sh > c1.ch + 4, `sh=${c1.sh} ch=${c1.ch}`);
// 抽屉内滚动 → 底部遮罩显影
// ghost 克隆不可见 → hover 定位到 portal 里真实的抽屉滚动容器（坐标法）
const dRect = await page.evaluate(() => {
  const sc = [...document.querySelectorAll(".cl-links-scroll")].filter((e) => !e.closest(".cl-layout-ghost"))[0];
  const r = sc.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: Math.min(Math.max(r.y + 80, 60), innerHeight - 120) };
});
await page.mouse.move(dRect.x, dRect.y);
await page.mouse.wheel(0, 260); // 中段滚动（最大滚动 566，一档 260 不触底）
await sleep(260);
const c2 = await page.evaluate(() => {
  const notGhost = (el) => !el.closest(".cl-layout-ghost");
  const sc = [...document.querySelectorAll(".cl-links-scroll")].filter(notGhost)[0];
  return {
    on: [...document.querySelectorAll(".cl-fade-veil-bottom.cl-fade-veil-on")].filter(notGhost).length,
    st: sc.scrollTop,
    max: sc.scrollHeight - sc.clientHeight,
  };
});
gate("C4 抽屉中段滚动底部遮罩显影（保留律实证）", c2.on === 1 && c2.st > 0 && c2.st < c2.max - 4,
  `on=${c2.on} scrollTop=${c2.st}/${c2.max}`);
await page.mouse.wheel(0, 2000); // 触底
await sleep(300);
const c3 = await page.evaluate(() => {
  const notGhost = (el) => !el.closest(".cl-layout-ghost");
  return {
    on: [...document.querySelectorAll(".cl-fade-veil-bottom.cl-fade-veil-on")].filter(notGhost).length,
    st: [...document.querySelectorAll(".cl-links-scroll")].filter(notGhost)[0].scrollTop,
  };
});
gate("C5 抽屉触底后底部遮罩隐影（到边即隐设计）", c3.on === 0 && c3.st >= c2.max - 4, `on=${c3.on} scrollTop=${c3.st}/${c2.max}`);
await page.screenshot({ path: SHOTS + "/drawer-60.png" });

console.log(`\n===== probe v8.7.109: ${ok} OK / ${bad.length} BAD =====`);
bad.forEach((b) => console.log("  [BAD]", b));
await browser.close();
process.exit(bad.length ? 1 : 0);
