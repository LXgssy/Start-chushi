#!/usr/bin/env python3
# build-v220-assets.py — v2.2.0 SMTC 交付资产（桥 v1.6.0 + 歌词源插件 v1.2.0）
# 产线：
#   1. download/v2.2.0/初始SMTC桥/ —— ps1(UTF-8 BOM) + bridge-hidden.vbs(ASCII) +
#      3 个 bat(纯 ASCII + CRLF) + 桥内说明
#   2. download/v2.2.0/初始歌词源-1.2.0.plugin
#   3. download/v2.2.0/ChuShi-SMTC音乐-交付包.zip —— 桥目录 + 插件 + 预设 .cshz + 使用说明
#   4. download/v2.2.0/ChuShi-v2.2.0-合并交付包.zip —— 扩展 zip + SMTC 交付包 zip
# 编码纪律（四轮实战定案）：bat/vbs 纯 ASCII + CRLF 无 BOM；ps1 UTF-8 with BOM；
#   说明/使用说明 UTF-8 with BOM；交付前字节级断言（[Math]×10 / 版本 / ASCII）。
import shutil, pathlib, zipfile, json

ROOT = pathlib.Path("/home/z/my-project")
VER = "v2.2.0"
OUT = ROOT / "download" / VER
BRIDGE_SRC = ROOT / "bridge" / "smtc"
BRIDGE_DST = OUT / "初始SMTC桥"
PLUGIN_SRC = ROOT / "bridge" / "lyric-plugin" / "初始歌词源-1.2.0.plugin"
ZIP = OUT / "ChuShi-SMTC音乐-交付包.zip"
MERGED = OUT / "ChuShi-v2.2.0-合并交付包.zip"
EXT = OUT / "ChuShi-NewTab-v2.2.0.zip"
PRESET = ROOT / "examples" / "初始SMTC音乐预设.cshz"
GUIDE = OUT / "使用说明-SMTC音乐.md"

assert PLUGIN_SRC.exists(), "先跑 scripts/build-lyric-plugin.py"
assert GUIDE.exists(), "先写使用说明"
assert EXT.exists(), "先跑 scripts/build-extension.py"
assert PRESET.exists(), "先跑 scripts/build-smtc-preset.py"

OUT.mkdir(parents=True, exist_ok=True)
if BRIDGE_DST.exists():
    shutil.rmtree(BRIDGE_DST)
BRIDGE_DST.mkdir(parents=True)

# 1) ps1：BOM + 版本 + [Math]×10 断言后字节原样拷贝
ps1_src = BRIDGE_SRC / "ChuShi-SMTC-Bridge.ps1"
ps1_bytes = ps1_src.read_bytes()
assert ps1_bytes[:3] == b"\xef\xbb\xbf", "源 ps1 缺 UTF-8 BOM"
assert b"$BRIDGE_VERSION = '1.6.0'" in ps1_bytes, "ps1 版本应为 1.6.0"
assert ps1_bytes.count(b"[Math]") == 10, f"[Math] 应 10 处，实际 {ps1_bytes.count(b'[Math]')}"
assert b"seekAckId" in ps1_bytes and b"Get-NetTCPConnection" in ps1_bytes, "ps1 缺 v1.6.0 标记"
shutil.copy2(ps1_src, BRIDGE_DST / "ChuShi-SMTC-Bridge.ps1")

# 2) bat/vbs：纯 ASCII + CRLF 无 BOM
for bat in ("启动SMTC桥.bat", "添加开机自启.bat", "移除开机自启.bat", "bridge-hidden.vbs"):
    data = (BRIDGE_SRC / bat).read_bytes()
    assert all(b < 128 for b in data), f"{bat}: 非 ASCII 字节"
    assert b"\n" not in data.replace(b"\r\n", b""), f"{bat}: 存在 bare LF"
    assert not data.startswith(b"\xef\xbb\xbf"), f"{bat}: 有 BOM"
    (BRIDGE_DST / bat).write_bytes(data)
assert b"bridge-hidden.vbs" in (BRIDGE_DST / "添加开机自启.bat").read_bytes(), "自启 bat 未指向 vbs"

# 3) 桥内说明（UTF-8 with BOM）
note = (
    "「初始」SMTC 桥 v1.6.0\n"
    "====================\n"
    "手动：双击「启动SMTC桥.bat」（可见窗口，诊断用，关窗即停）。\n"
    "常驻：双击「添加开机自启.bat」——之后每次开机经 bridge-hidden.vbs 静默拉起，\n"
    "  全程零窗口；已注册自启的老用户启动一次新桥即自动改指当前目录（自愈升级），\n"
    "  手动启动新桥时会自动接管旧实例占用的端口。\n"
    "v1.6.0：seek 命令带 id 下发插件（内部 dispatch API → el.currentTime 兑底，\n"
    "  双级实测校验，seekAck 回传）+ 插件版本透传（面板页脚可诊断）+ 自愈自启\n"
    "  + 旧实例接管 + 静默 vbs 自启（不再多开窗口）。\n"
    "v1.5.0：插件真值锚定 + seek 插件直通 + 歌词 rev 校验 + 暂停半窗补偿。\n"
    "v1.3.0/v1.4.0：SMTC 位置时钟补偿 / 暂停恢复连续位置锚点。\n"
    "配合「初始」新标签页 dock 音乐按钮使用（详见 使用说明-SMTC音乐.md）。\n"
)
(BRIDGE_DST / "说明.txt").write_bytes(b"\xef\xbb\xbf" + note.encode("utf-8"))

# 4) 歌词源插件入位 + .plugin 结构/版本断言
shutil.copy2(PLUGIN_SRC, OUT / PLUGIN_SRC.name)
with zipfile.ZipFile(OUT / PLUGIN_SRC.name) as z:
    pn = set(z.namelist())
    assert pn == {"manifest.json", "index.js"}, f".plugin 结构异常: {pn}"
    pm = json.loads(z.read("manifest.json"))
    assert pm["slug"] == "cc.chushi.lyricsource" and pm["version"] == "1.2.0"
    assert b"playing/setPlayingPosition" in z.read("index.js")

# 5) SMTC 交付包 zip
if ZIP.exists():
    ZIP.unlink()
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(PRESET, "初始SMTC音乐预设.cshz")
    z.write(GUIDE, "使用说明-SMTC音乐.md")
    z.write(OUT / PLUGIN_SRC.name, PLUGIN_SRC.name)
    for f in sorted(BRIDGE_DST.rglob("*")):
        z.write(f, str(f.relative_to(OUT)))

# 6) 合并交付包 zip（扩展 + SMTC 交付包）
if MERGED.exists():
    MERGED.unlink()
with zipfile.ZipFile(MERGED, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(EXT, EXT.name)
    z.write(ZIP, ZIP.name)

# 7) 终验
with zipfile.ZipFile(ZIP) as z:
    names = z.namelist()
assert any(n.endswith(".cshz") for n in names)
assert any(n.endswith(".plugin") for n in names)
assert any(n.endswith("bridge-hidden.vbs") for n in names)
with zipfile.ZipFile(MERGED) as z:
    mn = z.namelist()
assert EXT.name in mn and ZIP.name in mn
with zipfile.ZipFile(EXT) as z:
    mf = json.loads(z.read("manifest.json"))
    assert mf["version"] == "2.2.0", f"扩展 manifest 版本 {mf['version']}"

print("OK ->", ZIP, f"({ZIP.stat().st_size / 1024:.0f} KB)")
print("OK ->", MERGED, f"({MERGED.stat().st_size / 1024:.0f} KB)")
for f in sorted(OUT.rglob("*")):
    if f.is_file():
        print("  -", f.relative_to(OUT))
print("断言：ps1 BOM+1.6.0+[Math]x10 ✓ / bat+vbs ASCII+CRLF ✓ / plugin 1.2.0+dispatch ✓ / ext 2.2.0 ✓")
