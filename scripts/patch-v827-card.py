#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.7 补丁②：ext-card.js 三连——律动变亮+细节环 / 封面态 56px+律动高光 /
三态一镜到底过渡动画。

用户原话拆解：
  · 「律动应该是在原有的亮度下变亮，不是变暗」→ 封面本体 brightness 脉冲
    （低音驱动）+ 辉光上限 0.5→0.85；
  · 「有一些中音跟没有律动一样」→ 16 频段拆三轴包络（低/中/高），中频驱动
    .gring 细节环（rim light，不含模糊、动得快看得清），高频驱动饱和脉冲；
  · 「封面态的封面放大一点点」48→56px；「封面态底下也加上律动高光」；
  · 「三个模式切换加一镜到底动画」→ clone 封面连续飞形（translate+scale）+
    面板以封面中心为锚 scale/opacity 长出（展开）/缩回（收进封面），同步开始。
"""
import pathlib, re, sys

P = pathlib.Path("/tmp/my-project/extension-src/ext-card.js")
src = P.read_text(encoding="utf-8")
n0 = len(src)

def rep(old, new, tag):
    global src
    if new in src and old not in src:
        print(f"  skip(已应用) {tag}")
        return
    if old not in src:
        sys.exit(f"anchor NOT FOUND: {tag}")
    src = src.replace(old, new, 1)
    print(f"  ok {tag}")

# ---------- P1 头注释 ----------
rep(
    " * v8.2.6 性能特供（「5070 卡成屎」根治·渲染休眠律）：",
    " * v8.2.7 实机反馈三连：\n"
    " *   ① 律动变亮律——旧辉光只在封面外圈晕开观感「变暗」；现封面本体随低音\n"
    " *      提亮（brightness/saturate 直写，只碰合成器友好属性），辉光上限\n"
    " *      0.5→0.85；中频驱动 .gring 细节环（rim light 无模糊，中频段看得清），\n"
    " *      高频驱动饱和脉冲——三轴包络（低/中/高）拆自 16 频段原始帧。\n"
    " *   ② 封面态 48→56px + 封面态同款律动高光（glow+gring 上身，overflow 放开）。\n"
    " *   ③ 三态切换一镜到底——clone 封面从旧态矩形连续飞到新态矩形\n"
    " *      （translate+scale），面板同时以「新封面中心」为 transform-origin\n"
    " *      长出（展开）/缩回（收进封面），同步开始；中断安全（finish 跳末态），\n"
    " *      prefers-reduced-motion / 标签隐藏直切。\n"
    " * v8.2.6 性能特供（「5070 卡成屎」根治·渲染休眠律）：",
    "P1 头注释",
)

# ---------- P2/P3 数据面：lastSpec 带 bands + 三轴包络 ----------
rep(
    '  var lastSpec = { on: false, bass: 0, t: 0 };',
    '  var lastSpec = { on: false, bass: 0, bands: null, t: 0 };',
    "P2 lastSpec.bands",
)
rep(
    "  var envBass = 0;\n",
    "  var envB = 0, envM = 0, envH = 0; /* v8.2.7 律动包络：低/中/高三轴 */\n",
    "P3 三轴包络声明",
)

# ---------- P4 封面态 CSS：56px + overflow 放开 + img 自担圆角 ----------
rep(
    "    '.cover{width:48px;height:48px;border-radius:13px;overflow:hidden;padding:0;cursor:grab;' +\n"
    "    'display:none;position:fixed;border:1px solid rgba(255,255,255,.14);' +\n"
    "    'background:linear-gradient(135deg,color-mix(in srgb,var(--acc,#8b5cf6) 33%,transparent),' +\n"
    "    'color-mix(in srgb,var(--acc,#8b5cf6) 13%,transparent));touch-action:none}' +\n"
    "    '.cover:active{cursor:grabbing}' +\n"
    "    '.cover img{width:100%;height:100%;object-fit:cover;display:block}' +",
    "    '.cover{width:56px;height:56px;border-radius:14px;padding:0;cursor:grab;' +\n"
    "    'display:none;position:fixed;border:1px solid rgba(255,255,255,.14);' +\n"
    "    'background:linear-gradient(135deg,color-mix(in srgb,var(--acc,#8b5cf6) 33%,transparent),' +\n"
    "    'color-mix(in srgb,var(--acc,#8b5cf6) 13%,transparent));touch-action:none}' +\n"
    "    '.cover:active{cursor:grabbing}' +\n"
    "    '.cover img{width:100%;height:100%;object-fit:cover;display:block;' +\n"
    "    'border-radius:inherit;position:relative;z-index:1}' +",
    "P4 封面态 56px",
)

# ---------- P5 cdot 提层（img 提 z-index 后绿点要压回图上） ----------
rep(
    "    '.cdot{position:absolute;right:4px;bottom:4px;width:7px;height:7px;border-radius:999px;' +\n"
    "    'background:#34d399;box-shadow:0 0 5px #34d399;display:none}' +",
    "    '.cdot{position:absolute;right:4px;bottom:4px;width:7px;height:7px;border-radius:999px;z-index:3;' +\n"
    "    'background:#34d399;box-shadow:0 0 5px #34d399;display:none}' +",
    "P5 cdot z-index",
)

# ---------- P6 细节环 CSS ----------
rep(
    "    '.glow{position:absolute;inset:-5px;border-radius:14px;background:var(--acc,#8b5cf6);opacity:0;' +\n"
    "    'filter:blur(9px);pointer-events:none;z-index:0}' +",
    "    '.glow{position:absolute;inset:-5px;border-radius:14px;background:var(--acc,#8b5cf6);opacity:0;' +\n"
    "    'filter:blur(9px);pointer-events:none;z-index:0}' +\n"
    "    /* v8.2.7 细节环：中/高频驱动的 rim light（细边框不模糊，与低频辉光的\n"
    "       晕开互补——「有些中音跟没有律动一样」的根治面） */\n"
    "    '.gring{position:absolute;inset:-3px;border:2px solid color-mix(in srgb,var(--acc,#8b5cf6) 42%,#fff);' +\n"
    "    'opacity:0;pointer-events:none;z-index:2}' +\n"
    "    '.cov .gring{border-radius:13px}.fcard .cov .gring{border-radius:15px}' +\n"
    "    '.cover .gring{border-radius:17px}' +",
    "P6 gring CSS",
)

# ---------- P7/P8/P9 标记：三态封面挂 glow+ring ----------
rep(
    "'<button class=\"cover\" id=\"cover\" title=\"单击展开 · 按住拖动\"><img id=\"cpic\" alt=\"\" draggable=\"false\"><span class=\"cdot\" id=\"cdot\"></span></button>' +",
    "'<button class=\"cover\" id=\"cover\" title=\"单击展开 · 按住拖动\"><span class=\"glow\" id=\"cglow\"></span><span class=\"gring\" id=\"cring\"></span><img id=\"cpic\" alt=\"\" draggable=\"false\"><span class=\"cdot\" id=\"cdot\"></span></button>' +",
    "P7 封面态标记",
)
rep(
    "'<div class=\"cov\"><span class=\"glow\" id=\"glow\"></span><img id=\"pic\" alt=\"\" draggable=\"false\"></div>' +",
    "'<div class=\"cov\"><span class=\"glow\" id=\"glow\"></span><span class=\"gring\" id=\"gring1\"></span><img id=\"pic\" alt=\"\" draggable=\"false\"></div>' +",
    "P8 标准态标记",
)
rep(
    "'<div class=\"cov\"><span class=\"glow\" id=\"glow2\"></span><img id=\"fpic\" alt=\"\" draggable=\"false\"></div>' +",
    "'<div class=\"cov\"><span class=\"glow\" id=\"glow2\"></span><span class=\"gring\" id=\"gring2\"></span><img id=\"fpic\" alt=\"\" draggable=\"false\"></div>' +",
    "P9 完全体标记",
)

# ---------- P10 元素引用 ----------
rep(
    "  var card = el(\"card\"), pic = el(\"pic\"), glow = el(\"glow\");\n"
    "  var fcard = el(\"fcard\"), fpic = el(\"fpic\"), glow2 = el(\"glow2\");",
    "  var card = el(\"card\"), pic = el(\"pic\"), glow = el(\"glow\"), gring1 = el(\"gring1\");\n"
    "  var fcard = el(\"fcard\"), fpic = el(\"fpic\"), glow2 = el(\"glow2\"), gring2 = el(\"gring2\");\n"
    "  var cglow = el(\"cglow\"), cring = el(\"cring\");",
    "P10 元素引用",
)

# ---------- P11 封面态宽度 56 ----------
rep(
    "  var WIDTH = { cover: 48, mini: 264, full: 324 };",
    "  var WIDTH = { cover: 56, mini: 264, full: 324 };",
    "P11 WIDTH",
)

# ---------- P12 三态切换 → 一镜到底 ----------
rep(
    "  /* ---------- 三态切换 ---------- */\n"
    "  function applyMode() {\n"
    "    for (var k in SURFS) SURFS[k].style.display = k === mode ? \"block\" : \"none\";\n"
    "    applyPos(); applyVis(); applyDraggable();\n"
    "  }\n"
    "  function setMode(m) {\n"
    "    if (!SURFS[m] || m === mode) return;\n"
    "    mode = m; lastTcur = \"\"; /* 强制下一帧重写 tcur/mtm——防态切换残留旧串 */\n"
    "    savePos(); applyMode();\n"
    "    wake(); /* v8.2.6 态切换接管：循环若在睡（如 cover 静置）按新态需求重估 */\n"
    "  }",
    "  /* ---------- 三态切换（v8.2.7 一镜到底） ----------\n"
    "    封面是唯一连续锚：clone <img> 从旧态封面矩形连续飞到新态封面矩形\n"
    "    （translate+scale，合成器友好）；面板同时以「封面中心」为\n"
    "    transform-origin 做	scale+opacity——展开=从封面处长出来，收进封面态=\n"
    "    缩回封面底下，与封面飞形同步开始，中间不换镜。\n"
    "    中断安全：过渡中再切 → finish 跳末态再起；reduced-motion/隐藏直切。 */\n"
    "  function applyMode() {\n"
    "    for (var k in SURFS) SURFS[k].style.display = k === mode ? \"block\" : \"none\";\n"
    "    applyPos(); applyVis(); applyDraggable();\n"
    "  }\n"
    "  var RM = !!(window.matchMedia && matchMedia(\"(prefers-reduced-motion: reduce)\").matches);\n"
    "  var trans = null;\n"
    "  function covImgOf(m) { return m === \"cover\" ? cpic : m === \"mini\" ? pic : fpic; }\n"
    "  function covUnitOf(m) { return COVS[m]; }\n"
    "  function finishTrans() {\n"
    "    if (!trans) return;\n"
    "    var t = trans; trans = null;\n"
    "    for (var i = 0; i < t.anims.length; i++) { try { t.anims[i].finish(); } catch (e1) { /* 已结束 */ } }\n"
    "    t.cleanup();\n"
    "  }\n"
    "  function plainSetMode(m) {\n"
    "    mode = m; lastTcur = \"\"; /* 强制下一帧重写 tcur/mtm——防态切换残留旧串 */\n"
    "    savePos(); applyMode();\n"
    "  }\n"
    "  function setMode(m) {\n"
    "    if (!SURFS[m] || m === mode) return;\n"
    "    finishTrans();\n"
    "    if (RM || document.visibilityState !== \"visible\") { plainSetMode(m); wake(); return; }\n"
    "    var from = mode;\n"
    "    var fromImg = covImgOf(from), toImg = covImgOf(m);\n"
    "    var r0 = fromImg.getBoundingClientRect();\n"
    "    if (r0.width < 4) { plainSetMode(m); wake(); return; }\n"
    "    var rSrc = getComputedStyle(fromImg).borderRadius || \"12px\";\n"
    "    /* 律动内联态先复制到 clone 再清（亮度脉冲在飞形里保持连续） */\n"
    "    var fFilter = fromImg.style.filter;\n"
    "    if (covUnitOf(from)) covClear(covUnitOf(from));\n"
    "    mode = m; lastTcur = \"\";\n"
    "    savePos();\n"
    "    /* 换幕但旧面暂不撤（面板缩回要动画）：from+to 都 block，其余 none */\n"
    "    for (var k in SURFS) SURFS[k].style.display = (k === m || k === from) ? \"block\" : \"none\";\n"
    "    applyPos(); applyVis(); applyDraggable();\n"
    "    var fromSurf = SURFS[from], toSurf = SURFS[m];\n"
    "    fromImg.style.visibility = \"hidden\";\n"
    "    toImg.style.visibility = \"hidden\";\n"
    "    fromSurf.style.pointerEvents = \"none\";\n"
    "    var r1 = toImg.getBoundingClientRect();\n"
    "    var sr = toSurf.getBoundingClientRect();\n"
    "    var sfr = fromSurf.getBoundingClientRect();\n"
    "    if (r1.width < 4 || sr.width < 4) {\n"
    "      fromImg.style.visibility = toImg.style.visibility = \"\";\n"
    "      fromSurf.style.pointerEvents = \"\";\n"
    "      for (var k2 in SURFS) SURFS[k2].style.display = k2 === m ? \"block\" : \"none\";\n"
    "      wake(); return;\n"
    "    }\n"
    "    var clone = document.createElement(\"img\");\n"
    "    clone.src = (track && track.pic) || \"\";\n"
    "    clone.alt = \"\";\n"
    "    clone.draggable = false;\n"
    "    clone.style.cssText = \"position:fixed;left:\" + r0.left + \"px;top:\" + r0.top + \"px;width:\" +\n"
    "      r0.width + \"px;height:\" + r0.height + \"px;object-fit:cover;border-radius:\" + rSrc +\n"
    "      \";z-index:9;pointer-events:none;box-shadow:0 12px 36px rgba(0,0,0,.35);\" +\n"
    "      \"background:linear-gradient(135deg,color-mix(in srgb,var(--acc,#8b5cf6) 33%,transparent),transparent)\";\n"
    "    if (fFilter) clone.style.filter = fFilter;\n"
    "    shadow.appendChild(clone);\n"
    "    var dx = r1.left - r0.left, dy = r1.top - r0.top;\n"
    "    var sc = r1.width / r0.width;\n"
    "    var D = m === \"cover\" ? 300 : 340;\n"
    "    var ez = m === \"cover\" ? \"cubic-bezier(.45,.08,.35,1)\" : \"cubic-bezier(.32,1.18,.36,1)\";\n"
    "    var anims = [clone.animate([\n"
    "      { transform: \"translate(0px,0px) scale(1)\" },\n"
    "      { transform: \"translate(\" + dx.toFixed(1) + \"px,\" + dy.toFixed(1) + \"px) scale(\" + sc.toFixed(4) + \")\" }\n"
    "    ], { duration: D, easing: ez, fill: \"forwards\" })];\n"
    "    if (m !== \"cover\") {\n"
    "      /* 新面板从「新封面中心」长出来（scale .52 + 透明 → 原样，微回弹） */\n"
    "      toSurf.style.transformOrigin =\n"
    "        ((r1.left + r1.width / 2) - sr.left).toFixed(1) + \"px \" +\n"
    "        ((r1.top + r1.height / 2) - sr.top).toFixed(1) + \"px\";\n"
    "      anims.push(toSurf.animate([\n"
    "        { opacity: 0, transform: \"scale(.52)\" },\n"
    "        { opacity: 1, transform: \"scale(1)\" }\n"
    "      ], { duration: D, easing: ez, fill: \"forwards\" }));\n"
    "    }\n"
    "    if (from !== \"cover\") {\n"
    "      /* 旧面板以「旧封面中心」为锚缩回封面底下（scale→.52 + 渐隐） */\n"
    "      fromSurf.style.transformOrigin =\n"
    "        ((r0.left + r0.width / 2) - sfr.left).toFixed(1) + \"px \" +\n"
    "        ((r0.top + r0.height / 2) - sfr.top).toFixed(1) + \"px\";\n"
    "      anims.push(fromSurf.animate([\n"
    "        { opacity: 1, transform: \"scale(1)\" },\n"
    "        { opacity: 0, transform: \"scale(.52)\" }\n"
    "      ], { duration: D, easing: ez, fill: \"forwards\" }));\n"
    "    }\n"
    "    var done = false;\n"
    "    var selfinish = function () {\n"
    "      if (done) return; done = true;\n"
    "      trans = null;\n"
    "      for (var i = 0; i < anims.length; i++) { try { anims[i].cancel(); } catch (e2) { /* 已收 */ } }\n"
    "      try { clone.remove(); } catch (e3) { /* 已移除 */ }\n"
    "      fromImg.style.visibility = \"\";\n"
    "      toImg.style.visibility = \"\";\n"
    "      fromSurf.style.transformOrigin = \"\";\n"
    "      toSurf.style.transformOrigin = \"\";\n"
    "      fromSurf.style.pointerEvents = \"\";\n"
    "      if (mode === m) {\n"
    "        for (var k3 in SURFS) SURFS[k3].style.display = k3 === mode ? \"block\" : \"none\";\n"
    "        applyPos();\n"
    "      }\n"
    "      wake(); /* 收尾后按新态重估渲染循环 */\n"
    "    };\n"
    "    for (var a = 0; a < anims.length; a++) anims[a].onfinish = selfinish;\n"
    "    trans = { anims: anims, cleanup: selfinish };\n"
    "    wake(); /* v8.2.6 态切换接管：循环若在睡（如 cover 静置）按新态需求重估 */\n"
    "  }",
    "P12 一镜到底",
)

# ---------- P13 onMsg spec 带 bands ----------
rep(
    "      lastSpec = { on: m.on === true, bass: Number(m.bass) || 0, t: Date.now() };",
    "      lastSpec = { on: m.on === true, bass: Number(m.bass) || 0,\n"
    "        bands: Array.isArray(m.bands) ? m.bands : null, t: Date.now() };",
    "P13 spec bands",
)

# ---------- P14 loopBody 律动段替换 ----------
rep(
    "    var tgt = lastSpec.on && effPlaying() ? lastSpec.bass : 0;\n"
    "    envBass += (tgt - envBass) * (tgt > envBass ? 0.55 : 0.14);\n"
    "    if (envBass < 0.005) envBass = 0;\n"
    "    var gOp = envBass > 0.012 ? (0.2 + envBass * 0.3).toFixed(3) : \"0\";\n"
    "    if (glow.style.opacity !== gOp) { glow.style.opacity = gOp; glow2.style.opacity = gOp; }",
    "    stepEnv();\n"
    "    paintGlow();",
    "P14 loopBody 律动段",
)

# ---------- P15/P16 needFrame + schedule 三轴化 ----------
rep(
    "    if (lastSpec.on && effPlaying()) return true;   /* 辉光律动中 */\n"
    "    if (envBass > 0.012) return true;               /* 辉光衰减尾 */",
    "    if (lastSpec.on && effPlaying()) return true;   /* 辉光律动中 */\n"
    "    if (envB > 0.012 || envM > 0.02 || envH > 0.02) return true; /* 衰减尾（三轴） */",
    "P15 needFrame",
)
rep(
    "    if (mode === \"full\" || (lastSpec.on && effPlaying()) || envBass > 0.012) {",
    "    if (mode === \"full\" || (lastSpec.on && effPlaying()) || envB > 0.012 || envM > 0.02 || envH > 0.02) {",
    "P16 schedule",
)

# ---------- P17 律动引擎函数群（插在 rafId 声明后） ----------
rep(
    "  var rafId = 0, tickTimer = 0;\n"
    "  function loopBody() {",
    "  var rafId = 0, tickTimer = 0;\n"
    "  /* ---------- v8.2.7 律动引擎（变亮律 + 三频段细节） ----------\n"
    "     低音 → 封面本体提亮（brightness）+ 辉光晕开（halo opacity/scale）；\n"
    "     中频 → 细节环 rim light（.gring 不模糊，动得快看得清）+ 亮度微调；\n"
    "     高频 → 饱和脉冲（saturate）。\n"
    "     写值防抖：字符串不变不写；非当前态/静默 → 交还样式表（清内联）。\n"
    "     数据面：SW 20Hz 原始帧，包络在卡侧（快攻 .55 / 慢放 .14）。 */\n"
    "  var COVS = {\n"
    "    mini:  { img: pic,  glow: glow,  ring: gring1, on: 0, lf: \"\", lo: \"\", lt: \"\", lr: \"\" },\n"
    "    full:  { img: fpic, glow: glow2, ring: gring2, on: 0, lf: \"\", lo: \"\", lt: \"\", lr: \"\" },\n"
    "    cover: { img: cpic, glow: cglow, ring: cring,  on: 0, lf: \"\", lo: \"\", lt: \"\", lr: \"\" }\n"
    "  };\n"
    "  function specTgt() {\n"
    "    if (!lastSpec.on || !effPlaying()) return null;\n"
    "    var bands = lastSpec.bands, m = 0, h = 0, i;\n"
    "    if (bands && bands.length) {\n"
    "      for (i = 3; i <= 9; i++) m += Number(bands[i]) || 0;\n"
    "      m /= 7;\n"
    "      for (i = 10; i < 16; i++) h += Number(bands[i]) || 0;\n"
    "      h /= 6;\n"
    "    }\n"
    "    return { b: Number(lastSpec.bass) || 0, m: m, h: h };\n"
    "  }\n"
    "  function stepEnv() {\n"
    "    var t = specTgt();\n"
    "    var tb = t ? t.b : 0, tm = t ? t.m : 0, th = t ? t.h : 0;\n"
    "    envB += (tb - envB) * (tb > envB ? 0.55 : 0.14);\n"
    "    envM += (tm - envM) * (tm > envM ? 0.55 : 0.14);\n"
    "    envH += (th - envH) * (th > envH ? 0.55 : 0.14);\n"
    "    if (envB < 0.005) envB = 0;\n"
    "    if (envM < 0.006) envM = 0;\n"
    "    if (envH < 0.006) envH = 0;\n"
    "  }\n"
    "  function covClear(c) {\n"
    "    c.on = 0; c.lf = c.lo = c.lt = c.lr = \"\";\n"
    "    c.img.style.filter = \"\";\n"
    "    c.glow.style.opacity = \"\";\n"
    "    c.glow.style.transform = \"\";\n"
    "    if (c.ring) c.ring.style.opacity = \"\";\n"
    "  }\n"
    "  function paintGlow() {\n"
    "    var act = envB > 0.012 || envM > 0.02 || envH > 0.02;\n"
    "    for (var k in COVS) {\n"
    "      var c = COVS[k];\n"
    "      if (k !== mode || !act) { if (c.on) covClear(c); continue; }\n"
    "      var f = \"brightness(\" + (1 + envB * 0.34 + envM * 0.1).toFixed(3) + \") saturate(\" +\n"
    "        (1 + envH * 0.32).toFixed(3) + \")\";\n"
    "      var go = Math.min(1, 0.16 + envB * 0.55 + envM * 0.15).toFixed(3);\n"
    "      var gt = \"scale(\" + (1 + envB * 0.06 + envM * 0.02).toFixed(4) + \")\";\n"
    "      var ro = Math.min(1, envM * 0.85 + envH * 0.3).toFixed(3);\n"
    "      if (f !== c.lf) { c.lf = f; c.img.style.filter = f; }\n"
    "      if (go !== c.lo) { c.lo = go; c.glow.style.opacity = go; }\n"
    "      if (gt !== c.lt) { c.lt = gt; c.glow.style.transform = gt; }\n"
    "      if (c.ring && ro !== c.lr) { c.lr = ro; c.ring.style.opacity = ro; }\n"
    "      c.on = 1;\n"
    "    }\n"
    "  }\n"
    "  function loopBody() {",
    "P17 律动引擎",
)

P.write_text(src, encoding="utf-8")
print(f"OK ext-card.js: {n0} -> {len(src)} chars")
