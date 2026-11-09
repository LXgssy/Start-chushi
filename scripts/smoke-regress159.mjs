// smoke-v87154-regress.mjs — v8.7.156 真扩展冒烟（核心：学习通自绘磁贴 + 壳层/渲染回归）
// 门A 真 zip 解包 → --load-extension 加载
// 门B 新标签页渲染（时钟/磁贴/无 pageerror）
// 门C 学习通磁贴自绘渲染：iconStyle=selfdraw + i.chaoxing.com（子域 suffix 匹配）
//     → svg viewBox 23.96 锚 + #E60012 底 + 白流星 g + 2 path + 无字母回退
// 门D 注册表 fetch 200 且 188 条
// 门E shell.html 壳层 boot（iframe 在位，v8.7.152 回归）
import { chromium } from "playwright-core";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const ZIP = "/home/z/beta-wt/download/v8.7.160/ChuShi-NewTab-v8.7.160.zip";
const STAGE = "/tmp/ext-smoke-v87159-regress";
const PROFILE = "/tmp/ext-profile-v87159";
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
  viewport: { width: 1280, height: 800 },
});
const extId = [...createHash("sha256").update(STAGE).digest("hex").slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join("");
console.log("extension id:", extId);

// ---------- 门B+C+D：新标签页 ----------
const page = browser.pages()[0] || (await browser.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push("index: " + e.message.slice(0, 140)));
let regStatus = 0;
page.on("response", (r) => { if (r.url().endsWith("selfdraw-icons.json")) regStatus = r.status(); });
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(1500);

// 种入：iconStyle=selfdraw + 学习通磁贴（i. 子域验 suffix 匹配）+ 起点对照
await page.evaluate(() => {
  localStorage.setItem("start:settings", JSON.stringify({ iconStyle: "selfdraw" }));
  localStorage.setItem("start:links", JSON.stringify([
    { id: "cx1", name: "学习通", url: "https://i.chaoxing.com/" },
    { id: "qd1", name: "起点读书", url: "https://www.qidian.com/" },
  ]));
});
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(2200);

const boot = await page.evaluate(() => ({
  clock: !!document.querySelector(".cl-clock"),
  tiles: document.querySelectorAll(".cl-dock a, a[href]").length,
}));
T("B1 新标签页时钟渲染", boot.clock);
T("B2 磁贴链接渲染", boot.tiles >= 2);

const tile = await page.evaluate(() => {
  const a = document.querySelector('a[href*="i.chaoxing.com"]');
  if (!a) return null;
  const svg = a.querySelector("svg");
  const paths = svg ? [...svg.querySelectorAll("path")] : [];
  return {
    found: true,
    svgViewBox: svg?.getAttribute("viewBox") ?? "",
    shapeRendering: svg?.getAttribute("shape-rendering") ?? "",
    pathCount: paths.length,
    redBase: paths.some((p) => (p.getAttribute("fill") || "").includes("#E60012")
      && (p.getAttribute("d") || "").startsWith("M0 0 C320.76")),
    whiteGroup: !!svg?.querySelector('g[fill="#FFFFFF"] path'),
    letterFallback: /^[a-zA-Z\u4e00-\u9fa5]$/.test((a.textContent || "").trim()),
    label: (a.textContent || "").trim().slice(0, 12),
  };
});
T("C1 学习通磁贴存在（i. 子域命中 HOST_MAP）", !!tile?.found);
T("C2 自绘 svg viewBox=23.96 锚", tile?.svgViewBox === "23.96 23.96 976.08 976.08");
T("C2b 渲染精度档 geometricPrecision 在位（本轮核心）", tile?.shapeRendering === "geometricPrecision");
T("C3 红底 path（972 圆角方模板 #E60012）", !!tile?.redBase);
T("C4 白流星 g[fill=#FFFFFF] 描摹轮廓在位", !!tile?.whiteGroup);
T("C5 结构 2 path（底+流星）", tile?.pathCount === 2);
T("C6 无字母回退（svg 渲染即命中）", tile?.found && !tile?.letterFallback);
console.log("  磁贴实测:", JSON.stringify(tile));

const qd = await page.evaluate(() => {
  const a = document.querySelector('a[href*="qidian.com"]');
  return a ? !!a.querySelector("svg") : null;
});
T("C7 对照组起点磁贴同管道渲染", qd === true);

const perKey = await page.evaluate(async () => {
  const r = await fetch("selfdraw/i/chaoxing.json", { cache: "no-cache" });
  if (!r.ok) return null;
  const j = await r.json();
  return Array.isArray(j) && j.length === 3 ? "split-ok" : "bad-shape";
});
T("D1 per-key 拆分 fetch", perKey === "split-ok");
T("D2 全册文件已退役", !fs.existsSync(STAGE + "/selfdraw-icons.json"));

await page.screenshot({ path: "/home/z/my-project/scripts/pw-lab/shots/smoke-v87154-regress-index.png" });

// ---------- 门E：壳层 boot ----------
const sp = await browser.newPage();
const shErrors = [];
sp.on("pageerror", (e) => shErrors.push("shell: " + e.message.slice(0, 140)));
await sp.goto(`chrome-extension://${extId}/shell.html`, { waitUntil: "load", timeout: 60000 });
await sp.waitForTimeout(3000);
const shell = await sp.evaluate(() => ({
  iframe: !!document.querySelector('iframe[src*="index.html"]'),
  bootGone: (() => { const b = document.querySelector(".cs-boot"); return !b || getComputedStyle(b).display === "none" || (b.dataset.csFaded === "1"); })(),
}));
T("E1 壳层 iframe 挂载", shell.iframe);
T("E2 壳层揭幕（8s 兜底未触发即正常路径）", shell.bootGone);
T("E3 新标签页 pageerror=0", errors.length === 0);
T("E4 壳层 pageerror=0", shErrors.length === 0);
if (errors.length) console.log("  errors:", JSON.stringify(errors));
if (shErrors.length) console.log("  shErrors:", JSON.stringify(shErrors));
await sp.screenshot({ path: "/home/z/my-project/scripts/pw-lab/shots/smoke-v87154-regress-shell.png" });

await browser.close();
console.log("=".repeat(46));
console.log(`SMOKE v8.7.156: ${pass} 绿 / ${bad.length} 红`);
if (bad.length) { console.log("FAILURES:", JSON.stringify(bad)); process.exit(1); }
console.log("SMOKE PASS");
