# rel-v501.py — Release v5.0.1（修 SMTC Manager 插件列表消失：ncm3-compatible）
# 资产：双 .plugin 5.0.1 直发 + 交付包 + 合并包 + SHA256SUMS + 使用说明。幂等。
import hashlib, json, pathlib, time, urllib.parse, urllib.request

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v5.0.1"
REPO = "LXgssy/Start-chushi"
API_BASE = f"https://api.github.com/repos/{REPO}/releases"
TITLE = "v5.0.1 · 修 SMTC Manager 插件列表消失（网易云 3.x ncm3-compatible 静默过滤）"

D = ROOT / "download/v5.0.1"
ASSETS = [
    (ROOT / "bridge/smtc-plugin/ChuShi-SMTC-Manager-5.0.1.plugin", "ChuShi-SMTC-Manager-5.0.1.plugin"),
    (ROOT / "bridge/ncm-plugin/ChuShi-Music-API-5.0.1.plugin", "ChuShi-Music-API-5.0.1.plugin"),
    (D / "ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (D / "ChuShi-v5.0.1-合并交付包.zip", "ChuShi-v5.0.1-bundle.zip"),
    (D / "SHA256SUMS.txt", "SHA256SUMS.txt"),
    (D / "使用说明-SMTC音乐.md", "ChuShi-SMTC-README-5.0.1.md"),
]

NOTES = """# v5.0.1 · 修「ChuShi SMTC Manager 安装了但插件列表不显示」

## 根因（BetterNCM 源码实锤）

网易云 3.x 下，BetterNCM 插件管理器会**静默丢弃** manifest 里缺
`ncm3-compatible: true` 字段的插件——不解压、不加载、列表不显示、不报错。

- v5.0.0 的 **ChuShi SMTC Manager** 重写时丢了这个字段（v2.1.0 老版有）→ 消失；
- **ChuShi Music API** 5.0.0 带着这个字段 → 显示正常。

「只有一个插件看不到」的不对称症状正是定位线索。

## 本代改动

1. 双插件 manifest 补回 `ncm3-compatible: true`，构建门永久锁死（缺字段直接构建失败）。
2. 按用户规则调整文案：插件**名称保持英文**（ChuShi SMTC Manager / ChuShi Music API），**介绍改回中文**；.plugin 文件名与代码仍为纯 ASCII。
3. 扩展 / 预设包 / 引擎**零改动**：无需重装扩展、无需重导预设、无需强刷浏览器。

## 升级（只两步）

1. 打开 BetterNCM 数据目录的 `plugins` 文件夹，**删掉里面所有旧版 .plugin 文件**（含 ChuShi-*-5.0.0 与任何更早的「初始」插件——同 slug 插件解压到同一目录，旧文件不删会在启动时反向覆盖新插件）。
2. 放入 `ChuShi-SMTC-Manager-5.0.1.plugin` + `ChuShi-Music-API-5.0.1.plugin` → **完全退出并重启网易云音乐**（托盘右键退出）。

## 装完列表里还是没有？

- 查看 BetterNCM 数据目录的 `disable_list.txt`：若有 `cc.chushi.smtcbridge` 或 `cc.chushi.ncmapi` 行，删掉该行再重启（旧版被停用的记录会连坐同 slug 新插件）。
- .plugin 必须放在数据目录的 `plugins` 文件夹（`plugins_runtime` 是启动时自动生成的，不用管）。

## 30 秒自查

插件列表同时出现两个插件 → 放歌 → Windows 悬浮窗卡片进度每秒走且可拖 → 「初始」页脚 `API v5.0.1 · 管理 v5.0.1` → 拖动面板进度条网易云真实跳转 → 暂停 30s 恢复逐字歌词无漂移 → 网易云自家进度条与装插件前一致。

安全软件拦截自动拉起引擎时，用 `ChuShi-SMTC-Delivery.zip` 内 `Start-Engine.bat` 手动兜底。
"""

H = {"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github+json",
     "User-Agent": "chushi-rel", "Content-Type": "application/json"}


def api(url, method="GET", data=None):
    req = urllib.request.Request(url, headers=H, method=method,
                                 data=json.dumps(data).encode() if data else None)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            body = getattr(e, "read", lambda: b"")()
            if attempt == 3:
                raise
            print(f"  retry {attempt + 1}: {e} {body[:200] if body else ''}")
            time.sleep(3 * (attempt + 1))


rel = None
try:
    rel = api(f"https://api.github.com/repos/{REPO}/releases/tags/{TAG}")
except Exception:
    pass
if rel and rel.get("id"):
    rel_id = rel["id"]
    print(f"release exists id={rel_id}, updating body")
    api(f"{API_BASE}/{rel_id}", "PATCH", {"tag_name": TAG, "name": TITLE, "body": NOTES, "draft": False, "prerelease": False})
    for a in rel.get("assets", []):
        # token 对 DELETE 资产端点返回 404（v5.0.0 已实证）——容忍失败，靠重传改名/校验收口
        try:
            api(f"{API_BASE}/{rel_id}/assets/{a['id']}", "DELETE")
            print(f"deleted old asset {a['name']}")
        except Exception as e:
            print(f"WARN: cannot delete {a['name']}: {e}")
else:
    rel = api(API_BASE, "POST", {"tag_name": TAG, "name": TITLE, "body": NOTES, "draft": False, "prerelease": False})
    rel_id = rel["id"]
    print(f"release created id={rel_id}")

existing = {a["name"] for a in (api(f"{API_BASE}/{rel_id}").get("assets") or [])}

for path, name in ASSETS:
    if name in existing:
        print(f"skip upload {name} (already present)")
        continue
    data = path.read_bytes()
    ok = False
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                f"https://uploads.github.com/repos/{REPO}/releases/{rel_id}/assets?name={urllib.parse.quote(name)}",
                headers={"Authorization": f"token {TOKEN}", "Content-Type": "application/octet-stream",
                         "User-Agent": "chushi-rel"},
                data=data, method="POST")
            with urllib.request.urlopen(req, timeout=300) as r:
                j = json.loads(r.read().decode())
            print(f"uploaded {name} ({len(data):,} bytes) state={j.get('state')}")
            ok = True
            break
        except Exception as e:
            print(f"  upload retry {attempt + 1} {name}: {e}")
            time.sleep(3 * (attempt + 1))
    assert ok, f"upload failed {name}"

print("\n== direct-link SHA-256 ==")
allok = True
rel_now = api(f"https://api.github.com/repos/{REPO}/releases/tags/{TAG}")
remote = rel_now.get("assets") or []
for path, name in ASSETS:
    asset = next((a for a in remote if a["name"] == name), None)
    assert asset, f"asset missing {name}"
    req = urllib.request.Request(asset["browser_download_url"], headers={"User-Agent": "chushi-rel"})
    with urllib.request.urlopen(req, timeout=300) as r:
        dl = r.read()
    remote_sha = hashlib.sha256(dl).hexdigest()
    ok = remote_sha == hashlib.sha256(path.read_bytes()).hexdigest()
    allok &= ok
    print(f"{'OK ' if ok else 'BAD'} {name}: {remote_sha}")
print("ALL OK" if allok else "SHA MISMATCH")
assert allok
