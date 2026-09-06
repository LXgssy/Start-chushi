# build-lyric-plugin.py — 打包「初始歌词源」BetterNCM 插件（.plugin = zip 根部平铺）
# 出：bridge/lyric-plugin/初始歌词源-<ver>.plugin
# v1.3.0：构建时把内嵌 SMTC 桥（chushi-bridge.ps1 + chushi-bridge-launch.vbs，
#         均纯 ASCII）base64 注入 index.js 的占位符 —— 插件自部署/自拉起/监督。
# 格式律（v1.7.x 实证）：zip 根部平铺 manifest.json + index.js，放 plugins 文件夹自动解压
import base64, json, pathlib, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "bridge" / "lyric-plugin"
BRIDGE_PS1 = ROOT / "bridge" / "smtc" / "chushi-bridge.ps1"
BRIDGE_VBS = ROOT / "bridge" / "smtc" / "chushi-bridge-launch.vbs"

manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))
index = (SRC / "index.js").read_text(encoding="utf-8")

# 内嵌桥注入（必须先做，再做自检）
ps1_bytes = BRIDGE_PS1.read_bytes()
vbs_bytes = BRIDGE_VBS.read_bytes()
assert all(b < 128 for b in ps1_bytes), "桥 ps1 必须纯 ASCII"
assert all(b < 128 for b in vbs_bytes), "桥 vbs 必须纯 ASCII"
assert b"$BRIDGE_VERSION = '1.7.1'" in ps1_bytes, "桥 ps1 版本应为 1.7.1"
assert b"On Error Resume Next" in vbs_bytes, "桥 vbs 必须 On Error 静默化（真机 WSH 弹窗教训）"
ps1_b64 = base64.b64encode(ps1_bytes).decode("ascii")
vbs_b64 = base64.b64encode(vbs_bytes).decode("ascii")
assert "/*__BRIDGE_PS1_B64__*/" in index and "/*__BRIDGE_VBS_B64__*/" in index, "index.js 缺内嵌占位符"
index = index.replace("/*__BRIDGE_PS1_B64__*/", ps1_b64).replace("/*__BRIDGE_VBS_B64__*/", vbs_b64)
assert "/*__BRIDGE_PS1_B64__*/" not in index and "/*__BRIDGE_VBS_B64__*/" not in index

# 自检：加密标记块成对（build/验证脚本靠它提取）
assert "/*__EAPI_CRYPTO_START__*/" in index and "/*__EAPI_CRYPTO_END__*/" in index
# 关键 API 自检（v1.4.0：真值熔断/读回校验/直启退避/needLyric 自愈/channel 健康闸）
for needle in (
    "track.lyric.getinfo", "/api/plugin/state", "/api/plugin/lyric", "e82ckenh8dichen8",
    "audioplayer.seek", "playing/setPlayingPosition", "/api/plugin/cmd",
    "superviseBridge", "chushi-bridge.ps1", "1.5.1",
    "nativeExpectMs", "pickMediaEl", "lastPlayingAt", "lastProgressAt", "lastSeekAt",
    "spawnBackoffMs", "readFileText", "needLyric", "rePushLyric", "chushi-channel-seek-disabled",
):
    assert needle in index, f"index.js 缺少 {needle}"
assert "mediaElStrict" not in index and "stickyEl" not in index, "v1.3.0 粘滞选择器必须已废除"

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
    payload = z.read("index.js")
    # 内嵌桥回环：解出的 ps1 必须与源文件字节一致
    import re
    mb = re.search(rb'EMBEDDED_BRIDGE_PS1_B64 = "([A-Za-z0-9+/=]+)"', payload)
    vb = re.search(rb'EMBEDDED_BRIDGE_VBS_B64 = "([A-Za-z0-9+/=]+)"', payload)
    assert mb and base64.b64decode(mb.group(1)) == ps1_bytes, "ps1 内嵌回环失败"
    assert vb and base64.b64decode(vb.group(1)) == vbs_bytes, "vbs 内嵌回环失败"

print(f"OK -> {out} ({out.stat().st_size / 1024:.1f} KB, bridge embedded {len(ps1_b64)//1024}KB)")
