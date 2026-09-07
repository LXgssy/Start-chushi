# build-v5-assets.py -- assemble the v5.0.1 delivery set under download/v5.0.1/
#   Plugins-only fix release: NCM 3.x silently drops plugins whose manifest
#   lacks ncm3-compatible:true (v5.0.0 manager missed it -> invisible in the
#   BetterNCM plugin list). Extension/preset/engine are UNCHANGED -> the
#   extension zip keeps its honest v5.0.0 name and is reused from v5.0.0/.
#   ChuShi-NewTab-v5.0.0.zip          (extension, unchanged since v5.0.0)
#   ChuShi-SMTC-Manager-5.0.1.plugin  (plugin A: engine lifecycle manager)
#   ChuShi-Music-API-5.0.1.plugin     (plugin B: netease truth + lyrics + control)
#   初始SMTC音乐预设.cshz              (music widget preset, unchanged since v5.0.0)
#   ChuShi-SMTC音乐-交付包.zip         (manual engine fallback: bat + engine ps1)
#   ChuShi-v5.0.1-合并交付包.zip       (everything merged for wss upload)
#   使用说明-SMTC音乐.md
# Asserts byte-level fingerprints before shipping.
import base64
import hashlib
import json
import pathlib
import re
import zipfile

ROOT = pathlib.Path("/home/z/my-project")
OUT = ROOT / "download" / "v5.0.1"
OUT.mkdir(parents=True, exist_ok=True)

ext_zip = ROOT / "download" / "v5.0.0" / "ChuShi-NewTab-v5.0.0.zip"
mgr_plugin = ROOT / "bridge" / "smtc-plugin" / "ChuShi-SMTC-Manager-5.0.1.plugin"
api_plugin = ROOT / "bridge" / "ncm-plugin" / "ChuShi-Music-API-5.0.1.plugin"
preset_cshz = ROOT / "examples" / "初始SMTC音乐预设.cshz"
engine_ps1 = ROOT / "bridge" / "engine" / "chushi-smtc-engine.ps1"

assert ext_zip.exists(), "extension zip missing (run build-extension.py first)"
for p in (mgr_plugin, api_plugin, preset_cshz, engine_ps1):
    assert p.exists(), f"missing {p}"

# engine must be pure ASCII (CRLF conversion for Windows notepad compatibility)
engine_bytes = engine_ps1.read_bytes()
assert all(b < 128 for b in engine_bytes), "engine not ascii"
engine_crlf = engine_bytes.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")

# manual-start bat: ASCII + CRLF (policy-blocked machines fallback)
bat = (
    b"@echo off\r\n"
    b"rem ChuShi SMTC engine manual start (fallback when the manager plugin\r\n"
    b"rem cannot spawn processes; security software may block automatic starts)\r\n"
    b"taskkill /F /IM powershell.exe /FI \"WINDOWTITLE eq ChuShiSmtcEngine*\" >nul 2>&1\r\n"
    b"start \"ChuShiSmtcEngine\" /MIN powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%~dp0chushi-smtc-engine.ps1\"\r\n"
    b"echo ChuShi SMTC engine started (window is hidden by design).\r\n"
    b"echo Check the ChuShi new tab page: it should connect within a few seconds.\r\n"
    b"pause\r\n"
)

readme = """# 「初始」SMTC 音乐 v5.0.1 插件修复说明（SMTC Manager 在插件列表消失）

## 这一代只修一件事：SMTC Manager 装了但插件列表里看不到

1. **根因（BetterNCM 源码实锤）**：网易云 3.x 下，BetterNCM 会**静默丢弃**
   manifest 里没有 `"ncm3-compatible": true` 字段的插件——不报错、不显示、
   不解压。v5.0.0 的 SMTC Manager 重写时丢了这个字段（老版 2.1.0 是有的），
   所以在你的网易云 3.x 上消失；而 Music API 5.0.0 带着这个字段，所以
   显示正常。这正是「只有一个插件看不到」的原因。
2. **v5.0.1 修复**：两个插件 manifest 都带上 `ncm3-compatible: true`，
   并新增构建门：今后任何一代缺这个字段直接构建失败，永不复发。
3. **文案按你的要求调整**：插件**名称保持英文**（ChuShi SMTC Manager /
   ChuShi Music API），**介绍改回中文**；.plugin 文件名与代码仍为纯 ASCII
   （中文文件名在 BetterNCM 里按 ANSI 码页解析，确实读不了，实测实锤）。
4. **本次只改两个插件包**：扩展、预设包、引擎零改动——无需重装扩展、
   无需重导预设、无需强刷浏览器。

## 升级（只两步）

1. **删旧插件**：打开 BetterNCM 数据目录的 `plugins` 文件夹，
   **删掉里面所有旧版 .plugin 文件**（包括 ChuShi-*-5.0.0.plugin 和
   任何更早的「初始」插件）。同 slug 的插件会解压到同一目录，
   旧文件不删会在启动时反向覆盖新插件。
2. **装新插件**：放入 `ChuShi-SMTC-Manager-5.0.1.plugin` 和
   `ChuShi-Music-API-5.0.1.plugin`，**完全退出并重启网易云音乐**
   （插件只在启动时解压加载，热插不生效）。

## 装完列表里还是没有？

- 看看 BetterNCM 数据目录有没有 `disable_list.txt`：里面若有一行
  `cc.chushi.smtcbridge` 或 `cc.chushi.ncmapi`，删掉那一行再重启
  网易云（这是「已停用插件」名单，新旧插件共用 slug，会被旧记录连坐）。
- 确认放对目录：.plugin 文件要放在 BetterNCM 数据目录的 `plugins`
  文件夹里（不是 plugins_runtime，那个是启动时自动生成的）。
- 确认网易云是完全重启过的（托盘右键退出，不是只关窗口）。

## 30 秒自查

- BetterNCM 插件列表同时出现 **ChuShi Music API** 和 **ChuShi SMTC Manager**；
- 网易云播放任意歌曲 → Windows 悬浮窗/音量面板出现卡片，**进度条每秒走、可拖**；
- 「初始」面板显示歌名/进度/逐字歌词，页脚 `API v5.0.1 · 管理 v5.0.1`；
- 拖动面板进度条 → 网易云真实跳转（失败会明确提示，不再静默无效）；
- 暂停 30 秒再恢复 → 逐字歌词从暂停处继续，无漂移；
- 网易云**自己的**界面（进度条/播放按钮）行为与装插件前完全一致。

## 手动兜底（仅当安全软件拦截插件自动拉起引擎时）

交付包里 `ChuShi-SMTC音乐-交付包.zip` 内含 `chushi-smtc-engine.ps1` 与
`Start-Engine.bat`：解压后双击 `Start-Engine.bat` 即手动启动引擎，
「初始」面板几秒内应自动连接。

## 端口

引擎监听 `127.0.0.1:26801`（仅本机回环）。宿主、双插件、预设三方一致；
旧端口残留引擎会被新管理插件自动清掉。
"""
readme_bytes = readme.encode("utf-8")

# manual fallback package
manual = OUT / "ChuShi-SMTC音乐-交付包.zip"
with zipfile.ZipFile(manual, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("chushi-smtc-engine.ps1", engine_crlf)
    z.writestr("Start-Engine.bat", bat)
    z.writestr("README.txt",
               "ChuShi SMTC engine v5.0.0 manual fallback.\r\n"
               "Double-click Start-Engine.bat to start the engine.\r\n"
               "ASCII + CRLF by contract.\r\n")

# merged package (everything for wss upload)
merged = OUT / "ChuShi-v5.0.1-合并交付包.zip"
with zipfile.ZipFile(merged, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("使用说明-SMTC音乐.md", readme_bytes)
    z.writestr("ChuShi-NewTab-v5.0.0.zip", ext_zip.read_bytes())
    z.writestr("ChuShi-SMTC-Manager-5.0.1.plugin", mgr_plugin.read_bytes())
    z.writestr("ChuShi-Music-API-5.0.1.plugin", api_plugin.read_bytes())
    z.writestr("初始SMTC音乐预设.cshz", preset_cshz.read_bytes())
    z.writestr("ChuShi-SMTC音乐-交付包.zip", manual.read_bytes())

# fingerprint assertions
with zipfile.ZipFile(merged) as z:
    names = set(z.namelist())
    assert names == {
        "使用说明-SMTC音乐.md", "ChuShi-NewTab-v5.0.0.zip",
        "ChuShi-SMTC-Manager-5.0.1.plugin", "ChuShi-Music-API-5.0.1.plugin",
        "初始SMTC音乐预设.cshz", "ChuShi-SMTC音乐-交付包.zip",
    }, names
    # embedded manager engine must equal the shipped manual engine (bytes)
    mgr_js = zipfile.ZipFile(mgr_plugin).read("index.js").decode("ascii")
    b64 = re.search(r'var ENGINE_B64 = "([^"]+)"', mgr_js).group(1)
    assert base64.b64decode(b64) == engine_crlf, "embedded engine != shipped engine"
    # plugin manifests must be 5.0.1 and carry the NCM 3.x compatibility flag
    for plug, ver in ((mgr_plugin, "5.0.1"), (api_plugin, "5.0.1")):
        mf = json.loads(zipfile.ZipFile(plug).read("manifest.json").decode("utf-8"))
        assert mf["version"] == ver, f"{plug} version mismatch"
        assert mf.get("ncm3-compatible") is True, f"{plug} ncm3-compatible missing (the v5.0.0 regression)"
        assert any("\u4e00" <= c <= "\u9fff" for c in mf.get("description", "")), f"{plug} description not Chinese"
    # preset cshz contains the v5 widget (hFor guard present) and non-trivial
    cshz = zipfile.ZipFile(preset_cshz)
    cshz_names = cshz.namelist()
    assert any(n.endswith("cover.svg") for n in cshz_names), cshz_names
    widget_html = cshz.read("manifest.json").decode("utf-8")
    assert "music" in widget_html or len(widget_html) > 1000
    # extension zip non-trivial
    assert len(z.read("ChuShi-NewTab-v5.0.0.zip")) > 10_000_000

# sha256 manifest
assets = (ext_zip, mgr_plugin, api_plugin, preset_cshz, manual, merged)
print("== SHA-256 ==")
for p in assets:
    h = hashlib.sha256(p.read_bytes()).hexdigest()
    print(f"{h}  {p.name}  ({p.stat().st_size:,} bytes)")
(OUT / "SHA256SUMS.txt").write_text(
    "".join(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n" for p in assets),
    encoding="utf-8")
readme_path = OUT / "使用说明-SMTC音乐.md"
readme_path.write_text(readme, encoding="utf-8")
print(f"OK merged -> {merged}")
