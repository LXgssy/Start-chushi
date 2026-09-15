#!/usr/bin/env python3
# 线上镜像自洽核验：以【线上 version.json】为基准，逐文件拉取核对 尺寸+SHA256
# （不依赖本地 zip——CI 与本地构建 buildId 必然不同，v8.6.1 双部署的坑录）
import json, hashlib, urllib.request, sys

BASE = "https://lxgssy.github.io/Start-chushi"
req = urllib.request.Request(BASE + "/version.json", headers={"User-Agent": "curl/8"})
manifest = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
files = manifest["files"]
print(f"线上 version.json: v={manifest['v']} files={len(files)}")

bad, good = [], 0
sample_limit = int(sys.argv[1]) if len(sys.argv) > 1 else len(files)
for i, f in enumerate(files):
    if i >= sample_limit:
        break
    p, s = f["p"], f["s"]
    try:
        r = urllib.request.Request(f"{BASE}/{p}", headers={"User-Agent": "curl/8"})
        data = urllib.request.urlopen(r, timeout=30).read()
    except Exception as e:
        bad.append(f"{p}: FETCH {e}")
        continue
    if s and len(data) != s:
        bad.append(f"{p}: 尺寸 {len(data)}!={s}")
        continue
    sha = hashlib.sha256(data).hexdigest()
    expect = f.get("sha")
    if expect and sha != expect:
        bad.append(f"{p}: sha 不符")
        continue
    good += 1
print(f"核对 {good} 文件全对" if not bad else f"BAD {len(bad)}:")
for b in bad[:10]:
    print(" -", b)
sys.exit(1 if bad else 0)
