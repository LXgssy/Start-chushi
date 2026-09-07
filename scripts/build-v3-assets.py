#!/usr/bin/env python3
# build-v3-assets.py — v3.0.0 交付资产（双插件架构重写版）
# 架构：SMTC 桥管理 / 网易云 API 真值拆分为两个职责单一的插件；
#       桥 2.0.0 纯传输化（+注册表/role 仲裁 −ne-anchoring）；
#       宿主单主仲裁（judgeNcmOwns）；预设包 v4（样式零改动，文案映射新架构）
# 产线：
#   1. download/v3.0.0/初始SMTC桥-2.0.0.plugin（内嵌桥 ps1+vbs v2.0.0，回环已验）
#   2. download/v3.0.0/初始网易云API-2.0.0.plugin（role=ncm 真值生产，零桥管理）
#   3. download/v3.0.0/ChuShi-SMTC音乐-交付包.zip
#      （双 .plugin + 预设 .cshz + 使用说明 + 手动启动桥（备用）/）
#   4. download/v3.0.0/ChuShi-v3.0.1-合并交付包.zip（扩展 zip + SMTC 交付包 zip）
import shutil, pathlib, zipfile, json, base64, re

ROOT = pathlib.Path("/home/z/my-project")
VER = "v3.0.1"
OUT = ROOT / "download" / VER
PLUGIN_A_SRC = ROOT / "bridge" / "smtc-plugin" / "初始SMTC桥-2.0.0.plugin"
PLUGIN_B_SRC = ROOT / "bridge" / "ncm-plugin" / "初始网易云API-2.1.0.plugin"
ZIP = OUT / "ChuShi-SMTC音乐-交付包.zip"
MERGED = OUT / "ChuShi-v3.0.1-合并交付包.zip"
EXT = OUT / "ChuShi-NewTab-v3.0.1.zip"
PRESET = ROOT / "examples" / "初始SMTC音乐预设.cshz"
GUIDE = OUT / "使用说明-SMTC音乐.md"
BRIDGE_PS1 = ROOT / "bridge" / "smtc" / "chushi-bridge.ps1"
BRIDGE_VBS = ROOT / "bridge" / "smtc" / "chushi-bridge-launch.vbs"
BRIDGE_BAT = ROOT / "bridge" / "smtc" / "启动SMTC桥.bat"

assert PLUGIN_A_SRC.exists() and PLUGIN_B_SRC.exists(), "先跑 build-smtc-plugin.py / build-ncm-plugin.py"
assert GUIDE.exists(), "先写使用说明"
assert EXT.exists(), "先跑 scripts/build-extension.py"
assert PRESET.exists(), "先跑 scripts/build-smtc-preset.py"
OUT.mkdir(parents=True, exist_ok=True)

# 1) 插件A 入位 + 结构/内嵌桥回环断言（v2.0.0 标记）
shutil.copy2(PLUGIN_A_SRC, OUT / PLUGIN_A_SRC.name)
with zipfile.ZipFile(OUT / PLUGIN_A_SRC.name) as z:
    assert set(z.namelist()) == {"manifest.json", "index.js"}
    pm = json.loads(z.read("manifest.json"))
    assert pm["slug"] == "cc.chushi.smtcbridge" and pm["version"] == "2.0.0"
    idx = z.read("index.js")
    for needle in (b"/api/plugin/register", b"superviseBridge", b"killStaleBridge",
                   b"netstat.exe -aon", b"Get-NetTCPConnection", b"upgradeBackoffMs",
                   b"bridgeBlocked", b"readFileText", b"spawnBackoffMs",
                   b"powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File"):
        assert needle in idx, f"插件A 缺标记 {needle}"
    assert b"/api/plugin/state" not in idx, "插件A 不得推网易云状态（职责单一律）"
    mb = re.search(rb'EMBEDDED_BRIDGE_PS1_B64 = "([A-Za-z0-9+/=]+)"', idx)
    vb = re.search(rb'EMBEDDED_BRIDGE_VBS_B64 = "([A-Za-z0-9+/=]+)"', idx)
    assert mb and base64.b64decode(mb.group(1)) == BRIDGE_PS1.read_bytes(), "内嵌桥 ps1 与源不一致"
    assert vb and base64.b64decode(vb.group(1)) == BRIDGE_VBS.read_bytes(), "内嵌桥 vbs 与源不一致"
    dec_ps1 = base64.b64decode(mb.group(1))
    assert b"$BRIDGE_VERSION = '2.0.0'" in dec_ps1, "内嵌桥必须 2.0.0"
    assert b"/api/plugin/register" in dec_ps1 and b"$posSec = $neSec" not in dec_ps1, "桥必须纯传输化 2.0.0"

# 2) 插件B 入位 + 结构/role=ncm 断言
shutil.copy2(PLUGIN_B_SRC, OUT / PLUGIN_B_SRC.name)
with zipfile.ZipFile(OUT / PLUGIN_B_SRC.name) as z:
    assert set(z.namelist()) == {"manifest.json", "index.js"}
    pm = json.loads(z.read("manifest.json"))
    assert pm["slug"] == "cc.chushi.ncmapi" and pm["version"] == "2.1.0"
    idx = z.read("index.js")
    for needle in (b'role: "ncm"', b"audioplayer.seek", b"/api/plugin/cmd",
                   b"nativeExpectMs", b"pickMediaEl", b"needLyric", b"rePushLyric",
                   b"chushi-channel-seek-disabled", b"elLock", b"lastReportedPosMs",
                   b"e82ckenh8dichen8",
                   "物理自愈：进度在推进 = 在播放".encode(),
                   b"posMs - lastReportedPosMs > 800"):
        assert needle in idx, f"插件B 缺标记 {needle}"
    for forbidden in (b"EMBEDDED_BRIDGE", b"deployBridge", b"superviseBridge", b"chushi-bridge.ps1"):
        assert forbidden not in idx, f"插件B 不得含桥管理代码 {forbidden}"

# 3) 手动启动桥（备用）：bat(ASCII+CRLF) + ps1/vbs 原样
bat = BRIDGE_BAT.read_bytes()
assert all(b < 128 for b in bat) and bat.count(b"\r\n") == bat.count(b"\n"), "bat 必须 ASCII+CRLF"

# 4) SMTC 交付包 zip
if ZIP.exists():
    ZIP.unlink()
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(PRESET, "初始SMTC音乐预设.cshz")
    z.write(GUIDE, "使用说明-SMTC音乐.md")
    z.write(OUT / PLUGIN_A_SRC.name, PLUGIN_A_SRC.name)
    z.write(OUT / PLUGIN_B_SRC.name, PLUGIN_B_SRC.name)
    z.writestr("手动启动桥（备用）/启动SMTC桥.bat", bat)
    z.write(BRIDGE_PS1, "手动启动桥（备用）/chushi-bridge.ps1")
    z.write(BRIDGE_VBS, "手动启动桥（备用）/chushi-bridge-launch.vbs")

# 5) 合并交付包 zip
if MERGED.exists():
    MERGED.unlink()
with zipfile.ZipFile(MERGED, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(EXT, EXT.name)
    z.write(ZIP, ZIP.name)

print(f"OK -> {OUT}")
for f in sorted(OUT.iterdir()):
    print(f"   {f.name}  {f.stat().st_size / 1024:.1f} KB")
