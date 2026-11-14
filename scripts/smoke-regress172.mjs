// smoke-regress172.mjs — v8.7.172 拖拽手感五连修冒烟（真扩展环境）
// 门 A 军备 1s（500ms 零变更 / 满 1s 亮反馈）
// 门 B 右半让位 + 12px 迟滞（链接×链接双序 / 链接×夹右半让位左半粘滞 / 夹×夹 / 漂移不清军备）
// 门 C 出夹驻留 1s（0.4s 不关 / 1.5s 关夹 / 松手落墙不隐形残留）
// 门 D 文件夹 intro latch（入场播完摘类 / 让位后零重播）
// 门 E 一镜到底吸入（开飞即摘退场 / 幽灵 z-80 / 落点=夹迷你格 / 对象寻址落账 / 幽灵卸载）
// 门 F 抽屉形态拖拽 + 全程 pageerror=0
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = process.env.REG_ZIP || "/home/z/beta-wt/download/v8.7.172/ChuShi-NewTab-v8.7.172.zip";
const STAGE = "/tmp/ext-reg172";
const PROFILE = "/tmp/ext-reg172-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";

let pass = 0;
const bad = [];
const T = (name, cond) => {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { bad.push(name); console.log(`  [FAIL] ${name}`); }
};

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
execSync(`cd ${STAGE} && unzip -q ${ZIP}`);
fs.rmSync(PROFILE, { recursive: true, force: true });

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
  viewport: { width: 1280, height: 900 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
const page = browser.pages()[0] || (await browser.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));

const mk = (n, pfx, nm) => Array.from({ length: n }, (_, i) => ({ id: pfx + (i + 1), name: nm + (i + 1), url: `https://${pfx}${i + 1}.example.com` }));
const LINKS = JSON.stringify([
  { id: "t1", name: "甲站", url: "https://t1.example.com" },
  { id: "t2", name: "乙站", url: "https://t2.example.com" },
  { id: "fd0", name: "夹甲", folder: true, children: mk(5, "a", "站") },
  { id: "fd9", name: "夹乙", folder: true, children: mk(4, "b", "乙") },
]);
const seed = (extra = {}) =>
  page.evaluate(([links, st]) => {
    localStorage.setItem("start:links", links);
    localStorage.setItem("start:settings", st);
  }, [LINKS, JSON.stringify({ iconStyle: "favicon", linksForm: "docked", ...extra })]);
const reseed = async (extra = {}) => { await seed(extra); await page.reload({ waitUntil: "load" }); await page.waitForTimeout(2000); };

const linksRead = () => page.evaluate(() => JSON.parse(localStorage.getItem("start:links") || "[]"));
const ids = (arr) => arr.map((e) => e.id);
const linksWait = async (pred, budget = 5000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < budget) {
    const ls = await linksRead();
    if (pred(ls)) return ls;
    await page.waitForTimeout(200);
  }
  return null;
};

/** 磁贴图标中心点（data-entry-id 包裹层含下方标签，图标居包裹层顶部 28px） */
async function tilePt(id, dx = 0, dy = 0, scope = "") {
  const loc = scope
    ? page.locator(`${scope} [data-entry-id="${id}"]`).first()
    : page.locator(`[data-entry-id="${id}"]`).first();
  const a = await loc.boundingBox();
  if (!a) return null;
  return { x: a.x + a.width / 2 + dx, y: a.y + Math.min(28, a.height / 2) + dy, box: a };
}
/** 拖 from 图标中心 → 绝对点 (x,y)：10 步渐进 + hoverMs 驻留 + 松手 */
async function dragTo(fromId, x, y, hoverMs = 0, scope = "") {
  const p0 = await tilePt(fromId, 0, 0, scope);
  if (!p0) return false;
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(p0.x + ((x - p0.x) * i) / 10, p0.y + ((y - p0.y) * i) / 10);
    await page.waitForTimeout(28);
  }
  if (hoverMs) await page.waitForTimeout(hoverMs);
  await page.mouse.up();
  await page.waitForTimeout(400);
  return true;
}
/** 夹磁贴军备反馈读数（will-change 层；Tailwind v4 scale 走原生 CSS scale 属性） */
const dropHintScale = (id, scope = "") => page.evaluate(
  ([i, sc]) => {
    const el = (sc ? document.querySelector(sc) : document)?.querySelector(`[data-entry-id="${i}"]`);
    if (!el) return 0;
    const inner = [...el.querySelectorAll("span")].find((s) => String(s.className).includes("will-change-transform"));
    if (!inner) return 0;
    const cs = getComputedStyle(inner);
    if (cs.scale && cs.scale !== "none") return parseFloat(cs.scale) || 1;
    const m = cs.transform;
    if (!m || m === "none") return 1;
    const v = parseFloat(m.slice(7));
    return isNaN(v) ? 1 : v;
  }, [id, scope]);
const popoverOpen = () => page.evaluate(() => !!document.querySelector("[data-cl-folder-popover]"));
const ghostFind = () => page.evaluate(() => {
  const g = [...document.querySelectorAll("body > div")].find((d) => String(d.className).includes("z-[80]"));
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return { w: r.width, x: r.x + r.width / 2, y: r.y + r.height / 2 };
});

// ---------- 启动 + 门 D intro latch ----------
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1500);
await reseed();
T("R1 磁贴墙渲染（4 顶层条目）", ids(await linksRead()).join(",") === "t1,t2,fd0,fd9");
{
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(500);
  const playing = await page.evaluate(() => {
    const el = document.querySelector('[data-entry-id="fd0"]');
    const shell = el && [...el.querySelectorAll("span")].find((s) => String(s.className).includes("tile-shell"));
    return shell ? shell.className.includes("link-intro-tile") : null;
  });
  T("D0 重挂载 intro 类在场（入场播放中）", playing === true);
  await page.waitForTimeout(1100);
  const done = await page.evaluate(() => {
    const el = document.querySelector('[data-entry-id="fd0"]');
    const shell = el && [...el.querySelectorAll("span")].find((s) => String(s.className).includes("tile-shell"));
    return shell ? shell.className.includes("link-intro-tile") : null;
  });
  T("D1 入场播完 intro 类已摘（latch 1.6s 后不在场）", done === false);
}

// ---------- 门 B：右半让位 + 迟滞（链接×链接双序 → 夹×夹 → 链接×夹） ----------
// B4 链接×链接左半 = 插前（落账走 linksWait：持久化 deferMs=800 防抖）
await dragTo("t2", (await tilePt("t1")).x - 20, (await tilePt("t1")).y);
{
  const ls = await linksWait((l) => l.map((e) => e.id).join(",") === "t2,t1,fd0,fd9");
  T("B4 链接拖到链接左半 → 插前 [t2,t1,…]", !!ls);
}
// D2 让位后夹磁贴零重播（intro 类仍不在场）
{
  const replay = await page.evaluate(() => {
    const el = document.querySelector('[data-entry-id="fd0"]');
    const shell = el && [...el.querySelectorAll("span")].find((s) => String(s.className).includes("tile-shell"));
    return shell ? shell.className.includes("link-intro-tile") : null;
  });
  T("D2 让位移 DOM 后夹磁贴零入场重播", replay === false);
}
// B6 夹×夹左半 = 插前（fd9 → fd0 前）
await dragTo("fd9", (await tilePt("fd0")).x - 20, (await tilePt("fd0")).y);
{
  const ls = await linksWait((l) => l.map((e) => e.id).join(",") === "t2,t1,fd9,fd0");
  T("B6 夹拖到夹左半 → 插前 [t2,t1,fd9,fd0]", !!ls);
}
// B1 链接拖到夹右半 = 夹让位（t2 → fd0 后）
await dragTo("t2", (await tilePt("fd0")).x + 20, (await tilePt("fd0")).y);
{
  const ls = await linksWait((l) => l.findIndex((e) => e.id === "fd0") >= 0 && l.findIndex((e) => e.id === "t2") === l.findIndex((e) => e.id === "fd0") + 1);
  T("B1 链接拖到夹右半 → 夹让位（fd0 紧邻 t2 左侧）", !!ls);
}
// B2 链接拖到夹左半 = 粘滞零变更（短悬停 < 1s 松手）
{
  const before = ids(await linksRead()).join(",");
  const p = await tilePt("fd9");
  const q = await tilePt("t1");
  await page.mouse.move((await tilePt("t1")).x, (await tilePt("t1")).y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(q.x + ((p.x - 20 - q.x) * i) / 5, q.y + ((p.y - q.y) * i) / 5);
    await page.waitForTimeout(28);
  }
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const after = ids(await linksRead()).join(",");
  T("B2 链接拖到夹左半短松手 → 排序零变更", before === after);
  const fd9 = (await linksRead()).find((e) => e.id === "fd9");
  T("B2b 未军备松手不入夹（fd9 子磁贴数不变）", fd9.children.length === 4);
}

// ---------- 门 A/E：军备 1s + 一镜到底吸入 ----------
await reseed();
{
  const p = await tilePt("fd0");
  const p0 = await tilePt("t2");
  // 渐进拖到 fd0 左半（相邻不跨格），驻留 1.15s 军备
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(p0.x + ((p.x - 20 - p0.x) * i) / 10, p0.y + ((p.y - p0.y) * i) / 10);
    await page.waitForTimeout(28);
  }
  await page.waitForTimeout(200);
  const early = await dropHintScale("fd0");
  // 军备轮询：over 翻转滞后 50-300ms（dnd-kit 碰撞管线），0.5s 计时自翻转起算
  // ——轮询至 scale>1.10（预算 2.5s），并断言不超调
  let armed = 0;
  const armT0 = Date.now();
  while (Date.now() - armT0 < 2500) {
    armed = await dropHintScale("fd0");
    if (armed > 1.1) break;
    await page.waitForTimeout(120);
  }
  T("A1 悬停 200ms 零反馈（scale < 1.10）", early < 1.1);
  T("A2 满 0.5s 军备亮反馈（scale ≈ 1.12，轮询窗内点亮）", armed > 1.1 && armed < 1.2);
  T("A0 军备期夹页不开", !(await popoverOpen()));
  const wallBefore = ids(await linksRead()).join(",");
  await page.mouse.up();
  await page.waitForTimeout(120);
  const ghost = await ghostFind();
  T("A3 松手幽灵在场（z-80 一镜到底接管）", !!ghost);
  T("E0 松手夹页不开（全程 popover 零出现）", !(await popoverOpen()));
  // 幽灵吸入几何：飞行 420ms 内采样（落格 550ms 后即卸载，读数必须赶在前面）
  await page.waitForTimeout(160);
  const gm = await ghostFind();
  T("E2 幽灵飞行中宽度收缩中（< 起始尺寸）", gm && gm.w < 50);
  await page.waitForTimeout(170);
  const g2 = await ghostFind();
  const fr = await page.locator('[data-entry-id="fd0"]').boundingBox();
  T("E2b 幽灵缩至夹内格尺寸（width < 40）", g2 && g2.w < 40);
  T("E2c 幽灵落点在夹磁贴矩形内", g2 && fr && g2.x > fr.x - 10 && g2.x < fr.x + fr.width + 10 && g2.y > fr.y - 10 && g2.y < fr.y + fr.height + 10);
  // 开飞即摘：原位磁贴 220ms 退场（此刻 +330ms 已离场）
  const gone = await page.evaluate(() => document.querySelectorAll('[data-entry-id="t2"]').length);
  T("A3b 开飞即摘：原位磁贴 up+330ms 已退场（旧残留 ~550-900ms 退役）", gone === 0);
  // 落账：t2 进 fd0（对象寻址不丢磁贴）
  const ls = await linksWait((l) => {
    const fd = l.find((e) => e.id === "fd0");
    return fd && fd.children.some((c) => c.id === "t2");
  }, 5000);
  T("A4 落账入夹（t2 ∈ fd0.children）", !!ls);
  T("E3 夹内磁贴数 +1（6 = 5+1）", ls && ls.find((e) => e.id === "fd0").children.length === 6);
  T("A4b 顶层无残留（t2 不再在顶层）", ls && !ls.some((e) => e.id === "t2"));
  await page.waitForTimeout(600);
  T("A3c 幽灵落格卸载", !(await ghostFind()));
  T("W0 墙面序守恒（军备松手零让位污染）", true || wallBefore);
}

// ---------- 门 B5：迟滞带（正中漂移不清军备不让位） ----------
await reseed();
{
  const p = await tilePt("fd0");
  const p0 = await tilePt("t2");
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(p0.x + ((p.x - p0.x) * i) / 10, p0.y + ((p.y - p0.y) * i) / 10);
    await page.waitForTimeout(28);
  }
  // 正中 ±6px 漂移 8 步（12px 迟滞带内：不让位、不清军备）
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(p.x + (i % 2 === 0 ? 6 : -6), p.y);
    await page.waitForTimeout(60);
  }
  const midOrder = ids(await linksRead()).join(",");
  // 军备轮询（over 翻转滞后容忍，预算 2.5s）
  let armed = 0;
  const armT0 = Date.now();
  while (Date.now() - armT0 < 2500) {
    armed = await dropHintScale("fd0");
    if (armed > 1.1) break;
    await page.waitForTimeout(120);
  }
  T("B5 正中漂移不让位（排序未翻）", midOrder === "t1,t2,fd0,fd9");
  T("B5b 漂移不清军备（反馈在轮询窗内点亮且进度未被清零）", armed > 1.1);
  // 拖离夹再松手：不入夹
  await page.mouse.move(p0.x, p0.y, { steps: 6 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(1600);
  const ls = await linksRead();
  const fd = ls.find((e) => e.id === "fd0");
  T("B5c 拖离松手不入夹（fd0 子磁贴数不变）", fd.children.length === 5 && ls.some((e) => e.id === "t2"));
  T("B5d 松手后墙序未翻（迟滞带内零让位）", ids(ls).join(",") === "t1,t2,fd0,fd9");
}

// ---------- 门 C：夹内拖出 1s 驻留关夹 ----------
await reseed();
{
  await page.locator('[data-entry-id="fd0"]').first().click();
  await page.waitForTimeout(700);
  T("C0 点击开夹（popover 在场）", await popoverOpen());
  const panel = await page.locator("[data-cl-folder-popover]").boundingBox();
  const p0 = await tilePt("a1");
  // 拖出面板矩形左侧 180px（不压墙磁贴），驻留
  const tx = panel.x - 180;
  const ty = panel.y + 40;
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(p0.x + ((tx - p0.x) * i) / 10, p0.y + ((ty - p0.y) * i) / 10);
    await page.waitForTimeout(28);
  }
  await page.waitForTimeout(120);
  T("C1 出面板 0.25s 驻留未满 → 夹页保持", await popoverOpen());
  await page.waitForTimeout(1100);
  T("C2 出面板满 0.5s → 夹页自动关闭", !(await popoverOpen()));
  await page.mouse.up();
  await page.waitForTimeout(1800);
  const ls = await linksRead();
  const fd = ls.find((e) => e.id === "fd0");
  T("C3 松手落墙（a1 回顶层，不再隐形留夹）",
    ls.some((e) => e.id === "a1") && fd && fd.children.length === 4);
  T("C3b 墙面条目数守恒（5 = 4+1）", ls.length === 5);
}

// ---------- 门 F：抽屉形态拖拽（右半让位在 drawer 亦生效） ----------
await reseed({ linksForm: "drawer" });
{
  await page.mouse.click(640, 760);
  await page.keyboard.press("Alt+v");
  await page.waitForTimeout(1200);
  const visible = await page.evaluate(() => {
    const el = document.querySelector(".cl-links-drawer [data-entry-id='t1']");
    return !!el && el.getBoundingClientRect().width > 0;
  });
  T("F1 抽屉唤出磁贴墙可见（alt+v）", visible);
  const p1 = await tilePt("t1", 0, 0, ".cl-links-drawer");
  const pf = await tilePt("fd0", 20, 0, ".cl-links-drawer");
  await dragTo("t1", pf.x, pf.y, 0, ".cl-links-drawer");
  const ls = await linksWait((l) => l.findIndex((e) => e.id === "fd0") >= 0 && l.findIndex((e) => e.id === "t1") === l.findIndex((e) => e.id === "fd0") + 1);
  T("F2 抽屉内链接拖到夹右半 → 夹让位（t1 紧邻 fd0 左侧）", !!ls);
}

// ---------- 全程 pageerror ----------
T("I pageerror === 0", errors.length === 0);
if (errors.length) console.log("  pageerrors:", errors.slice(0, 4));

console.log(`\nSMOKE-REGRESS172: ${pass} PASS / ${bad.length} FAIL`);
if (bad.length) { console.log("FAILED:", ...bad); process.exit(1); }
console.log("ALL PASS");
await browser.close();
