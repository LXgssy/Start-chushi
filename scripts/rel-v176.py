#!/usr/bin/env python3
"""创建 GitHub Release v1.7.6 并上传扩展 zip + 音乐桥插件 zip"""
import json
import sys
import urllib.request
from pathlib import Path

TOKEN = Path("/home/z/my-project/.pkgtmp/gh-token").read_text().strip()
REPO = "LXgssy/Start-chushi"
DL = Path("/home/z/my-project/download/v1.7.6")

NOTES = """## v1.7.6 · 桥接独立版批（摆脱 BetterNCM 框架）

BetterNCM（chromatic）已停更于网易云（作者弃坑、chromatic 2.0 无二进制发布，最后一版 1.3.4 无法适配新客户端——这正是「桥接插件装了没反应」的根因）。本版将「初始音乐桥」升级为**独立版 ChuShiBridge**：

- **ChuShiBridge.exe**：以 CEF 调试端口替代 CEF 内部 hook，不随网易云升级失效；页内桥三路采集播放状态（dva store + 原生事件 + 媒体元素）；127.0.0.1:10754 API 与 v1.7.5 插件版完全同契约；新增 `/api/debug` 排障端点与 bridge.log 日志
- **msimg32.dll 装载器**：BetterNCM 同款劫持位，但只做 PEB 命令行追加（幂等、仅主进程、零指令 patch）——双击网易云原图标也能开启桥接
- **一键安装/卸载**：定位网易云 → x64 架构检查 → 装载器备份替换 → 桌面快捷方式 → 可选自启 → 自动重启网易云 → 60s 健康检查
- 音乐面板接入指引改为三步（下载安装包 → 双击安装 → 重试连接），旧版客户端（2.x/3.0.x）保留 chromatic 插件路线

### 下载
- `ChuShi-NewTab-v1.7.6.zip` — Edge/Chrome MV3 扩展包
- `ChuShiBridge-2.0.0-Setup.zip` — 初始音乐桥·独立版一键安装包（Windows x64，不依赖任何框架）

### 验证
页内桥假 NCM 世界对拍 37/37 · 网页回归 21/21 · 专项 13/13 · 扩展冒烟 7/7 · 双二进制 llvm-mingw x64 零警告 + 导出表 5/5 自检

### License 说明
本包全部代码为原创实现（不含 BetterNCM/chromatic 代码）；BetterNCM v2 分支（BetterNCMII 1.3.4）为 GPL-3.0，允许修改并发布到自己仓库（需同协议开源并保留版权声明）；chromatic master 无 license 文件（默认保留所有权利），不建议基于其修改再分发。
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


# 1. 若 v1.7.6 release 已存在则复用
releases = api(f"https://api.github.com/repos/{REPO}/releases")
rid = next((r["id"] for r in releases if r["tag_name"] == "v1.7.6"), None)

if rid is None:
    rel = api(
        f"https://api.github.com/repos/{REPO}/releases",
        {
            "tag_name": "v1.7.6",
            "target_commitish": "main",
            "name": "v1.7.6 · 网易云音乐接入批",
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
for fname in ["ChuShi-NewTab-v1.7.6.zip", "ChuShiBridge-2.0.0-Setup.zip"]:
    if fname in existing:
        print(f"{fname}: 已存在，跳过")
        continue
    blob = (DL / fname).read_bytes()
    url = f"https://uploads.github.com/repos/{REPO}/releases/{rid}/assets?name={fname}"
    res = api(url, raw=blob, method="POST", ctype="application/zip")
    print(f"{fname}: {res.get('state')} ({round(res.get('size', 0) / 1048576, 1)} MB)")
