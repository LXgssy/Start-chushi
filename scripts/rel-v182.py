# rel-v182.py — Release v1.8.2（dock 音乐按钮+弹出面板 + 桥 bat 纯 ASCII/CRLF 终修）
# 资产：SMTC 交付包 zip + 预设 .cshz + 扩展 zip（应用本体有改动，扩展需重装）。
# 幂等：建/更 Release + 删旧传新 + 直链 SHA-256 复核。
# ⚠ 教训沿用：资产名 ASCII；uploads 基址与 api 基址分开。
import hashlib, json, pathlib, sys, time, urllib.request, urllib.parse

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v1.8.2"
REPO = "LXgssy/Start-chushi"
API = f"https://api.github.com/repos/{REPO}/releases"

ASSETS = [
    (ROOT / "download/v1.8.2/ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (ROOT / "examples/初始SMTC音乐预设.cshz", "ChuShi-SMTC-Preset.cshz"),
    (ROOT / "download/v1.8.2/ChuShi-NewTab-v1.8.2.zip", "ChuShi-NewTab-v1.8.2.zip"),
]

NOTES = """# v1.8.2 · dock 音乐按钮 + 弹出面板（按反馈：不是磁贴，放 dock 里）

## 「初始」应用（网页 + 扩展均需更新）
- **预设 API 扩展：widgets 新增 `surface` 表面** —— `"dock"` 表面在底部 dock 栏注册按钮，点击在 dock 上方弹出同源沙箱面板（高度弹簧 + panel-rise/sink 与内建面板同一动效语言）
- 关闭方式：再点按钮 / 点击外部 / Esc / 面板内收起键（新 API `chushi.close()`）；与内建面板互斥
- **SMTC 音乐预设改用 dock 表面**：安装即见 dock「音乐」按钮，点开即 v1.7.x dock 面板样式的弹出音乐卡（340×248），空态 92px 随媒体接入弹簧长开
- 修复音乐部件空态视觉缺陷：顶部 19px 白条（svg defs inline 行盒）+ 空态文案与紧凑条叠加

## 桥启动器 .bat 编码终修（第三版，一劳永逸）
- v1.8.0（UTF-8）报 `'敤'`/`'垵濮?SMTC'`、v1.8.1（GBK 但 Unix LF 换行）报 `'ANSI'`/`'桥'`/`'MTC'`
  ——两类都是 cmd 批处理解析器对非 ASCII 内容/换行的解析怪癖
- v1.8.2 起 .bat = **纯 ASCII 内容 + CRLF 换行 + 无 BOM**，任何代码页/解析器下行为一致
- 窗口提示文字改为英文（属正常现象，中文说明见包内《使用说明-SMTC音乐.md》）

## 使用
1. 网页版：重开两次新标签页或 Ctrl+F5（Service Worker 换新）；扩展版：重装 v1.8.2 zip
2. ⌘K → 导入预设 → 选 `初始SMTC音乐预设.cshz`（覆盖旧版预设：先删旧的再导）
3. 解压 `ChuShi-SMTC-Delivery.zip` → 双击 `启动SMTC桥.bat` → dock 点「音乐」
"""

def api(path, method="GET", data=None, ctype="application/json"):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "rel-v182")
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
    req.add_header("User-Agent", "rel-v182")
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
