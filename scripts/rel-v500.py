# rel-v500.py — Release v5.0.0（预设包与音乐面板全部相关代码从零重写：五层 0 复用达成）
# 资产：双 .plugin 直发 + 扩展 zip v5.0.0 + .cshz + 手动兜底包。幂等。
import hashlib, json, pathlib, time, urllib.request

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v5.0.0"
REPO = "LXgssy/Start-chushi"
API_BASE = f"https://api.github.com/repos/{REPO}/releases"
TITLE = "v5.0.0 · 预设包与音乐面板全部代码从零重写（五层 0 复用 + 样式不变）"

ASSETS = [
    (ROOT / "download/v5.0.0/ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (ROOT / "bridge/smtc-plugin/ChuShi-SMTC-Manager-5.0.0.plugin", "ChuShi-SMTC-Manager-5.0.0.plugin"),
    (ROOT / "bridge/ncm-plugin/ChuShi-Music-API-5.0.0.plugin", "ChuShi-Music-API-5.0.0.plugin"),
    (ROOT / "examples/初始SMTC音乐预设.cshz", "ChuShi-SMTC-Preset.cshz"),
    (ROOT / "download/v5.0.0/ChuShi-NewTab-v5.0.0.zip", "ChuShi-NewTab-v5.0.0.zip"),
]

NOTES = """# v5.0.0 · 预设包与音乐面板全部代码从零重写

对应指令：**「预设包和音乐面板所有相关的 API 就不用重写了？全部重写」**。

## 本代归零重写的层（v4 之外补齐，样式不变）

1. **预设包音乐部件**（music-widget.html v5 + music-commands.js v5）：防位移三律 / 歌词高度迟滞 / 乐观翻转 / 升级芯片四态诚实归因全保留，实现全新。
2. **沙盒音乐核心**（sandbox.js `__chushiMusicCoreV5`）：解析 / 插值 / slew 0.35s 微抖吸收 / 暂停按当前词剩余时长算 fadeMs（120–420ms）；宿主与部件双通道同源零漂移；`whitelist()` 是宿主态→部件快照的唯一出口。
3. **新标签页数据面**（smtc.ts v5）：单真值直显，1s 轮询 127.0.0.1:26801，引擎/插件版本活源三分，拖动失败诚实提示「拖动未生效：网易云未响应」。
4. **部件通道**（PresetWidgets v5 路由）。
5. **双插件 5.0.0 + 引擎 5.0.0**：ASCII 逐字符断言延续。

至此插件A / 插件B / 引擎 / 预设包 / 音乐面板 API 与前端**五层 0 复用老代码**。

## 继承 v4 的三条硬性保证

- **不依赖网易云自带 SMTC 开关**（开或关都行）：引擎自注册满血 Windows 媒体会话（媒体键/悬浮窗卡片/可拖进度/锁屏），代码零读取外部 SMTC 会话。
- **插件全英文**：`ChuShi-SMTC-Manager-5.0.0.plugin` + `ChuShi-Music-API-5.0.0.plugin`。
- **不干扰网易云本体**：插件只读不写；控制仅在用户主动时单次执行 + 读回校验。

## 升级三步

1. 卸载所有旧版「初始」相关插件
2. 装本版双 `.plugin` → **完全重启网易云音乐**
3. 浏览器 `Ctrl+F5` 强刷（sw.js 缓存）→ 删除旧音乐部件重导 `ChuShi-SMTC-Preset.cshz`

30 秒自查：放歌 → Windows 悬浮窗出现卡片、进度每秒走且可拖；页脚 `API v5.0.0 · 管理 v5.0.0`；暂停 30s 恢复逐字歌词无漂移；网易云自家进度条行为与装插件前一致。

安全软件拦截自动启动时，用 `ChuShi-SMTC-Delivery.zip` 内 `Start-Engine.bat` 手动兜底。

验证：verify-v5 三套 **184 项断言 × 2 轮全绿**（静态 137 + 白盒 24 + e2e 23）+ 全 JS 语法门（含 .plugin 内嵌回环解析）；e2e 为真执行渲染（部件脚本实际运行 + sandbox ?mode=widget 生产同形加载）。
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
