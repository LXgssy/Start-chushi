#!/usr/bin/env python3
"""文叔叔分享链接下载（c.wss.ink/f/CODE → 本地文件）"""
import json, sys, os
import requests

BASE = "https://www.wenshushu.cn"
S = requests.Session()
S.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:82.0) Gecko/20100101 Firefox/82.0",
    "Prod": "com.wenshushu.web.pc",
    "Referer": "https://www.wenshushu.cn/",
    "Origin": "https://www.wenshushu.cn",
    "Content-Type": "application/json",
})

code = sys.argv[1].rstrip("/").split("/")[-1]  # 支持 URL 或纯 code
out = sys.argv[2] if len(sys.argv) > 2 else f"/home/z/my-project/upload/wss-{code}.bin"

# 1. 匿名登录
j = S.post(f"{BASE}/ap/login/anonymous", json={"dev_info": "{}"}).json()
assert j["code"] == 0, j
S.headers["X-TOKEN"] = j["data"]["token"]
print(f"[1] token ok")

# 2. scan 分享码
r = S.post(f"{BASE}/ap/task/scan", json={"code": code, "type": "link"})
print(f"[2] scan HTTP {r.status_code}: {r.text[:200]}")
r.raise_for_status()
j = r.json()
assert j.get("code") == 0, json.dumps(j, ensure_ascii=False)[:300]
tid = j["data"]["tid"]
print(f"[2] tid={tid} file_name={j['data'].get('file_name')} size={j['data'].get('size')}")

# 3. dtask/get
j = S.post(f"{BASE}/ap/dtask/get", json={"tid": tid}).json()
assert j.get("code") == 0, json.dumps(j, ensure_ascii=False)[:300]
bid = j["data"].get("file_bid") or j["data"].get("bid")
print(f"[3] dtask.get bid={bid}")

# 4. ufile/list
j = S.post(f"{BASE}/ap/ufile/list", json={
    "tid": tid, "pid": bid, "type": "ufile", "start": 0,
    "sort": "name", "limit": 50, "get": "all",
}).json()
assert j.get("code") == 0, json.dumps(j, ensure_ascii=False)[:300]
files = j["data"]["file_list"]
for f in files:
    print(f"    - {f['fname']} ({f['size']} B) fid={f['fid']}")
assert files, "no files"
target = max(files, key=lambda f: f["size"])  # 取最大的（视频）
fid = target["fid"]

# 5. dtask/download
j = S.post(f"{BASE}/ap/dtask/download", json={
    "type": "link", "ufileid": fid, "tid": tid,
}).json()
assert j.get("code") == 0, json.dumps(j, ensure_ascii=False)[:300]
url = j["data"]["url"]
print(f"[5] download url host={url.split('/')[2] if '/' in url else url[:60]}")

# 6. 流式下载
r = requests.get(url, stream=True, timeout=120)
r.raise_for_status()
total = 0
with open(out, "wb") as fh:
    for chunk in r.iter_content(1 << 20):
        fh.write(chunk)
        total += len(chunk)
print(f"[6] saved {out} ({total/1048576:.1f} MB)")
