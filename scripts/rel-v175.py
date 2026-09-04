#!/usr/bin/env python3
"""创建 GitHub Release v1.7.5 并上传扩展 zip + 音乐桥插件 zip"""
import json
import sys
import urllib.request
from pathlib import Path

TOKEN = Path("/home/z/my-project/.pkgtmp/gh-token").read_text().strip()
REPO = "LXgssy/Start-chushi"
DL = Path("/home/z/my-project/download/v1.7.5")

NOTES = """## v1.7.5 · 网易云音乐接入批

Dock 新增「音乐」面板：在网易云音乐装上 chromatic（BetterNCMII）与配套的「初始音乐桥」插件后，初始可实时显示正在播放的歌曲（封面/歌名/歌手/进度）并遥控播放（播放/暂停/上下曲/seek/音量）。

### 下载
- `ChuShi-NewTab-v1.7.5.zip` — Edge/Chrome MV3 扩展包
- `ChuShi-Music-Bridge-v1.0.0.zip` — 网易云音乐插件包（chromatic/BetterNCMII，含 bridge.dll 与安装说明）

### 安装（音乐接入三步）
1. 网易云音乐安装 [chromatic](https://github.com/std-microblock/chromatic) 插件管理器
2. 解压音乐桥 zip，放入 `C:\\betterncm\\plugins_dev\\`（或拖入插件管理界面）
3. 重启网易云 → 初始 → Dock「音乐」→ 自动连接

> 安全：桥服务仅绑定 127.0.0.1，Origin 白名单只放行扩展与初始线上域；不使用音乐面板则完全无感。

### 验证
网页版 21/21 · 扩展版 7/7 · bridge.dll llvm-mingw x64 零警告编译 + 协议对拍
"""


def api(url: str, data: dict | None = None, method: str = "GET", raw: bytes | None = None,
        ctype: str = "application/json"):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"token {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    if raw is not None:
        req.add_header("Content-Type", ctype)
        body = raw
    elif data is not None:
        body = json.dumps(data).encode()
    else:
        body = None
    with urllib.request.urlopen(req, body) as r:
        return json.loads(r.read().decode() or "{}")


# 1. 若 v1.7.5 release 已存在则复用
releases = api(f"https://api.github.com/repos/{REPO}/releases")
rid = next((r["id"] for r in releases if r["tag_name"] == "v1.7.5"), None)

if rid is None:
    rel = api(
        f"https://api.github.com/repos/{REPO}/releases",
        {
            "tag_name": "v1.7.5",
            "target_commitish": "main",
            "name": "v1.7.5 · 网易云音乐接入批",
            "body": NOTES,
            "draft": False,
            "prerelease": False,
        },
        method="POST",
    )
    rid = rel["id"]
print("release id:", rid)

# 2. 上传资产（已存在同名校验则跳过）
existing = {a["name"] for a in api(f"https://api.github.com/repos/{REPO}/releases/{rid}/assets")}
for fname in ["ChuShi-NewTab-v1.7.5.zip", "ChuShi-Music-Bridge-v1.0.0.zip"]:
    if fname in existing:
        print(f"{fname}: 已存在，跳过")
        continue
    blob = (DL / fname).read_bytes()
    url = f"https://uploads.github.com/repos/{REPO}/releases/{rid}/assets?name={fname}"
    res = api(url, raw=blob, method="POST", ctype="application/zip")
    print(f"{fname}: {res.get('state')} ({round(res.get('size', 0) / 1048576, 1)} MB)")
