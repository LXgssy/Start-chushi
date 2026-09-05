# rel-v181.py — Release v1.8.1（SMTC 预设包 .cshz 化 + dock 面板复刻 UI + 桥编码修复）
# 资产：SMTC 交付包 zip（GBK bat + BOM ps1）+ 预设 .cshz。幂等：建/更 Release + 直链 SHA-256 复核。
# ⚠ 教训沿用：资产名 ASCII；uploads 上传基址与 api 基址分开，不可拼 /releases 双叠。
import hashlib, json, pathlib, subprocess, sys, time, urllib.request

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v1.8.1"
REPO = "LXgssy/Start-chushi"
API = f"https://api.github.com/repos/{REPO}/releases"

ASSETS = [
    (ROOT / "download/v1.8.1/ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (ROOT / "examples/初始SMTC音乐预设.cshz", "ChuShi-SMTC-Preset.cshz"),
]

NOTES = """# v1.8.1 · SMTC 预设包修订（.cshz + dock 面板复刻 UI + 桥编码修复）

## 修复
- **桥启动器乱码假命令**（`'敤' 不是内部或外部命令`）：.bat 原为 UTF-8 + `chcp 65001`，
  cmd 中途切码页重读错位把注释乱码当命令——现改按 **ANSI/GBK** 编码发布并移除 chcp
- 桥主脚本更名 `ChuShi-SMTC-Bridge.ps1`，强制 UTF-8 BOM（v1.1.0）

## 「初始 · SMTC 音乐」预设包（改 .cshz 包形态）
- UI / 默认唱片资源**全部打包**：`manifest.json + assets/cover.svg`，导入时 `asset:` 引用自动内联
- 音乐磁贴展开卡**复刻 v1.7.x dock 音乐面板**样式：96px 大封面 + 播放态 accent 光晕 /
  微缩放 / 绿点，标题/歌手/专辑三级信息，细进度条 + 常显 thumb，居中圆形控制排 + accent 主键，
  底部「已连接 · 来源应用」状态行
- 磁贴修复：首次从空态切紧凑条时播放态样式被整体覆写的问题

## 使用
- 解压 `ChuShi-SMTC-Delivery.zip` → 双击 `启动SMTC桥.bat`（不再乱码）→ ⌘K 导入预设 → 选 `初始SMTC音乐预设.cshz`
- 本版应用本体无改动，v1.8.0 的网页/扩展无需重装；已导入过旧 JSON 预设的话，删掉重导 .cshz 即可
"""

def api(path, method="GET", data=None, ctype="application/json"):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "rel-v181")
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

# 2) 上传资产（先删同名）
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
    req.add_header("User-Agent", "rel-v181")
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
