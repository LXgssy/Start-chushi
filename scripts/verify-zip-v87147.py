#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.147 zip 内容门（verify-zip-v87146 骨架 + 抖音预载直链挑选改写）
本轮三项：①抖音区块 dy-more 折叠——预载直链逐行列出（新→旧）每行独立
下载钮（data-i 指回 state.items + data-nm 文件名直传），开合态跨重渲染
保持；②guessName 对 /aweme/v1/play/ 直链改用 video_id 尾 12 位命名
（列表行可辨 + 落盘名不再 play.mp4）；③fpOf 尾斜杠修复——v8.7.145 的
video_id 指纹对带斜杠形态从未生效（split("/").pop() 得空串回退整路径），
仅带查询且路径尾斜杠时重派生末段，其余形态零回归。
回归保留：v8.7.146 面板滚动壳/头部锁死/scrollTop 保持、v8.7.145 两区
美化+抖音全域+录制正规化、v8.7.141 图标钮、auth SHA 钉定、自绘 187 条。
锚串纪律：不跨引号/换行边界；扩展脚本未 minify（源样注入），页面 chunk
锚只取字符串字面量。"""
import zipfile, json, hashlib, sys

BASE = "/home/z/beta-wt/download/v8.7.147/"
ZIP = BASE + "ChuShi-NewTab-v8.7.147.zip"
SNAP = BASE + "ChuShi-CloudSnapshot-v8.7.147.zip"
z = zipfile.ZipFile(ZIP)
zs = zipfile.ZipFile(SNAP)
ok, bad = 0, []

def has(payload, needle, tag, count_ge=1):
    global ok
    c = payload.count(needle)
    if c >= count_ge:
        ok += 1
        print(f"  [OK] {tag} (x{c})")
    else:
        bad.append(f"{tag}: expect>={count_ge} got {c}")
        print(f"  [FAIL] {tag} expect>={count_ge} got {c}")

def gone(payload, needle, tag):
    global ok
    if needle not in payload:
        ok += 1
        print(f"  [OK-GONE] {tag}")
    else:
        bad.append(f"{tag}: still present")
        print(f"  [FAIL-GONE] {tag}: still present")

# ---- 门1) manifest 版本 ----
man = json.loads(z.read("manifest.json"))
print("manifest version:", man.get("version"))
if man.get("version") == "8.7.147":
    ok += 1
else:
    bad.append("manifest version != 8.7.147")

# ---- 门2) auth SHA 钉定 ----
sha = hashlib.sha256(z.read("ext-chushi-auth.js")).hexdigest()
print("auth sha256:", sha[:16], "…")
if sha == "b1776839307a6685752b62cb4875de366dfc6f8ade1ece4fc7a14b2e9e8fb794":
    ok += 1
else:
    bad.append("auth sha mismatch")

snf = z.read("sniffer-float.js").decode("utf-8")

# ---- 门3) 抖音预载折叠（本轮核心） ----
print("—— 门3) dy-more 预载直链折叠 ——")
has(snf, "v8.7.147", "浮窗挂载版本戳 MOUNT_VER")
has(snf, '<details class="dy-more"', "折叠 details 容器")
has(snf, '"><summary>其余 "', "折叠 summary 文案拼接")
has(snf, " 条预载直链（相邻视频预加载，新→旧）", "折叠 summary 文案")
has(snf, ">预载 ", "预载行标号拼接")
has(snf, '"douyin-dl" data-i="', "预载行独立下载钮", count_ge=1)
has(snf, 'data-nm="', "预载行文件名直传属性")
has(snf, ".dy-more{margin-top:6px;", "折叠容器 CSS")
has(snf, ".dy-more summary{list-style:none;", "summary 旋针族 CSS")
has(snf, ".dy-more[open] summary svg{transform:rotate(90deg);}", "展开旋针转向 CSS")
has(snf, ":host(.framedark) .dy-more summary:hover", "深色主题 hover 规则")
has(snf, 'state.dyMoreOpen ? " open" : ""', "开合态烘焙进 HTML")
has(snf, 'state.dyMoreOpen = !!(dyOld && dyOld.hasAttribute("open"))', "重渲染前回填开合态")
gone(snf, "可到下方列表挑选", "旧「到列表挑选」误导文案退役")

# ---- 门4) 预载行命名（video_id 尾段） ----
print("—— 门4) guessName video_id 命名 ——")
has(snf, '"抖音视频_" + vm3[1].slice(-12)', "video_id 尾 12 位命名")
has(snf, 'u.pathname.indexOf("/aweme/v1/play/") >= 0', "play 路径形态判定")
gone(snf, 'vm3[1].slice(0, 10)', "旧的公共前缀命名（撞名形态）不出现")

# ---- 门5) fpOf 尾斜杠修复 ----
print("—— 门5) fpOf 尾斜杠修复 ——")
has(snf, 'if (qAt >= 0 && /\\/$/.test(u)) {', "尾斜杠判定锚")
has(snf, 'seg = u.replace(/\\/+$/, "").split("/").pop() || u;', "末段重派生")
has(snf, 'var fp = (it.type || "") + "|" + seg;', "指纹拼接保留")

# ---- 门6) v8.7.146 面板滚动回归 ----
print("—— 门6) 面板滚动壳回归 ——")
has(snf, ".pbody{flex:1 1 auto;min-height:0;overflow-y:auto;", "滚动壳核心 CSS")
has(snf, "overscroll-behavior:contain", "滚动链隔离")
has(snf, "border-bottom:1px solid rgba(24,22,36,.07);flex-shrink:0;}", ".ph 头部锁死")
has(snf, "flex-direction:column;overflow:hidden;", ".panel overflow:hidden")
has(snf, "pbNew.scrollTop = keepScroll", "scrollTop 保持")
gone(snf, ".list{overflow-y:auto", ".list 自带滚动保持退役")

# ---- 门7) v8.7.145 缓存抓取区 + 录制区回归 ----
print("—— 门7) 缓存抓取/录制区回归 ——")
has(snf, "catchPulse", "状态胶囊脉冲 CSS")
has(snf, ".catch-pill.live{", "捕获中胶囊 CSS")
has(snf, '<details class="catch-tip">', "折叠提示 details")
has(snf, '"catch-toggle"', "开始/停止动作")
has(snf, '"catch-auto"', "自动下载开关动作")
has(snf, '<span class="catch-t">视频录制</span>', "录制区标题")
has(snf, 'data-act="rec-list"', "扫描动作")
has(snf, 'data-act="rec-stop"', "停止动作")
has(snf, "__chushiRecBridge", "录制桥引用", count_ge=3)
brg = z.read("sniffer-bridge.js").decode("utf-8")
has(brg, "__chushiCatchApi", "桥抓取 API 保留")

# ---- 门8) 抖音全域 + 主行 + 面板动作护栏 ----
print("—— 门8) 抖音全域与面板护栏 ——")
has(snf, 'douyin.com" || ', "douyin.com 全域判定")
has(snf, "video_id=", "video_id 锚（fpOf+guessName）", count_ge=3)
has(snf, 'data-act="douyin-dl"', "抖音下载动作", count_ge=2)
has(snf, "sniffer-download", "SW 下载代理通道")
has(snf, 'data-act="show-all"', "全部/精选切换")
has(snf, 'data-act="clear"', "清空动作")
has(snf, 'data-act="hide"', "收起动作")
has(snf, 'data-act="bili-dl"', "B 站区动作")
has(snf, 'data-act="yt-dl"', "YouTube 区动作")
has(snf, "chushi-catch-state", "桥状态事件监听")
has(snf, "2147483647", "z-index 恒顶律")

# ---- 门9) 云快照：sniffer-float 热更载荷 + changelog ----
print("—— 门9) 云快照通道 ——")
ssnf = zs.read("sniffer-float.js").decode("utf-8")
has(ssnf, "v8.7.147", "快照浮窗版本戳同步")
has(ssnf, '<details class="dy-more"', "快照含预载折叠")
cl_hit = 0
for n in zs.namelist():
    if n.endswith(".js"):
        try:
            if "8.7.147" in zs.read(n).decode("utf-8", "ignore"):
                cl_hit += 1
        except Exception:
            pass
if cl_hit >= 1:
    ok += 1
    print(f"  [OK] changelog 8.7.147 已入页面 chunk (x{cl_hit})")
else:
    bad.append("changelog chunk 未含 8.7.147")

# ---- 门10) 自绘注册表 + github 修复回归 ----
print("—— 门10) 自绘注册表回归 ——")
sd = json.loads(z.read("selfdraw-icons.json"))
if isinstance(sd, dict) and len(sd) == 187:
    ok += 1
    print("  [OK] 注册表 187 条")
else:
    bad.append(f"注册表条数异常 {len(sd) if isinstance(sd, dict) else type(sd)}")
gh = json.dumps(sd.get("github", ""))
if "translate(103 91.902) scale(34)" in gh:
    ok += 1
    print("  [OK] github 官方 path 修复在位")
else:
    bad.append("github path 丢失")

# ---- 汇总 ----
print()
print("=" * 46)
print(f"verify-zip-v8.7.147: {ok} 绿 / {len(bad)} 红")
if bad:
    print("红灯:")
    for b in bad:
        print("  -", b)
    sys.exit(1)
print("全绿")
