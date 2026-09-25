# patch-wordbtn-v8719.py — v8.7.19 词钮点击反馈（用户：不知道自己是否点击了按钮）
# 根因=hover 点亮与 on 点亮同为 accent 色，悬停态下点击前后颜色零变化。
# 三件套：①:active 按压缩小 ②wpulse 脉冲弹跳（JS 重触发）③on 态 accent 辉光
import pathlib

F = pathlib.Path("/tmp/beta-wt/preset-src/smtc/music-widget.html")
s = F.read_text(encoding="utf-8")

# ---------- ① CSS：transition 加速 + :active + on 辉光 + 脉冲关键帧 ----------
OLD_CSS = """#csWordBtn{position:absolute;right:-4px;top:100%;margin-top:3px;width:26px;height:26px;
  z-index:2}
#csWordBtn svg{width:20px;height:20px}
#csWordBtn:hover{background:transparent;color:var(--acc);transform:none}
/* ---------- 提示芯片 ---------- */"""
NEW_CSS = """#csWordBtn{position:absolute;right:-4px;top:100%;margin-top:3px;width:26px;height:26px;
  z-index:2;transition:transform .12s ease,color .25s,background-color .3s,filter .3s}
#csWordBtn svg{width:20px;height:20px}
#csWordBtn:hover{background:transparent;color:var(--acc);transform:none}
/* v8.7.19 点击反馈律（用户：不知道自己是否点击了按钮）：
   根因=hover 点亮与 on 点亮同为 accent，悬停态下点击前后颜色零变化。
   ①按下 :active 图标本体缩小（scale .82，.12s 快过渡=按下即陷，松手即弹）
   ②点击落定 wpulse 脉冲弹跳（.32s，起点对齐 .82 按下态续接不跳变，
   连点经 remove+reflow+add 重触发必重播）
   ③on 态 accent 辉光（drop-shadow 图标本体，非圆底）——on 在悬停下仍可分辨
   级联序：:active 在 :hover 后（同特异性后者胜，按下压过 transform:none）；
   hover 透明底律原样保留，零圆底回归。 */
#csWordBtn:active{transform:scale(.82);color:var(--acc)}
#csWordBtn.on{filter:drop-shadow(0 0 5px var(--acc32))}
@keyframes cs-wpulse-kf{0%{transform:scale(.82)}45%{transform:scale(1.22)}100%{transform:scale(1)}}
#csWordBtn.wpulse{animation:cs-wpulse-kf .32s var(--ez)}
/* ---------- 提示芯片 ---------- */"""
assert s.count(OLD_CSS) == 1, "CSS anchor not unique"
s = s.replace(OLD_CSS, NEW_CSS, 1)

# ---------- ② JS：onclick 脉冲重触发 ----------
OLD_JS = """  wordBtn.onclick = function () {
    wordOn = !wordOn;
    wordBtn.classList.toggle("on", wordOn);
    if (window.chushi && chushi.storage) chushi.storage.set("csDlyric", wordOn);
  };"""
NEW_JS = """  wordBtn.onclick = function () {
    wordOn = !wordOn;
    wordBtn.classList.toggle("on", wordOn);
    /* v8.7.19 点击反馈：脉冲弹跳重触发（remove+reflow+add，连点必重播） */
    wordBtn.classList.remove("wpulse");
    void wordBtn.offsetWidth;
    wordBtn.classList.add("wpulse");
    if (window.chushi && chushi.storage) chushi.storage.set("csDlyric", wordOn);
  };"""
assert s.count(OLD_JS) == 1, "JS anchor not unique"
s = s.replace(OLD_JS, NEW_JS, 1)

F.write_text(s, encoding="utf-8")
print("patched music-widget.html:",
      "css+js ok,", len(s), "chars source")
