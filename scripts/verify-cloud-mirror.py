#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""云端镜像全量逐文件核验（模拟 ext-bg.js snapCheck 的真实行为）

从 SNAP_MIRRORS[0] 的 version.json 逐文件拉取，与本地快照载荷对
（尺寸 manifest.s + SHA256），并对 zip 内缺失做双重校验。全绿 = 已装扩展
可从该镜像拿到一份完整的云端更新。

用法: python3 scripts/verify-cloud-mirror.py [载荷zip路径]
      缺省自动取 download/ 下最新的 ChuShi-CloudSnapshot-v*.zip

v8.6.7 加固（云推 v8.6.6 实测踩到）：
  GitHub Pages 的 CDN 在连续抓取 70+ 文件时会偶发
  「Connection reset by peer」——每轮命中的文件都不一样，属传输抖动而非内容问题。
  此前一次 RESET 就直接判 FAIL，导致镜像其实已经正确上线、CI 却连红 6 轮。
  现改为：单文件最多 6 次重试（指数退避 + 显式关闭连接避免复用陈旧 keep-alive），
  只有「重试后仍拿不到」或「拿到但尺寸/SHA256 不符」才算真失败。
"""
import glob
import hashlib
import json
import sys
import time
import urllib.request
import zipfile

MIRROR = "https://lxgssy.github.io/Start-chushi"
TRIES = 6
BACKOFF = (0.6, 1.2, 2.5, 4.0, 6.0)


def fetch_once(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "cs-mirror-verify/1.0",
        "Cache-Control": "no-cache",
        "Connection": "close",          # 不复用连接：陈旧 keep-alive 是 RESET 的主因
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        buf = r.read()
        n = r.headers.get("Content-Length")
        if n is not None and int(n) != len(buf):
            raise IOError("短读: 收到 %d 字节, Content-Length=%s" % (len(buf), n))
        return buf


def fetch(url):
    """带退避重试的抓取；全部失败才抛最后一个异常。"""
    last = None
    for i in range(TRIES):
        try:
            return fetch_once(url)
        except Exception as e:                       # URLError / HTTPError / 短读
            last = e
            if i < TRIES - 1:
                time.sleep(BACKOFF[min(i, len(BACKOFF) - 1)])
    raise last


def main():
    if len(sys.argv) > 1:
        payload = sys.argv[1]
    else:
        cands = sorted(glob.glob("/tmp/my-project/download/v*/ChuShi-CloudSnapshot-v*.zip"))
        if not cands:
            sys.exit("未找到 ChuShi-CloudSnapshot 载荷")
        payload = cands[-1]
    print("镜像: %s\n载荷: %s" % (MIRROR, payload))
    zf = zipfile.ZipFile(payload)
    local = {n: zf.read(n) for n in zf.namelist() if not n.endswith("/")}
    local_sha = {p: hashlib.sha256(b).hexdigest() for p, b in local.items()}
    ver = json.loads(fetch(MIRROR + "/version.json").decode("utf-8"))
    print("线上 version.json: v=%s files=%d" % (ver["v"], len(ver["files"])))
    fails = []
    retried = 0
    for i, f in enumerate(ver["files"], 1):
        p, s = f["p"], f["s"]
        try:
            buf = fetch(MIRROR + "/" + p)
        except Exception as e:
            fails.append("%s: FETCH FAIL %s" % (p, e))
            print("[%02d/%d] %s: FETCH FAIL（重试 %d 次后仍失败）" % (i, len(ver["files"]), p, TRIES))
            continue
        ok_s = (s == 0) or (len(buf) == s)
        ok_h = p in local and hashlib.sha256(buf).hexdigest() == local_sha[p]
        if not (ok_s and ok_h):
            fails.append("%s: size=%d expect=%s sha_ok=%s" % (p, len(buf), s, ok_h))
            print("[%02d/%d] BAD %s %dB" % (i, len(ver["files"]), p, len(buf)))
    print("=" * 48)
    if fails:
        print("FAIL %d 项:" % len(fails))
        for x in fails:
            print("  -", x)
        sys.exit(1)
    print("ALL-GREEN：%d 个文件尺寸 + SHA256 全部与本地载荷逐字节一致，云推可用。" % len(ver["files"]))


if __name__ == "__main__":
    main()
