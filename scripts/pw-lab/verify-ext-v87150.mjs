/* v8.7.150 真扩展冒烟：禅雾化改道（磨砂死亡窗根除）+ v8.7.149 全量回归
 * 链路：装包 → 种子 → 磁贴挂出 →
 * 【Z 系列像素门】隐藏磁贴内容只留玻璃板 → 截图磁贴/上方裸壁纸区 →
 *   页内 canvas 灰度横向梯度 → ratio=ref/tile：
 *   磨砂活着 ratio 大（基线 75~600+），磨砂死（玻璃板直透锐利壁纸）ratio≈1~2.6；
 *   Z1 基线磨砂在线 → Z2 进禅 visibility 隐没 →
 *   Z3 退禅 +0.70s（显影刚结束）与 +1.30s 双采样 ratio≥10（旧版同点位
 *   实测 0.99/2.06 全死——核心门）→ Z4 第二轮进出复验 →
 * 【M 系列回归】v8.7.149 十七项（划掉驻留/反悔/面板删除退场/拖动重放/
 *   行上起拖不误划/拖后点行/双磁贴拉伸/点按开面板）→
 * pageerror=0。
 * ⚠️ 冒烟新律沿用：traceHeight 必须 boundingBox 轮询（高频 Runtime.evaluate
 * 会冻结 headless renderer 的 timer 队列）。 */
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";

const ZIP = "/home/z/beta-wt/download/v8.7.150/ChuShi-NewTab-v8.7.150.zip";
const extDir = mkdtempSync(tmpdir() + "/ext-v150-");
execSync(`unzip -qo "${ZIP}" -d ${extDir}`);
const mf = JSON.parse(readFileSync(extDir + "/manifest.json", "utf8"));
if (mf.version !== "8.7.150") { console.error("✗ manifest 版本异常 " + mf.version); process.exit(1); }
console.log("✓ M0 manifest 8.7.150");

rmSync("/tmp/ext-v150-profile", { recursive: true, force: true });
const browser = await chromium.launchPersistentContext("/tmp/ext-v150-profile", {
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
console.log("✓ M1 磁贴挂出（seed 3 条 + todoTile/noteTile + mist-lake 壁纸）");

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
  st.rows[0].id === "done" && st.rows[0].pressed === "true" && strikeX >= 0.99 &&
  st.rows[1].rid === "t2" && st.rows[2].rid === "t3";
console.log((M3ok ? "✓" : "✗") + ` M3 点行划掉：t1.done=true 徽标=2 行原地不动位 划线 scaleX(1)`);
if (!M3ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

await page.waitForTimeout(2500);
st = await readState();
const M4ok = st.rows.length === 3 && st.rows[0].rid === "t1" && st.rows[0].id === "done" && st.badge === "2";
console.log((M4ok ? "✓" : "✗") + ` M4 驻留 2.5s 划掉行仍在磁贴（不消失）`);
if (!M4ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

await page.locator('[data-todo-row="done"]').first().click();
await page.waitForTimeout(500);
st = await readState();
const t1b = st.todos.find((t) => t.id === "t1");
const M5ok = t1b?.done === false && st.badge === "3" && st.rows.every((r) => r.id === "open");
console.log((M5ok ? "✓" : "✗") + ` M5 驻留反悔：t1.done 回 false 行回 open 徽标=3`);
if (!M5ok) { console.log(JSON.stringify(st, null, 2)); process.exit(1); }

/* M6 拖动重放回归：rAF 采样行-磁贴相对 top */
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
console.log((M6ok ? "✓" : "✗") + ` M6 拖动重放：${ds.length} 帧采样 相对 top 极差 ${(dMax - dMin).toFixed(3)}px（≤1.5 无重放）`);
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
console.log((M6bok ? "✓" : "✗") + ` M6b 拖动落座重钉 pinTile=${JSON.stringify(pinAfterDrag)} 无误划 徽标=3`);
if (!M6bok) process.exit(1);

const rb = await page.locator('[data-todo-id="t2"]').boundingBox();
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
if (!M6cok) process.exit(1);

await page.waitForTimeout(400);
await page.locator('[data-todo-id="t3"]').click();
await page.waitForTimeout(500);
st = await readState();
const t3b = st.todos.find((t) => t.id === "t3");
const M6dok = t3b?.done === true && st.badge === "2" &&
  st.rows.find((r) => r.rid === "t3")?.id === "done";
console.log((M6dok ? "✓" : "✗") + ` M6d 拖后点行正常划掉：t3.done=true 徽标=2`);
if (!M6dok) process.exit(1);
await page.waitForTimeout(300);

await page.locator('[aria-label="打开待办面板"]').getByText("待办", { exact: true }).click();
const panelInput = page.getByPlaceholder("添加待办，回车确认");
await panelInput.waitFor({ state: "visible", timeout: 6000 });
await page.locator('[aria-label="删除 跑步5公里"]').click();
await page.waitForTimeout(900);
st = await readState();
const M7ok = st.rows.length === 2 && !st.rows.some((r) => r.rid === "t3") && st.badge === "2";
console.log((M7ok ? "✓" : "✗") + ` M7 面板删除 t3 → 磁贴行退场（删除才消失）徽标=2`);
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
const nMid = nSeq.filter((h) => h > Math.min(n0, n1) + 2 && h < Math.max(n0, n1) - 2);
const M9ok = nCommitted && n1 - n0 > 8 && nMid.length >= 1;
console.log((M9ok ? "✓" : "✗") + ` M9 便签磁贴高度拉伸：${n0.toFixed(1)}→${n1.toFixed(1)}px 中间值 ${hMid.length >= 0 ? nMid.length : 0} 个 note 落地=${nCommitted}`);
if (!M9ok) { console.log("  序列:", nSeq.map((h) => h.toFixed(1)).join(",")); process.exit(1); }
console.log("✓ M10 便签磁贴点按开面板（M9 前置点击即验证）");

/* ============ Z 系列：禅磨砂像素门（本轮核心） ============ */
/* 收面板，回纯净桌面 */
await page.locator('[aria-label="关闭面板"]').click();
await page.waitForTimeout(800);

/* 隐藏磁贴内容只留玻璃板（zen-fog 是 glass-card 直接子层） */
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
  /* 裸壁纸参照区：磁贴正上方 84px（避开 dock/时钟/内容） */
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
  await page.dblclick("body", { position: { x: 640, y: 600 } });
  await page.waitForTimeout(1300);
  const zen = await page.evaluate(() => ({
    on: document.documentElement.classList.contains("zen"),
    vis: [...document.querySelectorAll(".zen-gone")].map((e) => getComputedStyle(e).visibility),
  }));
  const Z2ok = zen.on && zen.vis.every((v) => v === "hidden");
  console.log((Z2ok ? "✓" : "✗") + ` ${tag} 进禅：html.zen + 双磁贴 visibility hidden`);
  if (!Z2ok) { console.log(JSON.stringify(zen, null, 2)); process.exit(1); }

  await page.dblclick("body", { position: { x: 640, y: 600 } });
  const t0 = Date.now();
  /* 采样到 +0.70s（显影 0.65s 刚结束）与 +1.30s——旧版同点位实测死（0.99/2.06） */
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
await browser.close();
if (errors.length) {
  console.error("✗ pageerror:", errors);
  process.exit(1);
}
console.log("✓ pageerror=0 全程");
console.log("\nSMOKE PASS (v8.7.150)");
