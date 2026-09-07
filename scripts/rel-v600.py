#!/usr/bin/env python3
"""rel-v600.py -- Release v6.0.0 for LXgssy/Start-chushi.
Idempotency law (worklog hardening): uploads go to uploads.github.com;
DELETE-asset may 404 with this token -> if all assets already present,
verify SHA-256 and finish instead of delete-then-upload.
Final gate: /releases/tags/v6.0.0 asset digests == local digests.
"""
import hashlib
import json
import pathlib
import sys
import urllib.request

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
REPO = "LXgssy/Start-chushi"
TAG = "v6.0.0"
OUT = ROOT / "download" / "v6.0.0"

ASSETS = [
    "ChuShi-NewTab-v6.0.0.zip",
    "ChuShi-SMTC-Manager-6.0.0.plugin",
    "ChuShi-Music-Bridge-6.0.0.plugin",
    "ChuShi-Lyric-Source-6.0.0.plugin",
    "初始SMTC音乐预设.cshz",
    "ChuShi-v6.0.0-合并交付包.zip",
    "SHA256SUMS.txt",
]

BODY = """# v6.0.0 — 三插件纯插件架构（外部引擎退役）

## 三个插件
| 插件 | 职责 |
|------|------|
| **ChuShi SMTC Manager** | mediaSession 直接持有系统媒体会话：悬浮窗/锁屏/媒体键/可拖进度。网易云自带 SMTC 开关保持关闭即可 |
| **ChuShi Music Bridge** | 桥（独立插件）：只读真值 + 本地数据枢纽（127.0.0.1:26801，被占自动退 26802）+ 单次执行控制（带回执） |
| **ChuShi Lyric Source** | 独立歌词源：逐字 yrc → 卡拉OK klyric → 行级 lrc 三级回退 |

## 「初始」页面不显示音乐 = 根治
旧架构页面数据要过外部引擎，引擎没跑页面就空。v6 桥插件自己就是枢纽：插件活着，页面就有数据。

## 升级三步
1. 删光 plugins 文件夹里所有旧 .plugin（旧文件会反向覆盖新插件）
2. 装入三个新 .plugin，完全重启网易云
3. 浏览器 Ctrl+F5 / 扩展重载，重新导入 `初始SMTC音乐预设.cshz`

## 验证
静态门 112 + 白盒 46 + eapi 实测 3/3 + e2e 32（两轮全绿）；SHA256SUMS.txt 齐附。

## 资产
- `ChuShi-NewTab-v6.0.0.zip` — Edge MV3 扩展（双端口 host_permissions）
- `ChuShi-SMTC-Manager-6.0.0.plugin` / `ChuShi-Music-Bridge-6.0.0.plugin` / `ChuShi-Lyric-Source-6.0.0.plugin`
- `初始SMTC音乐预设.cshz` — 音乐面板预设（样式不变）
- `ChuShi-v6.0.0-合并交付包.zip` — 以上全部合并（文叔叔直传同包）
"""


def api(url, method="GET", data=None, headers=None, raw=False):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    if data is not None:
        req.data = data
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as r:
            body = r.read()
            return r.status, (body if raw else (json.loads(body) if body else {}))
    except urllib.error.HTTPError as e:
        return e.code, (e.read() if raw else {})


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


# 1) find or create release
st, rel = api(f"https://api.github.com/repos/{REPO}/releases/tags/{TAG}")
if st == 200:
    print(f"release exists: id={rel['id']} assets={len(rel['assets'])}")
else:
    st, created = api(f"https://api.github.com/repos/{REPO}/releases", "POST",
                      json.dumps({"tag_name": TAG, "target_commitish": "main",
                                  "name": "v6.0.0 三插件纯插件架构（引擎退役）",
                                  "body": BODY, "draft": False, "prerelease": False}).encode())
    assert st in (201,), f"create release failed: {st} {created}"
    rel = created
    print(f"release created: id={rel['id']}")

rid = rel["id"]
existing = {a["name"]: a for a in rel.get("assets", [])}

# 2) upload missing assets
for name in ASSETS:
    p = OUT / name
    assert p.exists(), f"missing asset {name}"
    if name in existing:
        print(f"  asset present: {name}")
        continue
    st, resp = api(
        f"https://uploads.github.com/repos/{REPO}/releases/{rid}/assets?name={urllib.parse.quote(name)}",
        "POST", p.read_bytes(), {"Content-Type": "application/octet-stream"})
    if st in (201, 202):
        print(f"  uploaded: {name} ({p.stat().st_size}B)")
    else:
        print(f"  UPLOAD FAILED {name}: {st} {str(resp)[:200]}")
        sys.exit(1)

# 3) final gate: digests from /releases/tags must match local
st, rel = api(f"https://api.github.com/repos/{REPO}/releases/tags/{TAG}")
assert st == 200
local = {n: sha(OUT / n) for n in ASSETS}
ok = True
for a in rel["assets"]:
    if a["name"] not in local:
        continue
    # GitHub asset digest field (sha256:...) when available; else size check
    digest = a.get("digest", "")
    size_ok = True
    if digest.startswith("sha256:"):
        size_ok = digest.split(":", 1)[1] == local[a["name"]]
    else:
        size_ok = a["size"] == (OUT / a["name"]).stat().st_size
    status = "OK" if size_ok else "MISMATCH"
    print(f"  {status} {a['name']}")
    ok = ok and size_ok

assert ok, "digest mismatch"
print(f"RELEASE-OK https://github.com/{REPO}/releases/tag/{TAG} (assets={len(rel['assets'])})")
