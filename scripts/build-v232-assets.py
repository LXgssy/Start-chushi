#!/usr/bin/env python3
# build-v232-assets.py — v2.3.2 交付资产（真机第 9 轮三联修复）
# 修复：①插件新版被误报旧版（旧桥进程占端口杀不掉 → 芯片误导常亮 →
#        插件 v1.5.0 主动杀旧桥 + 宿主/部件升级归因拆分：仅桥旧时给
#        「手动启动备用桥」诚实指引，绝不再喊无效的「更新 .plugin」）
#       ②播放态概率反向（插件 playing 改最后事件语义 + store 交叉自愈）
#       ③进度 0.5x 爬行/倒退（元素身份锁定 + 倒退熔断）
# 产线：
#   1. download/v2.3.2/初始歌词源-1.5.0.plugin（内嵌桥 ps1+vbs v1.7.1，回环已验）
#   2. download/v2.3.2/ChuShi-SMTC音乐-交付包.zip
#      （.plugin + 预设 .cshz + 使用说明 + 手动启动桥（备用）/ ——策略拦截机器的 plan B）
#   3. download/v2.3.2/ChuShi-v2.3.2-合并交付包.zip（扩展 zip + SMTC 交付包 zip）
import shutil, pathlib, zipfile, json, base64, re

ROOT = pathlib.Path("/home/z/my-project")
VER = "v2.3.2"
OUT = ROOT / "download" / VER
PLUGIN_SRC = ROOT / "bridge" / "lyric-plugin" / "初始歌词源-1.5.0.plugin"
ZIP = OUT / "ChuShi-SMTC音乐-交付包.zip"
MERGED = OUT / "ChuShi-v2.3.2-合并交付包.zip"
EXT = OUT / "ChuShi-NewTab-v2.3.2.zip"
PRESET = ROOT / "examples" / "初始SMTC音乐预设.cshz"
GUIDE = OUT / "使用说明-SMTC音乐.md"
BRIDGE_PS1 = ROOT / "bridge" / "smtc" / "chushi-bridge.ps1"
BRIDGE_VBS = ROOT / "bridge" / "smtc" / "chushi-bridge-launch.vbs"
BRIDGE_BAT = ROOT / "bridge" / "smtc" / "启动SMTC桥.bat"

assert PLUGIN_SRC.exists(), "先跑 scripts/build-lyric-plugin.py"
assert GUIDE.exists(), "先写使用说明"
assert EXT.exists(), "先跑 scripts/build-extension.py"
assert PRESET.exists(), "先跑 scripts/build-smtc-preset.py"
OUT.mkdir(parents=True, exist_ok=True)

# 1) 插件入位 + 结构/版本/内嵌桥回环断言（v1.5.0 标记）
shutil.copy2(PLUGIN_SRC, OUT / PLUGIN_SRC.name)
with zipfile.ZipFile(OUT / PLUGIN_SRC.name) as z:
    pn = set(z.namelist())
    assert pn == {"manifest.json", "index.js"}, f".plugin 结构异常: {pn}"
    pm = json.loads(z.read("manifest.json"))
    assert pm["slug"] == "cc.chushi.lyricsource" and pm["version"] == "1.5.0"
    idx = z.read("index.js")
    for needle in (b"audioplayer.seek", b"/api/plugin/cmd", b"superviseBridge",
                   b"nativeExpectMs", b"pickMediaEl", b"spawnBackoffMs",
                   b"readFileText", b"needLyric", b"chushi-channel-seek-disabled",
                   b"killStaleBridge", b"netstat.exe -aon", b"Get-NetTCPConnection",
                   b"upgradeBackoffMs", b"elLock", b"lastReportedPosMs",
                   b"storeDisagreeSince"):
        assert needle in idx, f".plugin 缺 v1.5.0 标记 {needle}"
    assert b"mediaElStrict" not in idx and b"stickyEl" not in idx, "粘滞选择器未废除"
    assert b"nowMs - lastPlayingAt < 5000" not in idx, "playing 5s 过期降级必须已废除（状态反向根因）"
    mb = re.search(rb'EMBEDDED_BRIDGE_PS1_B64 = "([A-Za-z0-9+/=]+)"', idx)
    vb = re.search(rb'EMBEDDED_BRIDGE_VBS_B64 = "([A-Za-z0-9+/=]+)"', idx)
    assert mb and base64.b64decode(mb.group(1)) == BRIDGE_PS1.read_bytes(), "内嵌桥 ps1 与源不一致"
    assert vb and base64.b64decode(vb.group(1)) == BRIDGE_VBS.read_bytes(), "内嵌桥 vbs 与源不一致"
    assert b"On Error Resume Next" in base64.b64decode(vb.group(1)), "内嵌 vbs 必须 On Error 静默化"
    dec_ps1 = base64.b64decode(mb.group(1))
    assert b"$BRIDGE_VERSION = '1.7.1'" in dec_ps1, "内嵌桥必须 1.7.1"

# 2) 手动启动桥（备用）文件夹：bat(ASCII+CRLF) + ps1/vbs 原样
bat = BRIDGE_BAT.read_bytes()
assert all(b < 128 for b in bat) and bat.count(b"\r\n") == bat.count(b"\n"), "bat 必须 ASCII+CRLF"

# 3) SMTC 交付包 zip（含手动兜底文件夹）
if ZIP.exists():
    ZIP.unlink()
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(PRESET, "初始SMTC音乐预设.cshz")
    z.write(GUIDE, "使用说明-SMTC音乐.md")
    z.write(OUT / PLUGIN_SRC.name, PLUGIN_SRC.name)
    z.writestr("手动启动桥（备用）/启动SMTC桥.bat", bat)
    z.write(BRIDGE_PS1, "手动启动桥（备用）/chushi-bridge.ps1")
    z.write(BRIDGE_VBS, "手动启动桥（备用）/chushi-bridge-launch.vbs")

# 4) 合并交付包 zip
if MERGED.exists():
    MERGED.unlink()
with zipfile.ZipFile(MERGED, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(EXT, EXT.name)
    z.write(ZIP, ZIP.name)

# 5) 终验
with zipfile.ZipFile(EXT) as z:
    mf = json.loads(z.read("manifest.json"))
    assert mf["version"] == "2.3.2", f"扩展 manifest 版本 {mf['version']}"
with zipfile.ZipFile(ZIP) as z:
    names = z.namelist()
assert any(n.endswith(".cshz") for n in names) and any(n.endswith(".plugin") for n in names)
assert any("手动启动桥" in n and n.endswith(".bat") for n in names), "交付包应含手动启动兜底"
with zipfile.ZipFile(MERGED) as z:
    mn = z.namelist()
assert EXT.name in mn and ZIP.name in mn

print("OK ->", ZIP, f"({ZIP.stat().st_size / 1024:.0f} KB)")
print("OK ->", MERGED, f"({MERGED.stat().st_size / 1024:.0f} KB)")
for f in sorted(OUT.rglob("*")):
    if f.is_file():
        print("  -", f.relative_to(OUT))
print("断言：plugin 1.5.0 杀旧桥+最后事件语义+元素锁定+倒退熔断+store自愈 ✓ / 内嵌桥 1.7.1 回环+On Error ✓ / ext 2.3.2 ✓ / 手动兜底在包 ✓")
