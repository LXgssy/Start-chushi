#!/usr/bin/env python3
"""v8.2.7 补丁①：sandbox.js 频谱透传根修。

用户实机反馈：「律动只有浮窗有，初始面板没有」。
根因（本轮考古确诊）：public/sandbox.js widgetMode() 的宿主→部件下行透传
白名单只有 widgetSmtc / widgetSmtcResult / widgetSmtcTick —— v8.2.0 给部件
加了 widgetSmtcSpectrum 处理器（widgetShim 内 __music.setSpectrum），却漏了
把宿主 SpectrumClient 的 30Hz 频谱帧透传进部件 iframe。频谱帧永远到不了
music-widget.html → now().bass 恒 0 → beatFrame 恒静态。
浮窗（ext-card 经 ext-bg SW 自有轮询）有律动、面板没有的分叉点即此。
"""
import pathlib

P = pathlib.Path("/tmp/my-project/public/sandbox.js")
src = P.read_text(encoding="utf-8")

OLD = (
    'if ((m.type === "widgetSmtc" || m.type === "widgetSmtcResult" || m.type === "widgetSmtcTick") && inner && inner.contentWindow) {'
)
NEW = (
    'if ((m.type === "widgetSmtc" || m.type === "widgetSmtcResult" || m.type === "widgetSmtcTick" || m.type === "widgetSmtcSpectrum") && inner && inner.contentWindow) {'
)
if NEW in src and OLD not in src:
    print("already patched")
    raise SystemExit(0)
if OLD not in src:
    raise SystemExit("anchor not found: widgetSmtc forward line")

# 替换透传行 + 注释行（紧随其后）
src = src.replace(
    OLD + "\n      /* SMTC 通道下行：快照推送/每拍锚点/控制回执原样透传进部件 */",
    NEW + "\n"
    '      /* SMTC 通道下行：快照推送/每拍锚点/控制回执/频谱帧原样透传进部件\n'
    '         v8.2.7 根修：widgetSmtcSpectrum 此前漏在透传白名单外——宿主\n'
    '         SpectrumClient 频谱帧永远到不了部件 iframe，now().bass 恒 0，\n'
    '         「初始」面板律动恒静态（浮窗有、面板没有的分叉点即此）。 */',
    1,
)
assert 'm.type === "widgetSmtcSpectrum"' in src, "forward not applied"

P.write_text(src, encoding="utf-8")
print("OK: sandbox.js widgetSmtcSpectrum forward added")
