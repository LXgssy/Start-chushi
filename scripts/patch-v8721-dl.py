#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.21：全局歌词四连——玻璃拉伸/药丸居中修复/药丸↔歌词同动画/切行模糊过渡
（ext-card.js dl 浮层；TL46 锚 .dw/.ov 行保持原样零波及）"""
import io

P = "/tmp/beta-wt/extension-src/ext-card.js"
src = io.open(P, encoding="utf-8").read()

def rep(old, new, tag):
    global src
    assert src.count(old) == 1, f"[{tag}] not unique (count={src.count(old)})"
    src = src.replace(old, new)
    print(f"  ok {tag}")

# R1 玻璃拉伸律：.dl 加 width/left 双过渡 + .drag 拖动态豁免
rep("""    '-webkit-backdrop-filter:blur(18px) saturate(1.35);transition:opacity .3s ease}' +
    '.dl:active{cursor:grabbing}' +""",
"""    '-webkit-backdrop-filter:blur(18px) saturate(1.35);' +
    /* v8.7.21 玻璃拉伸律：width/left 双过渡同曲线同拍——行宽变化时磨砂
       玻璃拉伸/收缩、左缘同拍回移=视觉中心逐帧恒定（center=left+width/2
       的 e(t) 系数相消可证）。布局动画不在「玻璃×动画杀合成律」禁域
       （该律只禁 transform/filter；高度盒同族先例=PanelStage 玻璃卡满窗）。
       .dl.drag 拖动态只留 opacity 过渡（跟手不果冻）。 */
    'transition:opacity .3s ease,width .45s cubic-bezier(.22,1,.36,1),' +
    'left .45s cubic-bezier(.22,1,.36,1)}' +
    '.dl.drag{transition:opacity .3s ease}' +
    '.dl:active{cursor:grabbing}' +""", "R1 dl transition")

# R2 切行模糊过渡关键帧
rep("""    '@keyframes dlin{from{opacity:0}to{opacity:1}}' +""",
"""    '@keyframes dlin{from{opacity:0}to{opacity:1}}' +
    /* v8.7.21 切行模糊过渡：行内容重建即重播（remove+reflow+add，wpulse
       同律）——blur(7px)→0 + 淡入；挂在 .dl1/.dl2 子元素（玻璃律只禁
       玻璃壳自身 transform/filter，子元素动画不碰磨砂采样链）。 */
    '@keyframes dlswap{0%{opacity:0;filter:blur(7px)}100%{opacity:1;filter:blur(0)}}' +
    '.dl1.lin,.dl2.lin{animation:dlswap .42s ease}' +""", "R2 dlswap kf")

# R3 reduced-motion 豁免扩展
rep("""    '@media (prefers-reduced-motion:reduce){.dl.boot{animation:none}.dl{transition:none}}' +""",
"""    '@media (prefers-reduced-motion:reduce){.dl.boot{animation:none}.dl{transition:none}' +
    '.dl1.lin,.dl2.lin{animation:none}}' +""", "R3 reduced-motion")

# R4 dlClamp 显式宽度优先（过渡飞行中 offsetWidth 是中间值）
rep("""  function dlClamp() {
    var w = window.innerWidth || 1200, h = window.innerHeight || 800;
    var pw = dlPill.offsetWidth || 420, ph = dlPill.offsetHeight || 76;""",
"""  function dlClamp() {
    var w = window.innerWidth || 1200, h = window.innerHeight || 800;
    /* v8.7.21 显式宽度优先：width 过渡飞行中 offsetWidth 是中间值，
       钳制按目标宽算（style.width 恒为目标 px），未显式化老态兜底旧路 */
    var pw = parseFloat(dlPill.style.width) || dlPill.offsetWidth || 420,
        ph = dlPill.offsetHeight || 76;""", "R4 dlClamp")

# R5 dlRecenter 重写：dlMeasure(Range 自然宽) + 显式 width + 首用真居中
rep("""  function dlRecenter() {
    if (!dlPos) return;
    var nw = dlPill.offsetWidth || 0;
    if (dlLastW && nw && nw !== dlLastW) {
      dlPos.x -= Math.round((nw - dlLastW) / 2);
    }
    if (nw) dlLastW = nw;
    dlApplyPos();
  }""",
"""  /* v8.7.21 玻璃拉伸律：内容重建后实测自然宽（Range 取文本布局宽——
     overflow/ellipsis 是绘制期裁剪不改布局，过渡飞行中读数不受污染；
     scrollWidth≥clientWidth 读不出收缩目标故弃用），显式写 width=拉伸/
     收缩动画源；左缘同拍回移差半=中心锚（已存档用户）。
     首用未存档（!dlPosSaved，用户没拖过）改真居中：x=(视口-新宽)/2，
     修复「无歌词药丸态不居中」——旧律 dlLoadPos 异步回调晚到时首用居中
     被 dlLastW 记账吞掉（首测只记录不回移），x 停在假设宽位=视觉偏侧。 */
  function dlMeasure() {
    function natW(el) {
      try {
        var r = document.createRange();
        r.selectNodeContents(el);
        return r.getBoundingClientRect().width || 0;
      } catch (eM) { return 0; }
    }
    /* 左右 padding 40 + 边框 2（box-sizing:border-box） */
    var raw = Math.max(natW(dlL1), natW(dlL2)) + 42;
    var vw = window.innerWidth || 1200;
    return Math.max(60, Math.min(Math.round(raw), Math.min(720, Math.round(vw * 0.94))));
  }
  function dlRecenter() {
    if (!dlPos) return;
    var nw = dlMeasure();
    if (nw) {
      dlPill.style.width = nw + "px";
      if (!dlPosSaved) {
        /* 首用真居中：内容宽度变化始终对齐视口中心（拖走后 dlPosSaved=true 转中心锚） */
        dlPos.x = Math.round(((window.innerWidth || 1200) - nw) / 2);
      } else if (dlLastW && nw !== dlLastW) {
        dlPos.x -= Math.round((nw - dlLastW) / 2);
      }
      dlLastW = nw;
    }
    dlApplyPos();
  }""", "R5 dlRecenter")

# R6 dlSwapFx 定义 + 三处调用
rep("""  function dlBuildLine(ln) {""",
"""  /* v8.7.21 切行模糊过渡重播口：remove+reflow+add（连行必重播，wpulse 同律） */
  function dlSwapFx() {
    dlL1.classList.remove("lin");
    dlL2.classList.remove("lin");
    void dlL1.offsetWidth;
    dlL1.classList.add("lin");
    dlL2.classList.add("lin");
  }
  function dlBuildLine(ln) {""", "R6a dlSwapFx def")

rep("""    dlSetSub(ln && ln.tr);
  }""",
"""    dlSetSub(ln && ln.tr);
    dlSwapFx();
  }""", "R6b buildline call")

rep("""        dlSetSub(t2s);
        dlRecenter(); /* 行宽变化 → 中心锚重排（v8.7.17） */""",
"""        dlSetSub(t2s);
        dlSwapFx();
        dlRecenter(); /* 行宽变化 → 拉伸动画+中心重排（v8.7.21） */""", "R6c nolyric call")

rep("""      dlRecenter(); /* 行宽变化 → 中心锚重排（长行不越界，v8.7.17） */""",
"""      dlRecenter(); /* 行宽变化 → 拉伸动画+中心重排（长行不越界，v8.7.21） */""", "R6d line call")

# R7 拖动态 drag 类挂/摘
rep("""    dlDrag.on = 1; dlDrag.moved = 0;
    dlDrag.px = e.clientX; dlDrag.py = e.clientY;
    dlDrag.ox = dlPos ? dlPos.x : 0; dlDrag.oy = dlPos ? dlPos.y : 0;""",
"""    dlDrag.on = 1; dlDrag.moved = 0;
    dlPill.classList.add("drag"); /* v8.7.21 拖动期过渡归零（跟手不果冻） */
    dlDrag.px = e.clientX; dlDrag.py = e.clientY;
    dlDrag.ox = dlPos ? dlPos.x : 0; dlDrag.oy = dlPos ? dlPos.y : 0;""", "R7a drag on")

rep("""  dlPill.addEventListener("pointerup", function () {
    if (dlDrag.on && dlDrag.moved) { dlPosSaved = true; dlSavePos(); }
    dlDrag.on = 0;
  });
  dlPill.addEventListener("pointercancel", function () { dlDrag.on = 0; });""",
"""  dlPill.addEventListener("pointerup", function () {
    if (dlDrag.on && dlDrag.moved) { dlPosSaved = true; dlSavePos(); }
    dlDrag.on = 0;
    dlPill.classList.remove("drag");
  });
  dlPill.addEventListener("pointercancel", function () { dlDrag.on = 0; dlPill.classList.remove("drag"); });""", "R7b drag off")

# R8 首用默认位假设宽 460→42（空药丸实宽，首帧即居中）
rep("""          var w = window.innerWidth || 1200, h = window.innerHeight || 800;
          dlPos = { x: Math.round((w - 460) / 2), y: Math.max(8, h - 176) };""",
"""          var w = window.innerWidth || 1200, h = window.innerHeight || 800;
          /* v8.7.21 默认位假设宽 460→42（空药丸实宽）：dlRecenter 首用真
             居中接手前，空药丸首帧即居中，消除内容到达前的偏侧闪帧 */
          dlPos = { x: Math.round((w - 42) / 2), y: Math.max(8, h - 176) };""", "R8 default pos")

io.open(P, "w", encoding="utf-8").write(src)
print("ext-card.js patched")
