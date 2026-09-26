#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.24 zip 逐串新鲜度验证（verify-zip-v8723 克隆 + 六项迭代锚）
新增源：ext-bg ne 数据面 / PresetWidgets neFrame+neCmd+nePub / sandbox pub
/ 官方预设（六项变更内嵌）/ 上限 36800 五处联动 / 版本 8.7.24
锚串纪律：不跨引号/换行边界（Task 154 律）"""
import zipfile, json, re

ZIP = "/tmp/beta-wt/download/v8.7.24/ChuShi-NewTab-v8.7.24.zip"
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
if man.get("version") == "8.7.24":
    ok += 1
else:
    bad.append("manifest version != 8.7.24")

# ---- 2) ext-bg.js：ne 数据面（原样入包） ----
bg = z.read("ext-bg.js").decode("utf-8")
has(bg, "function neWins()", "ext-bg: ne 仲裁")
has(bg, "const t = neWins() ? neTrack : state;", "ext-bg: 赢家广播")
has(bg, "type: \"neCmd\"", "ext-bg: 命令回程")
has(bg, "neLyrics.get(songId)", "ext-bg: 歌词缓存命中")
has(bg, 'm.type === "neLyricPush"', "ext-bg: 歌词推送接收")
has(bg, "chrome.storage.session.set", "ext-bg: session 存活")
has(bg, "sender.url.startsWith(\"chrome-extension://\")", "ext-bg: 发送方校验")
gone(bg, "const ok = await sendCmd(m.cmd, m.position);", "ext-bg: 旧 cmd 单路退役")

# ---- 3) sandbox.js：pub 通道 ----
sb = z.read("sandbox.js").decode("utf-8")
has(sb, "pub:function(o)", "sandbox: chushi.ne pub")
has(sb, "op:'nePub'", "sandbox: nePub op")
has(sb, "payload:p2", "sandbox: pub 载荷")
has(sb, "payload: str(d.payload, 240000)", "sandbox: relay payload 字段")

# ---- 4) 页面 chunk 锚（宿主数据层 + 桥三通道 + 官方预设内嵌） ----
chunks = [n for n in names if re.match(r"next/static/chunks/.*\.js$", n)]
print(f"chunks: {len(chunks)}")
alljs = ""
for n in chunks:
    alljs += z.read(n).decode("utf-8", "ignore")

# neFrame 发布 + neCmd 落宿主 + nePub 校验
has(alljs, "type:\"neFrame\"", "chunk: neFrame 发布")
has(alljs, "fetchedAt:Date.now()", "chunk: neFrame 锚点")
has(alljs, "type:\"neLyricPush\"", "chunk: neLyricPush 转发")
has(bg, "type: \"neCmd\"", "ext-bg: neCmd 发送（SW→页面）")
has(alljs, "\"neCmd\"!==", "chunk: neCmd 监听（比较翻转形态）")
has(alljs, "case\"nePub\":", "chunk: nePub 校验")
has(alljs, "source:\"chushi-ne\"", "chunk: 歌词源标记")
# 宿主数据层新增
has(alljs, "/weapi/logout", "chunk: logout 端点白名单")
# 官方预设内嵌六项
has(alljs, "初始 · 网易云播放器", "chunk: 预设名（UTF-8 原文）")
has(alljs, "chushi.ne.pub({songId:String(id)", "chunk: 歌词外送调用")
has(alljs, "csDlyric", "chunk: 词钮全局歌词开关", 2)
has(alljs, "lyReconcile", "chunk: 歌词动效 v2 行态机")
has(alljs, "vrail.addEventListener", "chunk: 音量滑块")
has(alljs, "--lybg:rgba(255,255,255,.88)", "chunk: 歌词页背景加实（浅）")
has(alljs, "--lybg:rgba(24,24,28,.86)", "chunk: 歌词页背景加实（深）")
has(alljs, "已退出登录", "chunk: 退出登录文案")
has(alljs, "确认退出?", "chunk: 两步确认文案")

# 上限五处联动：preset.ts 36800 进 chunk
has(alljs, "36800", "chunk: widgetHtmlLen 36800")

# ---- 5) 版本/changelog ----
has(alljs, "封面开歌词", "chunk: changelog 8.7.24 标题词")
gone(alljs, "widgetHtmlLen:30400", "chunk: 旧上限 30400 数值键退役")

# ---- 6) v8.7.22 存量零回归（SMTC 词钮 TL46 锚沿用） ----
has(alljs, 'r=' + chr(92) * 2 + '"5.25', "chunk: v8.7.22 词钮角标零回归（json-in-js 双重转义锚）")

print(f"\n===== verify-zip v8.7.24: {ok} OK / {len(bad)} BAD =====")
for b in bad:
    print("  [BAD]", b)
import sys
sys.exit(1 if bad else 0)
