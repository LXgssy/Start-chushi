#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""visual-v8721 修正三处探针 bug（非产品）：
  ①page2 viewport：ctx.newPage(options) 不收 viewport（被静默丢弃，实跑 1280x720）
    → setViewportSize 显式设置 + 断言改用运行时 innerWidth 动态基准
  ②dlNodesX 类匹配全等 bug：dlSwapFx 加 lin 后 class="dl1 lin"，==="dl1" 永假
    → token 化 split 匹配
  ③Z 组空白点：三点稀扫 → 全屏网格扫描（onMiddle 同款守卫链）"""
import io

P = "/tmp/beta-wt/scripts/visual-v8721.mjs"
src = io.open(P, encoding="utf-8").read()

def rep(old, new, tag, cnt=1):
    global src
    assert src.count(old) == cnt, f"[{tag}] expect {cnt} got {src.count(old)}"
    src = src.replace(old, new)
    print(f"  ok {tag}")

# ① page2 视口显式化
rep("""const page2 = await ctx.newPage({ viewport: { width: 900, height: 600, deviceScaleFactor: 3 } });""",
"""/* 坑录：ctx.newPage(options) 不收 viewport（静默丢弃→继承上下文 1280x720），
   显式 setViewportSize 才生效；居中断言一律用运行时 innerWidth 动态基准 */
const page2 = await ctx.newPage();
await page2.setViewportSize({ width: 900, height: 600 });
const vpOf = () => page2.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));""", "page2 viewport")

# ② dlNodesX token 化类匹配
rep("""      if (attrs[k] === "class") {
        if (attrs[k + 1] === "dl") out.pill.push(n);
        else if (attrs[k + 1] === "dl1") out.l1.push(n);
        else if (attrs[k + 1] === "dl2") out.l2.push(n);
      }""",
"""      if (attrs[k] === "class") {
        const toks = String(attrs[k + 1]).split(/\\s+/);
        if (toks.includes("dl")) out.pill.push(n);
        else if (toks.includes("dl1")) out.l1.push(n);
        else if (toks.includes("dl2")) out.l2.push(n);
      }""", "dlNodesX token")

# ③ midClick 网格扫描
rep("""const midClick = () => af.evaluate(() => {
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
});""",
"""const midClick = () => af.evaluate(() => {
  /* 全屏网格扫描（onMiddle 同款守卫链）：抽屉墙布局未知，空白点必须现找 */
  const GUARD = "a, button, input, textarea, select, [role='button'], [role='dialog'], [data-cl-tile], .cl-dock, .cl-dockwidget";
  for (let y = 70; y < 730; y += 55) {
    for (let x = 35; x < 1250; x += 75) {
      const el = document.elementFromPoint(x, y);
      if (!el || (el.closest && el.closest(GUARD))) continue;
      el.dispatchEvent(new PointerEvent("pointerdown", { button: 1, bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 2 }));
      el.dispatchEvent(new MouseEvent("mousedown", { button: 1, bubbles: true, cancelable: true, clientX: x, clientY: y }));
      return { x, y, hit: el.tagName + "." + (el.className || "").toString().slice(0, 30) };
    }
  }
  return { err: "no-blank" };
});""", "midClick grid")

# ④ zPt 网格化（非交互点即可）
rep("""const zPt = await af.evaluate(() => {
  const pts = [[60, 260], [1180, 140], [640, 120], [200, 500]];
  for (const [x, y] of pts) {
    const el = document.elementFromPoint(x, y);
    if (el && !el.closest("a, button, input")) return { x, y };
  }
  return { x: 60, y: 260 };
});""",
"""const zPt = await af.evaluate(() => {
  const GUARD = "a, button, input, textarea, select, [role='button'], [role='dialog'], [data-cl-tile], .cl-dock, .cl-dockwidget";
  for (let y = 70; y < 730; y += 55) {
    for (let x = 35; x < 1250; x += 75) {
      const el = document.elementFromPoint(x, y);
      if (el && !(el.closest && el.closest(GUARD))) return { x, y };
    }
  }
  return { x: 60, y: 260 };
});""", "zPt grid")

# ⑤ GA1 动态视口基准
rep("""  const cx = box ? (box.l + box.r) / 2 : -1;
  const wPx = box ? box.r - box.l : 0;
  judge("GA1 首用真居中（|cx-450|≤3，旧 460 假设位退役）", !!box && Math.abs(cx - 450) <= 3, `cx=${cx.toFixed(1)} w=${wPx.toFixed(0)} vp=900`);""",
"""  const cx = box ? (box.l + box.r) / 2 : -1;
  const wPx = box ? box.r - box.l : 0;
  const vpg = await vpOf().catch(() => ({ w: 1280 }));
  judge("GA1 首用真居中（|cx-vw/2|≤3，旧 460 假设位退役）", !!box && Math.abs(cx - vpg.w / 2) <= 3, `cx=${cx.toFixed(1)} w=${wPx.toFixed(0)} vw=${vpg.w}`);""", "GA1 dynamic vp")

# ⑥ GC3 动态视口基准
rep("""await sleep(600);
const box2 = await pillBox();
const cx2 = box2 ? (box2.l + box2.r) / 2 : -1;
judge("GC3 拉伸落点仍居中（左/宽同拍=中心逐帧恒定的终态见证）", !!box2 && Math.abs(cx2 - 450) <= 4, `cx=${cx2.toFixed(1)} w=${(box2.r - box2.l).toFixed(0)}`);""",
"""await sleep(600);
const box2 = await pillBox();
const cx2 = box2 ? (box2.l + box2.r) / 2 : -1;
const vpg2 = await vpOf().catch(() => ({ w: 1280 }));
judge("GC3 拉伸落点仍居中（左/宽同拍=中心逐帧恒定的终态见证）", !!box2 && Math.abs(cx2 - vpg2.w / 2) <= 4, `cx=${cx2.toFixed(1)} w=${(box2.r - box2.l).toFixed(0)} vw=${vpg2.w}`);""", "GC3 dynamic vp")

io.open(P, "w", encoding="utf-8").write(src)
print("visual-v8721 fixes applied")
