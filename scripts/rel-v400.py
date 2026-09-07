# rel-v400.py — Release v4.0.0（音乐链路全量重写）
# 资产：双 .plugin 直发 + 扩展 zip v4.0.0 + .cshz + 手动兜底包。幂等。
import hashlib, json, pathlib, time, urllib.request

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v4.0.0"
REPO = "LXgssy/Start-chushi"
API_BASE = f"https://api.github.com/repos/{REPO}/releases"
TITLE = "v4.0.0 · 音乐链路全量重写（自有满血 SMTC 引擎零依赖网易云 SMTC + 插件全英文 + 只读律）"

ASSETS = [
    (ROOT / "download/v4.0.0/ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (ROOT / "bridge/smtc-plugin/ChuShi-SMTC-Manager-3.0.0.plugin", "ChuShi-SMTC-Manager-3.0.0.plugin"),
    (ROOT / "bridge/ncm-plugin/ChuShi-Music-API-3.0.0.plugin", "ChuShi-Music-API-3.0.0.plugin"),
    (ROOT / "examples/初始SMTC音乐预设.cshz", "ChuShi-SMTC-Preset.cshz"),
    (ROOT / "download/v4.0.0/ChuShi-NewTab-v4.0.0.zip", "ChuShi-NewTab-v4.0.0.zip"),
]

NOTES = """# v4.0.0 · 音乐链路全量重写

对应指令：**「重写=把所有老代码删掉从头写，不许复用；不再需要开启网易云自己的 smtc 开关，直接就靠插件；插件不能是中文」**。

## 三条硬性变化

1. **零复用老代码**：插件 A/B、引擎、宿主仲裁层（judgeNcmOwns/harmonize/seekHold 等全部删除）、沙盒音乐核心、部件脚本五层从零新写；构建门断言老符号零残留。
2. **不再依赖网易云自带 SMTC**（开关开或关都不影响）：新引擎 `chushi-smtc-engine.ps1` 自注册满血 Windows 媒体会话（媒体键/悬浮窗卡片/可拖进度/锁屏），代码零读取外部 SMTC 会话（构建门封禁）。
3. **插件全英文**：`ChuShi-SMTC-Manager-3.0.0.plugin` + `ChuShi-Music-API-3.0.0.plugin`，文件名/manifest/代码逐字符 ASCII 断言——根治「中文名读取不了」。

## 根治清单（对应历史症状）

- **装插件弄坏网易云自家进度条** → 插件 B 只读律：绝不 dispatch、绝不改写播放进度、绝不拦截内部调用；控制仅在你主动操作时单次执行（seek 直写一次 + 读回校验 + 失败诚实提示）
- **进度不动/不能拖/时间 0** → 引擎自有满血会话时间线 1Hz 墙钟推进 + 可拖 + 命令队列元素级执行
- **播放状态不同步/反转** → 单真值直显（插件说什么显示什么，宿主零仲裁）
- **逐字歌词坏/漂移** → eapi 全量 yrc（自实现 MD5+AES-128-ECB，FIPS-197 向量门）→ 真值时间轴对齐 → 暂停按当前词剩余时长算淡入淡出 → 恢复零累积漂移
- **误报旧版/弹窗** → 版本只查活源（引擎/API 插件/管理插件三路）；无任何弹窗路径

## 升级三步

1. 卸载旧插件（初始歌词源 / 旧双插件）
2. 装本版双 `.plugin` → **完全重启网易云音乐**
3. 浏览器 `Ctrl+F5` 强刷 → 删除旧音乐部件重导 `ChuShi-SMTC-Preset.cshz`

30 秒自查：放歌 → Windows 悬浮窗出现卡片、进度每秒走且可拖；页脚 `API v3.0.0 · 管理 v3.0.0`；网易云自家进度条行为与装插件前一致。

引擎端口迁移 20754 → 26801（旧残留引擎由管理插件自动清理）。安全软件拦截自动启动时，用 `ChuShi-SMTC-Delivery.zip` 内 `Start-Engine.bat` 手动兜底。

验证：verify-v4 141/141 × 2 轮（静态门 + PowerShell 真语法门 + 插件 vm 白盒 + 音乐核心单测 + mock 引擎 e2e）+ 密码学向量门。
"""

H = {"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github+json",
     "User-Agent": "chushi-rel", "Content-Type": "application/json"}


def api(url, method="GET", data=None, raw=False):
    req = urllib.request.Request(url, headers=H, method=method,
                                 data=json.dumps(data).encode() if data and not raw else data)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode()) if not raw else r
        except Exception as e:
            body = getattr(e, "read", lambda: b"")()
            if attempt == 3:
                raise
            print(f"  retry {attempt + 1}: {e} {body[:200] if body else ''}")
            time.sleep(3 * (attempt + 1))


# find or create release by tag
rel = None
try:
    rel = api(f"https://api.github.com/repos/{REPO}/releases/tags/{TAG}")
except Exception:
    pass
if rel and rel.get("id"):
    rel_id = rel["id"]
    print(f"release exists id={rel_id}, updating")
    api(f"{API_BASE}/{rel_id}", "PATCH", {"tag_name": TAG, "name": TITLE, "body": NOTES, "draft": False, "prerelease": False})
    for a in rel.get("assets", []):
        api(f"{API_BASE}/{rel_id}/assets/{a['id']}", "DELETE")
else:
    rel = api(API_BASE, "POST", {"tag_name": TAG, "name": TITLE, "body": NOTES, "draft": False, "prerelease": False})
    rel_id = rel["id"]
    print(f"release created id={rel_id}")

# upload assets (uploads.github.com — api.github.com upload 404)
for path, name in ASSETS:
    data = path.read_bytes()
    ok = False
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                f"https://uploads.github.com/repos/{REPO}/releases/{rel_id}/assets?name={name}",
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

# verify direct links + sha256
print("\n== direct-link SHA-256 ==")
allok = True
for path, name in ASSETS:
    local = hashlib.sha256(path.read_bytes()).hexdigest()
    remote = api(f"https://api.github.com/repos/{REPO}/releases/assets?per_page=100")
    asset = next((a for a in remote if a["name"] == name), None)
    assert asset, f"asset missing {name}"
    req = urllib.request.Request(asset["browser_download_url"], headers={"User-Agent": "chushi-rel"})
    with urllib.request.urlopen(req, timeout=300) as r:
        dl = r.read()
    remote_sha = hashlib.sha256(dl).hexdigest()
    ok = remote_sha == local
    allok &= ok
    print(f"{'OK ' if ok else 'BAD'} {name}: {remote_sha}")
print("ALL OK" if allok else "SHA MISMATCH")
assert allok
