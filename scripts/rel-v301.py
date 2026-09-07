# rel-v301.py — Release v3.0.1（四症状定点根治：虚拟曲目/物理自愈/store 兜底）
# 资产：SMTC 交付包 zip（插件A v2.0.0 不变 + 网易云API插件 v2.1.0 + 桥 v2.0.0 + .cshz）
#       + 双 .plugin 直发 + 扩展 zip v3.0.1。幂等：建/更 Release + 删旧传新 + 直链 SHA-256 复核。
import hashlib, json, pathlib, sys, time, urllib.request

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v3.0.1"
REPO = "LXgssy/Start-chushi"
API = f"https://api.github.com/repos/{REPO}/releases"
TITLE = "v3.0.1 · 四症状定点根治（逐字歌词/播放状态/进度条/时间全冻结）"

ASSETS = [
    (ROOT / "download/v3.0.1/ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (ROOT / "download/v3.0.1/初始SMTC桥-2.0.0.plugin", "ChuShi-SmtcBridge-2.0.0.plugin"),
    (ROOT / "download/v3.0.1/初始网易云API-2.1.0.plugin", "ChuShi-NcmApi-2.1.0.plugin"),
    (ROOT / "examples/初始SMTC音乐预设.cshz", "ChuShi-SMTC-Preset.cshz"),
    (ROOT / "download/v3.0.1/ChuShi-NewTab-v3.0.1.zip", "ChuShi-NewTab-v3.0.1.zip"),
]

NOTES = """# v3.0.1 · 四症状定点根治（逐字歌词坏 / 播放状态不同步 / 进度条不动 / 数字时间不变）

对应反馈：**「逐字歌词是坏的，播放状态没有同步网易云音乐，进度条也不会动，数字时间也没有变化」**。

## 根因

四症状全现 = **网易云真值断供/失真**。面板拿不到在动的真值时回退 SMTC-only，而网易云桌面版 SMTC 的进度上报基本不更新（这正是当初自写网易云 API 的原因）——于是进度/时间/逐字歌词全冻结。三处断点：

1. 桥抓不到网易云 SMTC 会话时（真机常见），插件真值被判「独占」却**没人消费**，白白回退 SMTC-only
2. 播放态事件丢失/失真时插件报「暂停」→ 面板锚点冻结（进度条/时间/逐字歌词全停摆 + 显示暂停实际在响）
3. 原生进度事件死 + 媒体元素不可信时，进度冻死在 0/旧值

## 本版修复（架构不动、样式不动）

1. **宿主虚拟曲目兜底**：桥无 SMTC 会话时，插件B 真值直接构造面板曲目——有效真值绝不因 SMTC 会话缺失而弃用
2. **网易云API插件 v2.1.0 播放态物理自愈**：以物理事实为准「**进度在推进 = 在播放**」——推进 >800ms/拍而事件报暂停 → 输出播放中（<800ms 不误判；真暂停时 3s 内自动纠回）
3. **网易云API插件 v2.1.0 store 次级真值**：原生事件死 + 元素不可信时，用网易云自家进度条同源数据兜底，进度不再冻死

样式与交互**零改动**：播放键零位移、面板高度迟滞、按钮乐观翻转、拖动失败醒目芯片 + 诚实弹回全部保留。verify-v3 44/44 × 2 轮（新增物理自愈三拍白盒 / store 兜底白盒 / 虚拟曲目 e2e）。

## 升级两步

1. **更新扩展**：`ChuShi-NewTab-v3.0.1.zip`（扩展管理页移除旧「初始」→ 加载新 zip 解压后的文件夹）
2. **更新网易云插件**：卸载旧「初始网易云API」（2.0.0）→ 放入 `ChuShi-NcmApi-2.1.0.plugin`；**「初始SMTC桥-2.0.0.plugin」不用动** → 重启网易云音乐

> 从 v2.x 一体化「初始歌词源」升级：先卸旧「初始歌词源」，再装两个新插件，重启网易云。
> 自检（30 秒）：面板页脚应显示「已连接 · NetEase Music · API v2.1.0 · 管理 v2.0.0」；
> 只显示「管理 v2.0.0」没有「API v2.1.0」= 插件B 未加载，请确认已替换并重启网易云。
> 网页版需 Ctrl+F5 强刷缓存。
"""

def api(path, method="GET", data=None, ctype="application/json"):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "rel-v301")
    body = None
    if data is not None:
        body = json.dumps(data).encode() if ctype == "application/json" else data
        if ctype != "application/json":
            req.add_header("Content-Type", "application/octet-stream")
    resp = urllib.request.urlopen(req, body, timeout=180)
    return json.loads(resp.read().decode() or "{}")

def sha256(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

rel = None
try:
    rel = api(f"/tags/{TAG}")  # API 基址已含 /releases → 即 GET /releases/tags/{TAG}
except Exception:
    pass
if rel and rel.get("id"):
    rel = api(f"/{rel['id']}", "PATCH", {
        "tag_name": TAG, "name": TITLE, "body": NOTES,
        "draft": False, "prerelease": False,
    })
    print(f"Release updated: id={rel['id']}")
else:
    rel = api("", "POST", {
        "tag_name": TAG, "name": TITLE, "body": NOTES,
        "draft": False, "prerelease": False,
    })
    print(f"Release created: id={rel['id']}")

rid = rel["id"]
existing = {a["name"]: a["id"] for a in api(f"/{rid}/assets")}

for local, name in ASSETS:
    if not local.exists():
        sys.exit(f"缺资产: {local}")
    if name in existing:
        api(f"/assets/{existing[name]}", method="DELETE")
        print(f"deleted old {name}")
        time.sleep(1)
    data = local.read_bytes()
    done = False
    for attempt in range(4):
        try:
            up = urllib.request.Request(
                f"https://uploads.github.com/repos/{REPO}/releases/{rid}/assets?name={name}",
                method="POST",
            )
            up.add_header("Authorization", f"Bearer {TOKEN}")
            up.add_header("Content-Type", "application/octet-stream")
            up.add_header("User-Agent", "rel-v301")
            urllib.request.urlopen(up, data, timeout=600)
            print(f"uploaded {name} ({len(data)/1024:.1f} KB)")
            done = True
            break
        except Exception as e:
            print(f"  retry {attempt+1} for {name}: {e}")
            time.sleep(3 + attempt * 4)
    if not done:
        sys.exit(f"上传失败: {name}")

print("\n== 直链 SHA-256 复核 ==")
time.sleep(3)
rel2 = api(f"/tags/{TAG}")
for a in rel2.get("assets", []):
    url = a["browser_download_url"]
    h = hashlib.sha256()
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "rel-v301"}), timeout=600) as r:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            h.update(b)
    local_hash = next(sha256(l) for l, n in ASSETS if n == a["name"])
    ok = "OK" if h.hexdigest() == local_hash else "MISMATCH!"
    print(f"{a['name']}: {h.hexdigest()} {ok}")
