#!/usr/bin/env python3
# rel-installer-r4.py — Release v1.7.6 资产同名替换（2.0.3/r4）+ notes 更新（幂等）
import os, sys, json, urllib.request

ROOT = "/home/z/my-project"
TOKEN = open(f"{ROOT}/.pkgtmp/gh-token").read().strip()
REL_ID = 382824140
ASSET_NAME = "ChuShiBridge-2.0.0-Setup.zip"
LOCAL = f"{ROOT}/download/v1.7.6/{ASSET_NAME}"
MARK = "<!-- chushibridge-r4 -->"

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

# 4. notes（幂等：r4 MARK 不存在则追加，并替换 r3 段落标题行保持文档整洁）
st, rel = api("GET", f"/repos/LXgssy/Start-chushi/releases/{REL_ID}")
body = rel["body"]
if MARK in body:
    print("== notes 已含 r4 记录（幂等跳过） ==")
else:
    add = (
        "\n\n" + MARK + "\n"
        "### 安装包热修 2.0.3（r4：CDP 通道重构）\n"
        "`ChuShiBridge-2.0.0-Setup.zip` 已替换为**桥接器 2.0.3（r4）**，请重新下载：\n"
        "- **CDP 通道重构**：实测 CloudMusic CEF 对页端点（`/devtools/page/*`）WS 握手后立即关闭\n"
        "  （r3 日志 `eval-ws-closed` 证实）。r4 改用 **browser 端点 + Target.attachToTarget(flatten)**\n"
        "  会话模式（网易云生态适配器标准路径），页端点保留为回退\n"
        "- **close 帧状态码/原因解析**：以后再被拒，attachDetail 会直接给出 `ws-close(1002: ...)` 级证据\n"
        "- 附加成功日志标注 flatten/page 模式与页面 url\n"
    )
    # 移除 r3 MARK 段（其内容已被 r4 覆盖性描述），保持 notes 简洁
    if "<!-- chushibridge-r3 -->" in body:
        pre, _, rest = body.partition("<!-- chushibridge-r3 -->")
        _, _, post = rest.partition("\n\n") if "\n\n" in rest else ("", "", "")
        body = pre + post.lstrip("\n")
    st2, _ = api("PATCH", f"/repos/LXgssy/Start-chushi/releases/{REL_ID}", {"body": body + add})
    print(f"== notes 更新: {st2}")

# 5. 校验
st3, latest = api("GET", "/repos/LXgssy/Start-chushi/releases/latest")
names = {a["name"]: a["size"] for a in latest["assets"]}
assert names.get(ASSET_NAME) == size, "线上资产大小不符"
import hashlib
print(f"== SHA-256(本地) = {hashlib.sha256(data).hexdigest()}")
print("DONE")
