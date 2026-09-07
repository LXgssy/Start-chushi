# rel-v310.py — Release v3.1.0（满血版 SMTC 重写：桥自带满血会话 + 控制全回路 + 逐字歌词防漂移）
# 资产：SMTC 交付包 zip（插件A 2.1.0 内嵌桥 3.0.0 + 网易云API插件 2.2.0 + 桥 3.0.0 + .cshz）
#       + 双 .plugin 直发 + 扩展 zip v3.1.0。幂等：建/更 Release + 删旧传新 + 直链 SHA-256 复核。
import hashlib, json, pathlib, sys, time, urllib.request

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v3.1.0"
REPO = "LXgssy/Start-chushi"
API = f"https://api.github.com/repos/{REPO}/releases"
TITLE = "v3.1.0 · 满血版 SMTC 重写（自有媒体会话可拖进度 + 控制全回路 + 逐字歌词防漂移）"

ASSETS = [
    (ROOT / "download/v3.1.0/ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (ROOT / "download/v3.1.0/初始SMTC桥-2.1.0.plugin", "ChuShi-SmtcBridge-2.1.0.plugin"),
    (ROOT / "download/v3.1.0/初始网易云API-2.2.0.plugin", "ChuShi-NcmApi-2.2.0.plugin"),
    (ROOT / "examples/初始SMTC音乐预设.cshz", "ChuShi-SMTC-Preset.cshz"),
    (ROOT / "download/v3.1.0/ChuShi-NewTab-v3.1.0.zip", "ChuShi-NewTab-v3.1.0.zip"),
]

NOTES = """# v3.1.0 · 满血版 SMTC 重写

对应指令：**「不要依靠网易云自带的 smtc，直接自己写一个满血版的 smtc 插件，让音乐桥去连接自己写的 smtc 插件；逐字歌词先用 api 插件读取完整歌词，再用 smtc 对时间戳，暂停时计算淡入淡出时间防累积漂移」**。

## 本版变化（面板样式与交互零改动）

1. **桥 v3.0.0 满血版自有 SMTC 会话**：MediaPlayer + 官方手动控制模式（CommandManager 禁用）——
   时间线每秒墙钟推进、`IsPlaybackPositionEnabled` 可拖动、媒体键/悬浮窗按钮/悬浮窗拖动全部生效；
   **网易云自带的残疾 SMTC（position 不动、seek 静默忽略）从此不承担任何角色**。
   - 悬浮窗按钮 → 桥直控网易云会话（Try*Async），失败自动落插件页内执行
   - **悬浮窗拖动进度 → 插件页内 seek 阶梯**（网易云唯一接受的路径）+ 自有时间线乐观重锚
   - 命令队列化（面板 seek / 悬浮窗按钮 / 拖动可并存，最早优先 5s 过期）
   - 控制门修复：桥抓不到网易云会话（虚拟曲目场景）时面板播放/暂停/拖动自动转插件执行（旧版死路）；拖动的旧标题匹配门废除（真机「拖了没反应」的桥侧根因）
2. **网易云API插件 v2.2.0**：控制执行器（锁定元素 play/pause 优先 + 页脚可见按钮多候选兑底）；
   seek 直写后 1600ms **末级重写**（防本体重置元素）；**身份捕获**——被直写且真实生效的元素立即锁定为主播放器
3. **逐字歌词防累积漂移（渲染层落地）**：API 插件全量 yrc（eapi 三层回退）→ 真值时间轴对齐
   + slew 微抖吸收（≤0.35s 不重锚，扫色不再肉眼抖动）→ **暂停时按词时间轴计算淡入淡出时长**
   （淡出收敛在本词边界内，恢复淡入）——冻结感与累积漂移感知归零
4. **宿主 v3.1.0**：组件阈值更新（API 插件 ≥2.2.0 / 桥 ≥3.0.0），芯片文案与真实可行操作一一对应

历史修复全部保留：播放键零位移（双 SVG 同圆心交叉淡切）、面板高度迟滞、按钮乐观翻转、拖动失败醒目芯片 + 诚实弹回。
verify-v31 **58/58 × 2 轮**（含真 PowerShell 解析器语法门 / 满血 SMTC 全要素静态断言 / 控制执行器 vm 白盒 / 单主仲裁+虚拟曲目 e2e）。

## 升级三步

1. **更新扩展**：`ChuShi-NewTab-v3.1.0.zip`
2. **更新两个网易云插件**：卸载旧「初始SMTC桥」「初始网易云API」→ 放入 `ChuShi-SmtcBridge-2.1.0.plugin` + `ChuShi-NcmApi-2.2.0.plugin`
3. **完全重启网易云音乐**（桥自动升级：部署→杀旧→拉起）

> 从 v2.x 一体化「初始歌词源」升级：先卸旧，再装双新插件，重启网易云。
> 自检（30 秒）：页脚「已连接 · NetEase Music · API v2.2.0 · 管理 v2.1.0」；
> Windows 悬浮窗出现**可拖动进度条**的曲目卡片（与网易云官方卡片并存时，用本桥的卡片）。
> 网页版需 Ctrl+F5 强刷缓存。
"""

def api(path, method="GET", data=None, ctype="application/json"):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "rel-v310")
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
        api(f"/{rid}/assets/{existing[name]}", "DELETE")
        print(f"deleted old asset: {name}")
        time.sleep(1)
    data = local.read_bytes()
    up = None
    for attempt in range(4):  # 上传 4 次退避重试（rel 脚本教训）
        try:
            up = api(f"/{rid}/assets?name={name}", "POST", data, ctype="octet-stream")
            break
        except Exception as e:
            print(f"upload retry {attempt + 1} for {name}: {e}")
            time.sleep(2 * (attempt + 1))
    if not up or not up.get("id"):
        sys.exit(f"上传失败: {name}")
    print(f"uploaded: {name}  {len(data) / 1024:.1f} KB")

print("\n--- 直链 SHA-256 复核 ---")
ok_all = True
assets = {a["name"]: a for a in api(f"/{rid}/assets")}
for local, name in ASSETS:
    want = sha256(local)
    url = assets[name]["browser_download_url"]
    got = hashlib.sha256(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "rel-v310"}), timeout=300).read()).hexdigest()
    ok = want == got
    ok_all = ok_all and ok
    print(f"{'OK  ' if ok else 'FAIL'} {name}: {got[:16]}…")
print("ALL OK" if ok_all else "MISMATCH", flush=True)
sys.exit(0 if ok_all else 1)
