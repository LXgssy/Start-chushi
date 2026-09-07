# build-ncm-plugin.py — 打包「初始网易云API」BetterNCM 插件（.plugin = zip 根部平铺）
# 出：bridge/ncm-plugin/初始网易云API-<ver>.plugin
# v3.0.0 双插件架构：本插件 = 网易云真值唯一生产者（零桥进程管理，不内嵌桥）
# 格式律（v1.7.x 实证）：zip 根部平铺 manifest.json + index.js，放 plugins 文件夹自动解压
import json, pathlib, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "bridge" / "ncm-plugin"

manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))
index = (SRC / "index.js").read_text(encoding="utf-8")

# 自检：真值/歌词/seek 关键路径齐全（v1.4.0–v1.5.1 真机教训的全部防线）
for needle in (
    "2.0.0", "role: \"ncm\"", "/api/plugin/state", "/api/plugin/lyric", "/api/plugin/cmd",
    "e82ckenh8dichen8", "audioplayer.seek", "playing/setPlayingPosition",
    "nativeExpectMs", "pickMediaEl", "lastPlayingAt", "lastProgressAt", "lastSeekAt",
    "needLyric", "rePushLyric", "chushi-channel-seek-disabled",
    "track.lyric.getinfo", "__chushiNcmApi", "__chushiLyricSourceActive",
):
    assert needle in index, f"index.js 缺少 {needle}"
# 双插件律：本插件绝不管理桥进程（绝不内嵌/部署/拉起桥）
for forbidden in ("EMBEDDED_BRIDGE", "deployBridge", "spawnBridge", "superviseBridge",
                  "killStaleBridge", "chushi-bridge.ps1", "__BRIDGE_PS1_B64__"):
    assert forbidden not in index, f"网易云API插件不得包含桥管理代码: {forbidden}"
# v1.3.0 粘滞选择器必须已废除
assert "mediaElStrict" not in index and "stickyEl" not in index

out = SRC / f"初始网易云API-{manifest['version']}.plugin"
if out.exists():
    out.unlink()
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    z.writestr("index.js", index)

# 回读验包
with zipfile.ZipFile(out) as z:
    names = set(z.namelist())
    assert names == {"manifest.json", "index.js"}, f"包结构异常: {names}"
    m = json.loads(z.read("manifest.json"))
    assert m["slug"] == "cc.chushi.ncmapi"
    payload = z.read("index.js").decode("utf-8")
    assert 'role: "ncm"' in payload, "心跳缺 role=ncm（桥仲裁依赖）"

print(f"OK -> {out} ({out.stat().st_size / 1024:.1f} KB)")
