#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.28 zip 逐串新鲜度验证（verify-zip-v8727 骨架 + 整页重写锚）
本轮：搜索页签退役（双页签+命令行唯一搜索入口+世代/关键词双对账）
/ hover 纯放大禁位移（旋钮负边距定位，translate 退出 hover）
/ .lst→.ls 容器改名 / 版本 8.7.28 / changelog 新标题词
锚串纪律：不跨引号/换行边界；widget html 内嵌为转义形态（\\\"qpop\\\"）；
swc minify 改名免疫：行为锚只取字符串字面量/属性链/比较翻转实态形态。"""
import zipfile, json, re

ZIP = "/tmp/beta-wt/download/v8.7.28/ChuShi-NewTab-v8.7.28.zip"
z = zipfile.ZipFile(ZIP)
names = z.namelist()
ok, bad = 0, []

def has(payload, needle, tag, count_ge=1):
    global ok
    c = payload.count(needle)
    if c >= count_ge:
        ok += 1
        print(f"  [OK] {tag} (x{c})")
    else:
        bad.append(f"{tag}: expect>={count_ge} got {c}")
        print(f"  [FAIL] {tag} expect>={count_ge} got {c}")

def gone(payload, needle, tag):
    global ok
    if needle not in payload:
        ok += 1
        print(f"  [OK-GONE] {tag}")
    else:
        bad.append(f"{tag}: still present")
        print(f"  [FAIL-GONE] {tag}: still present")

# ---- 1) manifest 版本 ----
man = json.loads(z.read("manifest.json"))
print("manifest version:", man.get("version"))
if man.get("version") == "8.7.28":
    ok += 1
else:
    bad.append("manifest version != 8.7.28")

# ---- 2) ext-bg.js：ne 数据面（存量零回归） ----
bg = z.read("ext-bg.js").decode("utf-8")
has(bg, "function neWins()", "ext-bg: ne 仲裁")
has(bg, "const t = neWins() ? neTrack : state;", "ext-bg: 赢家广播")
has(bg, "neLyrics.get(songId)", "ext-bg: 歌词缓存命中")
has(bg, 'm.type === "neLyricPush"', "ext-bg: 歌词推送接收")
has(bg, "chrome.storage.session.set", "ext-bg: session 存活")

# ---- 3) sandbox.js：ne 通道（存量零回归） ----
sb = z.read("sandbox.js").decode("utf-8")
has(sb, "ne:{api:function(p,d)", "sandbox: chushi.ne api")
has(sb, "op:'neAudio'", "sandbox: neAudio op")
has(sb, "beat:function(cb)", "sandbox: chushi.ne beat")
has(sb, "op:'neBeatSub'", "sandbox: neBeatSub op")

# ---- 4) 页面 chunk 锚 ----
chunks = [n for n in names if re.match(r"next/static/chunks/.*\.js$", n)]
print(f"chunks: {len(chunks)}")
alljs = ""
for n in chunks:
    alljs += z.read(n).decode("utf-8", "ignore")

# 4a) palette 展示面全链（宿主，存量零回归）
has(alljs, 'filter(e=>"palette"!==e.display)', "chunk: Dock 舞台过滤（minify 翻转形态）")
has(alljs, 'filter(e=>"palette"===e.display)', "chunk: WidgetPalette 挂载过滤")
has(alljs, '"palette"===e.display?"palette":void 0', "chunk: parsePreset display 透传")
has(alljs, "max-w-[560px]", "chunk: palette 玻璃卡宽", 2)
has(alljs, "backdrop-blur-md", "chunk: 雾化遮罩", 2)
has(alljs, "Math.min(580,Math.max(120,", "chunk: 宽钳制 580")
has(alljs, "Math.min(560,Math.max(40,", "chunk: 高钳制 560")
# 4b) 官方预设 manifest（display/尺寸，单层 JSON-in-JS 形态）
has(alljs, '"display":"palette"', "chunk: manifest display=palette（单层 JSON-in-JS）")
has(alljs, '"width":560,"height":540', "chunk: manifest 560×540（单层 JSON-in-JS）")
# 4c) v8.7.28 整页重写四件（html 转义形态）
has(alljs, r'<b data-t=\\"d\\" class=\\"on\\">每日推荐</b><b data-t=\\"p\\">我的歌单</b>', "chunk: 双页签（搜索页签退役）")
gone(alljs, "S.rowsSrc", "chunk: rowsSrc 来源对账退役")
gone(alljs, r'data-t=\\"s\\"', "chunk: 搜索页签 data-t=s 退役（转义形态）")
gone(alljs, 'data-t="s"', "chunk: 搜索页签 data-t=s 退役（平文形态）")
has(alljs, "S.gen++", "chunk: 视图世代令牌")
has(alljs, r'k!==$(\\"q\\").value.trim()', "chunk: 搜索关键词双对账（转义）")
has(alljs, "function segLite", "chunk: 页签点亮器（搜索视图全熄）")
has(alljs, r'S.tab=\\"s\\"', "chunk: 搜索视图态（不占页签）")
has(alljs, r'id=\\"go\\"', "chunk: 命令行搜索按钮")
has(alljs, "S.curRow=r", "chunk: 当前曲行引用")
has(alljs, "playRow(S.curRow,S.anc.playing?S.anc.posMs/1000:0)", "chunk: 音质热切换直取 curRow")
has(alljs, r'cv.classList.add(\\"on\\")', "chunk: 封面 .on 无条件补回（转义）")
has(alljs, "lyRender();lyStart()", "chunk: 歌词 rAF 续跑", 2)
has(alljs, "function applyLvl", "chunk: 音质应用函数")
has(alljs, r'id=\\"qpop\\"', "chunk: 音质弹窗元素（转义）")
has(alljs, r'data-q=\\"exhigh\\"', "chunk: 音质弹窗三档（极高）")
has(alljs, r'data-q=\\"lossless\\"', "chunk: 音质弹窗三档（无损）")
has(alljs, r'class=\\"qsr\\"', "chunk: 常驻搜索行（转义）")
has(alljs, ".qpop{position:absolute", "chunk: 音质弹窗 CSS")
has(alljs, ".qsr{display:flex", "chunk: 常驻搜索行 CSS")
has(alljs, ".ls.pgrid{display:grid", "chunk: 歌单双列卡片（.ls 新容器名）")
has(alljs, "已回退", "chunk: 音质降级提示")
# 4d) hover 纯放大（本轮铁律）
has(alljs, ".vrail:hover b,.vrail.drag b{transform:scale(1.18)}", "chunk: 音量旋钮 hover 纯 scale")
has(alljs, "margin:-6px 0 0 -6px", "chunk: 旋钮负边距定位（translate 退出 hover）")
gone(alljs, "translate(-50%,-50%) scale(1.18)", "chunk: 旧旋钮 hover translate 形态退役")
# 4e) 存量零回归（v8.7.24/25/26/27 关键锚）
has(alljs, "chushi.ne.pub({songId:String(id)", "chunk: 歌词外送调用")
has(alljs, "lyReconcile", "chunk: 歌词动效 v2 行态机")
has(alljs, "vrail.addEventListener", "chunk: 音量滑块")
has(alljs, "--lybg:rgba(255,255,255,.88)", "chunk: 歌词背景加实（浅）")
has(alljs, "--lybg:rgba(24,24,28,.86)", "chunk: 歌词背景加实（深）")
has(alljs, ".ctls{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)", "chunk: 三键不让位")
has(alljs, "{t:+w[1],d:+w[2],x:w[3]}", "chunk: YRC 绝对时间戳")
has(alljs, "初始 · 网易云播放器", "chunk: 预设名（UTF-8 原文）")
has(alljs, "已退出登录", "chunk: 退出登录文案")

# ---- 5) 版本/上限/changelog ----
has(alljs, "44000", "chunk: widgetHtmlLen 44000", 2)
gone(alljs, "widgetHtmlLen:39600", "chunk: 旧上限 39600 数值键退役")
gone(alljs, "lvi=0", "chunk: 旧音质轮换索引退役")
has(alljs, "搜索页签退役", "chunk: changelog 8.7.28 标题词")
has(alljs, "命令面板式弹窗", "chunk: changelog 8.7.27 标题词（存量）")

# ---- 6) v8.7.22 存量零回归（SMTC 词钮 TL46 锚沿用） ----
has(alljs, 'r=' + chr(92) * 2 + '"5.25', "chunk: v8.7.22 词钮角标零回归（json-in-js 转义锚）")

print(f"\n===== verify-zip v8.7.28: {ok} OK / {len(bad)} BAD =====")
for b in bad:
    print("  [BAD]", b)
import sys
sys.exit(1 if bad else 0)
