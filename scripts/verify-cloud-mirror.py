#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""云端镜像全量端到端核验（模拟 ext-bg.js snapCheck 真实行为）。

对 SNAP_MIRRORS[0] 的 version.json 逐文件下载，与本地快照载荷做
尺寸（manifest.s）+ SHA256（本地 zip 解包内容）双校验。全绿 = 更新器
首装即可从该镜像完成一次完整云端更新。

用法: python3 scripts/verify-cloud-mirror.py [载荷zip路径]
      缺省自动取 download/ 下最新 ChuShi-CloudSnapshot-v*.zip
"""
import glob
import hashlib
import json
import sys
import urllib.request
import zipfile

MIRROR = "https://lxgssy.github.io/Start-chushi"

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "cs-mirror-verify/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def main():
    if len(sys.argv) > 1:
        payload = sys.argv[1]
    else:
        cands = sorted(glob.glob("/tmp/my-project/download/v*/ChuShi-CloudSnapshot-v*.zip"))
        if not cands:
            sys.exit("未找到 ChuShi-CloudSnapshot 载荷")
        payload = cands[-1]
    print(f"镜像: {MIRROR}\n载荷: {payload}")
    zf = zipfile.ZipFile(payload)
    local = {n: zf.read(n) for n in zf.namelist() if not n.endswith("/")}
    ver = json.loads(fetch(MIRROR + "/version.json").decode("utf-8"))
    print(f"线上 version.json: v={ver['v']} files={len(ver['files'])}")
    fails = []
    for i, f in enumerate(ver["files"], 1):
        p, s = f["p"], f["s"]
        try:
            buf = fetch(MIRROR + "/" + p)
        except Exception as e:
            fails.append(f"{p}: FETCH FAIL {e}")
            print(f"[{i:02d}/{len(ver['files'])}] {p}: FETCH FAIL")
            continue
        ok_s = (s == 0) or (len(buf) == s)
        ok_h = p in local and hashlib.sha256(buf).hexdigest() == hashlib.sha256(local[p]).hexdigest()
        if not (ok_s and ok_h):
            fails.append(f"{p}: size={len(buf)} expect={s} sha_ok={ok_h}")
            print(f"[{i:02d}/{len(ver['files'])}] BAD {p} {len(buf)}B")
    print("=" * 48)
    if fails:
        print(f"FAIL {len(fails)} 项:")
        for x in fails:
            print("  -", x)
        sys.exit(1)
    print(f"ALL-GREEN：{len(ver['files'])} 文件尺寸+SHA256 全部与本地载荷一致，镜像可用")

if __name__ == "__main__":
    main()
