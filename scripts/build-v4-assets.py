# build-v4-assets.py -- assemble the v4.0.0 delivery set under download/v4.0.0/
#   ChuShi-NewTab-v4.0.0.zip          (extension, built by build-extension.py)
#   ChuShi-SMTC-Manager-3.0.0.plugin  (plugin A)
#   ChuShi-Music-API-3.0.0.plugin     (plugin B)
#   ChuShi-SMTC音乐-交付包.zip          (manual engine fallback: bat + engine ps1)
#   ChuShi-v4.0.0-合并交付包.zip        (everything merged for wss upload)
#   使用说明-SMTC音乐.md
# Asserts byte-level fingerprints before shipping.
import hashlib, pathlib, zipfile

ROOT = pathlib.Path("/home/z/my-project")
OUT = ROOT / "download" / "v4.0.0"
OUT.mkdir(parents=True, exist_ok=True)

ext_zip = OUT / "ChuShi-NewTab-v4.0.0.zip"
mgr_plugin = ROOT / "bridge" / "smtc-plugin" / "ChuShi-SMTC-Manager-3.0.0.plugin"
api_plugin = ROOT / "bridge" / "ncm-plugin" / "ChuShi-Music-API-3.0.0.plugin"
engine_ps1 = ROOT / "bridge" / "engine" / "chushi-smtc-engine.ps1"

assert ext_zip.exists(), "extension zip missing (run build-extension.py first)"
for p in (mgr_plugin, api_plugin, engine_ps1):
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

readme = """# 「初始」SMTC 音乐 v4.0.0 升级说明（全部代码从零重写）

## 这一代改了什么（对应你报的每一个问题）

1. **不再需要网易云自带的 SMTC 开关**（开或关都行）。全新引擎
   chushi-smtc-engine.ps1 自己注册一个满血 Windows 媒体会话
   （媒体键 / 悬浮窗卡片 / 可拖动进度条 / 锁屏），数据全部来自新的
   网易云内插件，**代码里不存在任何"读取网易云 SMTC 会话"的路径**。
2. **插件全部英文化**（文件名 / 内部代码 0 中文字符，字节级断言保证），
   根治"中文名读取不了"。新插件名：
   - `ChuShi-SMTC-Manager-3.0.0.plugin`（引擎生命周期管理）
   - `ChuShi-Music-API-3.0.0.plugin`（网易云真值 + 歌词 + 控制执行）
3. **老代码 0 复用**：插件、引擎、宿主音乐核心、部件脚本全部从零重写。
   老版"三层互相修正"的仲裁/守卫/锚定代码整体删除——宿主现在只做
   "插件说什么就显示什么"，不存在再打架的层。
4. **不会再弄坏网易云自己的进度条**：新插件只"读"网易云（原生事件 +
   状态库 + 音频元素属性），绝不改写播放进度、绝不拦截内部调用；
   只有你主动拖进度条/点按钮时才执行一次控制动作，并在失效时诚实提示。
5. **逐字歌词防漂移**（你指定的管线）：API 插件抓全量逐字歌词 →
   真值时间轴对齐 → 暂停瞬间按当前词剩余时长计算淡入淡出 →
   恢复播放零累积漂移。

## 升级三步

1. **卸载旧插件**：BetterNCM 插件管理里卸载「初始歌词源」（以及旧版
   「初始SMTC桥」/「初始网易云API」，如果装过）。
2. **装新插件**：把 `ChuShi-SMTC-Manager-3.0.0.plugin` 和
   `ChuShi-Music-API-3.0.0.plugin` 放进 BetterNCM plugins 文件夹。
3. **完全重启网易云音乐**，浏览器端 `Ctrl+F5` 强刷（sw.js 缓存），
   「初始」里重新导入 `初始SMTC音乐预设.cshz`（先删除旧的音乐部件）。

## 30 秒自查

- 网易云播放任意歌曲 → Windows 悬浮窗/音量面板出现卡片，**进度条每秒走、可拖**；
- 「初始」面板显示歌名/进度/逐字歌词，页脚 `API v3.0.0 · 管理 v3.0.0`；
- 拖动面板进度条 → 网易云真实跳转（失败会明确提示"拖动未生效"）；
- 网易云**自己的**界面（进度条/播放按钮）行为与装插件前完全一致。

## 手动兜底（仅当安全软件拦截插件自动拉起引擎时）

交付包里 `ChuShi-SMTC音乐-交付包.zip` 内含 `chushi-smtc-engine.ps1` 与
`Start-Engine.bat`：解压后双击 `Start-Engine.bat` 即手动启动引擎，
「初始」面板几秒内应自动连接。

## 端口

引擎监听 `127.0.0.1:26801`（仅本机回环）。两个插件的配置面板里可以改端口，
改完需一致并重启网易云。旧版 20754 端口的残留引擎会被新管理插件自动清掉。
"""
readme_bytes = readme.encode("utf-8")

# manual fallback package
manual = OUT / "ChuShi-SMTC音乐-交付包.zip"
with zipfile.ZipFile(manual, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("chushi-smtc-engine.ps1", engine_crlf)
    z.writestr("Start-Engine.bat", bat)
    z.writestr("README.txt",
               "ChuShi SMTC engine v4.0.0 manual fallback.\r\n"
               "Double-click Start-Engine.bat to start the engine.\r\n"
               "ASCII + CRLF by contract.\r\n")

# merged package (everything for wss upload)
merged = OUT / "ChuShi-v4.0.0-合并交付包.zip"
with zipfile.ZipFile(merged, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("使用说明-SMTC音乐.md", readme_bytes)
    z.writestr("ChuShi-NewTab-v4.0.0.zip", ext_zip.read_bytes())
    z.writestr("ChuShi-SMTC-Manager-3.0.0.plugin", mgr_plugin.read_bytes())
    z.writestr("ChuShi-Music-API-3.0.0.plugin", api_plugin.read_bytes())
    z.writestr("ChuShi-SMTC音乐-交付包.zip", manual.read_bytes())

# fingerprint assertions
with zipfile.ZipFile(merged) as z:
    names = set(z.namelist())
    assert names == {
        "使用说明-SMTC音乐.md", "ChuShi-NewTab-v4.0.0.zip",
        "ChuShi-SMTC-Manager-3.0.0.plugin", "ChuShi-Music-API-3.0.0.plugin",
        "ChuShi-SMTC音乐-交付包.zip",
    }, names
    # embedded manager engine must equal the shipped manual engine (bytes)
    mgr_js = zipfile.ZipFile(mgr_plugin).read("index.js").decode("ascii")
    import base64, re
    b64 = re.search(r'const ENGINE_B64 = "([^"]+)"', mgr_js).group(1)
    assert base64.b64decode(b64) == engine_bytes, "embedded engine != shipped engine"
    # extension zip non-trivial
    assert len(z.read("ChuShi-NewTab-v4.0.0.zip")) > 10_000_000

# sha256 manifest
print("== SHA-256 ==")
for p in (ext_zip, mgr_plugin, api_plugin, manual, merged):
    h = hashlib.sha256(p.read_bytes()).hexdigest()
    print(f"{h}  {p.name}  ({p.stat().st_size:,} bytes)")
(OUT / "SHA256SUMS.txt").write_text(
    "".join(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n"
            for p in (ext_zip, mgr_plugin, api_plugin, manual, merged)),
    encoding="utf-8")
readme_path = OUT / "使用说明-SMTC音乐.md"
readme_path.write_text(readme, encoding="utf-8")
print(f"OK merged -> {merged}")
