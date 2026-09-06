#!/usr/bin/env python3
# build-v230-assets.py — v2.3.0 交付资产（一体化插件时代：Windows 侧只剩 .plugin）
# 产线：
#   1. download/v2.3.0/初始歌词源-1.3.0.plugin（内嵌桥 ps1+vbs，base64 回环已验）
#   2. download/v2.3.0/ChuShi-SMTC音乐-交付包.zip（.plugin + 预设 .cshz + 使用说明）
#   3. download/v2.3.0/ChuShi-v2.3.0-合并交付包.zip（扩展 zip + SMTC 交付包 zip）
# ⚠ v2.3.0 起交付包不再包含任何独立桥文件（ps1/vbs/bat 全部由插件内嵌自部署）
import shutil, pathlib, zipfile, json, base64

ROOT = pathlib.Path("/home/z/my-project")
VER = "v2.3.0"
OUT = ROOT / "download" / VER
PLUGIN_SRC = ROOT / "bridge" / "lyric-plugin" / "初始歌词源-1.3.0.plugin"
ZIP = OUT / "ChuShi-SMTC音乐-交付包.zip"
MERGED = OUT / "ChuShi-v2.3.0-合并交付包.zip"
EXT = OUT / "ChuShi-NewTab-v2.3.0.zip"
PRESET = ROOT / "examples" / "初始SMTC音乐预设.cshz"
GUIDE = OUT / "使用说明-SMTC音乐.md"
BRIDGE_PS1 = ROOT / "bridge" / "smtc" / "chushi-bridge.ps1"

assert PLUGIN_SRC.exists(), "先跑 scripts/build-lyric-plugin.py"
assert GUIDE.exists(), "先写使用说明"
assert EXT.exists(), "先跑 scripts/build-extension.py"
assert PRESET.exists(), "先跑 scripts/build-smtc-preset.py"
OUT.mkdir(parents=True, exist_ok=True)

# 1) 插件入位 + 结构/版本/内嵌桥回环断言
shutil.copy2(PLUGIN_SRC, OUT / PLUGIN_SRC.name)
with zipfile.ZipFile(OUT / PLUGIN_SRC.name) as z:
    pn = set(z.namelist())
    assert pn == {"manifest.json", "index.js"}, f".plugin 结构异常: {pn}"
    pm = json.loads(z.read("manifest.json"))
    assert pm["slug"] == "cc.chushi.lyricsource" and pm["version"] == "1.3.0"
    idx = z.read("index.js")
    assert b"audioplayer.seek" in idx and b"/api/plugin/cmd" in idx and b"superviseBridge" in idx
    import re
    mb = re.search(rb'EMBEDDED_BRIDGE_PS1_B64 = "([A-Za-z0-9+/=]+)"', idx)
    assert mb and base64.b64decode(mb.group(1)) == BRIDGE_PS1.read_bytes(), "内嵌桥 ps1 与源不一致"

# 2) SMTC 交付包 zip（无桥目录）
if ZIP.exists():
    ZIP.unlink()
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(PRESET, "初始SMTC音乐预设.cshz")
    z.write(GUIDE, "使用说明-SMTC音乐.md")
    z.write(OUT / PLUGIN_SRC.name, PLUGIN_SRC.name)

# 3) 合并交付包 zip
if MERGED.exists():
    MERGED.unlink()
with zipfile.ZipFile(MERGED, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(EXT, EXT.name)
    z.write(ZIP, ZIP.name)

# 4) 终验
with zipfile.ZipFile(EXT) as z:
    mf = json.loads(z.read("manifest.json"))
    assert mf["version"] == "2.3.0", f"扩展 manifest 版本 {mf['version']}"
with zipfile.ZipFile(ZIP) as z:
    names = z.namelist()
assert any(n.endswith(".cshz") for n in names) and any(n.endswith(".plugin") for n in names)
assert not any("初始SMTC桥" in n or n.endswith(".bat") or n.endswith(".ps1") or n.endswith(".vbs") for n in names), "v2.3.0 交付包不应含独立桥文件"
with zipfile.ZipFile(MERGED) as z:
    mn = z.namelist()
assert EXT.name in mn and ZIP.name in mn

print("OK ->", ZIP, f"({ZIP.stat().st_size / 1024:.0f} KB)")
print("OK ->", MERGED, f"({MERGED.stat().st_size / 1024:.0f} KB)")
for f in sorted(OUT.rglob("*")):
    if f.is_file():
        print("  -", f.relative_to(OUT))
print("断言：plugin 1.3.0+三级seek+内嵌桥回环 ✓ / ext 2.3.0 ✓ / 交付包零独立桥文件 ✓")
