#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""visual-v8721 增门手术：
  ①头部/路径/摘要 → v8.7.21
  ②E 组（更新日志复位修复）：overscroll-contain 计算值 + 首开零位 + 重开回位
  ③Z 组（抽屉双击禅守卫）：抽屉开+墙面双击不进禅 / 抽屉关双击仍进禅
  ④GA/GB/GC（dl 玻璃拉伸+居中+切行模糊）：无歌词药丸真居中 + .dl width/left
    过渡计算值 + 显式 width 属性 + 切行宽度飞行采样(Δ≥8) + dlswap/lin 在体
（v8.7.20 存量门 P0/G1/F0-F6/D0-D3 原样保留=零回归见证）"""
import io

P = "/tmp/beta-wt/scripts/visual-v8721.mjs"
src = io.open(P, encoding="utf-8").read()

def rep(old, new, tag, cnt=1):
    global src
    assert src.count(old) == cnt, f"[{tag}] expect {cnt} got {src.count(old)}"
    src = src.replace(old, new)
    print(f"  ok {tag}")

rep('const ZIP = "/tmp/beta-wt/download/v8.7.20/ChuShi-NewTab-v8.7.20.zip";',
    'const ZIP = "/tmp/beta-wt/download/v8.7.21/ChuShi-NewTab-v8.7.21.zip";', "zip path")
rep('const SHOTS = "/tmp/v8720-visual";', 'const SHOTS = "/tmp/v8721-visual";', "shots")
rep('const PROFILE = "/tmp/v8720-profile";', 'const PROFILE = "/tmp/v8721-profile";', "profile")
rep('visual-v8720: ${passCount} PASS', 'visual-v8721: ${passCount} PASS', "summary")

# ---------- E 组 + Z 组：插在 D 组之前（音乐面板先关、设置面板开→日志→关→抽屉→禅） ----------
rep("""/* ---------- D 组：dl 词模式白描边根修端到端（SW 直注 stub，零环境网络依赖） ----------""",
"""/* ---------- E 组：更新日志复位修复（overscroll 隔离 + 重开回位） ---------- */
console.log("===== E 组：更新日志复位修复 =====");
await ensureNoPanel();
await af.evaluate(() => [...document.querySelectorAll(".dock-btn")].find((b) => (b.getAttribute("aria-label") || "").includes("设置"))?.click());
await sleep(1600);
const chgScrollInfo = await af.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "更新日志");
  if (!btn) return { err: "no-changelog-btn" };
  btn.click();
  return { ok: true };
});
await sleep(900);
const e0 = await af.evaluate(() => {
  const veil = document.querySelector('[aria-label="更新日志"]');
  const sc = veil && veil.querySelector(".slim-scroll");
  if (!sc) return { err: "no-scroll" };
  const cs = getComputedStyle(sc);
  return { oby: cs.overscrollBehaviorY, st: sc.scrollTop, items: veil.querySelectorAll("section").length };
});
judge("E0a 更新日志打开（102 条时间线）", !!e0 && !e0.err && e0.items >= 100, JSON.stringify(e0));
judge("E0b 越界滚动隔离（overscroll-behavior-y=contain）", !!e0 && e0.oby === "contain", `oby=${e0 && e0.oby}`);
judge("E0c 首开回顶部（scrollTop=0）", !!e0 && e0.st === 0, `st=${e0 && e0.st}`);
const e1set = await af.evaluate(() => {
  const sc = document.querySelector('[aria-label="更新日志"] .slim-scroll');
  if (!sc) return false;
  sc.scrollTop = 300;
  sc.dispatchEvent(new Event("scroll"));
  return sc.scrollTop === 300;
});
await sleep(200);
judge("E1a 阅读位写入（scrollTop=300）", e1set === true, `set=${e1set}`);
await af.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "返回设置")?.click());
await sleep(900);
await af.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "更新日志")?.click());
await sleep(800);
const e2 = await af.evaluate(() => {
  const sc = document.querySelector('[aria-label="更新日志"] .slim-scroll');
  return sc ? sc.scrollTop : -1;
});
judge("E1b 重开回位（300±60，复位根治）", e2 >= 240 && e2 <= 360, `st=${e2}`);
await af.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "返回设置")?.click());
await sleep(900);
await ensureNoPanel();

/* ---------- Z 组：抽屉磁贴墙双击不进禅 ---------- */
console.log("===== Z 组：抽屉双击禅守卫 =====");
/* 唤出抽屉：中键落在页面空白（合成 mousedown/pointerdown button=1，免 autoscroll 干扰） */
const midClick = () => af.evaluate(() => {
  const pts = [[60, 260], [1180, 140], [200, 500]];
  for (const [x, y] of pts) {
    const el = document.elementFromPoint(x, y);
    if (!el) continue;
    if (el.closest("a, button, input, [role='dialog']")) continue;
    el.dispatchEvent(new PointerEvent("pointerdown", { button: 1, bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 2 }));
    el.dispatchEvent(new MouseEvent("mousedown", { button: 1, bubbles: true, cancelable: true, clientX: x, clientY: y }));
    return { x, y, hit: el.tagName + "." + (el.className || "").toString().slice(0, 30) };
  }
  return { err: "no-blank" };
});
const zOpen = await midClick();
await sleep(900);
const z0 = await af.evaluate(() => ({
  drawer: document.documentElement.classList.contains("cs-drawer"),
  zen: document.documentElement.classList.contains("zen"),
}));
judge("Z0 抽屉唤出（中键→html.cs-drawer）", z0.drawer && !z0.zen, `pt=${JSON.stringify(zOpen)} drawer=${z0.drawer} zen=${z0.zen}`);
/* 空白点重定位（抽屉墙内非交互元素）+ 真实双击 */
const zPt = await af.evaluate(() => {
  const pts = [[60, 260], [1180, 140], [640, 120], [200, 500]];
  for (const [x, y] of pts) {
    const el = document.elementFromPoint(x, y);
    if (el && !el.closest("a, button, input")) return { x, y };
  }
  return { x: 60, y: 260 };
});
await page.mouse.dblclick(zPt.x, zPt.y);
await sleep(700);
const z1 = await af.evaluate(() => ({
  drawer: document.documentElement.classList.contains("cs-drawer"),
  zen: document.documentElement.classList.contains("zen"),
}));
judge("Z1 抽屉开着墙面双击不进禅（守卫在位）", z1.drawer && !z1.zen, `pt=${JSON.stringify(zPt)} zen=${z1.zen}`);
await midClick();
await sleep(900);
const zClosed = await af.evaluate(() => !document.documentElement.classList.contains("cs-drawer"));
await page.mouse.dblclick(zPt.x, zPt.y);
await sleep(700);
const z2 = await af.evaluate(() => ({
  drawer: document.documentElement.classList.contains("cs-drawer"),
  zen: document.documentElement.classList.contains("zen"),
}));
judge("Z2 抽屉已关+禅路径无回归（双击进禅）", zClosed && z2.zen && !z2.drawer, `closed=${zClosed} zen=${z2.zen}`);
await page.mouse.dblclick(zPt.x, zPt.y);
await sleep(700);
const z3 = await af.evaluate(() => !document.documentElement.classList.contains("zen"));
judge("Z3 再双击退禅（来回零残留）", z3, `zenGone=${z3}`);

/* ---------- D 组：dl 词模式白描边根修端到端（SW 直注 stub，零环境网络依赖） ---------- */""", "E+Z groups")

io.open(P, "w", encoding="utf-8").write(src)
print("visual-v8721 E/Z groups inserted")
