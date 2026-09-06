# rel-v210.py — Release v2.1.0（四联修复：按钮位移/暂停后歌词错位/切歌歌词概率加载不出/进度条拖动 + 桥 v1.5.0 + 插件 v1.1.0）
# 资产：SMTC 交付包 zip（桥 v1.4.0 + 歌词源插件 + 新 .cshz）+ 预设 .cshz + 扩展 zip。
# 幂等：建/更 Release + 删旧传新 + 直链 SHA-256 复核。
# ⚠ 两处历史 404 教训写死在代码里：API 基址含 /releases 时 PATCH/DELETE 相对路径不可再拼 /releases；
#   资产上传必须用 uploads.github.com 专用域。
import hashlib, json, pathlib, sys, time, urllib.request, urllib.parse

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v2.1.0"
REPO = "LXgssy/Start-chushi"
API = f"https://api.github.com/repos/{REPO}/releases"

ASSETS = [
    (ROOT / "download/v2.1.0/ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (ROOT / "examples/初始SMTC音乐预设.cshz", "ChuShi-SMTC-Preset.cshz"),
    (ROOT / "download/v2.1.0/ChuShi-NewTab-v2.1.0.zip", "ChuShi-NewTab-v2.1.0.zip"),
]

NOTES = """# v2.1.0 · 四联修复（源自第 6 轮演示视频逐帧取证）

对应反馈：**播放/暂停按钮轻微位移 / 暂停再继续后歌词对不上 / 自动切歌歌词概率加载不出来 / 进度条还是拖不动**——全部根治。

## 修复明细
1. **按钮轻微位移根治**：播放/暂停双图标改为同圆心绝对堆叠 + opacity/scale 交叉淡切（布局零位移，构建内实测 dx=dy=0）；播放三角实心化，与暂停条视觉质量一致
2. **暂停→继续歌词错位根治（桥 v1.5.0）**：网易云插件在客户端内直读播放器（el.currentTime 帧级真值），桥每秒把插值基準重锚到真值——暂停/恢复的检测滞后不再累积成永久偏移；无插件场景自动半窗补偿
3. **切歌歌词概率加载不出根治（三层孪生竞态一并拔除）**：宿主拉取 latest-wins 链式补拉（拉取中切歌不再静默丢弃）+ 重试不再被旧词抑制 + 沙箱按歌词载荷引用重解析 + 部件歌词键加行数组引用维 + 桥 /api/lyric 对旧词请求明确拒绝（rev-mismatch，宿主重试到新词到位）
4. **进度条拖动根治**：网易云实测谎报 IsSeekAvailable=false——桥不再一票否决，直发 TryChangePlaybackPositionAsync 取真实返回值；同时 seek 命令经**插件心跳应答通道**直写播放器（SMTC 拒绝也跳得动，插件下一拍回报真值自动验证）

## 升级四件套
1. **网页版** Ctrl+F5；**扩展版**重装 v2.1.0 zip
2. 解压 `ChuShi-SMTC-Delivery.zip` → 关旧桥窗口 → 双击 `启动SMTC桥.bat`（**v1.5.0**，建议重跑「添加开机自启.bat」）
3. `初始歌词源-1.1.0.plugin` 放进 BetterNCM plugins（**删掉旧 1.0.0**）→ 重启网易云——seek 直通靠它
4. ⌘K → 预设 → 删除旧「初始 · SMTC 音乐」→ 导入新 `初始SMTC音乐预设.cshz`

> 即便暂不升级桥，网页 v2.1.0 的宿主守卫依旧兜住旧桥伪影；但「歌词对不上」「拖动被拒」需要桥 v1.5.0 + 插件 v1.1.0 才根治。
"""

def api(path, method="GET", data=None, ctype="application/json"):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "rel-v210")
    body = None
    if data is not None:
        body = json.dumps(data).encode() if ctype == "application/json" else data
        if ctype != "application/json":
            req.add_header("Content-Type", "application/octet-stream")
    resp = urllib.request.urlopen(req, body, timeout=120)
    return json.loads(resp.read().decode() or "{}")

def sha256(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

rel = None
try:
    rel = api(f"/tags/{TAG}")
except Exception:
    rel = None
if rel and rel.get("id"):
    print(f"release exists id={rel['id']} — 更新正文")
    # ⚠ API 基址已含 /releases——PATCH/DELETE 相对路径不可再拼 /releases（404 教训）
    api(f"/{rel['id']}", "PATCH", {"body": NOTES, "name": "v2.0.1 · 六联体验修复（暂停归零/seek/响应/闪白/逐字闪动/箭头）"})
    rel_id = rel["id"]
else:
    rel = api("", "POST", {"tag_name": TAG, "name": "v2.0.1 · 六联体验修复（暂停归零/seek/响应/闪白/逐字闪动/箭头）", "body": NOTES, "draft": False, "prerelease": False})
    rel_id = rel["id"]
    print(f"release created id={rel_id}")

want = {name: (src, sha256(src)) for src, name in ASSETS}
have = {a["name"]: a["id"] for a in api(f"/{rel_id}/assets")}
for name, (src, digest) in want.items():
    if name in have:
        api(f"/assets/{have[name]}", "DELETE")
        print(f"del old asset {name}")
        time.sleep(3)
    q = urllib.parse.quote(name)
    data = src.read_bytes()
    # ⚠ 资产上传必须用 uploads.github.com 专用域（api.github.com 上传 404，v1.8.0 教训沿用）
    up = f"https://uploads.github.com/repos/{REPO}/releases/{rel_id}/assets?name={urllib.parse.quote(name)}"
    req = urllib.request.Request(up, method="POST", data=data)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/octet-stream")
    req.add_header("User-Agent", "rel-v210")
    urllib.request.urlopen(req, timeout=600).read()
    print(f"uploaded {name} ({len(data)/1048576:.1f} MB)")

print("--- 直链 SHA-256 复核 ---")
ok = True
for name, (src, digest) in want.items():
    url = f"https://github.com/{REPO}/releases/download/{TAG}/{urllib.parse.quote(name)}"
    tmp = pathlib.Path("/tmp/rel-check.bin")
    urllib.request.urlretrieve(url, tmp)
    got = sha256(tmp)
    same = got == digest
    ok = ok and same
    print(f"{'OK ' if same else 'BAD'} {name} {got[:16]}…")
print("ALL OK" if ok else "MISMATCH")
sys.exit(0 if ok else 1)
