# build-smtc-delivery.py — v2.0.1 SMTC 交付包（六联修复版：桥 v1.4.0 + 歌词源插件）
# 产线：
#   1. download/v1.9.0/初始SMTC桥/ —— ps1(UTF-8 BOM) + 3 个 bat(纯 ASCII + CRLF) + 桥内说明
#   2. download/v1.9.0/初始歌词源-1.0.0.plugin —— BetterNCM 歌词源插件（zip 根部平铺）
#   3. download/v1.9.0/ChuShi-SMTC音乐-交付包.zip —— 桥目录 + 插件 + 预设 .cshz + 使用说明
# 编码纪律（三轮实战定案）：
#   ⚠ bat = 纯 ASCII + CRLF + 无 BOM（v1.8.2 终极方案）；
#   ⚠ ps1 必须 UTF-8 with BOM（PS 5.1 无 BOM 按 ANSI 解析）；
#   ⚠ 说明.txt / 使用说明.md = UTF-8 with BOM（面向人读）。
import shutil, pathlib, zipfile, json

ROOT = pathlib.Path("/home/z/my-project")
VER = "v2.0.1"
OUT = ROOT / "download" / VER
BRIDGE_SRC = ROOT / "bridge" / "smtc"
BRIDGE_DST = OUT / "初始SMTC桥"
PLUGIN_SRC = ROOT / "bridge" / "lyric-plugin" / "初始歌词源-1.0.0.plugin"
ZIP = OUT / "ChuShi-SMTC音乐-交付包.zip"
PRESET = ROOT / "examples" / "初始SMTC音乐预设.cshz"
GUIDE = OUT / "使用说明-SMTC音乐.md"

assert PLUGIN_SRC.exists(), "先跑 scripts/build-lyric-plugin.py"
assert GUIDE.exists(), "先写使用说明"

OUT.mkdir(parents=True, exist_ok=True)
if BRIDGE_DST.exists():
    shutil.rmtree(BRIDGE_DST)
BRIDGE_DST.mkdir(parents=True)

# 1) ps1：源文件已带 BOM，字节原样拷贝 + BOM 断言 + 版本断言
ps1_src = BRIDGE_SRC / "ChuShi-SMTC-Bridge.ps1"
ps1_bytes = ps1_src.read_bytes()
assert ps1_bytes[:3] == b"\xef\xbb\xbf", "源 ps1 缺 UTF-8 BOM"
assert b"$BRIDGE_VERSION = '1.4.0'" in ps1_bytes, "ps1 版本应为 1.4.0"
assert b"/api/plugin/lyric" in ps1_bytes and b"/api/lyric" in ps1_bytes, "ps1 缺歌词通道"
shutil.copy2(ps1_src, BRIDGE_DST / "ChuShi-SMTC-Bridge.ps1")

# 2) bat：纯 ASCII + CRLF，字节原样拷贝 + 三重断言
for bat in ("启动SMTC桥.bat", "添加开机自启.bat", "移除开机自启.bat"):
    data = (BRIDGE_SRC / bat).read_bytes()
    assert all(b < 128 for b in data), f"{bat}: 非 ASCII 字节"
    assert b"\n" not in data.replace(b"\r\n", b""), f"{bat}: 存在 bare LF"
    assert not data.startswith(b"\xef\xbb\xbf"), f"{bat}: 有 BOM"
    (BRIDGE_DST / bat).write_bytes(data)

# 3) 桥内说明（UTF-8 with BOM）
note = (
    "「初始」SMTC 桥 v1.4.0\n"
    "====================\n"
    "双击「启动SMTC桥.bat」启动，保持窗口开着；\n"
    "建议双击「添加开机自启.bat」，开机自动运行。\n"
    "v1.4.0：暂停/恢复归零根治（锚点重置改用连续位置）+ seek 后立即重锚——\n"
    "  暂停不再回 0:00、恢复不再从头计数、拖动进度条不再被拽回；\n"
    "v1.3.0：播放位置时钟补偿（LastUpdatedTime 插值）——进度条冻结的根治；\n"
    "v1.2.0：新增「初始歌词源」插件数据通道（/api/plugin/* 与 /api/lyric），\n"
    "  支持逐字歌词与网易云精确进度/封面兜底（插件可选安装，详见使用说明）。\n"
    "配合「初始」新标签页底栏的音乐按钮使用（点击弹出音乐面板，详见使用说明）。\n"
)
(BRIDGE_DST / "说明.txt").write_bytes(b"\xef\xbb\xbf" + note.encode("utf-8"))

# 4) 歌词源插件入位 + .plugin 结构断言
shutil.copy2(PLUGIN_SRC, OUT / PLUGIN_SRC.name)
with zipfile.ZipFile(OUT / PLUGIN_SRC.name) as z:
    pn = set(z.namelist())
    assert pn == {"manifest.json", "index.js"}, f".plugin 结构异常: {pn}"
    pm = json.loads(z.read("manifest.json"))
    assert pm["slug"] == "cc.chushi.lyricsource" and pm["version"] == "1.0.0"

# 5) zip：.cshz 预设包 + 使用说明 + 插件 + 桥目录
if ZIP.exists():
    ZIP.unlink()
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(PRESET, "初始SMTC音乐预设.cshz")
    z.write(GUIDE, "使用说明-SMTC音乐.md")
    z.write(OUT / PLUGIN_SRC.name, PLUGIN_SRC.name)
    for f in sorted(BRIDGE_DST.rglob("*")):
        z.write(f, str(f.relative_to(OUT)))

# 6) 验包
raw = (BRIDGE_DST / "启动SMTC桥.bat").read_bytes()
assert raw.startswith(b"@echo off\r\n") and all(b < 128 for b in raw), "bat 断言失败"
assert b"chcp" not in raw, "bat 不应含 chcp"
assert (BRIDGE_DST / "ChuShi-SMTC-Bridge.ps1").read_bytes()[:3] == b"\xef\xbb\xbf"
with zipfile.ZipFile(ZIP) as z:
    names = z.namelist()
assert any(n.endswith(".cshz") for n in names), f"zip 缺 .cshz: {names}"
assert any(n.endswith(".plugin") for n in names), f"zip 缺 .plugin: {names}"

print("OK ->", ZIP, f"({ZIP.stat().st_size / 1024:.0f} KB)")
for f in sorted(OUT.rglob("*")):
    if f.is_file():
        print("  -", f.relative_to(OUT))
print("bat ASCII+CRLF ✓ / ps1 UTF-8 BOM v1.3.0 ✓ / .plugin 结构 ✓ / zip 含 .cshz+.plugin ✓")
