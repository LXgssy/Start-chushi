/* v8.7.150 探针：禅模式进出后磁贴磨砂死亡的像素级复现
 * 用户实测：进禅再退禅，待办/便签磁贴磨砂消失 1-2s 才恢复。
 * 方法：隐藏磁贴内容层只留玻璃板 → 截图磁贴区与相邻裸壁纸区 →
 * 页内 canvas 灰度横向梯度均值 → 比值 ratio=ref/tile：
 *   磨砂活着 tile≈blur(20px) 低梯度 → ratio 大；
 *   磨砂死了（玻璃板直透锐利壁纸）→ tile≈α·ref → ratio ≈ 1/(1-0.62) ≈ 2.6；
 * 时间线：退禅后每 ~250ms 采样 3.6s，定位「死亡窗」与「复活点」。
 */
import { chromium } from "playwright-core";
import { execSync } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";
import { readFileSync } from "fs";

const ZIP = process.argv[2] || "/home/z/beta-wt/download/v8.7.149/ChuShi-NewTab-v8.7.149.zip";
const extDir = mkdtempSync(tmpdir() + "/ext-zf-");
execSync(`unzip -qo "${ZIP}" -d ${extDir}`);
const extId = createHash("sha256").update(extDir).digest("hex").slice(0, 32)
  .split("").map((c) => "abcdefghijklmnop"[parseInt(c, 16)]).join("");

const browser = await chromium.launchPersistentContext("/tmp/ext-zf-profile", {
  headless: true,
  channel: "chromium",
  args: [`--headless=new`, `--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  viewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`chrome-extension://${extId}/index.html`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1200);

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
  localStorage.setItem("start:note", JSON.stringify("禅磨砂探针"));
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector('[aria-label="打开待办面板"]', { timeout: 15000 });
await page.waitForTimeout(2600); /* 入场沉降（0.55 错拍 + 聚拢） */
console.log("✓ M1 起始页就绪（mist-lake 壁纸 + 双磁贴）");

/* 内容层隐藏：只留玻璃板（采样与磁贴文字无关） */
await page.evaluate(() => {
  document.querySelectorAll('.zen-gone .glass-card > span').forEach((el) => {
    el.style.visibility = "hidden";
  });
});

/* 页内梯度度量 */
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
});

async function sampleAt(sel, refSide) {
  const box = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, sel);
  if (!box) return null;
  const ref = {
    x: refSide === "right" ? box.x + box.width + 26 : Math.max(2, box.x - 26 - 110),
    y: box.y + box.height * 0.15,
    width: 110, height: Math.max(20, box.height * 0.7),
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

const base = { todo: await sampleAt(TODO, "right"), note: await sampleAt(NOTE, "left") };
console.log("M2 基线（磨砂应活着）:", JSON.stringify(base));

/* 进禅 */
await page.dblclick("body", { position: { x: 640, y: 600 } });
await page.waitForTimeout(1400);
const zenState = await page.evaluate(() => ({
  zen: document.documentElement.classList.contains("zen"),
  todoVis: getComputedStyle(document.querySelector(".zen-gone")).visibility,
}));
console.log("M3 进禅态:", JSON.stringify(zenState));

/* 退禅 */
await page.dblclick("body", { position: { x: 640, y: 600 } });
const t0 = Date.now();
console.log("M4 退禅，开始采样时间线");

const rows = [];
let done = false;
for (let i = 0; i < 16 && !done; i++) {
  const st = await sampleAt(TODO, "right");
  const nt = await sampleAt(NOTE, "left");
  const css = await page.evaluate(() => {
    const zg = document.querySelector(".zen-gone");
    const gc = document.querySelector(".zen-gone .glass-card");
    const a = getComputedStyle(zg), b = getComputedStyle(gc);
    return { zgOp: a.opacity, zgFl: a.filter, gcOp: b.opacity, gcFl: b.filter, gcBf: b.backdropFilter.slice(0, 24), gcWC: b.willChange };
  });
  const t = ((Date.now() - t0) / 1000).toFixed(2);
  rows.push({ t, todo: st, note: nt, css });
  console.log(`t=+${t}s todo tile=${st.tile} ref=${st.ref} ratio=${st.ratio} | note tile=${nt.tile} ratio=${nt.ratio} | css ${JSON.stringify(css)}`);
  /* 连续两次 ratio≥5 视为已复活 */
  const last2 = rows.slice(-2);
  if (last2.length === 2 && last2.every((r) => r.todo.ratio >= 5 && r.note.ratio >= 5)) done = true;
  await page.waitForTimeout(60);
}

await page.evaluate(() => {
  document.querySelectorAll('.zen-gone .glass-card > span').forEach((el) => {
    el.style.visibility = "";
  });
});
await browser.close();
console.log("pageerror:", errors.length ? errors : "0");
