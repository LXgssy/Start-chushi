# patch-tl45-v8718.py — TL45 门 v8.7.17 按钮断言 → v8.7.18 新位置律
# 旧：btnCtl(csNext 后 400 内 csWordBtn)+btnFootGone
# 新：btnTm(csTDur 后 csWordBtn)+btnCtlGone+btnFootGone+btnHoverLaw(绝对定位+hover 三件套)+btnGlyph(真字形 fill 路径)
import pathlib

f = pathlib.Path("/tmp/beta-wt/scripts/probe-beta.mjs")
s = f.read_text(encoding="utf-8")

OLD_START = "      /* ⑦ v8.7.17 按钮归位："
OLD_END = '      /* ④ 抽屉提速源码锚（globals.css） */'
i0 = s.index(OLD_START)
i1 = s.index(OLD_END)

NEW = r'''      /* ⑦ v8.7.18 按钮迁时长行右下：csWordBtn 在 cs-tm 内 csTDur 之后
         （用户：三键不让位+总时长正下方）；cs-ctl 与 cs-foot 行内均无歌词钮；
         悬停去圆底律（#csWordBtn 绝对定位+hover 三件套：透明底+accent+无 scale）+
         on 点亮态 +「词」真字形描取（fill 路径 45 点，注释形态锚）
         （musHtml45 是 JSON.stringify 产物：引号带反斜杠转义，正则用 \\?" 兼容） */
      btnTm: /id=\\?"csTDur\\?"[\s\S]{0,300}?id=\\?"csWordBtn\\?"/.test(musHtml45) && /\.cs-b\.on\{color:var\(--acc\)\}/.test(musHtml45),
      btnCtlGone: !( /<div class=\\?"cs-ctl\\?">[\s\S]{0,600}?<\/div>/.exec(musHtml45) || ["", ""] )[0].includes("csWordBtn"),
      btnFootGone: !( /<div class=\\?"cs-foot\\?">[\s\S]{0,800}?<\/div>/.exec(musHtml45) || ["", ""] )[0].includes("csWordBtn"),
      btnHoverLaw: /#csWordBtn\{position:absolute;right:-4px;top:100%/.test(musHtml45) && /#csWordBtn:hover\{background:transparent;color:var\(--acc\);transform:none\}/.test(musHtml45),
      btnGlyph: /<path fill=\\?"currentColor\\?" stroke=\\?"none\\?" d=\\?"m7\.2 6\.9[^"]{100,}z\\?"\/><\/symbol><!-- v8\.7\.18/.test(musHtml45),
'''

s = s[:i0] + NEW + s[i1:]

OLD_GATE = "面板开关按钮（cs-ctl 归位 cs-foot 退役+on 点亮+构建产物三源）+ 抽屉 0.4s 源码锚\",\n      t45.dlRead && t45.dlPortShared && t45.dlSurface && t45.dlPosPersist && t45.dlXWriteBack && t45.dlSweepLaw && t45.trLine && t45.previewGone && t45.centerAnchor && t45.pwMap && t45.pwMirror && t45.pwSet && t45.btn && t45.btnCtl && t45.btnFootGone && t45.drawerFast,"
NEW_GATE = "面板开关按钮（时长行右下 cs-ctl/cs-foot 双退役+hover 图标点亮+真字形+构建产物三源）+ 抽屉 0.4s 源码锚\",\n      t45.dlRead && t45.dlPortShared && t45.dlSurface && t45.dlPosPersist && t45.dlXWriteBack && t45.dlSweepLaw && t45.trLine && t45.previewGone && t45.centerAnchor && t45.pwMap && t45.pwMirror && t45.pwSet && t45.btn && t45.btnTm && t45.btnCtlGone && t45.btnFootGone && t45.btnHoverLaw && t45.btnGlyph && t45.drawerFast,"
assert OLD_GATE in s, "gate line not found"
s = s.replace(OLD_GATE, NEW_GATE)
assert "v8.7.17 扩）：浮层本体" in s
s = s.replace("TL45 全局歌词链路静态门（v8.7.17 扩）", "TL45 全局歌词链路静态门（v8.7.18 扩）")

f.write_text(s, encoding="utf-8")
print("TL45 patched; btnCtl refs left:", s.count("btnCtl:"))
