// repro-folder-area.mjs — v8.7.175 入夹面积律（≥2/3 重叠判定入夹）E2E
// 断言全走 DOM 直读（内存态即时反映，绕开 useStoredDeferred 写盘竞态）
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = process.env.REG_ZIP || "/home/z/beta-wt/download/v8.7.174/ChuShi-NewTab-v8.7.174.zip";
const STAGE = "/tmp/ext-fa";
const PROFILE = "/tmp/ext-fa-profile";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";

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
const seedSet = () => page.evaluate(([links]) => {
  localStorage.setItem("start:links", links);
  localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "favicon", linksForm: "docked" }));
}, [LINKS]);
/** 两段式重种：先 reload 冲掉上一场景的 deferred pagehide 落盘（旧态会
 *  晚于种子写入覆盖种），再落种 reload 干净起场；末尾校验墙序兜底重试 */
const reseed = async () => {
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1200);
  await seedSet();
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2000);
  let ids = await wallIds();
  if (ids.join(",") !== "t1,t2,fd0,fd9") {
    await seedSet();
    await page.reload({ waitUntil: "load" });
    await page.waitForTimeout(2000);
    ids = await wallIds();
  }
  return ids.join(",");
};

const wallIds = () => page.evaluate(() => [...document.querySelectorAll("[data-entry-id]")].map((e) => e.getAttribute("data-entry-id")));
async function domWait(pred, budget = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < budget) {
    if (await pred()) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

async function tilePt(id, dx = 0, dy = 0) {
  const a = await page.locator(`[data-entry-id="${id}"]`).first().boundingBox();
  if (!a) return null;
  return { x: a.x + a.width / 2 + dx, y: a.y + Math.min(28, a.height / 2) + dy, box: a };
}
/** 拖 from 图标中心 → 绝对点 (x,y)：10 步渐进 + hoverMs 悬停（±1px 微动
 *  保持 dragOver/dragMove 事件流——静止悬停无事件，军备续接链哑火） */
async function dragTo(fromId, x, y, hoverMs = 0) {
  const p0 = await tilePt(fromId);
  if (!p0) return false;
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(p0.x + ((x - p0.x) * i) / 10, p0.y + ((y - p0.y) * i) / 10);
    await page.waitForTimeout(28);
  }
  if (hoverMs) {
    const t0 = Date.now();
    let flip = 1;
    while (Date.now() - t0 < hoverMs) {
      await page.mouse.move(x + flip, y);
      flip = -flip;
      await page.waitForTimeout(120);
    }
  }
  await page.mouse.up();
  await page.waitForTimeout(900);
  return true;
}

let pass = 0;
const bad = [];
const T = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { bad.push(name); console.log(`  [FAIL] ${name}${detail ? " | " + detail : ""}`); }
};

await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1800);
await reseed();
const tw = (await tilePt("fd0")).box.width;
console.log("tile width:", Math.round(tw), "| 初始墙:", (await wallIds()).join(","));

/* A. 小重叠（dx=+0.42W → 比率≈0.58 <2/3）：右半让位排序，不入夹 */
if ((process.env.SCEN || "") !== "C") {
  try {
    const t = await tilePt("fd0", Math.round(tw * 0.42), 0);
    await dragTo("t2", t.x, t.y);
    const ids = await wallIds();
    T("A1 小重叠不入夹（t2 仍在墙）", ids.includes("t2"), ids.join(","));
  } catch (e) { T("A1 小重叠不入夹", false, e.message.split("\n")[0]); }
}

/* B. ≥2/3 重叠（dx=中心−20 → 右侧 2/3 压夹，旧口径此处是「右半让位」）：
   面积律 → 入夹意图，军备后飞入落账 */
if ((process.env.SCEN || "") !== "C") {
  await reseed();
  try {
    const t = await tilePt("fd0", -Math.round(tw / 4), 0);
    await dragTo("t2", t.x, t.y, 900);
    const bIn = await domWait(async () => !(await wallIds()).includes("t2"));
    const bIds = await wallIds();
    T("B1 ≥2/3 重叠入夹（t2 摘墙入夹甲）", bIn, bIds.join(","));
  } catch (e) { T("B1 ≥2/3 重叠入夹", false, e.message.split("\n")[0]); }
}

/* C. 完全覆盖（dx=0）：入夹（正统中心入夹路径回归） */
await reseed();
try {
  const t = await tilePt("fd0", 0, 0);
  await dragTo("t2", t.x, t.y, 900);
  const cIn = await domWait(async () => !(await wallIds()).includes("t2"));
  const cIds = await wallIds();
  T("C1 完全覆盖入夹（t2 摘墙入夹甲）", cIn, cIds.join(","));
} catch (e) { T("C1 完全覆盖入夹", false, e.message.split("\n")[0]); }

/* D. 夹×夹豁免（fd9 ≥2/3 压 fd0）：实时让位排序，不吞并 */
await reseed();
try {
  const t = await tilePt("fd0", -Math.round(tw / 4), 0);
  await dragTo("fd9", t.x, t.y, 900);
  const ids = await wallIds();
  T("D1 夹×夹不吞并（fd9 仍在墙）", ids.includes("fd9"), ids.join(","));
} catch (e) { T("D1 夹×夹不吞并", false, e.message.split("\n")[0]); }

console.log("pageerrors:", errors.slice(0, 6));
console.log(`FOLDER-AREA: ${pass} PASS / ${bad.length} FAIL`);
if (bad.length) { console.log("FAILED:", ...bad); process.exit(1); }
console.log("ALL PASS");
await browser.close();
