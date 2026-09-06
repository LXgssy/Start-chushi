# rel-v190.py — Release v1.9.0（逐字歌词 + 初始歌词源插件 + 进度条根治 + 弹出面板重构）
# 资产：SMTC 交付包 zip（含歌词源插件）+ 预设 .cshz + 扩展 zip（manifest 补 host_permissions，扩展需重装）。
# 幂等：建/更 Release + 删旧传新 + 直链 SHA-256 复核。
import hashlib, json, pathlib, sys, time, urllib.request, urllib.parse

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v1.9.0"
REPO = "LXgssy/Start-chushi"
API = f"https://api.github.com/repos/{REPO}/releases"

ASSETS = [
    (ROOT / "download/v1.9.0/ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (ROOT / "examples/初始SMTC音乐预设.cshz", "ChuShi-SMTC-Preset.cshz"),
    (ROOT / "download/v1.9.0/ChuShi-NewTab-v1.9.0.zip", "ChuShi-NewTab-v1.9.0.zip"),
]

NOTES = """# v1.9.0 · 音乐面板逐字歌词 + 进度条根治 + 弹出面板重构

## 新功能：逐字歌词（卡拉 OK）
- 全新**「初始歌词源」BetterNCM 插件**（纯 API 无 UI，可选安装）：从网易云客户端内部读取逐字歌词（eapi `song/lyric/v1`：yrc 逐字 → klyric → lrc 三层回退），经 SMTC 桥 v1.2.0 新通道转交
- 面板歌词区逐词扫色（完成=实色 / 当前=按词进度渐变扫色 / 未到=暗色）+ 行滚动居中 + 当前行翻译
- SMTC 时间戳驱动：拖动进度/暂停/切歌歌词即时跟随；不装插件其余功能不受影响

## 修复
- **进度条「拖完弹回」根治**（v1.8.x 真机「进度条完全是坏的」根因）：完整快照广播签名不含 position，seek 后新位置永远到不了面板；新增**每拍轻量锚点通道**（position/fetchedAt 每拍必达）+ seek 成功后本地乐观重锚
- **面板打开白屏根治**：dock 弹出面板 iframe 改为随页面常驻预热——打开零白屏零重载，SMTC 数据后台持续更新
- **扩展版桥请求被拦**：manifest 补上 `http://127.0.0.1:20754/*` host_permissions（此前扩展版音乐面板完全离线）
- 网易云 SMTC 时间轴缺失时自动用插件帧级进度兜底；SMTC 封面缺失时用网易云封面兜底（封面三重保障）
- 部件 `--ez` 缓动变量自引用无效声明（全部过渡静默退化）修复；弹出动画跟随设置里的动效档位

## 升级
1. **网页版**：重开两次新标签页或 Ctrl+F5；**扩展版**：重装 v1.9.0 zip（manifest 变更，必须重装）
2. ⌘K → 导入预设 → 选 `初始SMTC音乐预设.cshz`（旧版音乐预设先删除再导入）
3. 解压 `ChuShi-SMTC-Delivery.zip` → 双击 `启动SMTC桥.bat`（桥 v1.2.0，老桥请替换）
4. （可选，解锁逐字歌词）把 `初始歌词源-1.0.0.plugin` 放进 BetterNCM 的 plugins 文件夹 → 重启网易云

> 桥脚本 .bat 维持纯 ASCII + CRLF 终极形态；若从 v1.8.2 升级，桥/预设/插件均可直接覆盖。
"""

def api(path, method="GET", data=None, ctype="application/json"):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "rel-v190")
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
    pass
if not rel or "id" not in rel:
    rel = api("", "POST", {
        "tag_name": TAG, "target_commitish": "main", "name": TAG,
        "body": NOTES, "draft": False, "prerelease": False,
    })
    print(f"created release id={rel['id']}")
else:
    rel = api(f"/{rel['id']}", "PATCH", {"body": NOTES, "name": TAG})
    print(f"existing release id={rel['id']}")

rel_id = rel["id"]
existing = {a["name"]: a["id"] for a in rel.get("assets", [])}

for p, name in ASSETS:
    if name in existing:
        api(f"/assets/{existing[name]}", "DELETE")
        print(f"deleted old asset {name}")
        time.sleep(3)
    up = f"https://uploads.github.com/repos/{REPO}/releases/{rel_id}/assets?name={urllib.parse.quote(name)}"
    req = urllib.request.Request(up, method="POST", data=p.read_bytes())
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/octet-stream")
    req.add_header("User-Agent", "rel-v190")
    r = json.loads(urllib.request.urlopen(req, timeout=600).read().decode())
    print(f"uploaded {name} ({r['size']} B, state={r['state']})")

time.sleep(5)
ok = True
for p, name in ASSETS:
    url = f"https://github.com/{REPO}/releases/download/{TAG}/{urllib.parse.quote(name)}"
    h = hashlib.sha256(urllib.request.urlopen(url, timeout=300).read()).hexdigest()
    match = h == sha256(p)
    ok = ok and match
    print(f"{'OK ' if match else 'BAD'} {name}  {h[:12]}…")
print("ALL OK" if ok else "MISMATCH", file=sys.stderr)
sys.exit(0 if ok else 2)
