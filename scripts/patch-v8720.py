# patch-v8720.py — v8.7.20 三点：①词钮回弹轻量化 ②on 态 ✓ 角标 ③dl 逐字白描边根修
# ①② → preset-src/smtc/music-widget.html；③ → extension-src/ext-card.js
import pathlib

ok = []

# ================= ①② music-widget.html =================
F = pathlib.Path("/tmp/beta-wt/preset-src/smtc/music-widget.html")
s = F.read_text(encoding="utf-8")

# ① :active .82→.88 + 辉光保留 + 角标 CSS + 脉冲 .88→1.1→1 .28s
OLD_CSS = """#csWordBtn:active{transform:scale(.82);color:var(--acc)}
#csWordBtn.on{filter:drop-shadow(0 0 5px var(--acc32))}
@keyframes cs-wpulse-kf{0%{transform:scale(.82)}45%{transform:scale(1.22)}100%{transform:scale(1)}}
#csWordBtn.wpulse{animation:cs-wpulse-kf .32s var(--ez)}"""
NEW_CSS = """#csWordBtn:active{transform:scale(.88);color:var(--acc)}
#csWordBtn.on{filter:drop-shadow(0 0 5px var(--acc32))}
#csWordBtn .on-badge{position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;display:none;fill:var(--acc);stroke:none}
#csWordBtn .on-badge path{fill:none;stroke:#fff;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
#csWordBtn.on .on-badge{display:block}
@keyframes cs-wpulse-kf{0%{transform:scale(.88)}45%{transform:scale(1.1)}100%{transform:scale(1)}}
#csWordBtn.wpulse{animation:cs-wpulse-kf .28s var(--ez)}"""
assert s.count(OLD_CSS) == 1, "v8719 CSS block not unique"
s = s.replace(OLD_CSS, NEW_CSS, 1)
ok.append("css: press .88 + badge css + pulse .88/1.1/.28s")

# ① 注释块对账（数字更新 + v8.7.20 增记）
OLD_CMT = """   ①按下 :active 图标本体缩小（scale .82，.12s 快过渡=按下即陷，松手即弹）
   ②点击落定 wpulse 脉冲弹跳（.32s，起点对齐 .82 按下态续接不跳变，
   连点经 remove+reflow+add 重触发必重播）
   ③on 态 accent 辉光（drop-shadow 图标本体，非圆底）——on 在悬停下仍可分辨
   级联序：:active 在 :hover 后（同特异性后者胜，按下压过 transform:none）；
   hover 透明底律原样保留，零圆底回归。 */"""
NEW_CMT = """   ①按下 :active 图标本体缩小（.12s 快过渡=按下即陷，松手即弹）
   ②点击落定 wpulse 脉冲弹跳（起点对齐按下态续接不跳变，
   连点经 remove+reflow+add 重触发必重播）
   ③on 态 accent 辉光（drop-shadow 图标本体，非圆底）——on 在悬停下仍可分辨
   级联序：:active 在 :hover 后（同特异性后者胜，按下压过 transform:none）；
   hover 透明底律原样保留，零圆底回归。
   v8.7.20 轻量化+角标（用户：回弹感没必要这么强+加开启状态图标）：
   ④按压缩深 .82→.88、脉冲峰 1.22→1.1、时长 .32s→.28s（回弹轻一点）
   ⑤on-badge ✓ 角标（accent 圆+白勾）锚「词」字右下角（right/bottom:-1px，
   10px 徽标中心≈字形盒右下角 (22,22)），off 隐 on 显，与辉光并用=状态双保险。 */"""
assert s.count(OLD_CMT) == 1, "v8719 comment block not unique"
s = s.replace(OLD_CMT, NEW_CMT, 1)
ok.append("comment: v8.7.20 law recorded")

# ② 按钮 DOM：use 后追加 on-badge 徽标（accent 圆 + 白勾）
OLD_BTN = '<svg><use href="#cs-i-word"/></svg></button></div>'
NEW_BTN = ('<svg><use href="#cs-i-word"/></svg>'
           '<svg class="on-badge" viewBox="0 0 12 12" aria-hidden="true">'
           '<circle cx="6" cy="6" r="6"/><path d="m3.5 6.3 1.7 1.7 3.3-3.7"/></svg></button></div>')
assert s.count(OLD_BTN) == 1, "word btn markup not unique"
s = s.replace(OLD_BTN, NEW_BTN, 1)
ok.append("dom: on-badge svg appended into csWordBtn")

# ② title 对账（开启态描述补角标）
OLD_TT = "开启后图标点亮，浮层右上角 × 可临时隐藏"
NEW_TT = "开启后图标点亮并带 ✓ 角标，浮层右上角 × 可临时隐藏"
assert s.count(OLD_TT) == 1
s = s.replace(OLD_TT, NEW_TT, 1)
ok.append("title: badge mentioned")

F.write_text(s, encoding="utf-8")

# ================= ③ ext-card.js：dl 逐字白描边根修 =================
G = pathlib.Path("/tmp/beta-wt/extension-src/ext-card.js")
c = G.read_text(encoding="utf-8")

# 层角色对调：底层恒 accent（已唱色）、面层白字裁「未唱区」
OLD_DW = "    '.dl1 .dw{position:relative;display:inline-block}' +"
NEW_DW = ("    /* v8.7.20 逐字白描边根修（用户：播放过的高亮字有白色描边）：\n"
          "       旧律=白底字上叠 accent 扫光层——accent 字形抗锯齿边缘混入底下纯白，\n"
          "       已唱字四周白晕读作「描边」（悬浮卡/面板无此病：其底色是灰阶，白晕对比弱）。\n"
          "       根修=层角色对调：底层恒 accent（已唱色）、面层白字裁「未唱区」\n"
          "       （clip 左缘=--p，右半显白）——已唱字形直接坐在深色药丸上零白晕；\n"
          "       未唱白字边缘的 accent 混色在人眼跟踪焦点（已唱区）之外不可察。\n"
          "       视觉语义不变：未唱白 / 已唱 accent；--p 量化/行级时钟零改动。 */\n"
          "    '.dl1 .dw{position:relative;display:inline-block;color:var(--acc,#8b5cf6)}' +")
assert c.count(OLD_DW) == 1, "dl .dw rule not unique"
c = c.replace(OLD_DW, NEW_DW, 1)
ok.append("dl: .dw base -> accent (played color)")

OLD_OV = ("    '.dl1 .dw .ov{position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;color:var(--acc,#8b5cf6);' +\n"
          "    'clip-path:inset(-8% calc(100% - var(--p,0%)) -8% 0)}' +")
NEW_OV = ("    '.dl1 .dw .ov{position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;color:#fff;' +\n"
          "    'clip-path:inset(-8% -8% -8% var(--p,0%))}' +")
assert c.count(OLD_OV) == 1, "dl .ov rule not unique"
c = c.replace(OLD_OV, NEW_OV, 1)
ok.append("dl: .ov -> #fff + clip inverted (unplayed region)")

G.write_text(c, encoding="utf-8")

for line in ok:
    print("OK:", line)
