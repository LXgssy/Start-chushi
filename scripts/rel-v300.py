# rel-v300.py — Release v3.0.0（双插件架构重写：SMTC 与网易云 API 冲突结构性根治）
# 资产：SMTC 交付包 zip（桥管理插件 v2.0.0 + 网易云API插件 v2.0.0 + 桥 v2.0.0 + 新 .cshz）
#       + 双 .plugin 直发 + 扩展 zip。幂等：建/更 Release + 删旧传新 + 直链 SHA-256 复核。
# 教训沿用：PATCH/DELETE 相对路径不可再拼 /releases；上传必须用 uploads.github.com。
import hashlib, json, pathlib, sys, time, urllib.request, urllib.parse

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v3.0.0"
REPO = "LXgssy/Start-chushi"
API = f"https://api.github.com/repos/{REPO}/releases"
TITLE = "v3.0.0 · 双插件架构重写（SMTC 与网易云 API 冲突结构性根治）"

ASSETS = [
    (ROOT / "download/v3.0.0/ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (ROOT / "download/v3.0.0/初始SMTC桥-2.0.0.plugin", "ChuShi-SmtcBridge-2.0.0.plugin"),
    (ROOT / "download/v3.0.0/初始网易云API-2.0.0.plugin", "ChuShi-NcmApi-2.0.0.plugin"),
    (ROOT / "examples/初始SMTC音乐预设.cshz", "ChuShi-SMTC-Preset.cshz"),
    (ROOT / "download/v3.0.0/ChuShi-NewTab-v3.0.0.zip", "ChuShi-NewTab-v3.0.0.zip"),
]

NOTES = """# v3.0.0 · 双插件架构重写（SMTC 与网易云 API 冲突的结构性根治）

对应反馈：**「有没有可能是 smtc 和自写的网易云 api 冲突了，要不重写吧，把 smtc 插件和 api 分开写成两个插件，预设包也重写，但样式不要变」**——判断成立并已照做。

## 冲突确诊（九轮真机故障的共同结构根源）

同一份进度/播放态真值被**三层各自修正互相打架**：插件 buildSnapshot 熔断 → 桥 ne-anchoring 再改 → 宿主 harmonize/零值守卫/绝对锚定再改。层与层互相覆盖 → 播放状态概率反转、进度 0.5x 爬行/倒退、冻死 0:00；一体化插件「既管桥进程又产状态」又让版本误报与状态扰动互相伪装。

## 本版架构（每数据单主）

1. **拆成两个职责单一的插件**
   - **初始SMTC桥**（cc.chushi.smtcbridge v2.0.0）：桥进程生命周期唯一管理者——自动部署（写后读回校验）/ 直启 powershell 零 WSH 弹窗 / 杀旧桥双路径 / 冷启动与升级独立退避 / bridgeBlocked 诚实置位 / Run 键自启；向桥活体注册自己的版本
   - **初始网易云API**（cc.chushi.ncmapi v2.0.0）：网易云真值唯一生产者——精确进度/播放态/逐字歌词/seek 三级阶梯全套真机修复原样保留；心跳携带 role=ncm
2. **桥 v2.0.0 纯传输化**：删除 ne-anchoring（三层互打的桥层终结）；新增插件注册表与 role 心跳仲裁（新插件在场自动压制旧一体化插件心跳，**并存不互打**）
3. **宿主单主仲裁**：网易云会话身份用桥 app 字段判定（AUMID 归一，比标题模糊匹配可靠）；插件在场 → 插件真值独占（零守卫零混合）；不在场 → SMTC 兜底；网易云在响时无条件独占面板（修反转）
4. **版本误报根治**：版本各查各的活源（桥版本 / API 插件心跳 / 管理插件注册表）；面板芯片四态文案与真实可行操作一一对应，绝不再喊无效的「更新 .plugin」
5. **预设包 v4**：样式与交互**零改动**——播放键零位移（双 SVG 同圆心交叉淡切）、面板高度迟滞、按钮乐观翻转、拖动失败醒目芯片全部保留；仅文案映射新架构 + 页脚双版本诊断

## 升级三步（旧版用户）

1. **卸载旧版**：BetterNCM 插件管理卸载「初始歌词源」（1.3.0–1.5.1 都算）
2. **装双新件**：`ChuShi-SmtcBridge-2.0.0.plugin` + `ChuShi-NcmApi-2.0.0.plugin` 放入 BetterNCM plugins 文件夹（两个文件也在 `ChuShi-SMTC-Delivery.zip` 内）
3. **重启网易云音乐**——桥自动部署拉起（零窗口），新标签页播放音乐即接入

> 网页版 Ctrl+F5 / 扩展版重装 v3.0.0 zip；⌘K → 预设 → 删除旧「初始 · SMTC 音乐」→ 导入新 `ChuShi-SMTC-Preset.cshz`。
> 若面板提示「桥未运行」：解压交付包，双击「手动启动桥（备用）/启动SMTC桥.bat」。
> 自检：面板页脚应显示「已连接 · NetEase Music · API v2.0.0 · 管理 v2.0.0」，升级芯片熄灭。

verify-v3 38/38 × 2 轮（ST16 静态断言 + 插件 vm 白盒职责单一律 + e2e 单主反转实证/芯片四态/SMTC-only 兜底）。
"""

def api(path, method="GET", data=None, ctype="application/json"):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "rel-v300")
    body = None
    if data is not None:
        body = json.dumps(data).encode() if ctype == "application/json" else data
        if ctype != "application/json":
            req.add_header("Content-Type", "application/octet-stream")
    resp = urllib.request.urlopen(req, body, timeout=120)
    return json.loads(resp.read().decode() or "{}")

def sha256(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

rel = None
try:
    rel = api(f"/tags/{TAG}")
except Exception:
    rel = None
if rel and rel.get("id"):
    print(f"release exists id={rel['id']} — 更新正文")
    api(f"/{rel['id']}", "PATCH", {"body": NOTES, "name": TITLE})
    rel_id = rel["id"]
else:
    rel = api("", "POST", {"tag_name": TAG, "name": TITLE, "body": NOTES, "draft": False, "prerelease": False})
    rel_id = rel["id"]
    print(f"release created id={rel_id}")

want = {name: (src, sha256(src)) for src, name in ASSETS}
have = {a["name"]: a["id"] for a in api(f"/{rel_id}/assets")}
for name, (src, digest) in want.items():
    if name in have:
        api(f"/assets/{have[name]}", "DELETE")
        print(f"del old asset {name}")
        time.sleep(3)
    data = src.read_bytes()
    up = f"https://uploads.github.com/repos/{REPO}/releases/{rel_id}/assets?name={urllib.parse.quote(name)}"
    req = urllib.request.Request(up, method="POST", data=data)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/octet-stream")
    req.add_header("User-Agent", "rel-v300")
    urllib.request.urlopen(req, timeout=600).read()
    print(f"uploaded {name} ({len(data)/1048576:.1f} MB)")

print("--- 直链 SHA-256 复核 ---")
ok = True
for name, (src, digest) in want.items():
    url = f"https://github.com/{REPO}/releases/download/{TAG}/{urllib.parse.quote(name)}"
    tmp = pathlib.Path("/tmp/rel-check.bin")
    urllib.request.urlretrieve(url, tmp)
    got = sha256(tmp)
    same = got == digest
    ok = ok and same
    print(f"{'OK ' if same else 'BAD'} {name} {got[:16]}…")
print("ALL OK" if ok else "MISMATCH")
sys.exit(0 if ok else 1)
