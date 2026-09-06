# rel-v200.py — Release v2.0.0（统一面板舞台 + 核心内建音乐引擎 + 进度条冻结根治 + 桥 v1.3.0）
# 资产：SMTC 交付包 zip（桥 v1.3.0 + 歌词源插件 + 新 .cshz）+ 预设 .cshz + 扩展 zip。
# 幂等：建/更 Release + 删旧传新 + 直链 SHA-256 复核。
import hashlib, json, pathlib, sys, time, urllib.request, urllib.parse

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v2.0.0"
REPO = "LXgssy/Start-chushi"
API = f"https://api.github.com/repos/{REPO}/releases"

ASSETS = [
    (ROOT / "download/v2.0.0/ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (ROOT / "examples/初始SMTC音乐预设.cshz", "ChuShi-SMTC-Preset.cshz"),
    (ROOT / "download/v2.0.0/ChuShi-NewTab-v2.0.0.zip", "ChuShi-NewTab-v2.0.0.zip"),
]

NOTES = """# v2.0.0 · 统一面板舞台（切换动画衔接）+ 核心内建音乐引擎 + 进度条冻结根治

## 本轮修复（对应真机反馈）
- **进度条冻结根治（真机根因实锤）**：网易云的 SMTC Position 整首歌不上报（录屏实证钉死 0:00）——**桥 v1.3.0** 在源头做 LastUpdatedTime 时钟补偿，宿主对旧桥再做锚点保持兜底；verify 新增跨轮询回归（旧实现必回跳，新版单调前进）。**务必替换新桥**
- **切换动画衔接**：dock 音乐面板并入内建统一舞台——与待办/便签/设置等内建面板互切是**一次连续形变**（模糊聚拢/散场 + 高度宽度同弹簧，同一舞台节点），不再「内建淡出 → 空档 → 独立弹出」
- **打开/关闭模糊效果**：与内建面板同一套 content-focus/view-exit 模糊语言
- 打开白屏：部件视图随页面常驻预热（iframe 永不卸载），打开零白屏零重载

## 新能力：`chushi.music` 核心 API（预设开发者）
- SMTC 检测/歌词解析（yrc 逐字/lrc + 双语翻译对齐）/时钟插值/逐字时间戳对齐**全部内建进「初始」**
- 预设只写样式：`snapshot()/subscribe()` 拿离散快照，`now()` 每帧拿 `{position, progress, lineIndex, wordIndex, wordProgress, lineText, lineTr, wordText}`，`seek(s)` 自动乐观重锚——**用户零计算**
- 官方音乐预设 v3 同步瘦身（12875 字符），全部数据来自 `chushi.music`；旧 `chushi.smtc` 保持兼容

## 升级三件套
1. **网页版** Ctrl+F5（或重开两次新标签页）；**扩展版**重装 v2.0.0 zip
2. 解压 `ChuShi-SMTC-Delivery.zip` → 双击 `启动SMTC桥.bat`（**桥 v1.3.0，老桥请整目录替换**）
3. ⌘K → 导入预设 → 选 `初始SMTC音乐预设.cshz`（旧版音乐预设先删除再导入）
4. （逐字歌词）把 `初始歌词源-1.0.0.plugin` 放进 BetterNCM 的 plugins 文件夹 → 重启网易云

> 桥脚本 .bat 维持纯 ASCII + CRLF 终极形态；歌词源未就绪时歌词区自动收起，其余功能不受影响。
"""

def api(path, method="GET", data=None, ctype="application/json"):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "rel-v200")
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
    api(f"/releases/{rel['id']}", "PATCH", {"body": NOTES, "name": f"v2.0.0 · 统一面板舞台 + 音乐引擎 + 进度条冻结根治"})
    rel_id = rel["id"]
else:
    rel = api("", "POST", {"tag_name": TAG, "name": "v2.0.0 · 统一面板舞台 + 音乐引擎 + 进度条冻结根治", "body": NOTES, "draft": False, "prerelease": False})
    rel_id = rel["id"]
    print(f"release created id={rel_id}")

want = {name: (src, sha256(src)) for src, name in ASSETS}
have = {a["name"]: a["id"] for a in api(f"/releases/{rel_id}/assets")}
for name, (src, digest) in want.items():
    if name in have:
        api(f"/releases/assets/{have[name]}", "DELETE")
        print(f"del old asset {name}")
        time.sleep(1)
    q = urllib.parse.quote(name)
    data = src.read_bytes()
    req = urllib.request.Request(f"{API}/releases/{rel_id}/assets?name={q}", method="POST", data=data)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/octet-stream")
    req.add_header("User-Agent", "rel-v200")
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
