# rel-v201.py — Release v2.0.1（六联修复：暂停归零/恢复重头/seek 拽回/按钮迟钝/闪白/逐字闪动 + 桥 v1.4.0）
# 资产：SMTC 交付包 zip（桥 v1.4.0 + 歌词源插件 + 新 .cshz）+ 预设 .cshz + 扩展 zip。
# 幂等：建/更 Release + 删旧传新 + 直链 SHA-256 复核。
# ⚠ 两处历史 404 教训写死在代码里：API 基址含 /releases 时 PATCH/DELETE 相对路径不可再拼 /releases；
#   资产上传必须用 uploads.github.com 专用域。
import hashlib, json, pathlib, sys, time, urllib.request, urllib.parse

ROOT = pathlib.Path("/home/z/my-project")
TOKEN = (ROOT / ".pkgtmp/gh-token").read_text().strip()
TAG = "v2.0.1"
REPO = "LXgssy/Start-chushi"
API = f"https://api.github.com/repos/{REPO}/releases"

ASSETS = [
    (ROOT / "download/v2.0.1/ChuShi-SMTC音乐-交付包.zip", "ChuShi-SMTC-Delivery.zip"),
    (ROOT / "examples/初始SMTC音乐预设.cshz", "ChuShi-SMTC-Preset.cshz"),
    (ROOT / "download/v2.0.1/ChuShi-NewTab-v2.0.1.zip", "ChuShi-NewTab-v2.0.1.zip"),
]

NOTES = """# v2.0.1 · 六联体验修复（源自第 5 轮演示视频逐帧取证）

对应反馈：**音频和歌词不同步 / 歌词闪动 / 暂停后重置进度条和歌词 / 再播放重头再来 / 进度条拖不动 / 播放暂停反应慢 / 关闭箭头方向反了 / 面板切换仍是开关动画 / 开面板闪白**——全部根治。

## 修复明细
1. **暂停归零 + 恢复重头（根因实锤）**：网易云 SMTC 的 raw Position 整首歌钉死 0，旧桥在播放状态变化时重置锚点到 raw → 暂停瞬间 1:04→0:00、恢复后从 0 重数。**桥 v1.4.0** 改为曲目未变时用「连续位置」重锚（暂停=无缝冻结，恢复=无缝续接）；网页侧另加四重守卫，**旧桥不升级也能全对**
2. **进度条拖动全链**：拖动预览不再被逐帧循环覆写（真机「拖不动」的直接观感）；桥 seek 后立即重锚（网易云不刷新 SMTC 时间轴也生效）；宿主 4s 守卫顶住旧基準不弹回
3. **播放/暂停秒响应**：点击即刻翻转图标（乐观更新），真实态随后确认/纠正
4. **开面板闪白根治**：CDP 逐帧取证定位到「隐藏过的 iframe 重激活首帧被合成器填纯白」——实体色模糊聚拢（暗卡不再透出灰白）+ 文档画布随主题 + 同色罩驻留后揭开
5. **歌词逐字闪动根治**：渐变扫色在过渡中部分帧不绘制（录屏实锤整词隐形）→ 改双层实体色 + clip-path 裁剪，词永不隐形
6. **细节**：关闭箭头改朝下（面板在 dock 上方，收起向下）；音乐面板 ↔ 其它面板互切改为单帧「拉伸+模糊」（选框纯滑移，不再两段式开/关）

## 升级三件套
1. **网页版** Ctrl+F5（或重开两次新标签页）；**扩展版**重装 v2.0.1 zip
2. 解压 `ChuShi-SMTC-Delivery.zip` → 关旧桥窗口 → 双击 `启动SMTC桥.bat`（**v1.4.0**，建议重跑「添加开机自启.bat」）
3. ⌘K → 预设 → 删除旧「初始 · SMTC 音乐」→ 导入 `初始SMTC音乐预设.cshz`
4. （逐字歌词，装过就跳过）`初始歌词源-1.0.0.plugin` 放进 BetterNCM plugins → 重启网易云
"""

def api(path, method="GET", data=None, ctype="application/json"):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "rel-v201")
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
    # ⚠ API 基址已含 /releases——PATCH/DELETE 相对路径不可再拼 /releases（404 教训）
    api(f"/{rel['id']}", "PATCH", {"body": NOTES, "name": "v2.0.1 · 六联体验修复（暂停归零/seek/响应/闪白/逐字闪动/箭头）"})
    rel_id = rel["id"]
else:
    rel = api("", "POST", {"tag_name": TAG, "name": "v2.0.1 · 六联体验修复（暂停归零/seek/响应/闪白/逐字闪动/箭头）", "body": NOTES, "draft": False, "prerelease": False})
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
    # ⚠ 资产上传必须用 uploads.github.com 专用域（api.github.com 上传 404，v1.8.0 教训沿用）
    up = f"https://uploads.github.com/repos/{REPO}/releases/{rel_id}/assets?name={urllib.parse.quote(name)}"
    req = urllib.request.Request(up, method="POST", data=data)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/octet-stream")
    req.add_header("User-Agent", "rel-v201")
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
