#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""visual-v8721 修正②：
  ④Z 组时序重排——Z1 真实双击的首帧 pointerdown 会打在纱罩上把抽屉关掉
    （.cl-drawer-veil onPointerDown button===0 即收=产品正确行为），Z2 的
    midClick 反而把抽屉重新 toggle 开。改：Z1 用合成 dblclick（无
    pointerdown 副作用，纯验证禅守卫），Z2 用 midClick 关抽屉后再真实双击。
  ⑤GA2/GA3 nodeId 竞态重试（GC2 同款 6 拍循环，逐帧 --p 样式变动失效律）"""
import io

P = "/tmp/beta-wt/scripts/visual-v8721.mjs"
src = io.open(P, encoding="utf-8").read()

def rep(old, new, tag, cnt=1):
    global src
    assert src.count(old) == cnt, f"[{tag}] expect {cnt} got {src.count(old)}"
    src = src.replace(old, new)
    print(f"  ok {tag}")

# ④ Z1 合成 dblclick + Z2 时序重排
rep("""await page.mouse.dblclick(zPt.x, zPt.y);
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
judge("Z2 抽屉已关+禅路径无回归（双击进禅）", zClosed && z2.zen && !z2.drawer, `closed=${zClosed} zen=${z2.zen}`);""",
"""/* Z1 用合成 dblclick（无 pointerdown 副作用）：真实双击首帧会打在纱罩上
   触发 veil onPointerDown 收抽屉（产品正确行为），但会污染本门语义——
   纯粹验证「抽屉开着 dblclick 不进禅」用合成事件直发纱罩（bubbles 到 window） */
await af.evaluate(() => {
  const veil = document.querySelector(".cl-drawer-veil") || document.body;
  veil.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: 450, clientY: 300 }));
});
await sleep(700);
const z1 = await af.evaluate(() => ({
  drawer: document.documentElement.classList.contains("cs-drawer"),
  zen: document.documentElement.classList.contains("zen"),
}));
judge("Z1 抽屉开着墙面双击不进禅（守卫在位）", z1.drawer && !z1.zen, `drawer=${z1.drawer} zen=${z1.zen}`);
await midClick();
await sleep(900);
const zClosed = await af.evaluate(() => !document.documentElement.classList.contains("cs-drawer"));
await page.mouse.dblclick(zPt.x, zPt.y);
await sleep(700);
const z2 = await af.evaluate(() => ({
  drawer: document.documentElement.classList.contains("cs-drawer"),
  zen: document.documentElement.classList.contains("zen"),
}));
judge("Z2 抽屉已关+禅路径无回归（双击进禅）", zClosed && z2.zen && !z2.drawer, `closed=${zClosed} zen=${z2.zen}`);""", "Z group resequence")

# ⑤ GA2/GA3 合并重试
rep("""if (gaPill) {
  const box = await pillBox();
  const cs = await gCS(gaPill.pill[0].nodeId).catch(() => null);
  const styleAttr = await attrOf(gaPill.pill[0], "style");""",
"""if (gaPill) {
  const box = await pillBox();
  /* nodeId 竞态律（v8.7.20）：逐帧 --p 样式变动令 nodeId 失效——取样紧邻+重试 */
  let cs = null, styleAttr = "";
  for (let t = 0; t < 6 && (!cs || !styleAttr); t++) {
    const f0 = await dlNodesX().catch(() => null);
    if (f0 && f0.pill.length) {
      styleAttr = await attrOf(f0.pill[0], "style").catch(() => "");
      cs = await gCS(f0.pill[0].nodeId).catch(() => null);
    }
    if (!cs || !styleAttr) await sleep(250);
  }""", "GA retry")

io.open(P, "w", encoding="utf-8").write(src)
print("visual-v8721 fix2 applied")
