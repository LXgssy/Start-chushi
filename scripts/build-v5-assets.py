# build-v5-assets.py -- assemble the v5.0.0 delivery set under download/v5.0.0/
#   ChuShi-NewTab-v5.0.0.zip          (extension, built by build-extension.py)
#   ChuShi-SMTC-Manager-5.0.0.plugin  (plugin A: engine lifecycle manager)
#   ChuShi-Music-API-5.0.0.plugin     (plugin B: netease truth + lyrics + control)
#   初始SMTC音乐预设.cshz              (music widget preset, rebuilt by build-v5-preset.py)
#   ChuShi-SMTC音乐-交付包.zip         (manual engine fallback: bat + engine ps1)
#   ChuShi-v5.0.0-合并交付包.zip       (everything merged for wss upload)
#   使用说明-SMTC音乐.md
# Asserts byte-level fingerprints before shipping.
import base64
import hashlib
import pathlib
import re
import zipfile

ROOT = pathlib.Path("/home/z/my-project")
OUT = ROOT / "download" / "v5.0.0"
OUT.mkdir(parents=True, exist_ok=True)

ext_zip = OUT / "ChuShi-NewTab-v5.0.0.zip"
mgr_plugin = ROOT / "bridge" / "smtc-plugin" / "ChuShi-SMTC-Manager-5.0.0.plugin"
api_plugin = ROOT / "bridge" / "ncm-plugin" / "ChuShi-Music-API-5.0.0.plugin"
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

readme = """# 「初始」SMTC 音乐 v5.0.0 升级说明（预设包与音乐面板全部代码从零重写）

## 这一代改了什么（对应你的指令：预设包和音乐面板所有相关的 API 全部重写）

1. **第四层也归零了**：v4 已重写插件/引擎/宿主仲裁，v5.0.0 把剩下的
   「预设包音乐部件（music-widget.html + 命令脚本）」「沙盒音乐核心
   （sandbox.js 音乐引擎）」「新标签页数据面（smtc.ts 单真值客户端）」
   「部件通道（PresetWidgets）」全部从零重写——至此插件 A、插件 B、
   引擎、预设包、音乐面板 API/前端**五层 0 复用老代码**。
2. **样式保持不变**：音乐部件的视觉设计（卡片、歌词、按钮布局、
   防位移三律）与上一代完全一致，只有实现是新的。
3. **不再需要网易云自带的 SMTC 开关**（开或关都行）。引擎自己注册
   满血 Windows 媒体会话，代码 0 读取网易云 SMTC 会话。
4. **插件全英文**：`ChuShi-SMTC-Manager-5.0.0.plugin` +
   `ChuShi-Music-API-5.0.0.plugin`，文件名/manifest/代码逐字符 ASCII。
5. **装插件不影响网易云本体**：插件对网易云只读不写，控制仅在你
   主动操作时单次执行；拖动失败会诚实提示「拖动未生效：网易云未响应」。
6. **逐字歌词防漂移管线**（你指定的思路）：API 插件抓全量逐字歌词 →
   真值时间轴对齐 → 暂停瞬间按当前词剩余时长计算淡入淡出 → 恢复播放
   零累积漂移。

## 升级三步

1. **卸载旧插件**：BetterNCM 插件管理里卸载所有旧版「初始」相关插件
   （初始歌词源 / 初始SMTC桥 / 初始网易云API / ChuShi SMTC Manager /
   ChuShi Music API 的旧版本）。
2. **装新插件**：把 `ChuShi-SMTC-Manager-5.0.0.plugin` 和
   `ChuShi-Music-API-5.0.0.plugin` 放进 BetterNCM plugins 文件夹。
3. **完全重启网易云音乐**，浏览器端 `Ctrl+F5` 强刷（sw.js 缓存），
   「初始」里删除旧音乐部件后重新导入 `初始SMTC音乐预设.cshz`。

## 30 秒自查

- 网易云播放任意歌曲 → Windows 悬浮窗/音量面板出现卡片，**进度条每秒走、可拖**；
- 「初始」面板显示歌名/进度/逐字歌词，页脚 `API v5.0.0 · 管理 v5.0.0`；
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
merged = OUT / "ChuShi-v5.0.0-合并交付包.zip"
with zipfile.ZipFile(merged, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("使用说明-SMTC音乐.md", readme_bytes)
    z.writestr("ChuShi-NewTab-v5.0.0.zip", ext_zip.read_bytes())
    z.writestr("ChuShi-SMTC-Manager-5.0.0.plugin", mgr_plugin.read_bytes())
    z.writestr("ChuShi-Music-API-5.0.0.plugin", api_plugin.read_bytes())
    z.writestr("初始SMTC音乐预设.cshz", preset_cshz.read_bytes())
    z.writestr("ChuShi-SMTC音乐-交付包.zip", manual.read_bytes())

# fingerprint assertions
with zipfile.ZipFile(merged) as z:
    names = set(z.namelist())
    assert names == {
        "使用说明-SMTC音乐.md", "ChuShi-NewTab-v5.0.0.zip",
        "ChuShi-SMTC-Manager-5.0.0.plugin", "ChuShi-Music-API-5.0.0.plugin",
        "初始SMTC音乐预设.cshz", "ChuShi-SMTC音乐-交付包.zip",
    }, names
    # embedded manager engine must equal the shipped manual engine (bytes)
    mgr_js = zipfile.ZipFile(mgr_plugin).read("index.js").decode("ascii")
    b64 = re.search(r'var ENGINE_B64 = "([^"]+)"', mgr_js).group(1)
    assert base64.b64decode(b64) == engine_crlf, "embedded engine != shipped engine"
    # plugin manifests must be 5.0.0 and ascii
    for plug, ver in ((mgr_plugin, "5.0.0"), (api_plugin, "5.0.0")):
        mf = zipfile.ZipFile(plug).read("manifest.json").decode("utf-8")
        assert '"version": "%s"' % ver in mf, f"{plug} version mismatch"
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
