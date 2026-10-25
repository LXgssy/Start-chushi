/* v8.7.151 真扩展冒烟：禅雾化重建（快捷墙 blur 值通道 + 玻璃板同步消融）
 *            + 抖音录制根修 + v8.7.150 全量回归
 * 链路：装包 → 种子（todo/note 磁贴 + linksForm=docked 常驻墙 + 2 链接）→
 * 【M 系列】v8.7.150 十七项回归（划掉驻留/反悔/面板删除退场/拖动重放/
 *   行上起拖不误划/拖后点行/双磁贴拉伸/点按开面板）→
 * 【ZE 系列·本轮核心一】进禅 computed-style 扫样：
 *   ZE1 进禅中间态：glass-card blur 20px→1px、tile-frost 14px→1px 的
 *       插值扫样必须存在中间值（值通道真在过渡，不是瞬跳）+ 端点 blur(1px)
 *       + label/zen-fog opacity=0（墙内容与玻璃板同拍散场）；
 *   ZE2 禅末态：visibility hidden 三载体 + 墙 glass backdrop-filter=blur(1px)；
 *   ZE3 退禅 +~60ms snap：backdrop-filter 瞬回满血（基态 transition 表
 *       不含 backdrop-filter=显影首帧满血律）；
 * 【Z 系列像素门·v8.7.150 回归】隐藏内容只留玻璃板 → 壁纸梯度 ratio：
 *   Z1 基线磨砂在线 → Z2/Z3 退禅 +0.70s/+1.30s 双采样 ratio≥10 → Z4 二轮 →
 * 【R 系列·本轮核心三】example.com + canvas 动画流 video：
 *   R1 探针 list≥1 → R2 面板录制区 → R3 扫描候选 → R4 开录（data-rec-live
 *   + expando 标记）→ R5 sniffer-new 风暴 20 连发（旧版整表重建吞点击的
 *   根因场景）：标记节点存活 + data-rec-time 实时走秒 + 停止钮在位 →
 *   R6 风暴中真点击停止：≤8s 回候选列表 + toast 已保存（非停止失败）→
 *   R7 探针源断自动收尾：track.stop() → 事件→桥→浮窗自动落盘 toast
 *   「视频源已切换」+ 迟到 stop() 拿 lastAuto（auto:true, size>0）→
 *   R8 伪造 rec-ended postMessage → 桥转发浮窗 toast（通道回归）→
 * pageerror=0。
 * ⚠️ 冒烟律沿用：高频采样一律页内 rAF 循环（Runtime.evaluate 高频调用会
 * 冻结 headless renderer 的 timer 队列）；进禅 dblclick 落点必须页内动态
 * 选取非交互空白点（常驻墙在场时 640,600 可能命中磁贴导致拒绝进禅）。 */
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";

const ZIP = "/home/z/beta-wt/download/v8.7.151/ChuShi-NewTab-v8.7.151.zip";
const extDir = mkdtempSync(tmpdir() + "/ext-v151-");
execSync(`unzip -qo "${ZIP}" -d ${extDir}`);
const mf = JSON.parse(readFileSync(extDir + "/manifest.json", "utf8"));
if (mf.version !== "8.7.151") { console.error("✗ manifest 版本异常 " + mf.version); process.exit(1); }
console.log("✓ M0 manifest 8.7.151");

rmSync("/tmp/ext-v151-profile", { recursive: true, force: true });
const browser = await chromium.launchPersistentContext("/tmp/ext-v151-profile", {
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

/* 种子 A（M 系列回归）：todo/note 磁贴 + 3 条待办 + note。
   ⚠ 不种 linksForm（保持默认 drawer）——常驻墙在场时 [aria-label="快捷链接"]
   是拖拽禁区（forbiddenRects，v8.7.106 既定产品行为）且墙 w-full 全宽，
   M6 拖拽落座会被弹簧回弹；ZE 系列前再切常驻形态。 */
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "{}");
  s.todoTile = true;
  s.noteTile = true;
  s.photoId = "mist-lake";
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
await page.waitForTimeout(1500); /* 入场动画沉降 */
console.log("✓ M1 磁贴挂出（todo/note + mist-lake，抽屉形态=V8.7.150 同构环境）");

const readState = () => page.evaluate(() => ({
  todos: JSON.parse(localStorage.getItem("start:todos") || "[]"),
  rows: [...document.querySelectorAll("[data-todo-row]")].map((b) => ({
    rid: b.getAttribute("data-todo-id"),
    id: b.getAttribute("data-todo-row"),
    pressed: b.getAttribute("aria-pressed"),
    strike: getComputedStyle(b.querySelector(".strike")).transform,
  })),
  badge: document.querySelector('[aria-label="打开待办面板"] .ml-auto')?.textContent.trim(),
}));

let st = await readState();
let M2ok = st.rows.length === 3 && st.rows.every((r) => r.id === "open") && st.badge === "3";
console.log((M2ok ? "✓" : "✗") + ` M2 三行在位全 open 徽标=3`);
if (!M2ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

await page.locator('[data-todo-row="open"]').first().click();
await page.waitForTimeout(800);
st = await readState();
const t1 = st.todos.find((t) => t.id === "t1");
const strikeX = parseFloat((st.rows[0].strike.match(/matrix\(([-\d.]+)/) || [])[1] || "0");
const M3ok = t1?.done === true && st.badge === "2" && st.rows[0].rid === "t1" &&
  st.rows[0].id === "done" && st.rows[0].pressed === "true" && strikeX >= 0.99;
console.log((M3ok ? "✓" : "✗") + ` M3 点行划掉：t1.done=true 徽标=2 行原地 划线 scaleX(1)`);
if (!M3ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

await page.waitForTimeout(2500);
st = await readState();
const M4ok = st.rows.length === 3 && st.rows[0].rid === "t1" && st.rows[0].id === "done" && st.badge === "2";
console.log((M4ok ? "✓" : "✗") + ` M4 驻留 2.5s 划掉行仍在磁贴`);
if (!M4ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

await page.locator('[data-todo-row="done"]').first().click();
await page.waitForTimeout(500);
st = await readState();
const t1b = st.todos.find((t) => t.id === "t1");
const M5ok = t1b?.done === false && st.badge === "3" && st.rows.every((r) => r.id === "open");
console.log((M5ok ? "✓" : "✗") + ` M5 驻留反悔：t1.done=false 行回 open 徽标=3`);
if (!M5ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

/* M6 拖动重放回归：页内 rAF 采样行-磁贴相对 top */
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
await page.waitForTimeout(700);
const dLog = await page.evaluate(() => { window.__dLogStop = true; return window.__dLog; });
const ds = dLog.map((s) => s.d);
const dMax = Math.max(...ds), dMin = Math.min(...ds);
const M6ok = ds.length >= 8 && dMax - dMin <= 1.5;
console.log((M6ok ? "✓" : "✗") + ` M6 拖动重放：${ds.length} 帧 相对 top 极差 ${(dMax - dMin).toFixed(3)}px（≤1.5）`);
if (!M6ok) process.exit(1);

st = await readState();
const pinAfterDrag = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "{}");
  return s.pinTile?.todo ?? null;
});
const t1c = st.todos.find((t) => t.id === "t1");
const nb = await page.locator('[aria-label="打开待办面板"]').boundingBox();
const M6bok = !!pinAfterDrag && Math.abs(nb.x - (tb.x + 120)) < 5 &&
  Math.abs(nb.y - (tb.y + 24)) < 5 && t1c?.done === false && st.badge === "3";
console.log((M6bok ? "✓" : "✗") + ` M6b 拖动落座重钉 pinTile=${JSON.stringify(pinAfterDrag)} 无误划`);
if (!M6bok) {
  const dbg = await page.evaluate(() => {
    const tile = document.querySelector('[aria-label="打开待办面板"]');
    const r = tile.getBoundingClientRect();
    const s = JSON.parse(localStorage.getItem("start:settings") || "{}");
    return {
      tile: { x: r.x, y: r.y, w: r.width, h: r.height },
      pinTile: s.pinTile ?? null,
      atDown: (() => { const el = document.elementFromPoint(r.x + r.width / 2, r.y + 6); return el ? el.tagName + "." + (el.className || "").toString().slice(0, 60) : "null"; })(),
      wallRect: (() => { const w = document.querySelector("section.zen-gone"); const wr = w.getBoundingClientRect(); return { y: wr.y, h: wr.height }; })(),
    };
  });
  console.log("  调试:", JSON.stringify(dbg));
  process.exit(1);
}

const rb = await page.locator('[data-todo-id="t2"]').boundingBox();
const sx = rb.x + rb.width / 2, sy = rb.y + rb.height / 2;
await page.mouse.move(sx, sy);
await page.mouse.down();
await page.mouse.move(sx + 46, sy + 8, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(250);
st = await readState();
const t2a = st.todos.find((t) => t.id === "t2");
const nb2 = await page.locator('[aria-label="打开待办面板"]').boundingBox();
const M6cok = t2a?.done === false && Math.abs(nb2.x - (nb.x + 46)) < 5 && Math.abs(nb2.y - (nb.y + 8)) < 5;
console.log((M6cok ? "✓" : "✗") + ` M6c 行上起拖 46px 不误划 磁贴重钉`);
if (!M6cok) process.exit(1);

await page.waitForTimeout(400);
await page.locator('[data-todo-id="t3"]').click();
await page.waitForTimeout(500);
st = await readState();
const t3b = st.todos.find((t) => t.id === "t3");
const M6dok = t3b?.done === true && st.badge === "2" &&
  st.rows.find((r) => r.rid === "t3")?.id === "done";
console.log((M6dok ? "✓" : "✗") + ` M6d 拖后点行正常划掉 徽标=2`);
if (!M6dok) process.exit(1);
await page.waitForTimeout(300);

await page.locator('[aria-label="打开待办面板"]').getByText("待办", { exact: true }).click();
const panelInput = page.getByPlaceholder("添加待办，回车确认");
await panelInput.waitFor({ state: "visible", timeout: 6000 });
await page.locator('[aria-label="删除 跑步5公里"]').click();
await page.waitForTimeout(900);
st = await readState();
const M7ok = st.rows.length === 2 && !st.rows.some((r) => r.rid === "t3") && st.badge === "2";
console.log((M7ok ? "✓" : "✗") + ` M7 面板删除 t3 → 磁贴行退场 徽标=2`);
if (!M7ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

async function traceHeight(tile, maxMs = 3500) {
  const seq = [];
  let last = NaN, stable = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs && stable < 5) {
    const h = (await tile.boundingBox())?.height ?? NaN;
    if (!isNaN(h)) {
      if (Math.abs(h - last) < 0.4) stable++;
      else { stable = 0; seq.push(h); }
    }
    last = h;
    await page.waitForTimeout(30);
  }
  return { seq, final: last };
}

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
console.log((M8ok ? "✓" : "✗") + ` M8 待办磁贴高度拉伸：${h0.toFixed(1)}→${h1.toFixed(1)}px 中间值 ${hMid.length} 个`);
if (!M8ok) { console.log("  序列:", hTr.seq.map((h) => h.toFixed(1)).join(",")); process.exit(1); }
await page.waitForTimeout(200);

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
  if (nCommitted && i >= 8) break;
}
const n1 = nSeq[nSeq.length - 1];
const nMid = nSeq.filter((h) => h > Math.min(n0, n1) + 2 && h < Math.max(h0, n1) - 2);
const M9ok = nCommitted && n1 - n0 > 8 && nMid.length >= 1;
console.log((M9ok ? "✓" : "✗") + ` M9 便签磁贴高度拉伸：${n0.toFixed(1)}→${n1.toFixed(1)}px 中间值 ${nMid.length} 个 note 落地=${nCommitted}`);
if (!M9ok) { console.log("  序列:", nSeq.map((h) => h.toFixed(1)).join(",")); process.exit(1); }
console.log("✓ M10 便签磁贴点按开面板（M9 前置点击即验证）");

/* ============ ZE 系列：进禅雾化重建 computed-style 门（本轮核心一） ============ */
await page.locator('[aria-label="关闭面板"]').click();
await page.waitForTimeout(800);

/* 种子 B（ZE/Z 系列）：切常驻形态 + 2 链接 → 重载 → 磁贴墙挂出 */
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("start:settings") || "{}");
  s.linksForm = "docked";
  localStorage.setItem("start:settings", JSON.stringify(s));
  localStorage.setItem("start:links", JSON.stringify([
    { id: "l1", name: "测试站A", url: "https://example.com/" },
    { id: "l2", name: "测试站B", url: "https://www.wikipedia.org/" },
  ]));
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(".cl-links-docked .tile-frost", { timeout: 15000 });
await page.waitForTimeout(1800); /* 入场动画沉降 */
console.log("✓ ZE0 常驻墙挂出（linksForm=docked + 2 磁贴）");

/* 页内动态选取非交互空白 dblclick 落点（常驻墙在场，固定点可能命中磁贴） */
const zenSpot = await page.evaluate(() => {
  for (let y = 80; y < 700; y += 40) {
    for (const x of [40, 80, 120, 1160, 1200, 1240]) {
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      if (el.closest("button, a, nav, input, [role='dialog'], [data-tile-body], .zen-gone .cl-links")) continue;
      return { x, y };
    }
  }
  return { x: 40, y: 680 };
});
console.log(`  · 禅双击落点 (${zenSpot.x},${zenSpot.y})`);

/* ZE1 进禅中间态：页内 rAF 扫样 1.4s，采集 glass-card/tile-frost 的 blur
   插值序列 + label/zen-fog opacity —— Runtime.evaluate 高频会冻渲染器
   timer 队列（冒烟律），一律页内循环 */
await page.evaluate(() => {
  window.__ze = new Promise((res) => {
    const gd = document.querySelector(".zen-gone .glass-card");
    const tf = document.querySelector(".zen-gone .tile-frost");
    const lab = document.querySelector(".zen-gone .tile-label");
    const fog = document.querySelector(".zen-gone .zen-fog");
    const parseBlur = (s) => { const m = /blur\(([\d.]+)px\)/.exec(s || ""); return m ? +m[1] : -1; };
    const seq = { t: [], gd: [], tf: [], lab: [], fog: [] };
    const t0 = performance.now();
    const step = () => {
      const t = performance.now() - t0;
      seq.t.push(+t.toFixed(0));
      seq.gd.push(parseBlur(getComputedStyle(gd).backdropFilter));
      seq.tf.push(parseBlur(getComputedStyle(tf).backdropFilter));
      seq.lab.push(+getComputedStyle(lab).opacity);
      seq.fog.push(+getComputedStyle(fog).opacity);
      if (t < 1400) requestAnimationFrame(step);
      else res({
        gd: seq.gd, tf: seq.tf, lab: seq.lab, fog: seq.fog, gdT: seq.t,
        gdEnd: getComputedStyle(gd).backdropFilter,
        tfEnd: getComputedStyle(tf).backdropFilter,
        gdBg: getComputedStyle(gd).backgroundColor,
        gdVis: getComputedStyle(gd.closest(".zen-gone")).visibility,
        wallVis: getComputedStyle(document.querySelector("section.zen-gone")).visibility,
      });
    };
    requestAnimationFrame(step);
  });
});
await page.mouse.dblclick(zenSpot.x, zenSpot.y);
const ze = await page.evaluate(() => window.__ze);
/* 中值窗口：headless rAF 帧距 ~115ms，ease-out 前段飞快（20→8 一帧跨过
   (10,19) 窗口）——窗口取 (1.1, 19.5)/(1.1, 13.5)（排除基线 20/14 与
   端点 ~1，snap 无中值、插值必有） */
const gdMid = ze.gd.filter((v) => v > 1.1 && v < 19.5).length;
const tfMid = ze.tf.filter((v) => v > 1.1 && v < 13.5).length;
const gdMin = Math.min(...ze.gd), gdMax = Math.max(...ze.gd);
const ZE1ok = gdMid >= 1 && tfMid >= 1 && gdMin < 6 && gdMax > 16 &&
  ze.gdEnd === "blur(1px)" && ze.tfEnd === "blur(1px)" &&
  ze.lab[ze.lab.length - 1] === 0 && ze.fog[ze.fog.length - 1] === 0;
console.log((ZE1ok ? "✓" : "✗") + ` ZE1 进禅值通道扫样：glass-card blur ${gdMax}→${gdMin} 中间值 ${gdMid} 个 / tile-frost 中间值 ${tfMid} 个 / 端点 gd=${ze.gdEnd} tf=${ze.tfEnd} / label=${ze.lab[ze.lab.length - 1]} fog=${ze.fog[ze.fog.length - 1]}`);
if (!ZE1ok) { console.log(JSON.stringify({ gd: ze.gd, tf: ze.tf, lab: ze.lab, fog: ze.fog })); process.exit(1); }

const ZE2ok = ze.gdVis === "hidden" && ze.wallVis === "hidden" && ze.gdBg === "rgba(255, 255, 255, 0)";
console.log((ZE2ok ? "✓" : "✗") + ` ZE2 禅末态：磁贴/墙 visibility hidden + 玻璃板 bg α=0（${ze.gdBg}）`);
if (!ZE2ok) process.exit(1);

/* ZE3 退禅 snap：基态 transition 表不含 backdrop-filter → +~60ms 即满血 */
await page.mouse.dblclick(zenSpot.x, zenSpot.y);
await page.waitForTimeout(60);
const snap = await page.evaluate(() => ({
  gd: getComputedStyle(document.querySelector(".zen-gone .glass-card")).backdropFilter,
  tf: getComputedStyle(document.querySelector(".zen-gone .tile-frost")).backdropFilter,
  zen: document.documentElement.classList.contains("zen"),
}));
const ZE3ok = snap.zen === false && /^blur\(20px\)\s*saturate\(1\.5\)$/.test(snap.gd) &&
  /^blur\(14px\)\s*saturate\(1\.6\)$/.test(snap.tf);
console.log((ZE3ok ? "✓" : "✗") + ` ZE3 退禅首帧满血 snap：gd=${snap.gd} tf=${snap.tf}`);
if (!ZE3ok) process.exit(1);
await page.waitForTimeout(900);

/* ============ Z 系列：禅磨砂像素门（v8.7.150 回归） ============ */
await page.evaluate(() => {
  window.__grad = (dataUrl) => new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const W = c.width, H = c.height;
      const x0 = Math.floor(W * 0.12), x1 = Math.ceil(W * 0.88);
      const y0 = Math.floor(H * 0.25), y1 = Math.ceil(H * 0.75);
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1 - 1; x++) {
          const i = (y * W + x) * 4, j = i + 4;
          const a = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const b = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
          sum += Math.abs(a - b); n++;
        }
      }
      res(n ? sum / n : -1);
    };
    img.src = dataUrl;
  });
  document.querySelectorAll('.zen-gone .glass-card > span').forEach((el) => {
    el.style.visibility = "hidden";
  });
});

async function sampleFrost(sel) {
  const box = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, sel);
  if (!box) return null;
  const ref = {
    x: box.x + box.width * 0.2, y: Math.max(2, box.y - 84),
    width: 110, height: 56,
  };
  const tileShot = await page.screenshot({ clip: box });
  const refShot = await page.screenshot({ clip: ref });
  const b64t = "data:image/png;base64," + tileShot.toString("base64");
  const b64r = "data:image/png;base64," + refShot.toString("base64");
  const [gt, gr] = await page.evaluate(async ([t, r]) => {
    return [await window.__grad(t), await window.__grad(r)];
  }, [b64t, b64r]);
  return { tile: +gt.toFixed(3), ref: +gr.toFixed(3), ratio: +(gr / Math.max(gt, 0.001)).toFixed(2) };
}

const TODO = '[aria-label="打开待办面板"]';
const NOTE = '[aria-label="打开便签面板"]';

const zb = { todo: await sampleFrost(TODO), note: await sampleFrost(NOTE) };
const Z1ok = zb.todo.ratio >= 10 && zb.note.ratio >= 10 && zb.todo.ref >= 0.4 && zb.note.ref >= 0.4;
console.log((Z1ok ? "✓" : "✗") + ` Z1 基线磨砂在线：todo ratio=${zb.todo.ratio} note ratio=${zb.note.ratio}（ref ${zb.todo.ref}/${zb.note.ref}）`);
if (!Z1ok) { console.log(JSON.stringify(zb, null, 2)); process.exit(1); }

async function zenCycle(tag) {
  await page.mouse.dblclick(zenSpot.x, zenSpot.y);
  await page.waitForTimeout(1300);
  const zen = await page.evaluate(() => ({
    on: document.documentElement.classList.contains("zen"),
    vis: [...document.querySelectorAll(".zen-gone")].map((e) => getComputedStyle(e).visibility),
  }));
  const Z2ok = zen.on && zen.vis.every((v) => v === "hidden");
  console.log((Z2ok ? "✓" : "✗") + ` ${tag} 进禅：html.zen + 三载体 visibility hidden`);
  if (!Z2ok) { console.log(JSON.stringify(zen, null, 2)); process.exit(1); }

  await page.mouse.dblclick(zenSpot.x, zenSpot.y);
  const t0 = Date.now();
  const pts = [];
  for (const target of [700, 1300]) {
    const wait = target - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    const s = await sampleFrost(TODO);
    const n = await sampleFrost(NOTE);
    pts.push({ at: ((Date.now() - t0) / 1000).toFixed(2), todo: s, note: n });
  }
  const Z3ok = pts.every((p) => p.todo.ratio >= 10 && p.note.ratio >= 10);
  console.log((Z3ok ? "✓" : "✗") + ` ${tag} 退禅磨砂即满血：` +
    pts.map((p) => `+${p.at}s todo=${p.todo.ratio} note=${p.note.ratio}`).join(" / "));
  if (!Z3ok) { console.log(JSON.stringify(pts, null, 2)); process.exit(1); }
}

await zenCycle("Z2/Z3");
await page.waitForTimeout(400);
await zenCycle("Z4");

await page.evaluate(() => {
  document.querySelectorAll('.zen-gone .glass-card > span').forEach((el) => {
    el.style.visibility = "";
  });
});

/* ============ R 系列：录制根修（本轮核心三） ============ */
const start = await browser.newPage();
start.on("pageerror", (e) => errors.push("launcher:" + String(e)));
await start.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
await start.evaluate(() => new Promise((res) => chrome.storage.local.set({ snifferOn: true }, res)));
await new Promise((r) => setTimeout(r, 800));
console.log("✓ R0 嗅探开关已开");

const rpage = await browser.newPage();
rpage.on("pageerror", (e) => errors.push("rec:" + String(e)));
await rpage.goto("https://example.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
await rpage.waitForSelector("#chushi-sniffer-host", { state: "attached", timeout: 15000 });

/* 动画画布流视频：保证 captureStream 持续出帧 → MediaRecorder 有数据 */
await rpage.evaluate(() => {
  const c = document.createElement("canvas");
  c.width = 320; c.height = 180;
  c.id = "rec-canvas";
  const g = c.getContext("2d");
  const draw = () => {
    g.fillStyle = `hsl(${(performance.now() / 12) % 360} 80% 55%)`;
    g.fillRect(0, 0, 320, 180);
    g.fillStyle = "#fff";
    g.fillRect((performance.now() / 8) % 320, 60, 30, 60);
    window.__rafId = requestAnimationFrame(draw);
  };
  draw();
  const v = document.createElement("video");
  v.id = "rec-video";
  v.muted = true;
  v.autoplay = true;
  const stream = c.captureStream(30);
  v.srcObject = stream;
  document.body.appendChild(v);
  v.play();
  window.__recStream = stream;
  window.__recVideo = v;
});
await rpage.waitForFunction(() => {
  const v = document.getElementById("rec-video");
  return !!v && v.videoWidth > 0 && !v.paused;
}, null, { timeout: 10000 });
console.log("✓ R1 画布流视频播放中（videoWidth>0）");

/* 探针直查（MAIN world 可达） */
const lst = await rpage.evaluate(() => window.__chushiRec ? window.__chushiRec.list() : null);
const R1ok = Array.isArray(lst) && lst.length >= 1 && lst[0].w > 0;
console.log((R1ok ? "✓" : "✗") + ` R1b 探针 list=${JSON.stringify(lst)}`);
if (!R1ok) process.exit(1);

function ballTap(pg) {
  return pg.evaluate(() => {
    const b = document.querySelector("#chushi-sniffer-host").shadowRoot.querySelector(".ball");
    b.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, button: 0, pointerType: "mouse", clientX: 100, clientY: 100 }));
    b.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, button: 0, pointerType: "mouse", clientX: 100, clientY: 100 }));
  });
}
await ballTap(rpage);
await rpage.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  return !!r && !!r.querySelector(".panel.open");
}, null, { timeout: 8000 });
console.log("✓ R2 面板展开");

await rpage.locator('[data-act="rec-list"]').click();
await rpage.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  return !!r && !!r.querySelector('[data-act="rec-start"]');
}, null, { timeout: 10000 });
console.log("✓ R3 扫描出候选");

await rpage.locator('[data-act="rec-start"]').first().click();
await rpage.waitForFunction(() => {
  const r = document.querySelector("#chushi-sniffer-host")?.shadowRoot;
  return !!r && !!r.querySelector("[data-rec-live]");
}, null, { timeout: 10000 });
await rpage.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  r.querySelector("[data-rec-live]").__chushiKeep = "live-node";
});
const t0s = Date.now();
const time1 = await rpage.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  return r.querySelector("[data-rec-time]")?.textContent || "";
});
console.log(`✓ R4 开录（data-rec-live 在位 标记打上 走秒读数=${time1}）`);

/* R5 风暴：20 连发 sniffer-new（整表替换语义），期间标记/停止钮/走秒全须在位 */
const stormInfo = await start.evaluate(async () => {
  const tabs = await chrome.tabs.query({ url: "https://example.com/*" });
  if (!tabs.length) return { fail: "no example tab" };
  const mk = (n) => Array.from({ length: n }, (_, i) => ({
    url: `https://cdn.example.com/media/storm-${i}.mp4`,
    type: "video", ext: "mp4",
    name: `风暴资源-${i}.mp4`, size: 1024 * 1024, host: "cdn.example.com", at: Date.now(),
  }));
  const items = mk(8);
  for (let k = 0; k < 20; k++) {
    chrome.tabs.sendMessage(tabs[0].id, { type: "sniffer-new", items });
    await new Promise((r) => setTimeout(r, 130));
  }
  return { tabId: tabs[0].id, sent: 20 };
});
if (stormInfo.fail) { console.error("✗ 风暴发送失败 " + stormInfo.fail); process.exit(1); }
console.log(`✓ R5 风暴 20 连发完成（tab ${stormInfo.tabId}）`);

const R5st = await rpage.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  const live = r.querySelector("[data-rec-live]");
  return {
    keep: live ? live.__chushiKeep || "" : "GONE",
    stopBtn: !!r.querySelector('[data-act="rec-stop"]'),
    cnt: (r.querySelector(".ph .cnt") || {}).textContent || "",
  };
});
await page.waitForTimeout(0); /* 走秒需间隔——录制约 4s+ 了 */
const time2 = await rpage.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  return r.querySelector("[data-rec-time]")?.textContent || "";
});
const toSec = (s) => { const [m, ss] = (s || "0:00").split(":").map(Number); return m * 60 + (ss || 0); };
const R5ok = R5st.keep === "live-node" && R5st.stopBtn &&
  toSec(time2) > toSec(time1) && toSec(time2) >= 2;
console.log((R5ok ? "✓" : "✗") + ` R5 风暴后：标记节点存活=${R5st.keep === "live-node"} 停止钮在位=${R5st.stopBtn} 走秒 ${time1}→${time2}（实时 tick） 列表计数=${R5st.cnt}`);
if (!R5ok) process.exit(1);

/* R6 风暴尾段真点击停止 → 必须有下文 */
const toastText = () => rpage.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  const t = r.querySelector(".toast");
  return t && t.classList.contains("show") ? t.textContent : "";
});
await rpage.locator('[data-act="rec-stop"]').click();
let R6done = false, R6toast = "";
for (let i = 0; i < 32; i++) {
  await rpage.waitForTimeout(250);
  const gone = await rpage.evaluate(() => {
    const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
    return !r.querySelector("[data-rec-live]");
  });
  if (gone) { R6done = true; break; }
}
await rpage.waitForTimeout(300);
R6toast = await toastText();
const backToList = await rpage.evaluate(() => {
  const r = document.querySelector("#chushi-sniffer-host").shadowRoot;
  return !!r.querySelector('[data-act="rec-start"]');
});
const R6ok = R6done && backToList && R6toast.includes("已保存") && !R6toast.includes("停止失败");
console.log((R6ok ? "✓" : "✗") + ` R6 风暴中点停止：rec 区回候选列表=${R6done} toast="${R6toast}"`);
if (!R6ok) process.exit(1);

/* R7 源断自动收尾：探针开录 → track.stop() → finalize(auto) → 事件 → 桥 → 浮窗 */
const startOk = await rpage.evaluate(() => window.__chushiRec.start(0));
if (!startOk || !startOk.ok) { console.error("✗ R7 探针开录失败 " + JSON.stringify(startOk)); process.exit(1); }
/* 2.1s：跨两次 1000ms timeslice 落盘——Chrome 对 track-ended 自动停表
   不保证尾帧 flush，<1s 会话可能 empty（产品侧诚实报错即可） */
await rpage.waitForTimeout(2100);
await rpage.evaluate(() => {
  window.__recStream.getTracks().forEach((t) => t.stop());
});
await rpage.waitForTimeout(600);
const autoToastHit = await (async () => {
  for (let i = 0; i < 16; i++) {
    const t = await toastText();
    if (t.includes("视频源已切换")) return true;
    await rpage.waitForTimeout(250);
  }
  return false;
})();
const lateStop = await rpage.evaluate(() =>
  window.__chushiRec.stop().catch((e) => ({ ok: false, error: String(e) }))
);
const R7ok = autoToastHit && lateStop && lateStop.ok === true && lateStop.auto === true &&
  (lateStop.size || 0) > 0 && (lateStop.seconds || 0) >= 1;
console.log((R7ok ? "✓" : "✗") + ` R7 源断自动收尾：浮窗自动落盘 toast=${autoToastHit} 迟到 stop→${JSON.stringify({ ok: lateStop && lateStop.ok, auto: lateStop && lateStop.auto, size: lateStop && lateStop.size, secs: lateStop && lateStop.seconds })}`);
if (!R7ok) { console.log(JSON.stringify(lateStop)); process.exit(1); }

/* R8 伪造 rec-ended 事件 → 桥转发浮窗（通道回归）。先等 R7 toast 熄灭，
   避免断言撞上残留 toast 假绿 */
const toastClear = await (async () => {
  for (let i = 0; i < 24; i++) {
    const t = await toastText();
    if (!t) return true;
    await rpage.waitForTimeout(300);
  }
  return false;
})();
await rpage.evaluate(() => {
  window.postMessage({ __chushiRecEvt: "rec-ended", payload: { ok: true, url: "blob:https://example.com/fake", size: 4096, mime: "video/webm", seconds: 2 } }, "*");
});
const R8hit = await (async () => {
  for (let i = 0; i < 16; i++) {
    const t = await toastText();
    if (t.includes("视频源已切换")) return true;
    await rpage.waitForTimeout(250);
  }
  return false;
})();
console.log((R8hit && toastClear ? "✓" : "✗") + ` R8 伪造 rec-ended → 桥转发浮窗 toast=${R8hit}（前置 toast 已熄灭=${toastClear}）`);
if (!R8hit || !toastClear) process.exit(1);

await browser.close();
if (errors.length) {
  console.error("✗ pageerror:", errors);
  process.exit(1);
}
console.log("✓ pageerror=0 全程");
console.log("\nSMOKE PASS (v8.7.151)");
