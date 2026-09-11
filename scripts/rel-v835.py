#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""rel-v835.py — GitHub Release v8.3.5 创建 + 七资产上传 + SHA 回读校验
用法: python3 /tmp/my-project/scripts/rel-v835.py
token 从 /tmp/my-project git remote origin URL 中提取，绝不打印。
"""
import hashlib
import json
import os
import subprocess
import time
import urllib.parse
import urllib.request

REPO = "LXgssy/Start-chushi"
WT = "/tmp/my-project"
DL = "/tmp/my-project/download/v8.3.5"
TAG = "v8.3.5"

RELEASE_NAME = "v8.3.5 —— 面板无反应根治（桥 Worker 心跳）+ 中文逐字重影根治 + seek 歌词快速对齐 + 高光不再照亮文字"

BODY = """## ① 音乐面板没反应：歌词卡住 / 下一首歌播一半才显示 / 控制没效果 —— 根治
- 真根因：桥的状态推送+命令拉取循环跑在网易云窗口页面里，网易云窗口最小化/后台时被 Chromium 强节流（可至 1/分钟）→ 桥停摆，回前台才恢复
- 桥 8.3.5：心跳搬进 Web Worker（后台不节流）驱动 beat/drainCmds，原 setInterval 兜底（幂等守卫双驱动无害）
- 控制响应：命令排空 200ms 专职循环 × Worker 心跳 = 网易云在后台也能秒级响应

## ② 中文歌逐字歌词重影（浮窗 + 面板）—— 根治
- 根因：逐字扫光「灰底字 + 白亮覆盖层」的覆盖层是 inline 相对定位内的绝对定位——包含块顶=字体 em box 顶，与底字 line box 基线差半行距 ≈3px；中文方块字笔画极敏感 = 重影（英文圆润笔画看不出）
- 修复：词壳 inline-block 化——包含块成真块盒，两层文本像素级重合（e2e 实测 42 对 Δ=0.00px）

## ③ 跳转进度条后歌词过快/过慢/要校准 —— 根治
- 收窗容差 ±2s→±0.8s：真值落点差一两秒也直接采纳 = 歌词跳一下
- 收窗瞬间 600ms smoothstep 平滑入轨（不再硬跳，前进/回退双向）
- 护航窗 4.5→3s + 桥 seek 读回终局即拍（真值提前 ~1s 到页面）；逐字/逐行统一受益

## ④ 高光照亮文字 —— 修复
- 内容件（歌名/歌词/时间/按钮）层级提到律动辉光之上（浮窗 7 件 / 面板 6 件）
- 高光语义不变：光仍在封面底下，不上封面

## 组件
- NewTab v8.3.5（必更）；**桥 8.3.5 必换**（Worker 心跳在桥里）；SMTC 音乐预设 8.3.5（必更——重影根治+提层）；歌词源 7.3.0 沿用无需动

## 回归
- v8.3.5 专项：浮窗 7/7（CDP 深穿 closed Shadow DOM，42 对词壳/覆盖层 Δ=0.00）+ 面板 9/9
- 存量全绿：v8.3.4 双 16/16+12/12、v8.3.3 双 11/11+9/9、v8.3.2 双 13/13+9/9"""
ASSETS = [
    "ChuShi-NewTab-v8.3.5.zip",
    "ChuShi-Music-Bridge-8.3.5.plugin",
    "ChuShi-Music-Preset-8.3.5.cshz",
    "ChuShi-Lyric-Source-7.3.0.plugin",
    "SHA256SUMS.txt",
    "ChuShi-v8.3.5-Usage-Notes.md",  # GitHub 资产名剥 CJK——中文名原件在仓库，资产一律 ASCII
    "ChuShi-v8.3.5-AllInOne.zip",
]

# 内容变过的资产必须强制重传（按名存在即跳会残留旧内容）
FORCE_REUPLOAD = {"ChuShi-v8.3.5-AllInOne.zip", "ChuShi-NewTab-v8.3.5.zip",
                  "ChuShi-Music-Preset-8.3.5.cshz", "ChuShi-Music-Bridge-8.3.5.plugin",
                  "SHA256SUMS.txt"}


def get_token():
    url = subprocess.check_output(
        ["git", "-C", WT, "config", "--get", "remote.origin.url"], text=True
    ).strip()
    start = url.find(":", url.find("https://") + 8) + 1
    end = url.rfind("@")
    tok = url[start:end]
    if not tok:
        raise SystemExit("FATAL: token not found in remote URL")
    return tok


def api(method, url, token, data=None, raw=None, ctype=None):
    h = {"Authorization": f"token {token}", "Accept": "application/vnd.github+json",
         "User-Agent": "rel-v835"}
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        h["Content-Type"] = "application/json"
    if raw is not None:
        body = raw
        h["Content-Type"] = ctype or "application/octet-stream"
    req = urllib.request.Request(url, data=body, method=method, headers=h)
    with urllib.request.urlopen(req) as r:
        payload = r.read()
    return json.loads(payload) if payload.strip().startswith(b"{") else {}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    token = get_token()

    # 1) local SHA self-check against SHA256SUMS.txt
    sums = {}
    for line in open(f"{DL}/SHA256SUMS.txt"):
        digest, name = line.split(maxsplit=1)
        sums[name.strip()] = digest
    for name, digest in sums.items():
        assert sha256(f"{DL}/{name}") == digest, f"local SHA mismatch: {name}"
    print(f"[1] local SHA self-check {len(sums)}/4 OK")

    # 2) create release (idempotent: reuse if exists)
    rel = {}
    try:
        rel = api("GET", f"https://api.github.com/repos/{REPO}/releases/tags/{TAG}", token)
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        print("[2] no existing release for tag — will create")
    if rel.get("tag_name") == TAG:
        print(f"[2] release {TAG} already exists (id={rel['id']}) — reuse")
    else:
        rel = api("POST", f"https://api.github.com/repos/{REPO}/releases", token,
                  data={"tag_name": TAG, "name": RELEASE_NAME, "body": BODY})
        print(f"[2] release created (id={rel['id']})")

    upload_base = rel["upload_url"].split("{")[0]
    assets_by_name = {a["name"]: a for a in rel.get("assets", [])}

    # 2b) delete stale/mangled assets + forced reuploads
    for name, asset in list(assets_by_name.items()):
        if name not in ASSETS or name in FORCE_REUPLOAD:
            api("DELETE", f"https://api.github.com/repos/{REPO}/releases/assets/{asset['id']}", token)
            print(f"[2b] deleted stale asset {name}")
            assets_by_name.pop(name)

    # 3) upload assets (skip existing unless forced)
    for name in ASSETS:
        if name in assets_by_name:
            print(f"[3] exists, skip {name}")
            continue
        path = f"{DL}/{name}"
        size = os.path.getsize(path)
        for attempt in (1, 2, 3):
            try:
                with open(path, "rb") as f:
                    api("POST", f"{upload_base}?name={urllib.parse.quote(name)}", token,
                        raw=f.read(), ctype="application/octet-stream")
                print(f"[3] uploaded {name} ({size} B)")
                break
            except Exception as e:
                print(f"[3] retry {attempt} {name}: {e}")
                time.sleep(3)
        else:
            raise SystemExit(f"upload failed: {name}")

    # 4) binary SHA readback 4/4
    rel2 = api("GET", f"https://api.github.com/repos/{REPO}/releases/tags/{TAG}", token)
    by = {a["name"]: a for a in rel2.get("assets", [])}
    missing = [n for n in ASSETS if n not in by]
    assert not missing, f"missing assets: {missing}"
    good = 0
    for name in ("ChuShi-NewTab-v8.3.5.zip", "ChuShi-Music-Preset-8.3.5.cshz",
                 "ChuShi-Music-Bridge-8.3.5.plugin", "ChuShi-Lyric-Source-7.3.0.plugin"):
        a = by[name]
        req = urllib.request.Request(a["browser_download_url"], headers={
            "Authorization": f"token {token}", "User-Agent": "rel-v835"})
        with urllib.request.urlopen(req) as r:
            remote = hashlib.sha256(r.read()).hexdigest()
        local = sha256(f"{DL}/{name}")
        status = "OK" if local == remote else "MISMATCH"
        good += local == remote
        print(f"[4] {name}: {status} ({a['size']} B)")
    assert good == 4, f"SHA readback {good}/4"
    print(f"RELEASE OK: {rel2['html_url']}  assets={len(by)}  sha {good}/4")


if __name__ == "__main__":
    main()
