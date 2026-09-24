# bump-v8718.py — 版本双位 bump：build-extension.py VERSION + changelog.ts 头插条目
import pathlib

R = pathlib.Path("/tmp/beta-wt")

f = R / "scripts/build-extension.py"
s = f.read_text(encoding="utf-8")
assert 'VERSION = "8.7.17"' in s
s = s.replace('VERSION = "8.7.17"', 'VERSION = "8.7.18"')
f.write_text(s, encoding="utf-8")
print("build-extension.py VERSION -> 8.7.18")

f = R / "src/lib/startpage/changelog.ts"
s = f.read_text(encoding="utf-8")
ANCHOR = 'export const CHANGELOG: ChangelogEntry[] = [\n'
ENTRY = '''  {
    version: "8.7.18",
    date: "2026-09-24",
    title: "「词」开关再精修：真字形·总时长正下方·悬停直亮",
    channel: "shell",
    highlights: [
      "「词」字按真字形重新描画（思源黑体轮廓逐点描取），在方框正中居中，更像网易云的词按钮",
      "「词」开关移到右侧歌曲总时长正下方：播放/上一首/下一首三键回到原位不再让路",
      "悬停「词」按钮不再有圆形底色高亮，改为图标本身直接点亮",
    ],
  },
'''
assert ANCHOR in s and '"8.7.18"' not in s
s = s.replace(ANCHOR, ANCHOR + ENTRY, 1)
f.write_text(s, encoding="utf-8")
print("changelog.ts entry inserted")
