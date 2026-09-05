#!/usr/bin/env python3
# rel-installer-r5.py — Release v1.7.6 资产同名替换（2.0.4/r5）+ notes 更新（幂等）
import os, sys, json, urllib.request

ROOT = "/home/z/my-project"
TOKEN = open(f"{ROOT}/.pkgtmp/gh-token").read().strip()
REL_ID = 382824140
ASSET_NAME = "ChuShiBridge-2.0.0-Setup.zip"
LOCAL = f"{ROOT}/download/v1.7.6/{ASSET_NAME}"
MARK = "<!-- chushibridge-r5 -->"

API = "https://api.github.com"

def api(method, path, data=None):
    url = f"{API}{path}"
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"token {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "chushi-rel")
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read()
            return r.status, (json.loads(txt) if txt.strip().startswith(b"{") or txt.strip().startswith(b"[") else txt)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:400]

# 1. 找到当前资产 id
st, rel = api("GET", f"/repos/LXgssy/Start-chushi/releases/{REL_ID}")
if isinstance(rel, str): sys.exit(f"取 Release 失败: {rel[:200]}")
assets = [a for a in rel["assets"] if a["name"] == ASSET_NAME]
assert assets, "资产不存在"
aid = assets[0]["id"]
print(f"== 旧资产 id={aid} size={assets[0]['size']}")

# 2. 删旧
st, _ = api("DELETE", f"/repos/LXgssy/Start-chushi/releases/assets/{aid}")
print(f"== DELETE: {st}")
if st != 204: sys.exit("删除失败")

# 3. 上传新
size = os.path.getsize(LOCAL)
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
    print(f"== 上传: id={asset['id']} size={asset['size']} state={asset['state']}")
    assert asset["size"] == size

# 4. notes（幂等：r5 MARK 不存在则追加；保留 r4 段历史说明）
st, rel = api("GET", f"/repos/LXgssy/Start-chushi/releases/{REL_ID}")
body = rel["body"]
if MARK in body:
    print("== notes 已含 r5 记录（幂等跳过） ==")
else:
    add = (
        "\n\n" + MARK + "\n"
        "### 安装包热修 2.0.4（r5：诊断读出修复 + PNA）\n"
        "`ChuShiBridge-2.0.0-Setup.zip` 已替换为**桥接器 2.0.4（r5）**，请重新下载：\n"
        "- **修复 `/api/debug` 的 `diag` 恒 false**：读出层缺陷——页内三源诊断\n"
        "  （store/events/media）在快照轮询中被丢弃，诊断接口向内层快照索要诊断段\n"
        "  永远扑空。现在 diag 直接来自页内回执，并新增 `snapOk` / `snapErr`（最近\n"
        "  一次页内快照的成功布尔与错误原因）与 `diag.href`（页内桥所在页面）；\n"
        "- **预检响应补发 `Access-Control-Allow-Private-Network: true`**，\n"
        "  兼容 Chromium 私有网络访问（PNA）策略收紧后的网页版直连；\n"
        "- 数据链路（`/api/status`、`/api/control`）与 2.0.3 完全一致，升级无感；\n"
        "- ⚠ 2.0.3 实测提示：若 `diag` 中 `store/events/media` 全为 false 且\n"
        "  `snapOk:false`，页内桥三源皆未命中（网易云页面无 store/事件/媒体元素），\n"
        "  请把 `/api/debug` 全文与 bridge.log 一起反馈\n"
    )
    st2, _ = api("PATCH", f"/repos/LXgssy/Start-chushi/releases/{REL_ID}", {"body": body + add})
    print(f"== notes 更新: {st2}")

# 5. 校验
st3, latest = api("GET", "/repos/LXgssy/Start-chushi/releases/latest")
names = {a["name"]: a["size"] for a in latest["assets"]}
assert names.get(ASSET_NAME) == size, "线上资产大小不符"
import hashlib
print(f"== SHA-256(本地) = {hashlib.sha256(data).hexdigest()}")
print("DONE")
