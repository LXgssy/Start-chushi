#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.6 Release：GH API 创建 Release、上传七资产、直链 SHA-256 回读对拍。
（沿用 rel-v825.py 律：资产上传走 uploads 域；token 自 .pkgtmp/gh-token。）"""
import hashlib, json, pathlib, sys, urllib.request, urllib.error

TOKEN = pathlib.Path("/home/z/my-project/.pkgtmp/gh-token").read_text().strip()
REPO = "LXgssy/Start-chushi"
API = f"https://api.github.com/repos/{REPO}"
UA = {"User-Agent": "chushi-rel", "Authorization": f"token {TOKEN}"}

def api(method, path, payload=None):
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(payload).encode() if payload else None)
    for k, v in UA.items(): req.add_header(k, v)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b"{}")

def upload(url_base, name, data, ctype):
    url = url_base.replace("{?name,label}", f"?name={name}")
    req = urllib.request.Request(url, method="POST", data=data)
    for k, v in UA.items(): req.add_header(k, v)
    req.add_header("Content-Type", ctype)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def sha256(b): return hashlib.sha256(b).hexdigest()

BODY = """「初始」v8.2.6——性能特供：「5070 卡成屎」根治（渲染休眠律）

**你问「插件在后台跑什么」——三层（全部只听本机回环）**：网易云插件（hub.dll 媒体中继 + chushi-spectrum.exe 音频采集/FFT + 歌词源）+ 扩展 Service Worker（状态/频谱轮询）+ 每个网页里的悬浮卡（渲染循环）。

**卡的三个真凶（按贡献排序）**：
1. **spectrum 死亡循环**（你的日志实锤：3 小时启动 71 次/自杀 69 次 + 设备失效 800ms 重连风暴）——**v8.2.5 桥早已根治，但日志证明你机器还在跑 v8.2.2/v8.2.3，一直没装上！本轮必须换桥 8.2.5 + 重启网易云**
2. **悬浮卡渲染循环永不休眠**——前台标签 60fps 全帧跑（Chrome 只暂停后台标签 rAF）。v8.2.6 改按需唤醒：没放歌循环整个睡掉；标准/封面态走针降 5Hz；完全体逐字与辉光律动才用 60fps
3. **频谱消息风暴**——暂停时每秒 20 条空消息全量广播 + 每个标签都订阅。v8.2.6：频谱帧只发「可见且订阅」的浮窗 + 空消息翻转门 + 标签切后台自动撤订阅 + 浏览器整体后台时扩展全链静默（hub 零请求）

**升级**：NewTab v8.2.6 必装；桥 8.2.5 必换（若未装）+ 重启网易云；cshz 8.2.4 / 歌词源 7.3.0 沿用。
验证：e2e 24/24 全绿（走针/辉光/歌词保持/三态/拖动全兼容）；gh-pages 已随动（线上 bundle 实测含 8.2.6）。
详见 ChuShi-v8.2.6-Usage-Notes.md（含「装完怎么自查」）。"""

def deliver(tag, srcdir, expected):
    try:
        rel = api("GET", f"/releases/tags/{tag}")
    except urllib.error.HTTPError:
        rel = api("POST", "/releases", {
            "tag_name": tag, "name": "「初始」v8.2.6 — 性能特供（渲染休眠律）",
            "body": BODY, "draft": False, "prerelease": False,
        })
    rel_id, up = rel["id"], rel["upload_url"]
    got = {a["name"] for a in rel.get("assets", [])}
    for name in expected:
        p = srcdir / name
        data = p.read_bytes()
        if name in got:
            print(f"  skip(已有) {name}")
        else:
            ctype = "application/zip" if name.endswith(".zip") else "application/octet-stream"
            if name.endswith(".md"): ctype = "text/markdown"
            upload(up, name, data, ctype)
            print(f"  uploaded {name} ({len(data)} B)")
    print("==> SHA-256 直链回读对拍 ...")
    ok = 0
    for name in expected:
        url = f"https://github.com/{REPO}/releases/download/{tag}/{name}"
        for attempt in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                    remote = r.read()
                break
            except Exception as e:
                if attempt == 2: raise
        local = sha256((srcdir / name).read_bytes())
        match = sha256(remote) == local
        ok += match
        print(f"  {'OK ' if match else 'FAIL'} {name}")
    if ok != len(expected):
        sys.exit("SHA 对拍未全过——拒绝宣布完成")
    print(f"RELEASE {tag} DONE: {ok}/{len(expected)} 资产回读一致")

SRC = pathlib.Path("/tmp/my-project/download/v8.2.6")
EXPECTED = [
    "ChuShi-NewTab-v8.2.6.zip",
    "ChuShi-Music-Bridge-8.2.5.plugin",
    "ChuShi-Music-Preset-8.2.4.cshz",
    "ChuShi-Lyric-Source-7.3.0.plugin",
    "ChuShi-v8.2.6-Usage-Notes.md",
    "SHA256SUMS.txt",
    "ChuShi-v8.2.6-AllInOne.zip",
]
deliver("v8.2.6", SRC, EXPECTED)
