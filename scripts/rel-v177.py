#!/usr/bin/env python3
# rel-v177.py — Release v1.7.7 创建（幂等）：音乐面板翻新 + 音乐桥 1.3.0 控制链路修复
# 资产：扩展 zip / .plugin 官方包 / 插件 dev zip / 独立版 Setup / BetterNCM 合并交付包
# 上传后逐一 curl 直链复核 SHA-256（r4 律）
import os, sys, json, hashlib, time, urllib.request

ROOT = "/home/z/my-project"
TOKEN = open(f"{ROOT}/.pkgtmp/gh-token").read().strip()
REPO = "LXgssy/Start-chushi"
TAG = "v1.7.7"
DL = f"{ROOT}/download/v1.7.7"
ASSETS = [
    # (Release 资产名[必须 ASCII——GitHub 会剥离中文], 本地文件名, Content-Type)
    ("ChuShi-NewTab-v1.7.7.zip", "ChuShi-NewTab-v1.7.7.zip", "application/zip"),
    ("ChuShi-MusicBridge-1.3.0.plugin", "ChuShi-MusicBridge-1.3.0.plugin", "application/zip"),
    ("ChuShi-MusicBridge-1.3.0-folder.zip", "初始音乐桥-插件-1.3.0.zip", "application/zip"),
    ("ChuShiBridge-2.0.0-Setup.zip", "ChuShiBridge-2.0.0-Setup.zip", "application/zip"),
    ("ChuShi-MusicBridge-BetterNCM-1.3.0-bundle.zip", "ChuShi-音乐桥-BetterNCM-交付包.zip", "application/zip"),
]
NOTES = """## v1.7.7 — 音乐桥 1.3.0 控制链路修复 + 音乐面板翻新

### ★ 修复「网页上无法控制网易云音乐」的根因
bridge.dll 1.2.0 及之前把「初始」发来的控制命令文件误写到 `chushi-music\\` 根目录（少拼 `\\cmd` 子目录），而插件 JS 只轮询 `cmd\\` 子目录——**命令永远不被网易云执行，接口却返回成功**。表现：面板显示正常、`/api/debug` 诊断全绿，但播放/暂停/切歌/进度/音量全部无效。

- 1.3.0 修正落盘路径；插件侧兼扫根目录残留 + 启动清扫（旧 DLL 未升级也能控）
- 控制命令执行后 420ms 校验实际效果，未生效时直接驱动媒体元素兜底
- state.json 增加 5s 强制心跳：暂停不再零写盘，`stateAgeMs` 恒 <5s 成为「桥活着」的可靠信号（1.2.x 暂停时该值持续增大属已知现象）
- 原子写管道补 rename 响应校验，写盘失败必回落直写

### 音乐面板翻新（v1.7.7）
- 大封面 + 播放态光晕、专辑信息行
- 新增**诊断卡**：桥版本 / 三源状态 / 状态文件年龄一目了然，「复制诊断」一键回传 `/api/debug` JSON 排障，状态陈旧时自动提示升级 1.3.0
- 接入指引改回 BetterNCM 插件路线主推（`.plugin` 与官方插件商店同构），独立版 ChuShiBridge 继续兜底

### 音乐桥插件升级方法（1.2.0 → 1.3.0）
删除 `C:\\betterncm\\plugins\\ChuShi-MusicBridge-1.2.0.plugin` → 放入 `ChuShi-MusicBridge-1.3.0.plugin` → 完全退出并重启网易云音乐。

### 资产说明
| 文件 | 用途 |
|------|------|
| `ChuShi-NewTab-v1.7.7.zip` | 「初始」MV3 扩展（Edge/Chrome） |
| `ChuShi-MusicBridge-1.3.0.plugin` | 初始音乐桥插件官方安装包（放 `C:\\betterncm\\plugins\\`） |
| `ChuShi-MusicBridge-1.3.0-folder.zip` | 插件文件夹版（`plugins_dev` 开发者路线，即「初始音乐桥-插件-1.3.0.zip」，文件内容相同） |
| `ChuShiBridge-2.0.0-Setup.zip` | 独立版 ChuShiBridge 一键安装包（2.0.4，不依赖框架的兜底路线） |
| `ChuShi-MusicBridge-BetterNCM-1.3.0-bundle.zip` | 插件三件 + 安装指南的合并包（即「ChuShi-音乐桥-BetterNCM-交付包.zip」，内容相同） |

网页版已同步上线：https://lxgssy.github.io/Start-chushi/
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

import urllib.parse, urllib.error

# 1. 幂等取/建 Release
st, rel = api("GET", f"/repos/{REPO}/releases/tags/{TAG}")
if st == 200:
    rel_id = rel["id"]
    print(f"== Release {TAG} 已存在 id={rel_id}，更新 notes")
    api("PATCH", f"/repos/{REPO}/releases/{rel_id}", {"body": NOTES, "name": "v1.7.7 音乐面板翻新 + 音乐桥 1.3.0"})
else:
    st, rel = api("POST", f"/repos/{REPO}/releases", {
        "tag_name": TAG, "target_commitish": "main", "name": "v1.7.7 音乐面板翻新 + 音乐桥 1.3.0",
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
