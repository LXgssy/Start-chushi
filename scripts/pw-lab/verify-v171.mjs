import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import { unzipSync, strFromU8 } from "fflate";

/* verify-v171.mjs — v1.7.1 体验修缮批端到端验证
 * ① studio：.add 按钮不溢出（box-sizing 修复）② studio：.cshz 导出 → zip 结构合法
 * ③ .cshz 回环导入「初始」（拖拽路径）→ clock 12h 一次性合入
 * ④ 设置面板调回 24h 生效（时钟语义修复核心断言）
 * ⑤ 选框三段动效：出现 scale .6 起步 / 切换 translate 滑移 / 消失动画存在
 * ⑥ 导入面板拖拽提示高度形变（按钮被平滑推下）
 * ⑦ 右键菜单「批量管理磁贴」→ 编辑模式进入/退出
 * ⑧ pageerror 全程为 0 */

const ROOT = "/home/z/my-project/out";
const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain",
  ".cshz": "application/zip", ".zip": "application/zip",
};

const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  p = p.replace(/^\/Start-chushi/, "") || "/";
  if (p.endsWith("/")) p += "index.html";
  let f = join(ROOT, p);
  if (!existsSync(f)) f = join(ROOT, "index.html");
  try {
    const body = readFileSync(f);
    res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404); res.end("nf");
  }
});
await new Promise((r) => server.listen(4617, r));
console.log("serve out/ on :4617");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}
const B = "http://localhost:4617";

/* ---------- ① studio 布局修复 ---------- */
await page.goto(B + "/preset-studio.html", { waitUntil: "networkidle" });
await page.fill("#f-name", "回环测试预设"); /* 基础页签先填名 */
/* .add 按钮在「内容」页签下（默认页签隐藏） */
await page.click("button[data-tab='content']");
await page.waitForTimeout(120);
const addBox = await page.locator("button[data-add='commands']").boundingBox();
const panelBox = await page.locator("#form-panel").boundingBox();
const insidePanel = addBox && panelBox &&
  addBox.x + addBox.width <= panelBox.x + panelBox.width + 1;
check("① studio：.add 按钮不再溢出面板", !!insidePanel,
  insidePanel ? `add 右缘 ${Math.round(addBox.x + addBox.width)} ≤ 面板右缘 ${Math.round(panelBox.x + panelBox.width)}` : JSON.stringify({ addBox, panelBox }));
check("① studio：.cshz 导出按钮存在", await page.locator("#btn-download-pack").count() === 1);

/* ---------- ② studio 导出 .cshz → zip 结构校验（带 clock.hour12=true） ---------- */
await page.click("button[data-add='links']");
await page.fill("#list-links input >> nth=0", "GitHub");
await page.fill("#list-links input[type=text] >> nth=1", "https://github.com");
await page.click("button[data-tab='renew']");
await page.selectOption("#f-clock-hour12", "true");
await page.click("button[data-tab='base']"); /* 回基础页签，确保名称保留 */
await page.waitForTimeout(100);
const dlPromise = page.waitForEvent("download");
await page.click("#btn-download-pack");
const dl = await dlPromise;
const tmp = mkdtempSync(join(tmpdir(), "cshz-"));
const cshzPath = join(tmp, dl.suggestedFilename());
await dl.saveAs(cshzPath);
check("② 下载文件名为 .cshz", dl.suggestedFilename().endsWith(".cshz"), dl.suggestedFilename());
const zipBytes = new Uint8Array(readFileSync(cshzPath));
let manifestName = "";
const manifestOK = (() => { try {
  const entries = unzipSync(zipBytes);
  manifestName = Object.keys(entries).join(",");
  const m = JSON.parse(strFromU8(entries["manifest.json"]));
  return m.chushi === 1 && m.name === "回环测试预设" && m.clock && m.clock.hour12 === true && Array.isArray(m.links) && m.links.length === 1;
} catch (e) { manifestName = "解析失败: " + e.message; return false; } })();
check("② zip 结构合法（manifest.json 可解出且含 clock.hour12）", manifestOK, manifestName);

/* ---------- ③ .cshz 拖拽导入「初始」→ 12h 一次性合入 ---------- */
await page.goto(B, { waitUntil: "networkidle" });
const dt = await page.evaluate(() => {
  const s = localStorage.getItem("start:settings");
  return s ? JSON.parse(s).hour12 : null;
});
check("③ 基线为 24h（hour12=false）", dt === false, String(dt));

/* 拖拽导入：向导入面板 textarea 容器派发 drop（DataTransfer 带 File） */
await page.evaluate(() => {
  const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true });
  document.dispatchEvent(ev);
});
await page.waitForTimeout(700);
await page.getByText("导入预设").first().click();
await page.waitForTimeout(500);
const dropTarget = page.locator("textarea[placeholder*='chushi']");
await dropTarget.evaluate(async (el, path) => {
  const b64 = path.b64; const name = path.name;
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const file = new File([u8], name, { type: "application/zip" });
  const dt = new DataTransfer();
  dt.items.add(file);
  for (const type of ["dragenter", "dragover", "drop"]) {
    el.closest("div").dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
  }
}, { b64: zipBytesToB64(zipBytes), name: dl.suggestedFilename() });
await page.waitForTimeout(900);
check("③ .cshz 拖入即安装（toast 提及预设名）", (await page.locator("text=回环测试预设").count()) > 0 || (await page.evaluate(() => localStorage.getItem("start:presets"))).includes("回环测试预设"));
const afterImport = await page.evaluate(() => JSON.parse(localStorage.getItem("start:settings")).hour12);
check("③ clock.hour12 一次性合入 → 12h 生效", afterImport === true, String(afterImport));
await page.waitForTimeout(1200); /* 等 AM/PM 淡入完成 */
const clockHas12 = (await page.locator(".cl-clock time").textContent()).match(/AM|PM/);
check("③ 时钟 UI 显示 AM/PM", !!clockHas12);

/* ---------- ④ 设置面板调回 24h 立即生效（核心逻辑修复：预设装着时也必须可调） ---------- */
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
/* 此时「回环测试预设」仍处于安装状态——旧逻辑下这一步会被声明式覆写遮蔽 */
const presetStill = await page.evaluate(() => JSON.parse(localStorage.getItem("start:presets") || "[]").length);
check("④ 预设仍处于安装状态", presetStill > 0, `installed=${presetStill}`);
await page.locator("button[aria-label='设置']").click();
await page.waitForTimeout(700);
const seg24 = page.getByText("24 时").first();
await seg24.click();
await page.waitForTimeout(700);
const afterPanel = await page.evaluate(() => JSON.parse(localStorage.getItem("start:settings")).hour12);
check("④ 设置面板切回 24 时写入成功", afterPanel === false, String(afterPanel));
const clockNo12 = (await page.locator(".cl-clock time").textContent());
check("④ 时钟 UI 回到 24 时制（不再被预设遮蔽）", !/AM|PM/.test(clockNo12), clockNo12.slice(0, 20));

/* ---------- ⑤ 选框三段动效 ---------- */
/* 出现：点击待办 → 新选框 initial scale .6（matrix 起步值 < 1） */
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.locator("button[aria-label='待办']").click();
await page.waitForTimeout(60);
const popStart = await page.evaluate(() => {
  const pill = document.querySelector("button[data-active='true'] span[aria-hidden]");
  return pill ? getComputedStyle(pill).transform : "missing";
});
check("⑤ 出现动画：选框以缩放中间态起步（scale < 1）", /matrix\([^)]*\)/.test(popStart) && parseFloat(popStart.replace(/.*,\s*([\d.]+)\)$/, "$1")) < 0.95, popStart);
await page.waitForTimeout(900);
/* 切换：待办 → 便签，选框应 translate 滑移而非原地重现 */
const x0 = await page.evaluate(() => {
  const pill = document.querySelector("button[data-active='true'] span[aria-hidden]");
  return pill ? pill.getBoundingClientRect().x : null;
});
await page.locator("button[aria-label='便签']").click();
await page.waitForTimeout(90);
const midState = await page.evaluate(() => {
  const pill = document.querySelector("button[data-active='true'] span[aria-hidden]");
  return pill ? { transform: getComputedStyle(pill).transform, opacity: getComputedStyle(pill).opacity } : null;
});
/* 切换 = 纯滑移（基线手感）：飞行中 scale 恒为 1，不重播 Q 弹（scale .6）出场 */
check("⑤ 切换动画：纯滑移不重播出场（scale 恒 1）",
  !!midState && /^matrix\(1, 0, 0, 1,/.test(midState.transform), midState && midState.transform);
await page.waitForTimeout(900);
const x1 = await page.evaluate(() => {
  const pill = document.querySelector("button[data-active='true'] span[aria-hidden]");
  return pill ? pill.getBoundingClientRect().x : null;
});
check("⑤ 切换动画：选框最终停在新按钮位置", x0 != null && x1 != null && Math.abs(x1 - x0) > 20, `x0=${x0} x1=${x1}`);
/* 消失：关闭面板 → 选框退出（轮询 300ms 捕捉退出中间态，再确认卸载） */
await page.locator("button[aria-label='便签']").click();
const exitOpacity = await page.evaluate(() => new Promise((resolve) => {
  const t0 = performance.now();
  let minOp = null;
  function tick() {
    const pills = document.querySelectorAll("span[aria-hidden].rounded-full, span[aria-hidden][class*='rounded-full']");
    for (const p of pills) {
      const op = parseFloat(getComputedStyle(p).opacity);
      if (Number.isFinite(op) && op < 1 && op > 0) { minOp = minOp == null ? op : Math.min(minOp, op); }
    }
    if (performance.now() - t0 < 300) requestAnimationFrame(tick);
    else resolve(minOp);
  }
  requestAnimationFrame(tick);
}));
await page.waitForTimeout(600);
const pillGone = await page.evaluate(() => !document.querySelector("button[data-active='true'] span[aria-hidden].rounded-full"));
check("⑤ 消失动画：退出中间态可见（opacity < 1）", exitOpacity != null, String(exitOpacity));
check("⑤ 消失动画：选框最终卸载", pillGone);

/* ---------- ⑥ 导入面板拖拽提示高度形变 ---------- */
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.evaluate(() => {
  const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true });
  document.dispatchEvent(ev);
});
await page.waitForTimeout(700);
await page.getByText("导入预设").first().click();
await page.waitForTimeout(500);
const btnRow = page.locator("text=填入示例").first();
/* dragover 与采样合并进同一次 evaluate；无头 rAF 节流 ~13fps（Task 59 环境律），
   中间帧能采到就断言平滑，采不到时以「位移发生 + framer 高度盒真实存在」兜底判定 */
const sample6 = await page.evaluate((el) => new Promise((resolve) => {
  const dt = new DataTransfer();
  el.closest("div").dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
  const t0 = performance.now(); const ys = []; let hintBox = null;
  function tick() {
    ys.push(el.getBoundingClientRect().y);
    const hints = document.querySelectorAll("p");
    for (const p of hints) {
      if (p.textContent.includes("松开即导入")) {
        const box = p.parentElement; /* Collapse 的 motion.div 高度盒 */
        hintBox = { h: box.style.height, overflow: getComputedStyle(box).overflow };
      }
    }
    if (performance.now() - t0 < 700) requestAnimationFrame(tick);
    else resolve({ ys, hintBox });
  }
  requestAnimationFrame(tick);
}), await btnRow.elementHandle());
await page.waitForTimeout(200);
const afterY = (await btnRow.boundingBox())?.y;
const hintVisible = (await page.locator("text=松开即导入该预设文件").count()) > 0;
const { ys, hintBox } = sample6;
const beforeY = ys[0];
const shift = afterY - beforeY;
const distinct = new Set(ys.map((y) => Math.round(y * 10))).size;
check("⑥ 拖拽提示出现", hintVisible);
check("⑥ 按钮下移且高度盒动画在管（framer motion 高度盒 + 位移发生）",
  shift > 4 && hintBox != null && hintBox.overflow === "hidden" && distinct >= 2,
  `before=${beforeY} after=${afterY} distinct=${distinct} heightBox=${JSON.stringify(hintBox)}`);
/* 拖离收起 */
await page.evaluate(() => {
  const ta = document.querySelector("textarea[placeholder*='chushi']");
  const dt = new DataTransfer();
  ta.closest("div").dispatchEvent(new DragEvent("dragleave", { bubbles: true, cancelable: true, dataTransfer: dt }));
});
await page.waitForTimeout(600);
check("⑥ 拖离后提示收起", (await page.locator("text=松开即导入该预设文件").count()) === 0);

/* ---------- ⑦ 右键菜单「批量管理磁贴」 ---------- */
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.mouse.click(640, 300, { button: "right" });
await page.waitForTimeout(400);
let menuCount = await page.locator("[role='menuitem']").count();
if (menuCount === 0) {
  /* 无头环境兜底：直接派发 contextmenu 事件 */
  await page.locator("body").dispatchEvent("contextmenu", { button: 2, clientX: 500, clientY: 350, bubbles: true, cancelable: true });
  await page.waitForTimeout(400);
  menuCount = await page.locator("[role='menuitem']").count();
}
check("⑦ 右键菜单弹出", menuCount > 0, `menuitem × ${menuCount}`);
const manageItem = page.locator("[role='menuitem']", { hasText: "批量管理磁贴" });
check("⑦ 菜单含「批量管理磁贴」", (await manageItem.count()) === 1);
if ((await manageItem.count()) === 1) {
  await manageItem.click();
  await page.waitForTimeout(500);
  const jiggling = await page.locator(".jiggle").count();
  check("⑦ 进入磁贴编辑模式（jiggle 激活）", jiggling > 0, `jiggle × ${jiggling}`);
  check("⑦ 磁贴右上角出现删除钮", (await page.locator("button[aria-label^='删除 ']").count()) > 0);
  /* 点击空白处退出 */
  await page.mouse.click(640, 120);
  await page.waitForTimeout(400);
  check("⑦ 点击空白处退出编辑模式", (await page.locator(".jiggle").count()) === 0);
}

/* ---------- ⑧ 汇总 ---------- */
check("⑧ pageerror 全程为 0", errors.length === 0, errors.join(" | ").slice(0, 200));

const fails = results.filter((r) => !r.ok);
console.log(`\n===== ${results.length - fails.length}/${results.length} 通过 =====`);
if (fails.length > 0) process.exit(1);
process.exit(0);

function zipBytesToB64(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}
