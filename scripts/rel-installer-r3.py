#!/usr/bin/env python3
# rel-installer-r3.py — Release v1.7.6 资产同名替换（2.0.2/r3）+ notes 追加 r3 记录（幂等）
import os, sys, json, urllib.request

ROOT = "/home/z/my-project"
TOKEN = open(f"{ROOT}/.pkgtmp/gh-token").read().strip()
REL_ID = 382824140          # v1.7.6
ASSET_ID = 544633533        # ChuShiBridge-2.0.0-Setup.zip（同名替换，直链不变）
ASSET_NAME = "ChuShiBridge-2.0.0-Setup.zip"
LOCAL = f"{ROOT}/download/v1.7.6/{ASSET_NAME}"
MARK = "<!-- chushibridge-r3 -->"

API = "https://api.github.com"

def api(method, path, data=None, headers=None):
    url = f"{API}{path}"
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"token {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "chushi-rel")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read()
            return r.status, (json.loads(txt) if txt.strip().startswith(b"{") or txt.strip().startswith(b"[") else txt)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]

# ---------- 1. 删旧资产 ----------
print("== 删除旧资产 ==")
st, _ = api("DELETE", f"/repos/LXgssy/Start-chushi/releases/assets/{ASSET_ID}")
print(f"  DELETE asset {ASSET_ID}: {st}")
if st not in (204, 404):
    sys.exit("删除旧资产失败")

# ---------- 2. 上传新资产（同名） ----------
print("== 上传新资产 ==")
size = os.path.getsize(LOCAL)
print(f"  {LOCAL} ({size} bytes)")
data = open(LOCAL, "rb").read()
req = urllib.request.Request(
    f"https://uploads.github.com/repos/LXgssy/Start-chushi/releases/{REL_ID}/assets?name={ASSET_NAME}",
    data=data, method="POST")
req.add_header("Authorization", f"token {TOKEN}")
req.add_header("Content-Type", "application/zip")
req.add_header("Content-Length", str(size))
req.add_header("User-Agent", "chushi-rel")
with urllib.request.urlopen(req) as r:
    asset = json.loads(r.read())
    print(f"  上传成功: id={asset['id']} size={asset['size']} state={asset['state']}")
    assert asset["size"] == size, "上传资产大小不一致!"

# ---------- 3. notes 追加 r3 记录（幂等） ----------
st, rel = api("GET", f"/repos/LXgssy/Start-chushi/releases/{REL_ID}")
body = rel["body"]
if MARK in body:
    print("== notes 已含 r3 记录（幂等跳过） ==")
else:
    add = (
        "\n\n" + MARK + "\n"
        "### 安装包热修 2.0.2（r3 运行态）\n"
        "本 Release 的 `ChuShiBridge-2.0.0-Setup.zip` 已替换为 **桥接器 2.0.2（r3）**，请重新下载安装：\n"
        "- **网易云运行中可直接安装**：安装器自动关闭网易云并装完带参重启（修复「必须关闭网易云才能安装」）\n"
        "- **修复新版网易云附加失败**（`attach: eval-fail`）：页面识别判据放宽为 cmder / webpackJsonp / webpackChunk* / orpheus 四路兜底，适配网易云 3.x\n"
        "- 修复 WebSocket 大响应分片丢失、修复 --kill-ncm 时序误杀、修复中文安装目录 config 解码\n"
        "- `/api/debug` 新增 `attach` / `attachDetail` 细分诊断（ok / ws-fail / probe-miss / install-fail / snap-fail / poll-fail），bridge.log 记录每次失败的具体环节——若仍连不上，把 debug 输出与 bridge.log 全文发来即可一次定位\n"
    )
    st2, _ = api("PATCH", f"/repos/LXgssy/Start-chushi/releases/{REL_ID}",
                 {"body": body + add})
    print(f"== notes 追加 r3 记录: {st2} ==")

# ---------- 4. 校验直链 ----------
import hashlib
st3, head = api("GET", "/repos/LXgssy/Start-chushi/releases/latest")
names = {a["name"]: a["size"] for a in head["assets"]}
print(f"== latest={head['tag_name']} 资产: {names}")
assert names.get(ASSET_NAME) == size, "线上资产大小不符"
sha_local = hashlib.sha256(data).hexdigest()
print(f"== SHA-256(本地) = {sha_local}")
print("DONE")
