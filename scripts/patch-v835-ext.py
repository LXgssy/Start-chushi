#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch-v835-ext.py —— v8.3.5 浮窗 ext-card.js 四修：
①中文逐字重影（.fw inline-block 化，两层文本基线像素级重合）
②高光照亮文字（内容件 relative+z-index:1 提到 .glow 之上）
③seek 护航窗收窗容差 2→0.8s + 窗 4.5→3s（过快/过慢/要校准）
头部版本注释 v8.3.5。"""
import io, sys

P = "/tmp/my-project/extension-src/ext-card.js"
src = io.open(P, encoding="utf-8").read()
orig = src
n = 0

def rep(old, new, tag):
    global src, n
    if old not in src:
        print("MISS [%s]: %r..." % (tag, old[:70]))
        sys.exit(1)
    if src.count(old) != 1:
        print("AMBIG[%s]: %d hits" % (tag, src.count(old)))
        sys.exit(1)
    src = src.replace(old, new)
    n += 1
    print("ok  [%s]" % tag)

# ---- ①头部标题与注释段 ----
rep(
""" * 「初始」ext-card v8.3.4 —— 内容脚本：悬浮音乐卡（置顶所有网页，三态）
 *
 * v8.3.4 用户实机反馈四连：""",
""" * 「初始」ext-card v8.3.5 —— 内容脚本：悬浮音乐卡（置顶所有网页，三态）
 *
 * v8.3.5 用户实机反馈四连（浮窗侧）：
 *   ① 中文歌逐字歌词「重影」——根因：.fw 词壳是 inline 相对定位，
 *      .ov（absolute）的包含块顶 = 字体 em box 顶（content area），
 *      而底字基线由 line box 排布（line-height 1.45 的半 leading 差
 *      ≈3px）→ 两层文本基线错位，中文方块字笔画极敏感 = 重影
 *      （拉丁圆润笔画不敏感，故用户只见中文歌出影）。修：.fw 改
 *      inline-block——包含块成真块盒，内部 line box 与外部行盒基线
 *      对齐律一致（inline-block 基线=末行盒基线），两层像素级重合。
 *      .ov 补 white-space:nowrap 双保险。面板 .cs-w 同律（双表面）。
 *   ② 高光照亮文字（用户：文字层级要比律动高光高）——层叠律：
 *      .glow 是 positioned（z-index:0），同 context 内 positioned
 *      画在非定位内容之上；封面 img 有 z-index:1 压光，但 .meta/.mtm/
 *      .rail/.cap/.flyr/.ftm/.fctl 全是非定位 → 辉光 blur 晕出
 *      （-6px + 10px ≈ 16px）盖住邻近文字。修：全部内容件提层
 *      position:relative;z-index:1（cap/mtm 已 absolute 补 z-index）。
 *      面板 .cs-meta 等同律。
 *   ③ seek 后歌词过快/过慢/要校准——护航窗收窗容差 ±2s 太宽：
 *      真值落点差 1.9s 也直接收窗重锚。修：收窗容差收紧 0.8s +
 *      护航窗 4.5s→3s（真值正常 1~2.5s 内到，过期多=seek 失败，
 *      早收窗早诚实回锚；过期拍走既有中幅软重锚带（|d|≤2.5 →
 *      800ms smoothstep），不再硬跳）。sandbox 同律（收窗/软重锚/dur）。
 *
 * v8.3.4 用户实机反馈四连：""",
"hdr")

# ---- ②文字层级：.meta/.mtm/.cap/.rail/.flyr/.ftm/.fctl ----
rep("'.meta{flex:1;min-width:0}' +",
    "/* v8.3.5 文字层级律：内容件 relative+z-index:1 压住 .glow（positioned\n"
    "       z-index:0 同 context 画在非定位内容之上 = 辉光晕出盖字）；\n"
    "       img z-index:1 同带，文字件 DOM 源序靠后同带更高。 */\n"
    "    '.meta{flex:1;min-width:0;position:relative;z-index:1}' +", "meta")
rep("'.mtm{position:absolute;left:12px;top:4px;height:22px;line-height:22px;font-size:10px;' +",
    "'.mtm{position:absolute;left:12px;top:4px;height:22px;line-height:22px;font-size:10px;z-index:1;' +", "mtm")
rep("'.cap{position:absolute;right:8px;top:8px;display:flex;gap:2px}' +",
    "'.cap{position:absolute;right:8px;top:8px;display:flex;gap:2px;z-index:1}' +", "cap")
rep("'.rail{height:10px;display:flex;align-items:center;cursor:pointer}' +",
    "'.rail{position:relative;z-index:1;height:10px;display:flex;align-items:center;cursor:pointer}' +", "rail")
rep("'.flyr{position:relative;height:140px;margin-top:10px;overflow:hidden;flex:none;' +",
    "'.flyr{position:relative;z-index:1;height:140px;margin-top:10px;overflow:hidden;flex:none;' +", "flyr")
rep("'.ftm{display:flex;justify-content:space-between;font-size:10px;color:#8e8e96;margin-top:5px;font-variant-numeric:tabular-nums}' +",
    "'.ftm{position:relative;z-index:1;display:flex;justify-content:space-between;font-size:10px;color:#8e8e96;margin-top:5px;font-variant-numeric:tabular-nums}' +", "ftm")
rep("'.fctl{display:flex;align-items:center;justify-content:center;gap:22px;margin-top:4px}' +",
    "'.fctl{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:22px;margin-top:4px}' +", "fctl")

# ---- ③逐字重影：.fw inline-block + .ov nowrap ----
rep("'.fw{position:relative;color:#71717a}' +",
    "/* v8.3.5 逐字重影根治：.fw inline-block 化——inline 相对定位的\n"
    "       absolute 子元素包含块顶 = em box 顶，与底字 line box 基线差\n"
    "       半 leading（~3px），中文方块字重影明显。inline-block 后包含\n"
    "       块=真块盒，内部 line box 与外部行盒基线对齐律一致 → 两层文\n"
    "       本像素级重合。inline-block 序列在 text-align:center / 断行 /\n"
    "       基线对齐与 inline 行为一致（createElement 无空白节点无间隙）。 */\n"
    "    '.fw{position:relative;display:inline-block;color:#71717a}' +", "fw")
rep("'.fw .ov{position:absolute;left:0;top:0;color:#f4f4f5;pointer-events:none;' +",
    "'.fw .ov{position:absolute;left:0;top:0;color:#f4f4f5;pointer-events:none;white-space:nowrap;' +", "ov")

# ---- ④护航窗：收窗 0.8 / 窗 3000 ----
rep(
"""    /* seek 护航窗：拖动已乐观重锚——远离目标的拍是拖动前旧轨/中间态 */
    if (seekGuard) {
      if (now - seekGuard.at > 4500) { seekGuard = null; }
      else if (Math.abs(implied - seekGuard.to) <= 2) { seekGuard = null; }
      else return; /* 陈旧拍：忽略，目标轨迹继续走 */
    }""",
"""    /* seek 护航窗：拖动已乐观重锚——远离目标的拍是拖动前旧轨/中间态。
       v8.3.5：收窗容差 2→0.8（真值落点差 1~2s 也收窗 = 误差带内重锚，
       体感「seek 后歌词要校准」）；窗 4.5→3s（真值正常 1~2.5s 内到，
       过期多=seek 失败，早收窗早诚实回锚；过期拍走下方中幅软重锚带
       （|d|≤2.5 → 800ms smoothstep），不再硬跳）。 */
    if (seekGuard) {
      if (now - seekGuard.at > 3000) { seekGuard = null; }
      else if (Math.abs(implied - seekGuard.to) <= 0.8) { seekGuard = null; }
      else return; /* 陈旧拍：忽略，目标轨迹继续走 */
    }""",
"guard")

io.open(P, "w", encoding="utf-8").write(src)
print("ext-card.js: %d patches applied, %d -> %d bytes" % (n, len(orig), len(src)))
