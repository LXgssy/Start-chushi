# rel-v220.py — Release v2.2.0（内部 API seek + 真值绝对锚定 + 桥隐身化）
# 资产：SMTC 交付包 zip（桥 v1.6.0 + 歌词源插件 v1.2.0 + 新 .cshz）+ 扩展 zip。
# 幂等：建/更 Release + 删旧传新 + 直链 SHA-256 复核。
# 教训沿用：PATCH/DELETE 相对路径不可再拼 /releases；上传必须用 uploads.github.com。
import hashlib, json, pathlib, sys, time, urllib.request, urllib.parse

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v2.2.0"
REPO = "LXgssy/Start-chushi"
API = f"https://api.github.com/repos/{REPO}/releases"
TITLE = "v2.2.0 · 内部 API seek + 真值绝对锚定 + 桥隐身化"

ASSETS = [
    (ROOT / "download/v2.2.0/ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (ROOT / "examples/初始SMTC音乐预设.cshz", "ChuShi-SMTC-Preset.cshz"),
    (ROOT / "download/v2.2.0/ChuShi-NewTab-v2.2.0.zip", "ChuShi-NewTab-v2.2.0.zip"),
]

NOTES = """# v2.2.0 · 三联升级（真机第 7 轮反馈）

对应反馈：**面板进度条能拖了但网易云本体不动 / 暂停后再播放仍累积漂移 / SMTC 桥不想再多开一个窗口**。

## 修复明细
1. **seek 改走网易云客户端内部 API（桥 v1.6.0 + 插件 v1.2.0）**：seek 命令带 id 经心跳下发插件，插件按「内部 dispatch（`playing/setPlayingPosition`）→ 420ms 实测校验 → el.currentTime 兑底 → 再校验」双级执行，结果 seekAck 回传宿主；SMTC TryChangePlaybackPositionAsync 仍照发（Spotify 等正规 SMTC 播放器依旧直拖）
2. **拖动诚实化（宿主 v2.2.0）**：拖动后 2.5s 内对比插件真值——跟上即确认；未跟上进度条**诚实弹回真值**并在页脚提示「拖动未生效：播放器未响应」，不再出现「面板假跳 4 秒、本体纹丝不动」的观感（旧版盲信本端 seek 线 4s 是观感根因）
3. **暂停→再播放累积漂移归零（宿主真值绝对锚定）**：插件每秒心跳把客户端内 el.currentTime（帧级真值）报上来，进度/时长/播放态每拍**绝对重锚到真值**——暂停/恢复/微 seek 的插值误差不可能累积（构建内两轮暂停恢复实测偏差 0.03%/0.06%，无累积趋势）；旧时序守卫链仅对无插件场景兜底
4. **桥隐身化（不再多开窗口）**：新增 `bridge-hidden.vbs`，开机自启改经 wscript 静默拉起（零窗口零闪烁）；**自愈升级**——已注册自启的用户启动一次新桥，自启项自动改指新目录；**端口接管**——手动启动新桥时自动识别并接管旧实例
5. **版本漂移自检**：插件心跳捎带版本号，音乐面板页脚直显「插件 v1.2.0」——多组件版本不对齐一眼可见（本轮「本体不动/漂移」的最大嫌疑就是旧桥旧插件仍在自启）

## 升级四件套
1. **网页版** Ctrl+F5；**扩展版**重装 v2.2.0 zip
2. 解压 `ChuShi-SMTC-Delivery.zip` → 双击一次 `启动SMTC桥.bat`（v1.6.0，会自动接管旧实例；常驻请再双击「添加开机自启.bat」，此后开机零窗口）
3. `初始歌词源-1.2.0.plugin` 放进 BetterNCM plugins（**删掉旧 1.1.0/1.0.0**）→ 重启网易云——内部 API seek 靠它
4. ⌘K → 预设 → 删除旧「初始 · SMTC 音乐」→ 导入新 `初始SMTC音乐预设.cshz`

> 自检 2 分钟：面板页脚应显示「已连接 · 网易云音乐 · 插件 v1.2.0」；拖动进度条网易云本体跟跳；暂停 5 秒再继续无跳变。若连 Windows 自带媒体浮层都拖不动网易云进度，即坐实其 SMTC seek 为客户端级残废——我们已改走内部 API，与此无关。
"""

def api(path, method="GET", data=None, ctype="application/json"):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "rel-v220")
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
    q = urllib.parse.quote(name)
    data = src.read_bytes()
    up = f"https://uploads.github.com/repos/{REPO}/releases/{rel_id}/assets?name={urllib.parse.quote(name)}"
    req = urllib.request.Request(up, method="POST", data=data)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/octet-stream")
    req.add_header("User-Agent", "rel-v220")
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
