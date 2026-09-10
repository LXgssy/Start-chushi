#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.2.5 Release：GH API 创建 Release、上传七资产、直链 SHA-256 回读对拍。
（沿用 rel-v824.py 律：资产上传走 uploads 域；token 路径适配本轮 .pkgtmp。）"""
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

BODY = """「初始」v8.2.5——电流音根治·引擎零扰律

**v8.2.4 实测电音依旧后的真凶抓到了（「关扩展/移桥即消」对照实验 + spectrum-log 实锤）**

日志实锤：零消费者（served=0）时助手仍每 5 秒一次「设备失效 0x88890004 → 重初始化」——
loopback 采集客户端的反复挂载/摘除本身就是对音频引擎的折腾：驱动对「无活跃流」端点节能拉闸，
重初始化又把端点唤醒，扬声器被反复上下电 = 你听到的电流音。

**引擎零扰律四刀**：
1. **需求门挡在引擎门口**——零消费者连 COM 都不初始化、绝不创建 loopback；link 断开的重试同门。引擎上零客户端 = 驱动彻底安静
2. **退避真实化**——连上后稳定 ≥60s 才算健康；不到就断 = 驱动拉闸风暴，重试 800ms→30s 封顶逐级退避
3. **撤 v8.2.4 误加的 MMCSS "Pro Audio"**——采集线程改 BELOW_NORMAL 让核；hub 中继/keeper 线程（网易云进程内）同步降级
4. **全链 20Hz**——SW/宿主轮询 33ms→50ms（回环请求 -33%）、FFT 50ms 节拍（DSP CPU -80%）；律动顺滑度无感

**升级两件**：桥 8.2.5（替换后**重启网易云**）+ NewTab v8.2.5；cshz 8.2.4 / 歌词源 7.3.0 沿用。
详见 ChuShi-v8.2.5-Usage-Notes.md。验证：宪法门双架构过 + DSP 数学门 4/4 + e2e 24/24 全绿。"""

def deliver(tag, srcdir, expected):
    try:
        rel = api("GET", f"/releases/tags/{tag}")
    except urllib.error.HTTPError as e:
        if e.code != 404: raise
        rel = api("POST", "/releases", {"tag_name": tag, "name": tag, "body": BODY})
    rid = rel["id"]
    have = {a["name"] for a in rel.get("assets", [])}
    print(f"[{tag}] release id={rid} existing={sorted(have)}")
    for fname, ctype in expected:
        p = pathlib.Path(srcdir) / fname
        if not p.exists(): raise SystemExit(f"缺资产 {p}")
        if fname in have:
            print(f"  skip {fname}"); continue
        data = p.read_bytes()
        upload(rel["upload_url"], fname, data, ctype)
        print(f"  uploaded {fname} ({len(data)} B)")
    ok = True
    rel = api("GET", f"/releases/tags/{tag}")
    for a in rel["assets"]:
        direct = f"https://github.com/{REPO}/releases/download/{tag}/{a['name']}"
        req = urllib.request.Request(direct, headers={"User-Agent": "chushi-rel"})
        with urllib.request.urlopen(req) as r:
            got = r.read()
        match = sha256(got) == sha256((pathlib.Path(srcdir) / a["name"]).read_bytes())
        ok &= match
        print(f"  verify {a['name']}: {'OK' if match else 'MISMATCH'}")
    return ok

V = "8.2.5"
ASSETS = [
    (f"ChuShi-Music-Bridge-{V}.plugin", "application/octet-stream"),
    ("ChuShi-Lyric-Source-7.3.0.plugin", "application/octet-stream"),
    (f"ChuShi-NewTab-v{V}.zip", "application/zip"),
    ("ChuShi-Music-Preset-8.2.4.cshz", "application/octet-stream"),
    (f"ChuShi-v{V}-Usage-Notes.md", "text/markdown"),
    ("SHA256SUMS.txt", "text/plain"),
    (f"ChuShi-v{V}-AllInOne.zip", "application/zip"),
]
ok = deliver(f"v{V}", "/tmp/my-project/download/v8.2.5", ASSETS)
print("RELEASE " + ("OK" if ok else "FAIL"))
print("URL: https://github.com/LXgssy/Start-chushi/releases/tag/v8.2.5")
sys.exit(0 if ok else 1)
