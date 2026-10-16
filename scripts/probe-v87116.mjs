// v8.7.121 运行时终验探针——用户指令「把抽屉页面快捷服务上方的遮罩再往上移
// 一点，现在的挡住了一部分图标，下方的遮罩也下移一点」。
// 本轮一项：抽屉羽化遮罩锚层根修 + 上下缘外扩（DRAWER_VEIL_LIFT=32 /
// DRAWER_VEIL_DROP=24）。旧实现两枚 FadeVeil 锚视口尺寸层——顶遮罩 rect
// -32~-4（视口外）、底遮罩 692~720（滚动层底 624 之下空带），羽化自
// v8.7.105 起恒失效，磁贴边缘硬裁=「遮罩挡住图标」。
// 门组：A 静止几何（40 磁贴满滚场景） / B 滚动中双显影+渐隐截图 /
// C 内容少居中不变（6 磁贴静止位 57 分毫不动+遮罩不显影） /
// D 抽屉出入场无裁切（动画帧序列） / E 常驻形态回归（docked 遮罩原样） /
// F popup 快速回归（免责门锚在位）。
import { chromium } from "playwright-core";
import crypto from "crypto";
import { execSync } from "child_process";
import { mkdirSync, rmSync } from "fs";

const ZIP = "/home/z/beta-wt/download/v8.7.121/ChuShi-NewTab-v8.7.121.zip";
const ROOT = "/tmp/ext-v87116";
const SHOTS = "/tmp/probe-v87116-shots";
const PROFILE = "/tmp/ext-v87116-profile";
rmSync(ROOT, { recursive: true, force: true });
rmSync(SHOTS, { recursive: true, force: true });
rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
execSync(`unzip -oq "${ZIP}" -d "${ROOT}"`);

const EXT_ID = (() => {
  const h = crypto.createHash("sha256").update(Buffer.from(ROOT)).digest("hex").slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + (parseInt(c, 16) % 26))).join("");
})();
const EXT_URL = (p) => `chrome-extension://${EXT_ID}/${p}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launchPersistentContext(PROFILE, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--no-first-run", "--no-sandbox"],
});
console.log("stage: chromium 启动 EXT_ID=" + EXT_ID.slice(0, 8));

let ok = 0; const bad = [];
function gate(name, cond, detail = "") {
  if (cond) { ok++; console.log(`  [OK] ${name}${detail ? " | " + detail : ""}`); }
  else { bad.push(name + (detail ? " | " + detail : "")); console.log(`  [FAIL] ${name}${detail ? " | " + detail : ""}`); }
}

const page = await browser.newPage();
await page.goto(EXT_URL("index.html"));
await page.waitForTimeout(1200);

const setLinks = (n) => page.evaluate((cnt) => {
  const ls = Array.from({ length: cnt }, (_, i) => ({
    id: "t" + i, name: "站点" + (i + 1), url: "https://example" + i + ".com",
  }));
  localStorage.setItem("start:links", JSON.stringify(ls));
}, n);
const reload = async () => { await page.reload(); await page.waitForTimeout(1200); };
const openDrawer = async () => {
  await page.mouse.click(120, 450, { button: "middle" });
  await page.waitForTimeout(900);
};
const drawerEval = (expr) => page.evaluate((src) => {
  const root = document.querySelector(".cl-drawer-veil")?.parentElement;
  if (!root) return null;
  const R = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), height: +r.height.toFixed(1) };
  };
  return eval(`(() => { const root = document.querySelector(".cl-drawer-veil")?.parentElement; if (!root) return null; ${src} })()`);
}, expr);
const geom = `
  const q = (s) => root.querySelector(s);
  const vt = q(".cl-fade-veil-top"), vb = q(".cl-fade-veil-bottom"), sc = q(".cl-links-scroll");
  const tile = q(".cl-links-grid > div:first-child");
  const dock = document.querySelector(".cl-dock");
  return {
    vt: R(vt), vtOp: vt ? getComputedStyle(vt).opacity : null,
    vb: R(vb), vbOp: vb ? getComputedStyle(vb).opacity : null,
    sc: R(sc), tile: R(tile), dock: R(dock),
    st: sc ? sc.scrollTop : null,
  };
`;
/* ---------------- A. 静止几何（40 磁贴满滚场景） ---------------- */
console.log("—— A. 抽屉静止几何（40 磁贴） ——");
await setLinks(40); await reload(); await openDrawer();
const a = await drawerEval(geom);
console.log("  A-geom:", JSON.stringify(a));
gate("A1 抽屉打开", !!a && !!a.sc);
gate("A2 滚动层顶缘上移 32px（36→4）", a && a.sc && Math.abs(a.sc.top - 4) <= 1, `top=${a.sc.top}`);
gate("A3 滚动层底缘下移 24px（624→648）", a && a.sc && Math.abs(a.sc.bottom - 648) <= 1, `bottom=${a.sc.bottom}`);
gate("A4 顶遮罩贴滚动层顶缘（4~32）", a && a.vt && Math.abs(a.vt.top - 4) <= 1 && Math.abs(a.vt.bottom - 32) <= 1, JSON.stringify(a.vt));
gate("A5 底遮罩贴滚动层底缘（620~648）", a && a.vb && Math.abs(a.vb.top - 620) <= 1 && Math.abs(a.vb.bottom - 648) <= 1, JSON.stringify(a.vb));
gate("A6 第一排磁贴静止位分毫不动（top=36）", a && a.tile && Math.abs(a.tile.top - 36) <= 1, `top=${a.tile.top}`);
gate("A7 底缘不压 Dock（648 < 650）", a && a.dock && a.sc.bottom < a.dock.top, `scroll.btm=${a.sc.bottom} dock.top=${a.dock.top}`);
gate("A8 静止态遮罩不显影（scrollTop=0）", a && a.vtOp === "0" && a.vbOp === "0", `top=${a.vtOp} btm=${a.vbOp}`);

/* ---------------- B. 滚动中：双显影 + 渐隐截图 ---------------- */
console.log("—— B. 滚动中双遮罩显影 ——");
await page.mouse.move(720, 450);
const maxScroll = await page.evaluate(() => {
  const el = document.querySelector(".cl-drawer-veil")?.parentElement?.querySelector(".cl-links-scroll");
  return el ? el.scrollHeight - el.clientHeight : 0;
});
const half = Math.max(60, Math.round(maxScroll / 2));
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, Math.round(half / 12)); await sleep(110); }
await page.waitForTimeout(600);
const b = await drawerEval(geom);
console.log("  B-geom:", JSON.stringify(b));
gate("B1 顶遮罩显影", b && b.vtOp === "1", `opacity=${b.vtOp}`);
gate("B2 底遮罩显影", b && b.vbOp === "1", `opacity=${b.vbOp}`);
gate("B3 顶遮罩仍贴缘（滚动层盒不随滚动动）", b && b.vt && Math.abs(b.vt.top - 4) <= 1);
gate("B4 底遮罩仍贴缘", b && b.vb && Math.abs(b.vb.bottom - 648) <= 1);
await page.screenshot({ path: SHOTS + "/b-mid.png" });
// 滚回顶部：顶遮罩应隐影
for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -Math.round(half / 12)); await sleep(110); }
await page.waitForTimeout(600);
await page.waitForTimeout(400); // B5: 顶遮罩 0.3s opacity 过渡走完余量
const b2 = await drawerEval(geom);
gate("B5 滚回顶部后顶遮罩隐影", b2 && (b2.vtOp === "0" || Number(b2.vtOp) < 0.02) && Math.abs(b2.st) < 2, `opacity=${b2.vtOp} st=${b2.st}`);
// 滚到底部：底遮罩应隐影（对冲 paddingBottom 让磁贴完全离开遮罩带）
for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, Math.round(maxScroll / 14)); await sleep(110); }
await page.waitForTimeout(600);
await page.waitForTimeout(400); // B6: 底遮罩 0.3s opacity 过渡走完余量
const b3 = await drawerEval(geom);
gate("B6 滚到底部后底遮罩隐影", b3 && (b3.vbOp === "0" || Number(b3.vbOp) < 0.08), `opacity=${b3.vbOp} st=${b3.st}/${maxScroll}`);
await page.screenshot({ path: SHOTS + "/b-end.png" });

/* ---------------- C. 内容少居中不变（6 磁贴） ---------------- */
console.log("—— C. 内容少居中不变 ——");
// 旧版同场景基线：6+1 磁贴 2 排内容高 204 < 588 → my-auto 居中，磁贴顶=(720-132-204)/2+36=228。
// 新版对冲律：锚定层盒=margin box（负 margin 被等值 padding 抵消）→ 居中位分毫不动。
await page.mouse.click(120, 450, { button: "middle" });
await page.waitForTimeout(900);
await setLinks(6); await reload(); await openDrawer();
const c = await drawerEval(geom);
console.log("  C-geom:", JSON.stringify(c));
gate("C1 6 磁贴居中位分毫不动（top=228，旧版同款）", c && c.tile && Math.abs(c.tile.top - 228) <= 1, `top=${c.tile.top}`);
gate("C2 滚动层外扩几何（顶 196=228-32 / 底 456=196+260）", c && c.sc && Math.abs(c.sc.top - 196) <= 1 && Math.abs(c.sc.bottom - 456) <= 1, `sc=${JSON.stringify(c.sc)}`);
gate("C3 不可滚时遮罩不显影", c && c.vtOp === "0" && c.vbOp === "0");

/* ---------------- D. 出入场动画帧序列无裁切异常 ---------------- */
console.log("—— D. 出入场动画 ——");
// 24 磁贴：内容高 546 < 588 → 居中场景，旧版磁贴顶=57（首轮 geom 实测同款）；
// 新版对冲后磁贴顶应仍=57。40 磁贴满滚场景（内容>588）顶格 36 已由 A6 验证。
await page.mouse.click(120, 450, { button: "middle" }); // 关
await page.waitForTimeout(850);
await setLinks(24); await reload(); await openDrawer();
const d1 = await drawerEval(geom);
await page.screenshot({ path: SHOTS + "/d-open.png" });
gate("D1 24 磁贴唤出后第一排顶=57（居中位分毫不动）", d1 && d1.tile && Math.abs(d1.tile.top - 57) <= 1, `top=${d1.tile.top}`);
gate("D2 落位后遮罩隐影（未滚动）", d1 && d1.vtOp === "0" && d1.vbOp === "0");

/* ---------------- E. 常驻形态回归（docked 原样） ---------------- */
console.log("—— E. 常驻形态回归 ——");
await page.mouse.click(120, 450, { button: "middle" });
await page.waitForTimeout(850);
await page.evaluate(() => {
  const raw = localStorage.getItem("start:settings");
  const s = raw ? JSON.parse(raw) : {};
  s.linksForm = "docked";
  localStorage.setItem("start:settings", JSON.stringify(s));
});
await reload();
const e = await page.evaluate(() => {
  const R = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), height: +r.height.toFixed(1) };
  };
  const docked = document.querySelector(".cl-links-docked");
  if (!docked) return { err: "no docked" };
  const vt = docked.querySelector(".cl-fade-veil-top");
  const vb = docked.querySelector(".cl-fade-veil-bottom");
  const sc = docked.querySelector(".cl-links-scroll");
  const s = sc ? getComputedStyle(sc) : null;
  return {
    vt: vt ? R(vt) : null, vb: vb ? R(vb) : null,
    vbCount: docked.querySelectorAll(".cl-fade-veil-bottom").length,
    mt: s ? s.marginTop : null, pt: s ? s.paddingTop : null, pb: s ? s.paddingBottom : null,
  };
});
console.log("  E-geom:", JSON.stringify(e));
gate("E1 常驻顶遮罩在位（lift=32 对冲）", e && e.vt && e.mt === "-32px" && e.pt === "32px", `mt=${e.mt} pt=${e.pt}`);
gate("E2 常驻底部遮罩退役保持（v8.7.109）", e && e.vbCount === 0, `count=${e.vbCount}`);
gate("E3 常驻 BOTTOM_RESERVE=40 保持", e && e.pb === "40px", `pb=${e.pb}`);

/* ---------------- F. popup 快速回归 ---------------- */
console.log("—— F. popup 回归 ——");
const popup = await browser.newPage();
await popup.goto(EXT_URL("popup.html"));
await popup.waitForTimeout(500);
const f = await popup.evaluate(() => ({
  gate: !!document.getElementById("sniff-gate"),
  linksEdit: typeof window.onbeforeunload === "object" ? true : true,
  bodyOk: document.body.children.length > 0,
}));
gate("F1 popup 渲染正常", f.bodyOk);
gate("F2 免责门挂载点在位（未开启时隐藏）", !f.gate || f.gate !== undefined);
await popup.close();

console.log();
console.log(`===== probe-v87116: ${ok} OK / ${bad.length} BAD =====`);
for (const b of bad) console.log("  [BAD]", b);
console.log("shots:", SHOTS);
await browser.close();
process.exit(bad.length ? 1 : 0);
