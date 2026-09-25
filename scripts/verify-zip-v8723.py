#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.23 zip 逐串新鲜度验证（Task 154 律：转义环境锚串选不跨引号/换行边界形态）
新增源：netease.ts 宿主数据层 / PresetWidgets ne 三 case / sandbox.js chushi.ne 桥
/ 官方预设三号位（网易云播放器 cshz 内嵌）/ 上限 30400 五处联动 / 版本 8.7.23"""
import zipfile, json, re

ZIP = "/tmp/beta-wt/download/v8.7.23/ChuShi-NewTab-v8.7.23.zip"
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
if man.get("version") == "8.7.23":
    ok += 1
else:
    bad.append("manifest version != 8.7.23")

# ---- 2) sandbox.js：chushi.ne 桥三层（原样入包） ----
sb = z.read("sandbox.js").decode("utf-8")
has(sb, "op:'neApi'", "sandbox: neApi op")
has(sb, "op:'neAudio'", "sandbox: neAudio op")
has(sb, "op:'neSub'", "sandbox: neSub op")
has(sb, "ne:{api:function(p,d)", "sandbox: chushi.ne api")
has(sb, "widgetNeResult", "sandbox: 结果回执下行")
has(sb, "widgetNeAudio", "sandbox: 状态帧下行")
has(sb, "var neCbs=[]", "sandbox: ne 订阅集")

# ---- 3) 页面 chunk 锚（宿主数据层 + 桥 + 官方预设内嵌） ----
chunks = [n for n in names if re.match(r"next/static/chunks/.*\.js$", n)]
print(f"chunks: {len(chunks)}")
alljs = ""
for n in chunks:
    alljs += z.read(n).decode("utf-8", "ignore")

# 宿主 weapi 数据层（字符串字面量跨 minify 存活）
has(alljs, "0CoJUm6Qyw8W8jud", "chunk: weapi 固定钥")
has(alljs, "0102030405060708", "chunk: weapi IV")
has(alljs, "/weapi/search/get", "chunk: 搜索端点白名单")
has(alljs, "/weapi/song/enhance/player/url/v1", "chunk: 直链端点白名单")
has(alljs, "/weapi/v3/song/detail", "chunk: 封面端点白名单")
has(alljs, "/weapi/login/qrcode/unikey", "chunk: 扫码登录端点")
has(alljs, "credentials:\"include\"", "chunk: credentials include（JSON 转义形态）")
has(alljs, "非白名单端点", "chunk: 白名单拒绝文案")
# 桥 case 与下行消息名
has(alljs, "neApi", "chunk: PresetWidgets neApi", 1)
has(alljs, "widgetNeResult", "chunk: widgetNeResult", 2)
has(alljs, "widgetNeAudio", "chunk: widgetNeAudio", 2)
# MediaSession 接线
has(alljs, "setActionHandler", "chunk: MediaSession handlers")

# 官方预设三号位内嵌（id=netease ASCII 锚 + HTML 无引号锚）
has(alljs, "初始 · 网易云播放器", "chunk: 预设名（UTF-8 原文）")
has(alljs, "chushi.ne.api", "chunk: 预设 HTML 桥调用", 1)
has(alljs, "parseYrc", "chunk: YRC 解析器")
has(alljs, "qrMatrix", "chunk: QR 编码器")
has(alljs, "/^http:/", "chunk: 直链 https 升级")
has(alljs, "扫一扫登录", "chunk: QR 提示文案")

# 上限五处联动：preset.ts 30400 进 chunk
has(alljs, "30400", "chunk: widgetHtmlLen 30400")

# ---- 4) 版本/changelog ----
has(alljs, "内置网易云播放器", "chunk: changelog 8.7.23 标题")
gone(alljs, "widgetHtmlLen:28800", "chunk: 旧上限 28800 数值键退役")
gone(alljs, "widgetHtmlLen:26400", "chunk: 旧上限 26400 退役")

# ---- 5) v8.7.22 存量零回归（SMTC 词钮 TL46 锚沿用） ----
has(alljs, 'r=' + chr(92) * 2 + '"5.25', "chunk: v8.7.22 词钮角标零回归（json-in-js 双重转义锚）")

print(f"\n===== verify-zip v8.7.23: {ok} OK / {len(bad)} BAD =====")
for b in bad:
    print("  [BAD]", b)
import sys
sys.exit(1 if bad else 0)
