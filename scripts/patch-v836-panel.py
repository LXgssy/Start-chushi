#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch-v836-panel.py —— v8.3.6 面板 music-widget.html 修（与浮窗同律）：
①歌词左右截断：当前行 scale(1.06) 把行盒横向扩出 ≈9px 被 .cs-lyr overflow:hidden
  左右硬切 + 翻译行（.cs-subw/.cs-sub）隐式 grid 列 auto=max-content 被 nowrap
  长句撑到面板外再硬切（左右都被切、ellipsis 失效）。修：.cs-lyr-in 左右各留 9px；
  .cs-subw 显式 grid-template-columns:minmax(0,1fr)；.cs-sub 补 overflow:hidden；
  .cs-ln 补 overflow-wrap:anywhere。
②播放/暂停键按下位移：.cs-bmain:active 的 transform:scale(.94) 按下瞬间整键缩放
  被读作位移 → 改非几何 brightness（▶ 字形不动，M8 视觉质心居中）。
③歌词复位：buildLyric 的旧门 = (rev#mode:行数) + 载荷对象身份。快照经
  postMessage/重解析每拍都是新对象 → 身份维恒不等 → 门每拍失效 → 歌词 DOM
  每拍重建（高亮/滚动/已唱态整组复位）。改内容指纹 lyricSig：内容不变不重建，
  内容变（同 rev 的旧词→新词 / 翻译回填 / lrc→yrc 升级）仍重建。
"""
import io, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
P = ROOT + "/preset-src/smtc/music-widget.html"
src = io.open(P, encoding="utf-8").read()
orig = src
n = 0

def rep(old, new, tag):
    global src, n
    if old not in src:
        print("MISS [%s]: %r..." % (tag, old[:70])); sys.exit(1)
    if src.count(old) != 1:
        print("AMBIG[%s]: %d hits" % (tag, src.count(old))); sys.exit(1)
    src = src.replace(old, new); n += 1
    print("ok  [%s]" % tag)

# ---- ①a 歌词左右防裁切：.cs-lyr-in 内缩 9px ----
rep(
".cs-lyr-in{position:absolute;left:0;right:0;top:0;transition:transform .45s var(--ez);will-change:transform}",
"""/* v8.3.6 歌词左右防裁切律（浮窗同律）：当前行 transform:scale(1.06) 把整行盒
   （含 padding）横向扩出 (1.06-1)×行宽/2 ≈9px，被 .cs-lyr 的 overflow:hidden
   在左右各切一刀——翻译行首字被吃掉、满宽主行末字被切。内层左右各留 9px
   呼吸位，放大后的行盒仍落在视口内；文字另有行内 4px padding，余量充足。 */
.cs-lyr-in{position:absolute;left:9px;right:9px;top:0;transition:transform .45s var(--ez);will-change:transform}""",
"lyr-in")

# ---- ①b 长词兜底 ----
rep(
".cs-ln{padding:6px 4px;text-align:center;font-size:14.5px;font-weight:560;line-height:1.45;",
"""/* v8.3.6 断行兜底：超长不可断词（URL/长英文单词）禁止横向溢出被裁。 */
.cs-ln{padding:6px 4px;text-align:center;font-size:14.5px;font-weight:560;line-height:1.45;overflow-wrap:anywhere;""",
"cs-ln")

# ---- ①c 翻译行 grid 列锁宽 ----
rep(
""".cs-subw{display:grid;grid-template-rows:1fr;height:0;opacity:0;overflow:hidden;
  transition:height .38s var(--ez),opacity .38s ease}""",
"""/* v8.3.6 翻译行左右截断根治（浮窗 .fsubw 同律）：只声明 grid-template-rows
   时隐式列是 auto = max-content——nowrap 的翻译长句把列撑到面板外，再由
   overflow:hidden 硬切（左右都被切）。显式 minmax(0,1fr) 把列锁在视口内，
   .cs-sub 补 overflow:hidden 让 text-overflow:ellipsis 真正生效（截断变省略号）。 */
.cs-subw{display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:1fr;height:0;opacity:0;overflow:hidden;
  transition:height .38s var(--ez),opacity .38s ease}""",
"subw")

# ---- ①d 翻译行 ellipsis 生效 ----
rep(
""".cs-subw .cs-sub{min-height:0;font-size:11px;font-weight:400;color:var(--ink2);line-height:1.5;
  white-space:nowrap;text-overflow:ellipsis}""",
""".cs-subw .cs-sub{min-height:0;font-size:11px;font-weight:400;color:var(--ink2);line-height:1.5;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}""",
"cs-sub")

# ---- ②播放键按下零位移（去几何缩放；▶ 字形保持原样）----
rep(
".cs-bmain:active{transform:scale(.94)}",
"""/* v8.3.6 播放键按下零位移律：:active 的 transform:scale(.94) 按下瞬间整键
   缩放（边缘内收 ~1.4px），被读作「按下位移」。改非几何反馈 brightness——
   尺寸/位置恒定。▶ 字形不改：M8 的视觉质心正好落在按钮中心，是有意的视觉
   居中（改左反而偏左，见 worklog）。 */
.cs-bmain:active{transform:none;filter:brightness(.94)}""",
"active")

# ---- ③歌词复位：去掉身份维，改内容指纹 ----
rep(
'  var lyKey = "", lyRef = null, lyMode = 0;',
'  var lyKey = "", lyMode = 0;',
"lykey-var")

rep(
"""  /* ---------- 歌词 DOM 构建（歌词键 + 对象引用双判定才重建） ---------- */
  function buildLyric() {
    var l = snap && snap.lyric;
    var key = (snap && snap.lyricRev || "") + (l ? "#" + (l.mode || 0) + ":" + (l.lines ? l.lines.length : 0) : "#0");
    if (key === lyKey && l === lyRef) return;
    lyKey = key;
    lyRef = l;""",
"""  /* ---------- 歌词 DOM 构建（v8.3.6：内容指纹判定才重建） ----------
     v8.3.6 歌词复位根治（用户实机反馈：切新歌词出来时歌词复位）：
     旧门 = (lyricRev#mode:行数) + 载荷**对象身份**。快照经 postMessage 结构化
     克隆 + 沙箱 whitelist 重解析后，**每拍都是全新对象**，身份维恒不等 → 门
     每拍失效 → 歌词 DOM 每拍重建：innerHTML 清空 + activeLine=-2 + lastLyrTy=null
     = 高亮/滚动/已唱渐隐整组复位（e2e 实测同一内容喂入 survived=0）。
     修：身份维换**内容指纹** lyricSig —— 对 mode/src/songId/行数 + 每行 t/tr +
     词表长度与词文本做 FNV-1a，内容不变则指纹不变（不重建），内容变则指纹变。
     既治复位，又保留旧门原本要保的「同 rev 下旧词→新词 / 翻译回填 /
     lrc→yrc 升级仍必须重建」语义（这些内容确实变了）。 */
  function lyricSig(l) {
    if (!l || !l.lines || !l.lines.length) return "";
    var h = 2166136261, i, j;
    function mix(v) {
      v = String(v == null ? "" : v);
      for (var k = 0; k < v.length; k++) { h ^= v.charCodeAt(k); h = (h * 16777619) >>> 0; }
      h = ((h ^ 31) * 16777619) >>> 0; /* 分隔符，防相邻字段拼接歧义 */
    }
    mix(l.mode); mix(l.src); mix(l.songId); mix(l.lines.length);
    for (i = 0; i < l.lines.length; i++) {
      var ln = l.lines[i], w = ln.w;
      mix(ln.t); mix(ln.tr);
      if (w) { mix(w.length); for (j = 0; j < w.length; j++) mix(w[j].t); }
    }
    return (h >>> 0).toString(36);
  }
  function buildLyric() {
    var l = snap && snap.lyric;
    var key = (snap && snap.lyricRev || "") + "#" + lyricSig(l);
    if (key === lyKey) return;
    lyKey = key;""",
"buildlyric-gate")

io.open(P, "w", encoding="utf-8", newline="\n").write(src)
print("music-widget.html: %d patches applied, %d -> %d bytes" % (n, len(orig.encode("utf-8")), len(src.encode("utf-8"))))
