# build-smtc-plugin.py — 打包「初始SMTC桥」BetterNCM 插件（.plugin = zip 根部平铺）
# 出：bridge/smtc-plugin/初始SMTC桥-<ver>.plugin
# v3.0.0 双插件架构：本插件 = 桥进程生命周期唯一管理者，内嵌桥 ps1/vbs base64
# （与旧 build-lyric-plugin.py 的内嵌机制同构：占位符注入 + 回环校验）
# 格式律（v1.7.x 实证）：zip 根部平铺 manifest.json + index.js，放 plugins 文件夹自动解压
import base64, json, pathlib, zipfile, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "bridge" / "smtc-plugin"
BRIDGE_PS1 = ROOT / "bridge" / "smtc" / "chushi-bridge.ps1"
BRIDGE_VBS = ROOT / "bridge" / "smtc" / "chushi-bridge-launch.vbs"

manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))
index = (SRC / "index.js").read_text(encoding="utf-8")

# 内嵌桥注入（必须先做，再做自检）
ps1_bytes = BRIDGE_PS1.read_bytes()
vbs_bytes = BRIDGE_VBS.read_bytes()
assert all(b < 128 for b in ps1_bytes), "桥 ps1 必须纯 ASCII"
assert all(b < 128 for b in vbs_bytes), "桥 vbs 必须纯 ASCII"
assert b"$BRIDGE_VERSION = '3.0.0'" in ps1_bytes, "桥 ps1 版本应为 3.0.0"
assert b"On Error Resume Next" in vbs_bytes, "桥 vbs 必须 On Error 静默化（真机 WSH 弹窗教训）"
ps1_b64 = base64.b64encode(ps1_bytes).decode("ascii")
vbs_b64 = base64.b64encode(vbs_bytes).decode("ascii")
assert "/*__BRIDGE_PS1_B64__*/" in index and "/*__BRIDGE_VBS_B64__*/" in index, "index.js 缺内嵌占位符"
index = index.replace("/*__BRIDGE_PS1_B64__*/", ps1_b64).replace("/*__BRIDGE_VBS_B64__*/", vbs_b64)
assert "/*__BRIDGE_PS1_B64__*/" not in index and "/*__BRIDGE_VBS_B64__*/" not in index

# 自检：桥管理关键路径齐全（v1.4.0–v1.5.1 真机教训的全部防线）
for needle in (
    "2.1.0", "superviseBridge", "deployBridge", "spawnBridge", "killStaleBridge",
    "spawnBackoffMs", "upgradeBackoffMs", "bridgeBlocked", "readFileText",
    "chushi-bridge.ps1", "/api/plugin/register", "EMBEDDED_BRIDGE_VERSION",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File",
    "__chushiSmtcBridgePlugin",
):
    assert needle in index, f"index.js 缺少 {needle}"
# 双插件律：本插件绝不生产网易云状态（绝不推 /api/plugin/state）
assert "/api/plugin/state" not in index, "SMTC桥管理插件不得推送网易云状态（职责单一律）"

out = SRC / f"初始SMTC桥-{manifest['version']}.plugin"
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
    assert m["slug"] == "cc.chushi.smtcbridge"
    payload = z.read("index.js")
    # 内嵌桥回环：解出的 ps1/vbs 必须与源文件字节一致
    mb = re.search(rb'EMBEDDED_BRIDGE_PS1_B64 = "([A-Za-z0-9+/=]+)"', payload)
    vb = re.search(rb'EMBEDDED_BRIDGE_VBS_B64 = "([A-Za-z0-9+/=]+)"', payload)
    assert mb and base64.b64decode(mb.group(1)) == ps1_bytes, "ps1 内嵌回环失败"
    assert vb and base64.b64decode(vb.group(1)) == vbs_bytes, "vbs 内嵌回环失败"
    assert b"role: \"smtc\"" in payload or b'role: "smtc"' in payload, "缺注册上报"

print(f"OK -> {out} ({out.stat().st_size / 1024:.1f} KB, bridge embedded {len(ps1_b64)//1024}KB)")
