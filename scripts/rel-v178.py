#!/usr/bin/env python3
# rel-v178.py — Release v1.7.8 创建（幂等）：音乐面板端口自动发现（插件改端口后面板自动跟随）
# 资产：扩展 zip v1.7.8 / .plugin 官方包 / 插件 dev zip / 独立版 Setup / BetterNCM 合并交付包（后四者与 v1.7.7 同物，重传保证 latest 直链齐全）
# 上传后逐一 curl 直链复核 SHA-256（r4 律）
import os, sys, json, hashlib, time, urllib.request, urllib.parse, urllib.error

ROOT = "/home/z/my-project"
TOKEN = open(f"{ROOT}/.pkgtmp/gh-token").read().strip()
REPO = "LXgssy/Start-chushi"
TAG = "v1.7.8"
DL = f"{ROOT}/download/v1.7.8"
ASSETS = [
    # (Release 资产名[必须 ASCII——GitHub 会剥离中文], 本地文件名, Content-Type)
    ("ChuShi-NewTab-v1.7.8.zip", "ChuShi-NewTab-v1.7.8.zip", "application/zip"),
    ("ChuShi-MusicBridge-1.3.0.plugin", "ChuShi-MusicBridge-1.3.0.plugin", "application/zip"),
    ("ChuShi-MusicBridge-1.3.0-folder.zip", "初始音乐桥-插件-1.3.0.zip", "application/zip"),
    ("ChuShiBridge-2.0.0-Setup.zip", "ChuShiBridge-2.0.0-Setup.zip", "application/zip"),
    ("ChuShi-MusicBridge-BetterNCM-1.3.0-bundle.zip", "ChuShi-音乐桥-BetterNCM-交付包.zip", "application/zip"),
]
NOTES = """## v1.7.8 — 音乐面板端口自动发现（插件改端口，面板自动跟随）

### ★ 修复「改了服务端口后面板连不上」
初始音乐桥插件设置页支持改「服务端口」（默认 10754），但改完后「初始」面板仍敲旧端口，永远连不上。

- 面板保存地址连不上时，**自动扫描常见端口（10754 / 8008）**，命中即接入并记住（下次直连）
- 扫描用 `/api/ping` 的 `name=chushi-music-bridge` 精确校验，**不会误认占用端口的其它程序**
- 运行中桥断了也会自动走扫描重连；错误提示给出自动扫描范围与自定义端口填法
- 诊断卡端口回显为**实连端口**，一眼确认连到了哪

### 插件侧（1.3.0，未变动）
控制链路根因修复（命令落盘路径错位）+ 5s 状态心跳（`stateAgeMs` 恒 <5s = 桥存活的可靠信号）。仍在 1.2.0 的用户请先升级插件（见下）。

### 资产说明
| 文件 | 用途 |
|------|------|
| `ChuShi-NewTab-v1.7.8.zip` | 「初始」MV3 扩展（Edge/Chrome）——**本次更新本体** |
| `ChuShi-MusicBridge-1.3.0.plugin` | 初始音乐桥插件官方安装包（放 `C:\\betterncm\\plugins\\`，与 v1.7.7 相同） |
| `ChuShi-MusicBridge-1.3.0-folder.zip` | 插件文件夹版（`plugins_dev` 开发者路线） |
| `ChuShiBridge-2.0.0-Setup.zip` | 独立版 ChuShiBridge 一键安装包（2.0.4，不依赖框架的兜底路线） |
| `ChuShi-MusicBridge-BetterNCM-1.3.0-bundle.zip` | 插件三件 + 安装指南的合并包 |

网页版已同步上线（Service Worker 会自动换新，打开两次或 Ctrl+F5 即可）：https://lxgssy.github.io/Start-chushi/

### 升级方法
- **网页版**：无操作，自动更新（关掉标签页重开一次）
- **扩展版**：下载 `ChuShi-NewTab-v1.7.8.zip` 解压覆盖 → 扩展管理页「重新加载」
- **插件仍为 1.2.0 的**：删 `C:\\betterncm\\plugins\\ChuShi-MusicBridge-1.2.0.plugin` → 放入 1.3.0 `.plugin` → 完全退出重启网易云
"""

API = "https://api.github.com"

def api(method, path, data=None):
    url = f"{API}{path}"
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"token {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "chushi-rel")
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read()
            return r.status, (json.loads(txt) if txt.strip().startswith(b"{") or txt.strip().startswith(b"[") else txt)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]

def upload(rel_id, name, path, ctype):
    size = os.path.getsize(path)
    data = open(path, "rb").read()
    req = urllib.request.Request(
        f"https://uploads.github.com/repos/{REPO}/releases/{rel_id}/assets?name={urllib.parse.quote(name)}",
        data=data, method="POST")
    req.add_header("Authorization", f"token {TOKEN}")
    req.add_header("Content-Type", ctype)
    req.add_header("Content-Length", str(size))
    req.add_header("User-Agent", "chushi-rel")
    with urllib.request.urlopen(req) as r:
        a = json.loads(r.read())
        print(f"  上传 {name}: id={a['id']} size={a['size']} state={a['state']}")
        assert a["size"] == size, f"{name} 大小不一致"

# 1. 幂等取/建 Release
st, rel = api("GET", f"/repos/{REPO}/releases/tags/{TAG}")
if st == 200:
    rel_id = rel["id"]
    print(f"== Release {TAG} 已存在 id={rel_id}，更新 notes")
    api("PATCH", f"/repos/{REPO}/releases/{rel_id}", {"body": NOTES, "name": "v1.7.8 音乐面板端口自动发现"})
else:
    st, rel = api("POST", f"/repos/{REPO}/releases", {
        "tag_name": TAG, "target_commitish": "main", "name": "v1.7.8 音乐面板端口自动发现",
        "body": NOTES, "draft": False, "prerelease": False})
    assert st == 201, f"建 Release 失败: {rel}"
    rel_id = rel["id"]
    print(f"== Release {TAG} 创建 id={rel_id}")

# 2. 资产幂等上传（同名先删后传；并清理 GitHub 剥离中文名产生的烂名残留）
st, rel = api("GET", f"/repos/{REPO}/releases/{rel_id}")
expected = {n for n, _, _ in ASSETS}
existing = {a["name"]: a["id"] for a in rel["assets"]}
for stale_name, aid in existing.items():
    if stale_name not in expected:
        api("DELETE", f"/repos/{REPO}/releases/assets/{aid}")
        print(f"  清理烂名残留 {stale_name!r}")
        time.sleep(2)
st, rel = api("GET", f"/repos/{REPO}/releases/{rel_id}")
existing = {a["name"]: a["id"] for a in rel["assets"]}
for name, _local, ctype in ASSETS:
    if name in existing:
        api("DELETE", f"/repos/{REPO}/releases/assets/{existing[name]}")
        print(f"  删旧 {name}")
        time.sleep(3)   # 删除传播窗口，防同名重传 422
    upload(rel_id, name, f"{DL}/{_local}", ctype)
    time.sleep(1)

# 3. 直链复核 SHA-256（r4 律；404/瞬时失败重试，CDN 传播有延迟）
print("== 直链复核 ==")
ok = True
for _name, _local, _ctype in ASSETS:
    url = f"https://github.com/{REPO}/releases/download/{TAG}/{urllib.parse.quote(_name)}"
    local = f"{DL}/{_local}"
    lh = hashlib.sha256(open(local, "rb").read()).hexdigest()
    rh = None
    for attempt in range(6):
        try:
            req = urllib.request.Request(url)
            req.add_header("User-Agent", "chushi-rel")
            rh = hashlib.sha256(urllib.request.urlopen(req).read()).hexdigest()
            break
        except Exception as e:
            print(f"  [{_name}] 第{attempt + 1}次失败: {e}，5s 后重试")
            time.sleep(5)
    if rh is None:
        ok = False
        print(f"  [FAIL ] {_name} 直链始终 404")
        continue
    tag = "OK " if lh == rh else "MISMATCH"
    if lh != rh: ok = False
    print(f"  [{tag}] {_name}  {rh[:12]}…")
print("ALL OK" if ok else "HAS MISMATCH")
sys.exit(0 if ok else 1)
