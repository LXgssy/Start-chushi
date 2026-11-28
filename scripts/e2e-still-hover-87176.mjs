// e2e-still-hover.mjs — v8.7.176 入夹判定「静止悬停」回归（Task 195）
// 用户口径：磁贴站点图标悬停在文件夹上，文件夹有概率反应不过来。根因三处：
//   ① move 侧让位分支不受 ≥2/3 入夹意图闸控（停在夹中心右侧 12~27px 必被让位抽走）
//   ② 判定矩形用「指针居中」近似，抓取偏移不入账
//   ③ over 吃会跳变的 translated 矩形，指针静止时也会翻走 → 宽限兜底抹军备
// 全程不加微动（真实用户手停即静）。断言全走 DOM 直读。
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = process.env.REG_ZIP || "/tmp/ext-176.zip";
const STAGE = "/tmp/ext-sh";
const PROFILE = "/tmp/ext-sh-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";
const ONLY = process.env.ONLY || "";

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
const WALL = "t1,t2,fd0,t3,fd9";
const LINKS = JSON.stringify([
  { id: "t1", name: "甲站", url: "https://t1.example.com" },
  { id: "t2", name: "乙站", url: "https://t2.example.com" },
  { id: "fd0", name: "夹甲", folder: true, children: mk(5, "a", "站") },
  { id: "t3", name: "丙站", url: "https://t3.example.com" },
  { id: "fd9", name: "夹乙", folder: true, children: mk(4, "b", "乙") },
]);
const seedSet = () => page.evaluate(([links]) => {
  localStorage.setItem("start:links", links);
  localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "favicon", linksForm: "docked" }));
}, [LINKS]);
const wallIds = () => page.evaluate(() => [...document.querySelectorAll("[data-entry-id]")].map((e) => e.getAttribute("data-entry-id")));
async function domWait(pred, budget = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < budget) {
    if (await pred()) return true;
    await page.waitForTimeout(200);
  }
  return false;
}
async function reseed() {
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1000);
  await seedSet();
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1800);
  let ids = await wallIds();
  if (ids.join(",") !== WALL) {
    await seedSet();
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(1800);
    ids = await wallIds();
  }
  return ids.join(",");
}
const geo = (id) => page.evaluate((i) => {
  const el = document.querySelector(`[data-entry-id="${i}"]`);
  const sh = el?.querySelector(".tile-shell");
  const r = (b) => (b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null);
  return { box: r(el?.getBoundingClientRect()), icon: r(sh?.getBoundingClientRect()) };
}, id);
const hintOn = (id) => page.evaluate((i) => {
  const sh = document.querySelector(`[data-entry-id="${i}"] .tile-shell`);
  return !!sh?.parentElement?.classList.contains("scale-[1.12]");
}, id);

/** 静止拖拽：从 fromId 图标壳的 (gx,gy) 抓起 → 12 步渐进到指针终位 → 一动不动悬停
 *  hoverMs → 读反馈/墙序 → 松手。dx/dy = 拖拽图标中心相对夹图标中心的落点偏移。 */
async function dragStill(fromId, toId, gx, gy, dx, dy, hoverMs = 1000, steps = 12) {
  const g = await geo(fromId);
  const f = await geo(toId);
  const sx = g.icon.x + gx;
  const sy = g.icon.y + gy;
  const px = f.icon.x + f.icon.w / 2 + dx + (gx - g.icon.w / 2);
  const py = f.icon.y + f.icon.h / 2 + dy + (gy - g.icon.h / 2);
  await page.mouse.move(sx, sy);
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.waitForTimeout(60);
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(sx + ((px - sx) * i) / steps, sy + ((py - sy) * i) / steps);
    await page.waitForTimeout(24);
  }
  await page.waitForTimeout(hoverMs);
  const hint = await hintOn(toId);
  const wallHover = (await wallIds()).join(",");
  await page.mouse.up();
  await page.waitForTimeout(500);
  await domWait(async () => !(await wallIds()).includes(fromId), 3000);
  await page.waitForTimeout(500);
  const wallEnd = (await wallIds()).join(",");
  return { hint, wallHover, wallEnd, entered: !wallEnd.split(",").includes(fromId) };
}

let pass = 0;
const bad = [];
const T = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { bad.push(name); console.log(`  [FAIL] ${name}${detail ? " | " + detail : ""}`); }
};
const want = (tag) => !ONLY || ONLY.split(",").includes(tag);

await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1800);
await reseed();
const g0 = await geo("t2");
const f0 = await geo("fd0");
const IW = g0.icon.w;
const IH = g0.icon.h;
const WW = f0.box.w;
const GRABS = [["左缘", 8], ["正中", IW / 2], ["右缘", IW - 8]];
console.log(`tile ${WW}x${f0.box.h} icon ${IW}x${IH} | 初始墙: ${await reseed()}`);
console.log(`入夹带：图标中心偏离夹中心 |dx| ≤ ${(WW / 3).toFixed(1)}px（=2/3 压夹）；左半粘滞同入夹；右半 <2/3 让位不入夹`);

/* S1 左侧靠近 × 抓取点 × 落点：≥2/3 带与左半全部入夹且不让位 */
if (want("S1")) {
  console.log("S1 左侧靠近静止悬停矩阵");
  for (const [gname, gx] of GRABS) {
    for (const dx of [-32, -24, -8, 0, 8, 14, 24]) {
      await reseed();
      const r = await dragStill("t2", "fd0", gx, IH / 2, dx, 0);
      T(`S1 抓${gname} dx=${dx} 亮反馈+入夹+不让位`, r.hint && r.entered && r.wallHover === WALL, `hint=${r.hint} entered=${r.entered} hover=${r.wallHover} end=${r.wallEnd}`);
    }
  }
}

/* S2 右半 <2/3（dx=+32，重叠 60%）：排序意图——不亮、不入夹、让位到夹后 */
if (want("S2")) {
  console.log("S2 右半 <2/3 让位");
  for (const [gname, gx] of GRABS) {
    await reseed();
    const r = await dragStill("t2", "fd0", gx, IH / 2, 32, 0);
    T(`S2 抓${gname} dx=+32 不亮+不入夹+让位`, !r.hint && !r.entered && r.wallEnd === "t1,fd0,t2,t3,fd9", `hint=${r.hint} entered=${r.entered} hover=${r.wallHover} end=${r.wallEnd}`);
  }
}

/* S3 右侧靠近（t3 从右往左压到 fd0）：旧版从右进 ≥2/3 带永不起计时 */
if (want("S3")) {
  console.log("S3 右侧靠近静止悬停");
  for (const [gname, gx] of GRABS) {
    for (const dx of [24, 8, -20]) {
      await reseed();
      const r = await dragStill("t3", "fd0", gx, IH / 2, dx, 0);
      T(`S3 抓${gname} dx=${dx} 亮反馈+入夹`, r.hint && r.entered && r.wallEnd === "t1,t2,fd0,fd9", `hint=${r.hint} entered=${r.entered} hover=${r.wallHover} end=${r.wallEnd}`);
    }
  }
}

/* S4 竖向偏移（图标压低/抬高 30px 仍同行）：行对齐口径入夹 */
if (want("S4")) {
  console.log("S4 竖向偏移");
  for (const dy of [30, -30]) {
    await reseed();
    const r = await dragStill("t2", "fd0", IW / 2, IH / 2, 0, dy);
    T(`S4 dy=${dy} 亮反馈+入夹`, r.hint && r.entered, `hint=${r.hint} entered=${r.entered} end=${r.wallEnd}`);
  }
}

/* S5 夹×夹豁免：fd9 ≥2/3 压 fd0 → 实时让位排序，不吞并不亮反馈 */
if (want("S5")) {
  console.log("S5 夹×夹");
  await reseed();
  const g9 = await geo("fd9");
  const r = await dragStill("fd9", "fd0", g9.icon.w / 2, g9.icon.h / 2, -20, 0);
  T("S5 夹×夹不吞并不亮反馈", !r.entered && !r.hint && r.wallEnd.split(",").includes("fd0"), `hint=${r.hint} end=${r.wallEnd}`);
}

/* S6 未满 0.5s 松手：不入夹、墙序不变 */
if (want("S6")) {
  console.log("S6 短驻留");
  await reseed();
  /* 驻留从 over 首次翻到本夹起算（左侧靠近在中线即翻，含进场路程）——
     3 步快进到场即松手，在场总时长 ≈100ms（12 步进场 + 200ms 悬停 ≈450ms
     贴 0.5s 阈值，负载抖动下会假失败） */
  const r = await dragStill("t2", "fd0", IW / 2, IH / 2, 0, 0, 0, 3);
  T("S6 到场即松手（<0.5s）不入夹", !r.hint && !r.entered && r.wallEnd === WALL, `hint=${r.hint} end=${r.wallEnd}`);
}

/* S7 军备后滑出 2/3 带：反馈熄灭、松手不入夹（右半让位照旧） */
if (want("S7")) {
  console.log("S7 军备后滑出");
  await reseed();
  const g = await geo("t2");
  const sx = g.icon.x + IW / 2;
  const sy = g.icon.y + IH / 2;
  const cxA = f0.icon.x + f0.icon.w / 2;
  const cy = f0.icon.y + f0.icon.h / 2;
  await page.mouse.move(sx, sy);
  await page.waitForTimeout(150);
  await page.mouse.down();
  await page.waitForTimeout(60);
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(sx + ((cxA - sx) * i) / 12, sy);
    await page.waitForTimeout(24);
  }
  await page.waitForTimeout(750);
  const hintA = await hintOn("fd0");
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(cxA + (36 * i) / 8, cy);
    await page.waitForTimeout(24);
  }
  await page.waitForTimeout(450);
  const hintB = await hintOn("fd0");
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const wall = (await wallIds()).join(",");
  T("S7 军备后滑到 dx=+36：反馈先亮后灭", hintA && !hintB, `hintA=${hintA} hintB=${hintB}`);
  T("S7 滑出后松手不入夹（t2 留墙）", wall.split(",").includes("t2"), wall);
}

/* S8 重复试验（概率性复现）：正中/右偏 20px 各 5 次，抓正中与抓右缘交替 */
if (want("S8")) {
  console.log("S8 重复试验");
  for (let i = 0; i < 5; i++) {
    for (const [label, gx, dx] of [["正中dx0", IW / 2, 0], ["右缘dx+20", IW - 8, 20]]) {
      await reseed();
      const r = await dragStill("t2", "fd0", gx, IH / 2, dx, 0);
      T(`S8 #${i + 1} 抓${label} 亮反馈+入夹`, r.hint && r.entered, `hint=${r.hint} entered=${r.entered} hover=${r.wallHover} end=${r.wallEnd}`);
    }
  }
}

/* S9 指针落在夹图标正中、抓取点偏左/右（图标实际偏右/左 20px，仍在 2/3 带） */
if (want("S9")) {
  console.log("S9 指针居中抓取偏移");
  for (const [gname, gx] of [["左缘", 8], ["右缘", IW - 8]]) {
    await reseed();
    /* 指针落在夹图标正中 ⟺ 图标中心相对夹中心偏 −(抓取点偏移) = IW/2 − gx */
    const r = await dragStill("t2", "fd0", gx, IH / 2, IW / 2 - gx, 0);
    T(`S9 抓${gname} 指针居中 亮反馈+入夹`, r.hint && r.entered, `hint=${r.hint} entered=${r.entered}`);
  }
}

console.log("pageerrors:", errors.slice(0, 6));
console.log(`STILL-HOVER-176: ${pass} PASS / ${bad.length} FAIL`);
if (bad.length) { console.log("FAILED:", ...bad); await browser.close(); process.exit(1); }
console.log("ALL PASS");
await browser.close();
