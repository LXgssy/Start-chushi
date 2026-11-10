// smoke-v87162.mjs — v8.7.162 真扩展冒烟（核心：迷你格形状统一律 object-cover + 161 双形态全回归）
// 门A 真 zip 解包 → --load-extension 加载
// 门S 形状统一（用户反馈「图标形状不统一，应该全是正方形」）：
//     混夹 = 宽版自定义图标站（64×32 data URL）+ 宽版 favicon 站（记忆源 64×32）+ 字母站
//     → 迷你格 img 计算样式 object-fit=cover；img 盒正方形（w==h）；
//       上传图标与站点图标同尺寸 16px；morph 皮层 img 同律；展开面板磁贴保持 contain（范围锁定）
// 门G2 grid2 默认回归：5 站夹 = 2×2 的 3 图标 + 「+2」；10 站夹 = 3 图标 + 「+7」
// 门G3 grid3 三排微缩墙：5 站夹 = 5 图标 + 4 淡占位；10 站夹 = 8 图标 + 「+2」
// 门G4 morph skin 联动：皮层 3×3 九格同源；白卡覆盖磁贴本体；收起还原
// 门G5 grid2 计数收敛不变
// 门M modal 回归：遮罩在场 + 白卡 + 点遮罩全卸
// 门I pageerror === 0
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.162/ChuShi-NewTab-v8.7.162.zip";
const STAGE = "/tmp/ext-smoke-v87162";
const PROFILE = "/tmp/ext-profile-v87162";
const CHROME = "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";
const OUT = "/home/z/beta-wt/download/v8.7.162";
const WIDE = JSON.parse(fs.readFileSync("/tmp/wide-icons.json", "utf8"));
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
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launchPersistentContext(PROFILE, {
  executablePath: CHROME,
  args: ["--no-sandbox", `--disable-extensions-except=${STAGE}`, `--load-extension=${STAGE}`],
  viewport: { width: 1280, height: 900 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
console.log("extension id:", extId);

const page = browser.pages()[0] || (await browser.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1200);

// ---------- 种入：fd0 混夹（形状统一主战场）+ fd1 常用 5 站 + fd2 满夹 10 站 ----------
const children5 = ["c1","c2","c3","c4","c5"].map((id, i) => ({
  id, name: "站" + (i + 1), url: `https://s${i + 1}.example.com`,
}));
const children10 = Array.from({ length: 10 }, (_, i) => ({
  id: "d" + (i + 1), name: "满" + (i + 1), url: `https://f${i + 1}.example.com`,
}));
const childrenMix = [
  { id: "w1", name: "宽自定义", url: "https://ciwide.example.com" },
  { id: "w2", name: "宽favicon", url: "https://fw.example.com" },
  { id: "w3", name: "字母站", url: "https://letter.example.com" },
];
const LINKS_SEED = JSON.stringify([
  { id: "t1", name: "GitHub", url: "https://github.com" },
  { id: "t2", name: "哔哩哔哩", url: "https://www.bilibili.com" },
  { id: "t3", name: "知乎", url: "https://www.zhihu.com" },
  { id: "t4", name: "微博", url: "https://weibo.com" },
  { id: "fd0", name: "混夹", folder: true, children: childrenMix },
  { id: "fd1", name: "常用", folder: true, children: children5 },
  { id: "fd2", name: "满夹", folder: true, children: children10 },
]);
const seed = (opts = {}) =>
  page.evaluate(([links, st, icons, favsrc]) => {
    localStorage.setItem("start:settings", st);
    localStorage.setItem("start:links", links);
    if (icons) localStorage.setItem("start:custom-icons", icons);
    if (favsrc) localStorage.setItem("favicon-src2:fw.example.com", favsrc);
  }, [
    LINKS_SEED,
    JSON.stringify({ iconStyle: "letter", linksForm: "docked", ...opts }),
    JSON.stringify({ "ciwide.example.com": WIDE.red }),
    WIDE.blue,
  ]);

// ---------- 门S：形状统一律（iconStyle=favicon 让宽 favicon 走 img 分支） ----------
// 注：favicon.im 对任意 host 都有兜底图，字母站也会解析出 img——故断言
// 「全部 img 正方形+等尺寸+cover」的强均匀律，而非枚举 img 数
await seed({ iconStyle: "favicon" });
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2400);
{
  const grid = page.locator('[data-entry-id="fd0"] [data-cl-folder-grid]');
  const imgs = grid.locator("img");
  const nImg = await imgs.count();
  T("S1 混夹迷你格 ≥2 枚图片格（宽自定义+宽favicon 已入格）", nImg >= 2);
  const fits = await imgs.evaluateAll((els) => els.map((e) => getComputedStyle(e).objectFit));
  T("S2 迷你格全部 img object-fit=cover", nImg >= 2 && fits.every((f) => f === "cover"));
  const boxes = await imgs.evaluateAll((els) =>
    els.map((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
  T("S3 每个 img 盒正方形（w==h）", boxes.length >= 2 && boxes.every(([w, h]) => Math.abs(w - h) <= 0.5));
  const w0 = boxes[0]?.[0] ?? 0;
  T("S4 迷你格 img 等尺寸（上传图标与站点图标同大小）",
    boxes.length >= 2 && boxes.every(([w]) => Math.abs(w - w0) <= 0.5));
  // 范围锁定：morph 皮层是 solid-card 子元素，内容层是其兄弟——分别断言
  await page.locator('[data-entry-id="fd0"]').click();
  await page.waitForTimeout(1100);
  const skinImg = page.locator("[data-cl-folder-morph-preview] img").first();
  T("S5 morph 皮层迷你格同律 cover",
    (await skinImg.count()) >= 1 && (await skinImg.evaluate((e) => getComputedStyle(e).objectFit)) === "cover");
  const contentFits = await page.evaluate(() => {
    const pop = document.querySelector("[data-cl-folder-popover]");
    if (!pop) return null;
    return [...pop.querySelectorAll("img")]
      .filter((e) => !e.closest("[data-cl-folder-morph-preview]"))
      .map((e) => getComputedStyle(e).objectFit);
  });
  T("S6 展开面板磁贴图标保持 contain（全局磁贴设计范围锁定）",
    Array.isArray(contentFits) && contentFits.length >= 2 && contentFits.every((f) => f === "contain"));
  await page.screenshot({ path: `${OUT}/preview-morph-mixed-open.png` });
  await page.mouse.click(640, 60);
  await page.waitForTimeout(800);
  // 磁贴特写：形状统一肉眼核
  const tb = await page.locator('[data-entry-id="fd0"]').boundingBox();
  if (tb) await page.screenshot({ path: `${OUT}/preview-tile-grid2-mixed.png`,
    clip: { x: tb.x - 12, y: tb.y - 12, width: tb.width + 24, height: tb.height + 24 } });
}

// ---------- 门G2：grid2 默认（老数据零迁移，观感=v8.7.157 现状） ----------
await seed({});
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2000);
{
  const g1 = page.locator('[data-entry-id="fd1"] [data-cl-folder-grid]');
  const g2 = page.locator('[data-entry-id="fd2"] [data-cl-folder-grid]');
  T("G2.1 fd1 网格 2×2", ((await g1.getAttribute("class")) || "").includes("grid-cols-2"));
  T("G2.2 fd1 5 站 = 3 图标 + 「+2」", (await g1.locator("> span").count()) === 4);
  T("G2.3 fd1 计数 +2", ((await g1.locator("> span").last().innerText()) || "").trim() === "+2");
  T("G2.4 fd2 10 站 = 3 图标 + 「+7」", (await g2.locator("> span").count()) === 4);
  T("G2.5 fd2 计数 +7", ((await g2.locator("> span").last().innerText()) || "").trim() === "+7");
}

// ---------- 门G3：切 grid3 三排微缩墙（favicon 风格让混夹出多枚 img 供形状断言） ----------
await seed({ iconStyle: "favicon", folderIconStyle: "grid3" });
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2600);
{
  const g1 = page.locator('[data-entry-id="fd1"] [data-cl-folder-grid]');
  const g2 = page.locator('[data-entry-id="fd2"] [data-cl-folder-grid]');
  const g0 = page.locator('[data-entry-id="fd0"] [data-cl-folder-grid]');
  T("G3.1 fd1 网格 3×3", ((await g1.getAttribute("class")) || "").includes("grid-cols-3"));
  T("G3.2 fd1 5 站 = 5 图标 + 4 空位占位", (await g1.locator("> span").count()) === 9);
  T("G3.3 fd1 无计数格（未超 8 站）", ((await g1.innerText()) || "").includes("+") === false);
  T("G3.4 fd2 网格 3×3", ((await g2.getAttribute("class")) || "").includes("grid-cols-3"));
  T("G3.5 fd2 10 站 = 8 图标 + 「+2」", (await g2.locator("> span").count()) === 9);
  T("G3.6 fd2 计数 +2", ((await g2.locator("> span").last().innerText()) || "").trim() === "+2");
  // grid3 形状统一同律（全部 img cover）
  const fits0 = await g0.locator("img").evaluateAll((els) => els.map((e) => ({
    fit: getComputedStyle(e).objectFit,
    src: (e.getAttribute("src") || "").slice(0, 24),
    w: Math.round(e.getBoundingClientRect().width * 10) / 10,
    h: Math.round(e.getBoundingClientRect().height * 10) / 10,
  })));
  console.log("  g0 imgs 实况:", JSON.stringify(fits0));
  T("G3.7 grid3 混夹 img 同律 cover", fits0.length >= 2 && fits0.every((f) => f.fit === "cover" && Math.abs(f.w - f.h) <= 0.5));
  await page.screenshot({ path: `${OUT}/preview-wall-grid3-mixed.png` });
}

// ---------- 门G4：morph skin 联动 + 覆盖式展开 + 收起还原 ----------
{
  const fdTile = page.locator('[data-entry-id="fd1"]');
  await fdTile.click();
  await page.waitForTimeout(700);
  const pop = page.locator("[data-cl-folder-popover]");
  T("G4.1 popover 挂载", (await pop.count()) === 1);
  const skin = page.locator("[data-cl-folder-morph-preview]");
  T("G4.2 morph 皮层在场", (await skin.count()) === 1);
  const skinGrid = skin.locator(".grid").first();
  T("G4.3 皮层 3×3 同源跟随", ((await skinGrid.getAttribute("class")) || "").includes("grid-cols-3"));
  T("G4.4 皮层九格", (await skinGrid.locator("> span").count()) === 9);

  // v8.7.160 M1 回归：白卡覆盖磁贴本体（磁贴中心点落在白卡 rect 内）
  const card = pop.locator(".solid-card").first();
  const cb = await card.boundingBox();
  const tb = await fdTile.boundingBox();
  T("G4.5 白卡在场", !!cb && !!tb);
  if (cb && tb) {
    const cx = tb.x + tb.width / 2, cy = tb.y + tb.height / 2;
    T("G4.6 磁贴中心被白卡覆盖（上层展开）",
      cx >= cb.x && cx <= cb.x + cb.width && cy >= cb.y && cy <= cb.y + cb.height);
    T("G4.7 白卡面积大于磁贴（形变长大）", cb.width * cb.height > tb.width * tb.height * 2);
  }

  const inner = pop.locator('[data-entry-id="c1"]');
  T("G4.8 夹内站点可见", (await inner.count()) === 1);

  await page.mouse.click(640, 60);
  await page.waitForTimeout(800);
  T("G4.9 收起 popover 全卸", (await pop.count()) === 0);
  const g1back = page.locator('[data-entry-id="fd1"] [data-cl-folder-grid]');
  T("G4.10 磁贴还原 3×3", ((await g1back.getAttribute("class")) || "").includes("grid-cols-3"));
}

// ---------- 门G5：切回 grid2 观感复原 ----------
await seed({});
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(1800);
{
  const g1 = page.locator('[data-entry-id="fd1"] [data-cl-folder-grid]');
  T("G5.1 切回 grid2 生效", ((await g1.getAttribute("class")) || "").includes("grid-cols-2"));
  T("G5.2 子格数回 4", (await g1.locator("> span").count()) === 4);
}

// ---------- 门M：modal 回归（folderIconStyle 与 openStyle 正交组合） ----------
await seed({ folderOpenStyle: "modal", folderIconStyle: "grid3" });
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2000);
{
  const g2 = page.locator('[data-entry-id="fd2"] [data-cl-folder-grid]');
  T("M0 组合生效：modal+grid3", ((await g2.getAttribute("class")) || "").includes("grid-cols-3"));
  await page.locator('[data-entry-id="fd2"]').click();
  await page.waitForTimeout(700);
  const modal = page.locator("[data-cl-folder-modal]");
  T("M1 遮罩在场", (await modal.count()) === 1);
  T("M2 白卡居中", (await page.locator("[data-cl-folder-popover] .solid-card").count()) === 1);
  await modal.click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(700);
  T("M3 点遮罩全卸", (await page.locator("[data-cl-folder-popover]").count()) === 0);
}

T("I1 pageerror === 0", errors.length === 0);
if (errors.length) console.log("  pageerrors:", errors.slice(0, 3));

console.log(`\nSMOKE ${pass}/${pass + bad.length} ` + (bad.length ? "HAS RED: " + bad.join(" | ") : "ALL PASS"));
await browser.close();
process.exit(bad.length ? 1 : 0);
