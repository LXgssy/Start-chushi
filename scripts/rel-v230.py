# rel-v230.py — Release v2.2.0（内部 API seek + 真值绝对锚定 + 桥隐身化）
# 资产：SMTC 交付包 zip（桥 v1.6.0 + 歌词源插件 v1.2.0 + 新 .cshz）+ 扩展 zip。
# 幂等：建/更 Release + 删旧传新 + 直链 SHA-256 复核。
# 教训沿用：PATCH/DELETE 相对路径不可再拼 /releases；上传必须用 uploads.github.com。
import hashlib, json, pathlib, sys, time, urllib.request, urllib.parse

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v2.3.0"
REPO = "LXgssy/Start-chushi"
API = f"https://api.github.com/repos/{REPO}/releases"
TITLE = "v2.3.0 · 一体化插件（原生 RPC seek + 单文件部署 + 提示芯片）"

ASSETS = [
    (ROOT / "download/v2.3.0/ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (ROOT / "download/v2.3.0/初始歌词源-1.3.0.plugin", "ChuShi-LyricSource-1.3.0.plugin"),
    (ROOT / "examples/初始SMTC音乐预设.cshz", "ChuShi-SMTC-Preset.cshz"),
    (ROOT / "download/v2.3.0/ChuShi-NewTab-v2.3.0.zip", "ChuShi-NewTab-v2.3.0.zip"),
]

NOTES = """# v2.3.0 · 一体化插件（Windows 侧只剩一个 .plugin 文件）

对应反馈：**拖动还是无效且没有提示 / 按你的思路重构——抛弃独立 SMTC 桥文件，全部集成进插件**。

## 本轮变更
1. **一体化插件（初始歌词源 v1.3.0）**：SMTC 桥以纯 ASCII 内嵌进插件（base64，构建内回环校验），插件自动部署/静默拉起/20s 监督/开机自启/版本仲裁——不再有任何 bat/ps1/vbs 交付文件，不再有多开窗口，不再有版本漂移
2. **seek 走网易云自家原生 RPC**：`channel.call("audioplayer.seek", cb, [songId, "songId|seek|rand", 秒])`（经 refined-now-playing-netease 劫持 channel.call 实证——这就是网易云自家进度条拖动用的通道，即你说的 channel.seek）；三级阶梯 = audioplayer.seek 正门 → setPlayingPosition dispatch → el.currentTime 兑底，每级 420ms 实测校验，全败 seekAck=false 回传
3. **拖动失败醒目提示芯片**：进度条正上方芯片（v2.2.0 藏在 10.5px 页脚里确实看不见，反馈属实）；未生效时进度条诚实弹回真值
4. **组件过旧芯片**：桥<1.7.0 / 插件<1.3.0 / 插件不在场 → 面板常驻橙色升级芯片（版本漂移从症状可见）
5. **300ms 快命令通道** `/api/plugin/cmd`（seek 延迟 ≤300ms）
6. **漂移加固**：粘滞媒体元素选择（修换源/缓冲过场命中空元素报 0 的真实错位源）+ v2.2.0 真值绝对锚定延续

## 升级（只剩两步）
1. 网页版 Ctrl+F5；扩展版重装 v2.3.0 zip
2. `初始歌词源-1.3.0.plugin` 放进 BetterNCM plugins（删旧版）→ 重启网易云 → 放歌（旧桥窗口/旧桥文件夹可全删）

> 自检：页脚「已连接 · 网易云音乐 · 插件 v1.3.0」+ 无橙色过旧芯片 + 拖动看本体跟跳。
"""

def api(path, method="GET", data=None, ctype="application/json"):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "rel-v230")
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
    api(f"/{rel['id']}", "PATCH", {"body": NOTES, "name": TITLE})
    rel_id = rel["id"]
else:
    rel = api("", "POST", {"tag_name": TAG, "name": TITLE, "body": NOTES, "draft": False, "prerelease": False})
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
    up = f"https://uploads.github.com/repos/{REPO}/releases/{rel_id}/assets?name={urllib.parse.quote(name)}"
    req = urllib.request.Request(up, method="POST", data=data)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/octet-stream")
    req.add_header("User-Agent", "rel-v230")
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
