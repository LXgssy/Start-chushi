# bump-v8719.py — 版本双位 bump：build-extension.py VERSION + changelog.ts 头插条目
#               + 探针 ZIP 路径版本耦合（v8.7.18→v8.7.19）
import pathlib

R = pathlib.Path("/tmp/beta-wt")

# ① build-extension.py VERSION
f = R / "scripts/build-extension.py"
s = f.read_text(encoding="utf-8")
assert 'VERSION = "8.7.18"' in s
s = s.replace('VERSION = "8.7.18"', 'VERSION = "8.7.19"')
f.write_text(s, encoding="utf-8")
print("build-extension.py VERSION -> 8.7.19")

# ② changelog.ts 头插条目
f = R / "src/lib/startpage/changelog.ts"
s = f.read_text(encoding="utf-8")
ANCHOR = 'export const CHANGELOG: ChangelogEntry[] = [\n'
ENTRY = '''  {
    version: "8.7.19",
    date: "2026-09-25",
    title: "「词」开关点击反馈：按下回弹·脉冲确认·点亮辉光",
    channel: "shell",
    highlights: [
      "按下「词」按钮图标立即缩小、松手回弹，点击落定有一记脉冲弹跳，不用再猜有没有点中",
      "开启状态下「词」图标带同色微光，悬停时也能一眼分辨开与关",
    ],
  },
'''
assert ANCHOR in s and '"8.7.19"' not in s
s = s.replace(ANCHOR, ANCHOR + ENTRY, 1)
f.write_text(s, encoding="utf-8")
print("changelog.ts entry inserted")

# ③ 探针 ZIP 路径版本耦合
f = R / "scripts/probe-beta.mjs"
s = f.read_text(encoding="utf-8")
OLD = 'const ZIP = "/tmp/beta-wt/download/v8.7.18/ChuShi-NewTab-v8.7.18.zip";'
NEW = 'const ZIP = "/tmp/beta-wt/download/v8.7.19/ChuShi-NewTab-v8.7.19.zip";'
assert s.count(OLD) == 1
s = s.replace(OLD, NEW, 1)
f.write_text(s, encoding="utf-8")
print("probe-beta.mjs ZIP path -> v8.7.19")
