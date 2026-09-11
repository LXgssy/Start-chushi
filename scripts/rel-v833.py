#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""rel-v833.py — GitHub Release v8.3.3 创建 + 七资产上传 + SHA 回读校验
用法: python3 /tmp/my-project/scripts/rel-v833.py
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
DL = "/home/z/my-project/download/v8.3.3"
TAG = "v8.3.3"

RELEASE_NAME = "v8.3.3 —— 高光归位（封面底下）+ 上一句模糊防重置 + 新标签页焦点归位"

BODY = """## ① 高光归位：高光只在封面底下，封面本身不再发亮
- 封面本体 brightness/saturate/contrast 滤镜整体退役（v8.2.7「封面提亮」路线废弃）——封面图恒定不动
- 律动能量全部改走封面背后的光晕层（浮窗与「初始」面板同律）：不透明度增益拉满（低音主推 0.68→0.85）、呼吸幅度加大、外圈加宽——光环只从封面四周晕出，弱歌也拳拳到肉

## ② 上一句歌词的模糊不再「重置」
- 已唱行常驻合成层：过渡结束瞬间的降层重栅格化（合成器实时模糊→原生烘焙模糊的质感阶跃）彻底消灭（像素取证：当前行边缘能量 46→71.6 突跳根除）
- 行界滞回门：位置源回跳（管线延迟、连续回退放行后软重锚入轨倒退）让行号翻转=上一行刚糊又重亮再糊一遍；现前进行照旧秒切，后退/间奏判定持续 650ms 才生效，拖动进度条零延迟（护航窗旁路）
- 浮窗内容脚本、「初始」面板、宿主预计算层（sandbox.js）三层同修；宿主门复位键=歌曲+歌词版本（快照对象每拍都是新的，拿对象身份做键=门失效，e2e 实锤后改律）

## ③ 新开「初始」标签页不再聚焦网址搜索栏
- Chrome 新标签默认把焦点交给地址栏；页面挂载后短窗内把焦点偷回页面（多次重试赢竞速）
- 直接敲字照样触发搜索（type-to-search），只在前 ~1.2s 抢，之后绝不和用户抢焦点

## 判据律对齐（取证器随法更新）
- F13b/G 套件：「封面随拍提亮」改判「封面恒定+辉光承拍」；F30a 对齐 v8.3.1 克制弹簧（微过冲 ∈ +[1,6]px）

## 组件
- NewTab v8.3.3（必更）；SMTC 音乐预设 8.3.3（必更——面板提层+辉光归位）；桥 8.3.1 / 歌词源 7.3.0 沿用无需动

## 回归
- v8.3.3 专项：浮窗 11/11 + 面板 9/9；存量：v8.2.7 全量 PASS + 律动 14/14 + 面板律动 7/7 + v8.3.0 ALL GREEN + v8.3.1 14/14 + v8.3.2 浮窗 9/9 面板 13/13"""

ASSETS = [
    "ChuShi-NewTab-v8.3.3.zip",
    "ChuShi-Music-Bridge-8.3.1.plugin",
    "ChuShi-Music-Preset-8.3.3.cshz",
    "ChuShi-Lyric-Source-7.3.0.plugin",
    "SHA256SUMS.txt",
    "ChuShi-v8.3.3-Usage-Notes.md",  # GitHub 资产名剥 CJK——中文名原件在仓库，资产一律 ASCII
    "ChuShi-v8.3.3-AllInOne.zip",
]

# 内容变过的资产必须强制重传（按名存在即跳会残留旧内容）
FORCE_REUPLOAD = {"ChuShi-v8.3.3-AllInOne.zip", "ChuShi-NewTab-v8.3.3.zip",
                  "ChuShi-Music-Preset-8.3.3.cshz", "SHA256SUMS.txt"}


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
         "User-Agent": "rel-v833"}
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
    for name in ("ChuShi-NewTab-v8.3.3.zip", "ChuShi-Music-Preset-8.3.3.cshz",
                 "ChuShi-Music-Bridge-8.3.1.plugin", "ChuShi-Lyric-Source-7.3.0.plugin"):
        a = by[name]
        req = urllib.request.Request(a["browser_download_url"], headers={
            "Authorization": f"token {token}", "User-Agent": "rel-v833"})
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
