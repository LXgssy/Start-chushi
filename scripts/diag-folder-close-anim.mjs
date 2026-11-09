// diag-folder-close-anim.mjs — 文件夹三形态动画问题诊断（录帧实测，v2 干净时序）
// 每形态独立 reload：打开 → 120/240/840ms 采夹内磁贴（②入场动画）
//   → 700ms 采白卡 rect vs 磁贴 rect（③定位）→ 点空白收起 → 40ms×12 录帧（①收起动画）
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.160/ChuShi-NewTab-v8.7.160.zip";
const STAGE = "/tmp/ext-diag-fca";
const PROFILE = "/tmp/ext-diag-fca-profile2";
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
page.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1200);

const LINKS_SEED = JSON.stringify([
  { id: "t1", name: "GitHub", url: "https://github.com" },
  { id: "t2", name: "哔哩哔哩", url: "https://www.bilibili.com" },
  { id: "t3", name: "知乎", url: "https://www.zhihu.com" },
  { id: "t4", name: "微博", url: "https://weibo.com" },
  { id: "fd1", name: "常用", folder: true, children: [
    { id: "c1", name: "网易云音乐", url: "https://music.163.com" },
    { id: "c2", name: "起点读书", url: "https://www.qidian.com" },
    { id: "c3", name: "豆瓣", url: "https://www.douban.com" },
    { id: "c4", name: "百度", url: "https://www.baidu.com" },
    { id: "c5", name: "掘金", url: "https://juejin.cn" },
  ] },
]);
const seed = (style) =>
  page.evaluate(([links, st]) => {
    localStorage.setItem("start:settings", st);
    localStorage.setItem("start:links", links);
  }, [LINKS_SEED, JSON.stringify({ iconStyle: "letter", linksForm: "docked", ...(style ? { folderOpenStyle: style } : {}) })]);

const snapRect = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }, sel);

async function diag(styleName, openStyle) {
  await seed(openStyle);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(2000);
  console.log(`\n===== [${styleName}] =====`);
  const tileRect = await snapRect('[data-entry-id="fd1"] .tile-shell');
  console.log("磁贴 rect:", JSON.stringify(tileRect));

  // 打开（坐标硬点磁贴中心）
  await page.mouse.click(tileRect.x + tileRect.w / 2, tileRect.y + tileRect.h / 2);

  // ② 夹内磁贴入场动画采样（打开后早期）
  await page.waitForTimeout(120);
  const childEarly = await snapRect('[data-entry-id="c1"]');
  await page.waitForTimeout(120);
  const childMid = await snapRect('[data-entry-id="c1"]');
  await page.waitForTimeout(600);
  const childLate = await snapRect('[data-entry-id="c1"]');
  if (childEarly && childLate) {
    const moved = Math.abs(childEarly.y - childLate.y) + Math.abs(childEarly.x - childLate.x);
    console.log(`② 夹内磁贴 c1 early(120ms): y=${childEarly.y} mid(240ms): y=${childMid?.y} late(840ms): y=${childLate.y} → 位移 ${moved}px ${moved > 4 ? "⚠️ 入场动画在播" : "✓ 静止"}`);
  } else {
    console.log("② 夹内磁贴采样失败:", { childEarly, childMid, childLate });
  }

  // ③ 白卡定位（相对磁贴）
  const cardSel = openStyle === "inline" ? "[data-cl-folder-inline]" : "[data-cl-folder-popover] .solid-card";
  const cardRect = await snapRect(cardSel);
  if (cardRect && tileRect) {
    const covers = cardRect.x <= tileRect.x + 2 && cardRect.y <= tileRect.y + 2 &&
                   cardRect.x + cardRect.w >= tileRect.x + tileRect.w - 2 &&
                   cardRect.y + cardRect.h >= tileRect.y + tileRect.h - 2;
    const rel = covers ? "✓ 白卡覆盖磁贴（上层）"
      : tileRect.y >= cardRect.y + cardRect.h ? "⚠️ 白卡在磁贴下方（below）"
      : "部分重叠";
    console.log(`③ 白卡 rect: ${JSON.stringify(cardRect)} vs 磁贴 y=${tileRect.y} → ${rel}`);
  } else {
    console.log("③ 白卡采样失败:", { cardRect });
  }

  // ① 收起动画录帧：点空白（左下角远点）收起，40ms×12 帧采样卡片 rect
  await page.mouse.click(20, 860);
  const frames = [];
  for (let i = 0; i < 12; i++) {
    frames.push(await snapRect(cardSel));
    await page.waitForTimeout(40);
  }
  const alive = frames.filter(Boolean).length;
  console.log(`① 收起录帧（40ms×12）: 卡片存活帧 ${alive}/12`);
  const seq = frames.map((f, i) => (f ? `f${i}:${f.w}x${f.h}@(${f.x},${f.y})` : null)).filter(Boolean);
  if (seq.length) console.log("   " + seq.join(" | "));
  if (alive === 0) console.log("   → ⚠️ 卡片瞬间消失（收起动画未播）");
  else if (alive >= 12) console.log("   → ⚠️ 480ms 后卡片仍在（未收起？）");
  else {
    const f0 = frames.find(Boolean);
    const fn = frames.filter(Boolean).pop();
    const changing = f0 && fn && (Math.abs(f0.w - fn.w) > 3 || Math.abs(f0.h - fn.h) > 3 || Math.abs(f0.x - fn.x) > 3 || Math.abs(f0.y - fn.y) > 3);
    console.log(`   → ${changing ? "✓ 收起动画在播（逐帧变化）" : "⚠️ 卡片在场但尺寸静止"}`);
  }
  await page.waitForTimeout(600);
  const late = await snapRect(cardSel);
  console.log("   1s 后终态:", late ? "卡片仍在场 ⚠️" : "已卸载 ✓");
}

await diag("morph（默认）", null);
await diag("modal", "modal");
await diag("inline", "inline");

console.log("\npageerror:", errors.length ? errors : "0");
await browser.close();
console.log("DIAG DONE");
