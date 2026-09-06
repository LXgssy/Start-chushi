# build-lyric-plugin.py — 打包「初始歌词源」BetterNCM 插件（.plugin = zip 根部平铺）
# 出：bridge/lyric-plugin/初始歌词源-1.0.0.plugin
# 格式律（v1.7.x 实证）：zip 根部平铺 manifest.json + index.js，放 plugins 文件夹自动解压
import json, pathlib, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "bridge" / "lyric-plugin"

manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))
index = (SRC / "index.js").read_text(encoding="utf-8")

# 自检：加密标记块成对（build/验证脚本靠它提取）
assert "/*__EAPI_CRYPTO_START__*/" in index and "/*__EAPI_CRYPTO_END__*/" in index
# 关键 API 自检
for needle in ("track.lyric.getinfo", "/api/plugin/state", "/api/plugin/lyric", "e82ckenh8dichen8"):
    assert needle in index, f"index.js 缺少 {needle}"

out = SRC / f"初始歌词源-{manifest['version']}.plugin"
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
    assert m["slug"] == "cc.chushi.lyricsource"

print(f"OK -> {out} ({out.stat().st_size / 1024:.1f} KB)")
