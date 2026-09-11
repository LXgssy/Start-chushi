#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch-v835-sandbox.py —— v8.3.5 sandbox.js 引擎修（问题③seek 后歌词过快/
过慢/要校准——「初始」面板侧根治，浮窗已同律）：
①护航窗收窗容差 ±2s→±0.8s（feed/tick 两处）——真值落点差 1~2s 也收窗重锚
  = 误差带内大跳变，体感「每次跳转都要校准」。
②收窗拍软重锚——feed 全量重锚/tick reanchor 都是硬锚，收窗拍真值与乐观显示
  差 ≤0.8s 内 >0.35s 的部分 600ms smoothstep 平滑入轨，不再「咯噔」。
③护航窗 4.5s→3s——真值正常 1~2.5s 内到（桥 v8.3.5 读回终局即拍更快），
  过期多=seek 失败，早收窗早诚实回锚；过期拍走软重锚带不再硬跳。"""
import io, sys

P = "/tmp/my-project/public/sandbox.js"
src = io.open(P, encoding="utf-8").read()
orig = src
n = 0

def rep(old, new, tag, count=1):
    global src, n
    hits = src.count(old)
    if hits != count:
        print("MISS/AMBIG [%s]: %d hits (want %d): %r..." % (tag, hits, count, old[:70])); sys.exit(1)
    src = src.replace(old, new); n += 1
    print("ok  [%s]" % tag)

# ---- ①变量声明（guard 旁）----
rep("""    var guard = null;         /* v8.0.9 seek 护航窗 {from,to,at,dur,song} */""",
    """    var guard = null;         /* v8.0.9 seek 护航窗 {from,to,at,dur,song} */
    var unguardSoft = null;   /* v8.3.5 收窗软重锚源 {from,at}——收窗拍硬锚→软入轨 */""",
    "var")

# ---- ②feed 收窗：容差 0.8 + 软重锚源 ----
rep("""        } else {
          guard = null; /* 真值已到目标附近，护航完成 */
        }""",
    """        } else {
          guard = null; /* 真值已到目标附近，护航完成 */
          /* v8.3.5 收窗软重锚源：feed 全量重锚是硬锚——收窗拍真值与乐观
             显示差 ≤0.8s，>0.35s 的部分直接硬锚 = 歌词「咯噔」一下。
             记下当前显示位置，锚点重建后按偏差带软入轨（600ms）。 */
          unguardSoft = { from: posNow(), at: Date.now() };
        }""",
    "feed-win")
rep("""        } else if (Math.abs(t.position - guard.to) > 2) {""",
    """        } else if (Math.abs(t.position - guard.to) > 0.8) {""",
    "feed-tol")
rep("""      soft = null; /* 新快照全量重锚：软窗口作废 */
      push();""",
    """      soft = null; /* 新快照全量重锚：软窗口作废 */
      /* v8.3.5 收窗拍软重锚恢复：偏差 0.35~2.5 带 600ms smoothstep 入轨
         （正负双向——前进/回退 seek 的收窗拍都不再跳变）；带内 <0.35s
         维持硬锚（肉眼阈下无感）。 */
      if (unguardSoft && t && typeof t.position === "number" && isFinite(t.position)) {
        var udAbs = Math.abs(t.position - unguardSoft.from);
        if (udAbs > 0.35 && udAbs <= 2.5) {
          soft = { from: unguardSoft.from, at: unguardSoft.at, dur: SOFT_MS };
        }
      }
      unguardSoft = null;
      push();""",
    "feed-soft")

# ---- ③tick 收窗：容差 0.8 + 软重锚源 ----
rep("""          guard = null; /* 真值到达 / 翻转放行 / 窗口过期 → 正常仲裁 */
          guardGraceAt = Date.now(); /* 收窗豁免期：真值跟随的回退不算锯齿 */""",
    """          guard = null; /* 真值到达 / 翻转放行 / 窗口过期 → 正常仲裁 */
          guardGraceAt = Date.now(); /* 收窗豁免期：真值跟随的回退不算锯齿 */
          /* v8.3.5 收窗软重锚源（feed 同律）：下方 reanchor 若硬锚会跳变，
             记显示位置供 reanchor 分支软入轨。 */
          unguardSoft = { from: expected, at: Date.now() };""",
    "tick-win")
rep("""          if (gEl < guard.dur && gTo > 2 && prevPlaying === !!tk.playing) {""",
    """          if (gEl < guard.dur && gTo > 0.8 && prevPlaying === !!tk.playing) {""",
    "tick-tol")
rep("""        if (reanchor) {
          capPos = 0; /* 重锚即解除钉守；rejHist 保留——重现证据靠 8s 窗口自然过期 */
          if (prevPlaying === false && tk.playing === true &&
              Math.abs(delta) > 0.05 && Math.abs(delta) <= 2) {
            soft = { from: posNow(), at: Date.now(), dur: SOFT_MS };
          } else if (Math.abs(delta) > 2 || prevPlaying !== !!tk.playing) {
            soft = null;
          }""",
    """        if (reanchor) {
          capPos = 0; /* 重锚即解除钉守；rejHist 保留——重现证据靠 8s 窗口自然过期 */
          if (prevPlaying === false && tk.playing === true &&
              Math.abs(delta) > 0.05 && Math.abs(delta) <= 2) {
            soft = { from: posNow(), at: Date.now(), dur: SOFT_MS };
          } else if (Math.abs(delta) > 2 || prevPlaying !== !!tk.playing) {
            soft = null;
          }
          /* v8.3.5 收窗拍软重锚：同态拍 delta 0.35~2.5 带 600ms smoothstep
             入轨（from=收窗拍显示位置）——seek 收窗不再「咯噔」；翻转拍/
             大偏差拍不适用（诚实语义优先）。 */
          if (unguardSoft && prevPlaying === !!tk.playing &&
              Math.abs(delta) > 0.35 && Math.abs(delta) <= 2.5) {
            soft = { from: unguardSoft.from, at: unguardSoft.at, dur: SOFT_MS };
          }
          unguardSoft = null;""",
    "tick-soft")
# tick 非 reanchor 拍也清源（防残留跨拍误用）
rep("""        if (reanchor && capFresh && prevPlaying === !!tk.playing &&
            anchor.playing && delta < 0.35) {
          reanchor = false;
        }""",
    """        if (reanchor && capFresh && prevPlaying === !!tk.playing &&
            anchor.playing && delta < 0.35) {
          reanchor = false;
        }
        if (!reanchor) unguardSoft = null; /* v8.3.5：slew 吸收拍清软源（防残留） */""",
    "tick-clean")

# ---- ④护航窗 4.5→3s（seek() 与 gateFrame bypass）----
rep("""          guard = {
            from: posNow(),
            to: s,
            at: Date.now(),
            dur: 4500,
            song: lastSnap ? String(lastSnap.title || "") : "",
          };""",
    """          guard = {
            from: posNow(),
            to: s,
            at: Date.now(),
            dur: 3000, /* v8.3.5：4.5→3s——真值 1~2.5s 内必到（桥读回即拍），过期多=seek 失败早诚实回锚 */
            song: lastSnap ? String(lastSnap.title || "") : "",
          };""",
    "seek-dur")
rep("""      var bypass = (guard && nowG - guard.at < (guard.dur || 4500)) ||""",
    """      var bypass = (guard && nowG - guard.at < (guard.dur || 3000)) ||""",
    "gate-dur")

io.open(P, "w", encoding="utf-8").write(src)
print("sandbox.js: %d patches, %d -> %d bytes" % (n, len(orig), len(src)))
