# build-v6-assets.py -- assemble the v6.0.0 delivery set under download/v6.0.0/
#   Three-plugin pure-plugin generation: the external engine is RETIRED.
#   ChuShi-NewTab-v6.0.0.zip           (extension: 6.0.0, dual-port host permissions)
#   ChuShi-SMTC-Manager-6.0.0.plugin   (plugin A: pure mediaSession SMTC owner)
#   ChuShi-Music-Bridge-6.0.0.plugin   (plugin B: truth + control + local hub)
#   ChuShi-Lyric-Source-6.0.0.plugin   (plugin C: full lyric ladder)
#   初始SMTC音乐预设.cshz               (music widget preset, style unchanged)
#   ChuShi-v6.0.0-合并交付包.zip        (everything merged for wss upload)
#   SHA256SUMS.txt
#   使用说明-SMTC音乐.md
# Asserts byte-level fingerprints before shipping.
import hashlib
import pathlib
import zipfile

ROOT = pathlib.Path("/home/z/my-project")
OUT = ROOT / "download" / "v6.0.0"
OUT.mkdir(parents=True, exist_ok=True)

ext_zip = ROOT / "download" / "v6.0.0" / "ChuShi-NewTab-v6.0.0.zip"
smtc_plugin = ROOT / "bridge" / "v6" / "dist" / "ChuShi-SMTC-Manager-6.0.0.plugin"
bridge_plugin = ROOT / "bridge" / "v6" / "dist" / "ChuShi-Music-Bridge-6.0.0.plugin"
lyric_plugin = ROOT / "bridge" / "v6" / "dist" / "ChuShi-Lyric-Source-6.0.0.plugin"
preset_cshz = ROOT / "examples" / "初始SMTC音乐预设.cshz"

for p in (ext_zip, smtc_plugin, bridge_plugin, lyric_plugin, preset_cshz):
    assert p.exists(), f"missing {p}"

# loose plugin/preset copies ship alongside the merged package (v5.0.1 layout)
for src in (smtc_plugin, bridge_plugin, lyric_plugin, preset_cshz):
    (OUT / src.name).write_bytes(src.read_bytes())

readme = """# 「初始」SMTC 音乐 v6.0.0 使用说明（三插件纯插件架构）

## 这一代改了什么

**外部引擎整体退役。** v5 及之前需要一个 PowerShell 引擎进程在后台跑
（部署、拉起、被杀软拦截、端口被占……都是它的锅）。v6.0.0 起整个音乐
链路就是**三个 BetterNCM 插件**，全部住在网易云窗口里，没有任何外部
进程、没有任何要手动启动的东西：

| 插件 | 职责 |
|------|------|
| ChuShi SMTC Manager | 用标准 mediaSession 接口直接持有 Windows 系统媒体会话（悬浮窗/锁屏/媒体键/可拖进度）。网易云自带的 SMTC 开关**保持关闭**即可 |
| ChuShi Music Bridge | 桥：只读采集网易云真实播放状态、在窗口内自建本地数据枢纽给「初始」页面用、单次执行控制指令（带回执） |
| ChuShi Lyric Source | 独立歌词源：逐字歌词（yrc）→ 卡拉OK（klyric 转换）→ 行级（lrc）三级回退 |

「初始」页面不显示音乐的根因也一并根治：旧架构里页面数据要经过引擎，
引擎没跑起来页面就永远空着；v6 桥插件自己就是枢纽，插件活着页面就有数据。

## 升级三步（从任何旧版本）

1. **删光旧插件**：打开 BetterNCM 插件目录（网易云设置 → 关于/数据目录），
   把 plugins 文件夹里的**所有旧 .plugin 文件全部删掉**
   （包括旧版「ChuShi-SMTC-Manager」「ChuShi-Music-API」「初始歌词源」等，
   旧文件不删会在启动时反向覆盖新插件）。
2. **装入三个新插件**：把交付包里的三个 .plugin 文件复制进 plugins 文件夹
   （或者直接双击安装），**完全退出并重启网易云**。
   插件列表应出现：ChuShi SMTC Manager、ChuShi Music Bridge、ChuShi Lyric Source。
3. **更新「初始」**：浏览器 Ctrl+F5 强刷（扩展版在扩展管理里点重新加载，
   或安装新版 ChuShi-NewTab-v6.0.0.zip）；重新导入 `初始SMTC音乐预设.cshz`。

## 30 秒自查

- 放歌 → 面板出现曲目/进度/逐字歌词；时间数字每秒走。
- 系统媒体悬浮窗（Win+K 面板/音量弹层）出现网易云曲目卡片，进度可拖，
  媒体键（播放/暂停/上一首/下一首）都能控网易云。
- 面板页脚显示 `API v6.0.0 · 管理 v6.0.0`。
- 网易云**自家**进度条/按钮行为与装插件前完全一致（桥是严格只读的）。

## 装完列表里还是没有插件？

1. 确认网易云是 3.x：本插件要求 manifest 带 ncm3 兼容标记（已内置）。
2. 打开 BetterNCM 数据目录 → 检查 `disable_list.txt` 里有没有这三插件的
   slug（cc.chushi.smtc / cc.chushi.musicbridge / cc.chushi.lyricsource），
   有就删掉对应行再重启。
3. 确认 plugins 文件夹里没有同功能旧版 .plugin 残留（中文名旧包会按
   文件名排序反向覆盖新包）。

## 与旧版的兼容性

- 网易云 SMTC 开关：**关闭**（推荐）。开着也能用——本插件的会话刷新
  更频繁，系统面板会显示本插件会话。
- 旧引擎进程：可以彻底忘掉它；装 v6 后可删除旧的 chushi-smtc-engine.ps1
  与开机自启项，不会再被使用。
- 「ChuShi Music API」旧插件必须删除（与 Music Bridge 是不同 slug 的
  两个插件，同时装会出现两份诊断面板）。
"""

# ---------------- assemble merged package ----------------
merged = OUT / "ChuShi-v6.0.0-合并交付包.zip"
names = [
    "ChuShi-NewTab-v6.0.0.zip",
    "ChuShi-SMTC-Manager-6.0.0.plugin",
    "ChuShi-Music-Bridge-6.0.0.plugin",
    "ChuShi-Lyric-Source-6.0.0.plugin",
    "初始SMTC音乐预设.cshz",
    "使用说明-SMTC音乐.md",
]
with zipfile.ZipFile(merged, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr(names[0], ext_zip.read_bytes())
    z.writestr(names[1], smtc_plugin.read_bytes())
    z.writestr(names[2], bridge_plugin.read_bytes())
    z.writestr(names[3], lyric_plugin.read_bytes())
    z.writestr(names[4], preset_cshz.read_bytes())
    z.writestr(names[5], readme)

(OUT / "使用说明-SMTC音乐.md").write_text(readme, encoding="utf-8")

# read-back structure check
with zipfile.ZipFile(merged) as z:
    got = set(z.namelist())
assert got == set(names), f"merged content mismatch: {got}"

# ---------------- fingerprint gate ----------------
def sha(p: pathlib.Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()

# plugin manifests must carry the three-plugin language rules (byte fingerprints)
with zipfile.ZipFile(smtc_plugin) as z:
    m = z.read("manifest.json").decode("utf-8")
    assert '"name": "ChuShi SMTC Manager"' in m and "ncm3-compatible" in m
with zipfile.ZipFile(bridge_plugin) as z:
    m = z.read("manifest.json").decode("utf-8")
    assert '"name": "ChuShi Music Bridge"' in m
with zipfile.ZipFile(lyric_plugin) as z:
    m = z.read("manifest.json").decode("utf-8")
    assert '"name": "ChuShi Lyric Source"' in m

# extension zip must be the 6.0.0 build
with zipfile.ZipFile(ext_zip) as z:
    mf = z.read("manifest.json").decode("utf-8")
    assert '"version": "6.0.0"' in mf and any("26802" in x for x in mf.split("host_permissions")[1].split("]")[0].split(",")), "extension fingerprint"

# preset must embed v6 chip copy
with zipfile.ZipFile(preset_cshz) as z:
    import json as _json
    man = _json.loads(z.read("manifest.json").decode("utf-8"))
    h = man["widgets"][0]["html"]
    assert "音乐桥未连接 · 安装 ChuShi Music Bridge 插件并重启网易云" in h, "preset fingerprint"
    assert "引擎未运行" not in h, "stale engine copy in preset"

lines = [f"{sha(p)}  {p.name}" for p in
         (ext_zip, smtc_plugin, bridge_plugin, lyric_plugin, preset_cshz, merged)]
(OUT / "SHA256SUMS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

print(f"OK: {merged.name} ({merged.stat().st_size} bytes)")
print(f"OK: {OUT/'使用说明-SMTC音乐.md'}")
for l in lines:
    print("  " + l)
