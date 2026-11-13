// smoke-regress169.mjs — v8.7.169 继承回归（163/161/160 核心 fix + 壳层）
// R1 index 直开零 pageerror   R2 shell.html 壳路由 boot
// R3 设置面板渲染             R4 更新日志弹窗头插 8.7.169
// R5 指令面板 ⌘K             R6 morph 开合还原
// R7 inline 收起零重播（163 fix①）  R8 modal 遮罩三件套
// R9 拖文件夹实时让位         R10 同夹内排序
// R12 grid3 留白律（163 fix② 与 165 方形律共存）
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.169/ChuShi-NewTab-v8.7.169.zip";
const STAGE = "/tmp/ext-reg169";
const PROFILE = "/tmp/ext-reg169-profile";
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

async function dragTile(fromId, toId, hoverMs = 0) {
  const a = await page.locator(`[data-entry-id="${fromId}"]`).boundingBox();
  const b = await page.locator(`[data-entry-id="${toId}"]`).boundingBox();
  if (!a || !b) return false;
  const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2, by = b.y + b.height / 2;
  await page.mouse.move(ax, ay);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(ax + ((bx - ax) * i) / 10, ay + ((by - ay) * i) / 10);
    await page.waitForTimeout(28);
  }
  if (hoverMs) await page.waitForTimeout(hoverMs);
  await page.mouse.up();
  await page.waitForTimeout(600);
  return true;
}

// ---------- R1 index 直开 ----------
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1500);
await reseed();
T("R1 index 直开磁贴墙渲染", (await page.locator('[data-entry-id="t1"]').count()) === 1);

// ---------- R2 shell 壳路由 ----------
{
  await page.goto(`chrome-extension://${extId}/shell.html`, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(2500);
  const shellBoot = await page.evaluate(() => !!document.querySelector("iframe"));
  T("R2 shell.html 壳 iframe 路由在位", shellBoot);
}

// ---------- R3/R4 设置面板 + 更新日志 ----------
{
  await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await reseed();
  // 指令面板 ⌘K（R5 先做——设置入口在指令面板里）
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(700);
  const cmdOpen = await page.evaluate(() => !!document.querySelector("[data-cl-cmdk], .cl-cmdk, [role=dialog]"));
  T("R5 指令面板 ⌘K 打开", cmdOpen);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  // 设置面板（dock 齿轮 or 右键菜单——用 dock 按钮泛找）
  const btn = page.locator('[aria-label*="设置"], [data-cl-dock-settings], button:has-text("设置")').first();
  if ((await btn.count()) > 0) {
    await btn.click();
    await page.waitForTimeout(800);
    const panel = await page.evaluate(() => !!document.querySelector("[data-cl-settings], [role=dialog]"));
    T("R3 设置面板打开", panel);
    // 更新日志
    const logBtn = page.locator('button:has-text("更新日志"), [data-cl-changelog-btn]').first();
    if ((await logBtn.count()) > 0) {
      await logBtn.click();
      await page.waitForTimeout(600);
      const head = await page.evaluate(() => document.body.innerText.includes("8.7.169"));
      T("R4 更新日志首条 8.7.169", head);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    } else {
      T("R4 更新日志入口未找到（面板结构变动，人工核）", false);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  } else {
    T("R3 设置入口未找到（dock 结构变动，人工核）", false);
    T("R4 更新日志（依赖设置面板，跳过）", false);
  }
}

// ---------- R6 morph 开合（默认形态） ----------
{
  await reseed();
  await page.locator('[data-entry-id="fd0"]').click();
  await page.waitForTimeout(1000);
  const opened = await page.evaluate(() => !!document.querySelector("[data-cl-folder-popover]"));
  T("R6a morph 白卡展开", opened);
  await page.mouse.click(40, 860); // 点空白收起（点磁贴会真实打开链接离开扩展页）
  await page.waitForTimeout(900);
  const closed = await page.evaluate(() => !document.querySelector("[data-cl-folder-popover]"));
  T("R6b 点空白收起全退场", closed);
}

// ---------- R7 inline 收起零重播 ----------
{
  await reseed({ folderOpenStyle: "inline" });
  await page.locator('[data-entry-id="fd0"]').click();
  await page.waitForTimeout(1100);
  const inlined = await page.evaluate(() => !!document.querySelector("[data-cl-folder-inline]"));
  T("R7a inline 膨胀卡在位", inlined);
  // 点空白收起
  await page.mouse.click(40, 860);
  await page.waitForTimeout(1000);
  const restored = await page.evaluate(() => {
    const tile = document.querySelector('[data-entry-id="fd0"] .tile-shell');
    if (!tile) return null;
    const anims = tile.getAnimations({ subtree: true }).filter((a) => a.playState === "running");
    const cs = getComputedStyle(tile);
    return { opacity: cs.opacity, runningAnims: anims.length };
  });
  T("R7b 收起还原磁贴在位且零入场动画重播", !!restored && restored.opacity === "1" && restored.runningAnims === 0);
  await reseed();
}

// ---------- R8 modal 三件套 ----------
{
  await reseed({ folderOpenStyle: "modal" });
  await page.locator('[data-entry-id="fd0"]').click();
  await page.waitForTimeout(900);
  const m = await page.evaluate(() => ({
    mask: !!document.querySelector("[data-cl-folder-modal]"),
    pop: !!document.querySelector("[data-cl-folder-popover]"),
  }));
  T("R8a modal 遮罩+白卡在位", m.mask && m.pop);
  await page.mouse.click(40, 860);
  await page.waitForTimeout(800);
  const gone = await page.evaluate(() => !document.querySelector("[data-cl-folder-modal]"));
  T("R8b 点遮罩全卸", gone);
  await reseed();
}

// ---------- R9 拖文件夹实时让位 ----------
{
  await reseed();
  const ok = await dragTile("fd0", "fd9", 0);
  await page.waitForTimeout(700);
  const links = await page.evaluate(() => JSON.parse(localStorage.getItem("start:links") ?? "[]"));
  const i0 = links.findIndex((e) => e.id === "fd0");
  const i9 = links.findIndex((e) => e.id === "fd9");
  T("R9 拖文件夹实时让位换序", ok && i9 < i0);
}

// ---------- R10 同夹内排序 ----------
{
  await reseed();
  await page.locator('[data-entry-id="fd0"]').click();
  await page.waitForTimeout(1000);
  const ok = await dragTile("a1", "a3", 0);
  await page.waitForTimeout(700);
  const links = await page.evaluate(() => JSON.parse(localStorage.getItem("start:links") ?? "[]"));
  const fd0 = links.find((e) => e.id === "fd0");
  const ids = fd0?.children.map((c) => c.id) ?? [];
  T("R10 同夹内拖拽排序（a1 → a3 位）", ok && ids[2] === "a1" && ids.length === 5);
}

// ---------- R12 grid3 留白律 + 方形律共存 ----------
{
  await reseed({ folderIconStyle: "grid3" });
  const g = await page.evaluate(() => {
    const grid = document.querySelector('[data-entry-id="fd0"] [data-cl-folder-grid]');
    if (!grid) return null;
    const cells = [...grid.children].map((el) => {
      const b = el.getBoundingClientRect();
      return { w: b.width, h: b.height };
    });
    return { n: cells.length, square: cells.every((c) => Math.abs(c.w - c.h) <= 0.6), gridClass: grid.className };
  });
  T("R12 grid3 五站夹 5 格全方（留白不补占位）", !!g && g.n === 5 && g.square);
  await reseed();
}

T("I pageerror === 0", errors.length === 0);
if (errors.length) console.log("  pageerrors:", errors.slice(0, 3));

await browser.close();
console.log(`\nREGRESS165: ${pass} PASS / ${bad.length} FAIL ${bad.length ? "— " + bad.join(" | ") : "ALL PASS"}`);
process.exit(bad.length ? 1 : 0);
