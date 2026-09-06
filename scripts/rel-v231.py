# rel-v231.py — Release v2.3.1（弹窗根除 + 真值熔断 + 反转根治 + 按钮位移根治）
# 资产：SMTC 交付包 zip（含手动启动兜底 + 桥 v1.7.1 内嵌插件 v1.4.0 + 新 .cshz）
#       + 独立 .plugin + 扩展 zip + 合并交付包 zip。
# 幂等：建/更 Release + 删旧传新 + 直链 SHA-256 复核。
# 教训沿用：PATCH/DELETE 相对路径不可再拼 /releases；上传必须用 uploads.github.com。
import hashlib, json, pathlib, sys, time, urllib.request, urllib.parse

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v2.3.1"
REPO = "LXgssy/Start-chushi"
API = f"https://api.github.com/repos/{REPO}/releases"
TITLE = "v2.3.1 · 弹窗根除 + 真值熔断（冻 0:00 / 状态反转 / 按钮位移根治）"

ASSETS = [
    (ROOT / "download/v2.3.1/ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (ROOT / "download/v2.3.1/初始歌词源-1.4.0.plugin", "ChuShi-LyricSource-1.4.0.plugin"),
    (ROOT / "examples/初始SMTC音乐预设.cshz", "ChuShi-SMTC-Preset.cshz"),
    (ROOT / "download/v2.3.1/ChuShi-NewTab-v2.3.1.zip", "ChuShi-NewTab-v2.3.1.zip"),
    (ROOT / "download/v2.3.1/ChuShi-v2.3.1-合并交付包.zip", "ChuShi-v2.3.1-AllInOne.zip"),
]

NOTES = """# v2.3.1 · 弹窗根除 + 真值熔断（真机第 8 轮反馈四联修复）

对应反馈：**WSH 弹窗（0x80070312）/ 进度条逐字歌词冻死、播放时间显示 0 / 「初始」与网易云播放状态概率反转 / 播放暂停按钮又位移**。

## 根因与修复
1. **WSH 弹窗根除**：弹窗 = 你机器上的策略/安全软件拦截「wscript→powershell」进程创建（0x80070312 = 管理员策略限制），v2.3.0 监督无退避每 20s 重试一次 = 反复弹。修复：VBS 顶层 `On Error Resume Next` 物理静默（任何失败都不弹窗）+ 插件改为直启 powershell 优先 + 部署读回校验（内容一致跳过重写，读回不一致绝不运行损坏脚本）+ 拉起失败 20/40/80/120s 指数退避
2. **进度/歌词/时间冻死 0:00 根治**（本轮最大 bug）：v2.3.0 插件「挑音频元素」逻辑选错对象（NCM 页面里的预加载/流浪元素），把「暂停+0 秒」当真值上报钉死面板。插件 v1.4.0 **真值熔断重构**：原生事件（网易云自家引擎的 PlayState/PlayProgress）为播放态/进度主源；媒体元素降级为对齐校验（与原生期望差 ≤1.5s 才采信）；深位置突报 ≈0 且 5s 内无拖动 → 垃圾样本直接丢弃；时长只用歌锚定快照值
3. **播放态概率反转根治**：同一根因的另一面（错误元素的 paused 与真相反）+ 宿主零值两击守卫双保险（可疑零拍不采纳、播放态不翻转）
4. **播放/暂停按钮位移根治**：面板高度随「歌词出现/消失」反复塌 124px 推挤按钮——部件歌词高度迟滞（同曲丢词高度不变，换曲才重算）
5. **歌词自愈**：桥重启丢词后心跳应答捎带 `needLyric`，插件自动补推缓存，面板不再因桥重启丢词
6. **channel seek 健康闸**：若 audioplayer.seek 在你的客户端版本上会打断播放，本会话自动禁用该路线（持久化），seek 走 dispatch/元素路线

## 升级（三件套）
1. 网页版 Ctrl+F5；扩展版重装 v2.3.1 zip
2. `初始歌词源-1.4.0.plugin` 放进 BetterNCM plugins（**删旧版 1.3.0**）→ 重启网易云 → 放歌
3. ⌘K → 预设 → 删除旧「初始 · SMTC 音乐」→ 导入新 `初始SMTC音乐预设.cshz`

> 自检：进度/歌词/时间正常前进 + 页脚「插件 v1.4.0」+ 无任何 WSH 弹窗 + 无橙色过旧芯片。
> 若面板一直「未连接」（策略连直启也拦）：交付包内「手动启动桥（备用）」文件夹双击 bat 即可。
"""

def api(path, method="GET", data=None, ctype="application/json"):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "rel-v231")
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
    req.add_header("User-Agent", "rel-v231")
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
