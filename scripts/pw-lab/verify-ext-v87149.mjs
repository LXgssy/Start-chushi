/* v8.7.149 真扩展冒烟：磁贴三项修复（划掉驻留 / 拖动重放根修 / 高度拉伸）
 * 链路：装包 → 起始页种 3 条待办 + note → 磁贴挂出 3 行 →
 * ①点行划掉：done=true + 划线 scaleX(1) + 徽标即时减 + 行原地不动位 →
 * ①驻留 2.5s（>旧 LINGER 1.36s 总退场窗）行仍在磁贴（划掉不消失）→
 * ①面板里删除该条 → 行 exit 退场才消失（修复闭环）→
 * ②拖动磁贴 +120px：rAF 采样「行-磁贴相对 top」，落座后恒定（无重放动画）→
 * ③面板加一条待办：rAF 采样磁贴视觉高度，存在插值中间帧（拉伸动画）→
 * ③便签改长文本：rAF 采样便签磁贴高度，存在插值中间帧 →
 * 回归：驻留反悔恢复、行上起拖 46px 不误划+合法重钉、拖后点行正常、
 * 点磁贴标题区开面板、便签磁贴点按开面板、pageerror=0 */
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";

const ZIP = "/home/z/beta-wt/download/v8.7.149/ChuShi-NewTab-v8.7.149.zip";
const extDir = mkdtempSync(tmpdir() + "/ext-v149-");
execSync(`unzip -qo "${ZIP}" -d ${extDir}`);
const mf = JSON.parse(readFileSync(extDir + "/manifest.json", "utf8"));
if (mf.version !== "8.7.149") { console.error("✗ manifest 版本异常 " + mf.version); process.exit(1); }
console.log("✓ M0 manifest 8.7.149");

rmSync("/tmp/ext-v149-profile", { recursive: true, force: true });
const browser = await chromium.launchPersistentContext("/tmp/ext-v149-profile", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  viewport: { width: 1280, height: 800 },
});
const extId = createHash("sha256").update(extDir).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");
const errors = [];

const page = await browser.newPage();
page.on("pageerror", (e) => errors.push("start:" + String(e)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1200);

/* 种子：todoTile/noteTile=true + 3 条待办 + note，重载后磁贴挂出 */
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "{}");
  s.todoTile = true;
  s.noteTile = true;
  localStorage.setItem("start:settings", JSON.stringify(s));
  localStorage.setItem("start:todos", JSON.stringify([
    { id: "t1", text: "买牛奶", done: false, createdAt: 1 },
    { id: "t2", text: "回邮件", done: false, createdAt: 2 },
    { id: "t3", text: "跑步5公里", done: false, createdAt: 3 },
  ]));
  localStorage.setItem("start:note", JSON.stringify("测试便签"));
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector('[aria-label="打开待办面板"]', { timeout: 15000 });
await page.waitForSelector('[data-todo-row="open"]', { timeout: 15000 });
await page.waitForTimeout(1500); /* 入场动画（0.55s 错拍 + 模糊聚拢）沉降 */
console.log("✓ M1 磁贴挂出（seed 3 条 + todoTile/noteTile）");

const readState = () => page.evaluate(() => ({
  todos: JSON.parse(localStorage.getItem("start:todos") || "[]"),
  rows: [...document.querySelectorAll("[data-todo-row]")].map((b) => ({
    rid: b.getAttribute("data-todo-id"),
    id: b.getAttribute("data-todo-row"),
    label: b.getAttribute("aria-label"),
    pressed: b.getAttribute("aria-pressed"),
    strike: getComputedStyle(b.querySelector(".strike")).transform,
  })),
  badge: document.querySelector('[aria-label="打开待办面板"] .ml-auto')?.textContent.trim(),
}));

let st = await readState();
let M2ok = st.rows.length === 3 && st.rows.every((r) => r.id === "open") &&
  st.badge === "3" && st.rows[0].label === "划掉待办：买牛奶" &&
  st.rows[0].strike === "matrix(0, 0, 0, 1, 0, 0)";
console.log((M2ok ? "✓" : "✗") + ` M2 三行在位全 open 徽标=3 aria=划掉待办：买牛奶 划线 scaleX(0)`);
if (!M2ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

/* M3 点第一行 → 划掉：done + 划线扫入 + 徽标减 + 行原地不动位（DOM 序不变） */
await page.locator('[data-todo-row="open"]').first().click();
await page.waitForTimeout(800); /* .strike 0.45s 过渡沉降（含亚像素收尾余量） */
st = await readState();
const t1 = st.todos.find((t) => t.id === "t1");
const strikeX = parseFloat((st.rows[0].strike.match(/matrix\(([-\d.]+)/) || [])[1] || "0");
const M3ok = t1?.done === true && st.badge === "2" && st.rows.length === 3 &&
  st.rows[0].rid === "t1" && st.rows[0].id === "done" &&
  st.rows[0].pressed === "true" && st.rows[0].label === "恢复待办：买牛奶" &&
  strikeX >= 0.99 &&
  st.rows[1].rid === "t2" && st.rows[2].rid === "t3";
console.log((M3ok ? "✓" : "✗") + ` M3 点行划掉：t1.done=true 徽标=2 行原地不动位（t1 仍居首）划线 scaleX(1)`);
if (!M3ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

/* M4 驻留 2.5s 行仍在（v8.7.148 在 1.36s 内已退场——修复①核心断言） */
await page.waitForTimeout(2500);
st = await readState();
const M4ok = st.rows.length === 3 && st.rows[0].rid === "t1" &&
  st.rows[0].id === "done" && st.badge === "2";
console.log((M4ok ? "✓" : "✗") + ` M4 驻留 2.5s 划掉行仍在磁贴（不消失，修复①）`);
if (!M4ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

/* M5 驻留行再点反悔：done 回 false 行回 open */
await page.locator('[data-todo-row="done"]').first().click();
await page.waitForTimeout(500);
st = await readState();
const t1b = st.todos.find((t) => t.id === "t1");
const M5ok = t1b?.done === false && st.badge === "3" &&
  st.rows.length === 3 && st.rows.every((r) => r.id === "open");
console.log((M5ok ? "✓" : "✗") + ` M5 驻留反悔：t1.done 回 false 行回 open 徽标=3`);
if (!M5ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

/* M6 拖动重放修复：拖磁贴 +120px，rAF 采样「行-磁贴相对 top」，
 * 落座后应恒定（旧 bug：行相对磁贴再补放一次 a→b 移动动画） */
await page.evaluate(() => {
  window.__dLog = [];
  window.__dLogStop = false;
  const step = () => {
    if (window.__dLogStop) return;
    const tile = document.querySelector('[aria-label="打开待办面板"]');
    const row = document.querySelector('[data-todo-row]');
    if (tile && row) {
      window.__dLog.push({
        t: performance.now(),
        d: row.getBoundingClientRect().top - tile.getBoundingClientRect().top,
      });
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
const tb = await page.locator('[aria-label="打开待办面板"]').boundingBox();
await page.mouse.move(tb.x + tb.width / 2, tb.y + 6);
await page.mouse.down();
await page.mouse.move(tb.x + tb.width / 2 + 120, tb.y + 6 + 24, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(700); /* 旧重放动画 0.38s+ 若在播必被采到 */
const dLog = await page.evaluate(() => { window.__dLogStop = true; return window.__dLog; });
const ds = dLog.map((s) => s.d);
const dMax = Math.max(...ds), dMin = Math.min(...ds);
const M6ok = ds.length >= 8 && dMax - dMin <= 1.5;
console.log((M6ok ? "✓" : "✗") + ` M6 拖动重放修复：${ds.length} 帧采样 行-磁贴相对 top 极差 ${ (dMax-dMin).toFixed(3) }px（≤1.5 无重放）`);
if (!M6ok) {
  const tail = dLog.slice(-40).map((s) => s.d.toFixed(2)).join(",");
  console.log("  d 尾部样本:", tail);
  process.exit(1);
}

/* M6b 拖动落座合法性：磁贴重钉 + 徽标不变 + 行未误划 */
st = await readState();
const pinAfterDrag = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "{}");
  return s.pinTile?.todo ?? null;
});
const t1c = st.todos.find((t) => t.id === "t1");
const nb = await page.locator('[aria-label="打开待办面板"]').boundingBox();
const M6bok = !!pinAfterDrag && Math.abs(nb.x - (tb.x + 120)) < 5 &&
  Math.abs(nb.y - (tb.y + 24)) < 5 && t1c?.done === false && st.badge === "3";
console.log((M6bok ? "✓" : "✗") + ` M6b 拖动落座重钉 pinTile=${JSON.stringify(pinAfterDrag)} 无误划 徽标=3`);
if (!M6bok) { console.log(JSON.stringify({ pinAfterDrag, nb, tb, st }, null, 2)); process.exit(1); }

/* M6c 行上起拖 46px：不误划 + 合法重钉（v8.7.148 拖拽护栏回归） */
const rb = await page.locator('[data-todo-id="t2"]').boundingBox(); /* t2 行 */
const sx = rb.x + rb.width / 2, sy = rb.y + rb.height / 2;
await page.mouse.move(sx, sy);
await page.mouse.down();
await page.mouse.move(sx + 46, sy + 8, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(250);
st = await readState();
const pinAfterRowDrag = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "{}");
  return s.pinTile?.todo ?? null;
});
const t2a = st.todos.find((t) => t.id === "t2");
const nb2 = await page.locator('[aria-label="打开待办面板"]').boundingBox();
const M6cok = t2a?.done === false && !!pinAfterRowDrag &&
  Math.abs(nb2.x - (nb.x + 46)) < 5 && Math.abs(nb2.y - (nb.y + 8)) < 5;
console.log((M6cok ? "✓" : "✗") + ` M6c 行上起拖 46px 不误划 t2.done=false 磁贴重钉`);
if (!M6cok) { console.log(JSON.stringify({ t2a, pinAfterRowDrag, nb2, nb }, null, 2)); process.exit(1); }

/* M6d 拖后 400ms 点行仍可正常划掉（护栏只吞 300ms 窗口） */
await page.waitForTimeout(400);
await page.locator('[data-todo-id="t3"]').click();
await page.waitForTimeout(500);
st = await readState();
const t3b = st.todos.find((t) => t.id === "t3");
const M6dok = t3b?.done === true && st.badge === "2" &&
  st.rows.find((r) => r.rid === "t3")?.id === "done";
console.log((M6dok ? "✓" : "✗") + ` M6d 拖后点行正常划掉：t3.done=true 徽标=2 行驻留 done`);
if (!M6dok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }
await page.waitForTimeout(300); /* 沉降 */

/* M7 面板删除划掉条 → 行才退场（修复①闭环） */
await page.locator('[aria-label="打开待办面板"]').getByText("待办", { exact: true }).click();
const panelInput = page.getByPlaceholder("添加待办，回车确认");
await panelInput.waitFor({ state: "visible", timeout: 6000 });
await page.locator('[aria-label="删除 跑步5公里"]').click();
await page.waitForTimeout(900); /* exit 0.26 + exitTick 补测量 + 拉伸 0.38 */
st = await readState();
const M7ok = st.rows.length === 2 && !st.rows.some((r) => r.rid === "t3") &&
  st.badge === "2" && !(JSON.parse(await page.evaluate(() => localStorage.getItem("start:todos"))).some((t) => t.id === "t3"));
console.log((M7ok ? "✓" : "✗") + ` M7 面板删除 t3 → 磁贴行退场（修复①闭环：删除才消失）徽标=2`);
if (!M7ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

/* 高度动画描迹：CDP boundingBox 轮询（DOM 层命令，强制同步 layout 读
 * 真实视觉高度，与页面 rAF/时钟无关）。动画期相邻采样差 >0.4px 入列，
 * 连续 5 次不变判稳定收束。
 * ⚠️ 实测纪律：本循环必须用 boundingBox 而非高频 Runtime.evaluate——
 * headless 下高频 evaluate 会让 renderer timer 队列冻结（后续步骤的
 * 页面 setTimeout/interval 全部停摆，诊断 diag-bisect 系列实证）。 */
async function traceHeight(tile, maxMs = 3500) {
  const seq = [];
  let last = NaN, stable = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs && stable < 5) {
    const h = (await tile.boundingBox())?.height ?? NaN;
    if (!isNaN(h)) {
      if (Math.abs(h - last) < 0.4) stable++;
      else {
        stable = 0;
        seq.push(h);
      }
    }
    last = h;
    await page.waitForTimeout(30);
  }
  return { seq, final: last };
}

/* M8 面板连加 3 条待办 → 磁贴高度拉伸动画：描迹序列中存在严格介于
 * 首末稳定值之间的中间值 = 拉伸插值实证（无动画则是首值直跳末值）。 */
const hTile = page.locator('[aria-label="打开待办面板"]');
const h0 = (await hTile.boundingBox()).height;
for (const nm of ["喂猫", "浇花", "取快递"]) {
  await panelInput.fill(nm);
  await page.keyboard.press("Enter");
}
const hTr = await traceHeight(hTile);
const h1 = hTr.final;
const hMid = hTr.seq.filter((h) => h > Math.min(h0, h1) + 2 && h < Math.max(h0, h1) - 2);
const M8ok = h1 - h0 > 20 && hMid.length >= 1;
console.log((M8ok ? "✓" : "✗") + ` M8 待办磁贴高度拉伸：${h0.toFixed(1)}→${h1.toFixed(1)}px 中间值 ${hMid.length} 个（${hMid.slice(0, 4).map((h) => h.toFixed(1)).join(",")||"无"}）`);
if (!M8ok) { console.log("  序列:", hTr.seq.map((h) => h.toFixed(1)).join(",")); process.exit(1); }
await page.waitForTimeout(200);

/* M9 便签磁贴拉伸：便签面板改长文本 → 防抖 450ms 后 onCommit 到全局
 * note，磁贴 layout 动画随后启动。300ms 间隔 evaluate dump（实证该
 * 形式下 renderer timer 正常调度），全程记 note+tileH 时间线，
 * commit 前后高度序列中存在中间值即拉伸动画实证。 */
await page.locator('[aria-label="关闭面板"]').click();
await page.waitForTimeout(500);
await page.locator('[aria-label="打开便签面板"]').click();
const noteInput = page.getByPlaceholder("随手记点什么… 自动保存");
await noteInput.waitFor({ state: "visible", timeout: 6000 });
const nTile = page.locator('[aria-label="打开便签面板"]');
const n0 = (await nTile.boundingBox()).height;
await noteInput.fill("第一行便签内容\n第二行便签内容\n第三行便签内容");
const nSeq = [];
let nCommitted = false;
for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => ({
    note: localStorage.getItem("start:note"),
    h: document.querySelector('[aria-label="打开便签面板"]')?.getBoundingClientRect().height ?? NaN,
  }));
  if (s.note && s.note.includes("第一行")) nCommitted = true;
  if (!isNaN(s.h)) nSeq.push(s.h);
  if (nCommitted && i >= 8) break; /* commit 后至少采 2.4s 覆盖动画 */
}
const n1 = nSeq[nSeq.length - 1];
const nMid = nSeq.filter((h) => h > Math.min(n0, n1) + 2 && h < Math.max(n0, n1) - 2);
const M9ok = nCommitted && n1 - n0 > 8 && nMid.length >= 1;
console.log((M9ok ? "✓" : "✗") + ` M9 便签磁贴高度拉伸：${n0.toFixed(1)}→${n1.toFixed(1)}px 中间值 ${nMid.length} 个（${nMid.slice(0, 5).map((h) => h.toFixed(1)).join(",")||"无"}）note 落地=${nCommitted}`);
if (!M9ok) { console.log("  序列:", nSeq.map((h) => h.toFixed(1)).join(",")); process.exit(1); }

/* M10 便签磁贴点按开面板已在 M9 顺带验证（点击即开） */
console.log("✓ M10 便签磁贴点按开面板（M9 前置点击即验证）");

await browser.close();
if (errors.length) {
  console.error("✗ pageerror:", errors);
  process.exit(1);
}
console.log("✓ pageerror=0 全程");
console.log("\nSMOKE PASS (v8.7.149)");
