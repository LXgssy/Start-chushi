# rel-v180.py — Release v1.8.0（SMTC 换线版）
# 资产：扩展 zip + SMTC 交付包 zip + 预设 JSON。幂等：建/更 Release + 直链 SHA-256 复核。
import hashlib, json, pathlib, subprocess, sys, time, urllib.request

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v1.8.0"
REPO = "LXgssy/Start-chushi"
API = f"https://api.github.com/repos/{REPO}/releases"

ASSETS = [
    (ROOT / "download/v1.8.0/ChuShi-NewTab-v1.8.0.zip", "ChuShi-NewTab-v1.8.0.zip"),
    (ROOT / "download/v1.8.0/ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (ROOT / "examples/初始SMTC音乐预设.json", "ChuShi-SMTC-Preset.json"),
]

NOTES = """# v1.8.0 · SMTC 系统媒体换线（推翻网易云插件路线）

## 音乐接入整体换线
- **不再需要任何网易云音乐插件**：BetterNCM 插件 / CDP 独立桥全部退役并从仓库移除
- 新增「初始SMTC桥」（PowerShell + WinRT，**零依赖**，双击即用，可选开机自启）：
  直连 Windows 系统媒体会话（SMTC），网易云 / QQ 音乐 / Spotify / 浏览器视频都能控
- 宿主新增媒体作用面 `chushi.smtc.get / control / subscribe`（沙箱脚本与角落小部件两通道）

## 官方「初始 · SMTC 音乐」预设包
- 右下角双形态音乐磁贴：紧凑条 ⇄ 展开大卡（封面呼吸光晕 / 切歌上浮 / 进度插值 / 可拖 seek）
- ⌘K 新增四条命令：播放/暂停、下一首、上一首、正在播放什么
- 导入方式：⌘K → 导入预设 → 选择 `初始SMTC音乐预设.json`

## 修复
- 关闭面板 450ms 内快速点开另一个功能：tab 选框改播「切换滑移」，不再重播打开动画
- 删磁贴两排变一排时页面抖动：`scrollbar-gutter: stable` 根治经典滚动条宽度跳变

## 升级说明
- 网页版：重开两次标签页或 Ctrl+F5（Service Worker 换新）
- 扩展版：解压新 zip 重载扩展
- 音乐功能：解压 `ChuShi-SMTC音乐-交付包.zip` → 双击启动SMTC桥.bat → 导入预设 JSON
- 旧网易云插件请卸载，避免干扰
"""

def api(path, method="GET", data=None, ctype="application/json"):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "rel-v180")
    body = None
    if data is not None:
        body = json.dumps(data).encode() if ctype == "application/json" else data
        if ctype != "application/json":
            req.add_header("Content-Type", "application/octet-stream")
    resp = urllib.request.urlopen(req, body, timeout=120)
    return json.loads(resp.read().decode() or "{}")

def sha256(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

# 1) 找/建 Release
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

# 2) 上传资产（先删同名；⚠资产名 ASCII 硬约束——中文会被 GitHub 静默剥离）
import urllib.parse
for p, name in ASSETS:
    if name in existing:
        api(f"/assets/{existing[name]}", "DELETE")
        print(f"deleted old asset {name}")
        time.sleep(3)
    up = f"https://uploads.github.com/repos/{REPO}/releases/{rel_id}/assets?name={urllib.parse.quote(name)}"
    req = urllib.request.Request(up, method="POST", data=p.read_bytes())
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/octet-stream")
    req.add_header("User-Agent", "rel-v180")
    r = json.loads(urllib.request.urlopen(req, timeout=600).read().decode())
    print(f"uploaded {name} ({r['size']} B, state={r['state']})")

# 3) 直链 SHA-256 复核
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
