#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.150 zip 内容门（verify-zip-v87149 骨架 + 禅雾化改道改写）
本轮核心（用户实测：进禅再退禅，磁贴磨砂消失 1-2s 才恢复）：
根因=禅雾化 opacity+filter 挂 .zen-gone 外壳=玻璃本体 .glass-card 的祖先
（v8.7.105 起复用旧语言），退禅显影末段毒物清除后 Chrome 不即时回连磨砂
取样（像素探针 +0.8s 死 +1.7s 活，CSS 计算值全程干净）。修复=v8.7.64
search-pill 同款改道：外壳只留 visibility；玻璃板走 bg alpha+border+shadow
零毒淡入淡出（backdrop 取样全程不改链）；内容雾化下放 .zen-fog 内容层。
回归保留：v8.7.149 磁贴三改、v8.7.148 行级划掉、v8.7.147 抖音预载折叠、
v8.7.146 面板滚动壳、v8.7.145 两区美化+录制正规化、auth SHA 钉定、自绘 187 条。
锚串纪律：不跨引号/换行边界；扩展脚本未 minify（源样注入），页面 chunk
锚只取字符串字面量与对象 key（minify 不动 JSX props key）；CSS 锚取
Lightning CSS 压缩后实态（已对产物实测）。"""
import zipfile, json, hashlib, sys

BASE = "/home/z/beta-wt/download/v8.7.150/"
ZIP = BASE + "ChuShi-NewTab-v8.7.150.zip"
SNAP = BASE + "ChuShi-CloudSnapshot-v8.7.150.zip"
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
if man.get("version") == "8.7.150":
    ok += 1
else:
    bad.append("manifest version != 8.7.150")

# ---- 门2) auth SHA 钉定 ----
sha = hashlib.sha256(z.read("ext-chushi-auth.js")).hexdigest()
print("auth sha256:", sha[:16], "…")
if sha == "b1776839307a6685752b62cb4875de366dfc6f8ade1ece4fc7a14b2e9e8fb794":
    ok += 1
else:
    bad.append("auth sha mismatch")

# ---- 门3) 禅雾化改道 CSS（本轮核心） ----
print("—— 门3) 禅雾化改道 CSS（v8.7.150） ——")
css = ""
for n in z.namelist():
    if n.endswith(".css"):
        css += z.read(n).decode("utf-8", "ignore")
has(css, "html.zen .zen-gone{visibility:hidden;transition:visibility 0s .65s}",
    "外壳只留 visibility（旧 opacity/filter 雾化退役）")
has(css, ".zen-gone{transition:visibility}", "外壳基线过渡零雾化")
has(css, ".zen-gone .glass-card{transition:background-color",
    "玻璃板零毒过渡（bg alpha blessed 通道）")
has(css, "html.zen .zen-gone .glass-card{background-color:#fff0;border-color:#18162400;box-shadow:0 0 #0000}",
    "亮色禅态玻璃板 α=0 端点（同色相插值不出灰）")
has(css, ".dark html.zen .zen-gone .glass-card{background-color:#16161b00;border-color:#fff0}",
    "暗色禅态玻璃板 α=0 端点")
has(css, ".zen-gone .zen-fog{transition:opacity .65s cubic-bezier(.22,1,.36,1),filter .65s cubic-bezier(.22,1,.36,1);display:block}",
    "内容雾化层过渡（下放 .zen-fog）")
has(css, "html.zen .zen-gone .zen-fog{opacity:0;filter:blur(12px)}",
    "内容雾化终态（无磨砂后代零毒）")
gone(css, ".zen-gone{transition:opacity", "旧外壳雾化过渡退役（毒通道清除）")
gone(css, "html.zen .zen-gone{opacity:0", "旧外壳禅态雾化终态退役")

# ---- 门4) 磁贴 chunk v8.7.150 + v8.7.149 全量回归 ----
print("—— 门4) 磁贴 chunk（v8.7.150 zen-fog + v8.7.149 回归） ——")
tiles = []
for n in z.namelist():
    if n.endswith(".js"):
        try:
            t = z.read(n).decode("utf-8", "ignore")
        except Exception:
            continue
        if "划掉待办：" in t:
            tiles.append((n, t))
if len(tiles) >= 1:
    ok += 1
    print(f"  [OK] 磁贴 chunk 定位 (x{len(tiles)}): {tiles[0][0]}")
else:
    bad.append("磁贴 chunk 未找到（划掉待办： 缺失）")
    print("  [FAIL] 磁贴 chunk 未找到")
tile = "".join(t for _, t in tiles)
has(tile, 'className:"zen-fog"', "zen-fog 内容雾化包装层（待办+便签 ≥2）", count_ge=2)
# v8.7.149 三改回归
has(tile, "划掉待办：", "行级 aria「划掉待办：」")
has(tile, "恢复待办：", "行级 aria「恢复待办：」")
has(tile, '"data-todo-row"', "行级 data-todo-row 标记")
has(tile, '"data-todo-id"', "行级 data-todo-id")
has(tile, '"aria-pressed"', "行级 aria-pressed 状态位")
has(tile, "今日无事，从容一些", "空态文案（磁贴+面板 ≥2）", count_ge=2)
has(tile, " 项…", "「还有 N 项」溢出行保留")
has(tile, "layoutDependency", "layoutDependency 测量锁（行+本体 ≥3）", count_ge=3)
has(tile, "onExitComplete", "exit 卸载补测量（AnimatePresence 回调 key）")
has(tile, "layout:!0", "layout 投影启用（行/本体 ≥3 处）", count_ge=3)
has(tile, "duration:.38", "layout 拉伸过渡 0.38s（三处 ≥3）", count_ge=3)
has(tile, 'role:"button"', "待办本体 role=button（motion.div）")
has(tile, "打开待办面板", "待办磁贴 aria")
has(tile, "打开便签面板", "便签磁贴 aria")
has(tile, 'elementFromPoint', "capture 重定向落点还原（宿主代理）")
has(tile, '"data-tile-body"', "磁贴本域标记（宿主代理识别）", count_ge=2)
has(tile, "添加待办，回车确认", "面板输入框 placeholder")
has(tile, "清除已完成（", "面板清除已完成钮")
has(tile, "删除", "面板行删除钮（划掉条目的退场出口）")

# ---- 门5) v8.7.147/146/145 嗅探浮窗全量回归 ----
snf = z.read("sniffer-float.js").decode("utf-8")
print("—— 门5) 嗅探浮窗回归（v8.7.147 抖音折叠） ——")
has(snf, "v8.7.147", "浮窗挂载版本戳 MOUNT_VER（sniffer 本轮未动）")
has(snf, '<details class="dy-more"', "折叠 details 容器")
has(snf, '"douyin-dl" data-i="', "预载行独立下载钮")
has(snf, 'data-nm="', "预载行文件名直传属性")
has(snf, '"抖音视频_" + vm3[1].slice(-12)', "video_id 尾 12 位命名")
has(snf, 'if (qAt >= 0 && /\\/$/.test(u)) {', "fpOf 尾斜杠判定锚")
print("—— 门6) 面板滚动壳回归（v8.7.146） ——")
has(snf, ".pbody{flex:1 1 auto;min-height:0;overflow-y:auto;", "滚动壳核心 CSS")
has(snf, "overscroll-behavior:contain", "滚动链隔离")
has(snf, "border-bottom:1px solid rgba(24,22,36,.07);flex-shrink:0;}", ".ph 头部锁死")
has(snf, "pbNew.scrollTop = keepScroll", "scrollTop 保持")
gone(snf, ".list{overflow-y:auto", ".list 自带滚动保持退役")
print("—— 门7) 缓存抓取/录制区回归（v8.7.145） ——")
has(snf, "catchPulse", "状态胶囊脉冲 CSS")
has(snf, '"catch-toggle"', "开始/停止动作")
has(snf, '"catch-auto"', "自动下载开关动作")
has(snf, '<span class="catch-t">视频录制</span>', "录制区标题")
has(snf, 'data-act="rec-list"', "扫描动作")
has(snf, 'data-act="rec-stop"', "停止动作")
has(snf, "__chushiRecBridge", "录制桥引用", count_ge=3)
print("—— 门8) 抖音全域与面板护栏 ——")
has(snf, 'douyin.com" || ', "douyin.com 全域判定")
has(snf, "video_id=", "video_id 锚（fpOf+guessName）", count_ge=3)
has(snf, 'data-act="douyin-dl"', "抖音下载动作", count_ge=2)
has(snf, "sniffer-download", "SW 下载代理通道")
has(snf, 'data-act="show-all"', "全部/精选切换")
has(snf, 'data-act="clear"', "清空动作")
has(snf, 'data-act="hide"', "收起动作")
has(snf, "2147483647", "z-index 恒顶律")

# ---- 门9) changelog 8.7.150 入页面 chunk ----
print("—— 门9) changelog 通道 ——")
cl_hit = 0
for n in z.namelist():
    if n.endswith(".js"):
        try:
            if "8.7.150" in z.read(n).decode("utf-8", "ignore"):
                cl_hit += 1
        except Exception:
            pass
if cl_hit >= 1:
    ok += 1
    print(f"  [OK] changelog 8.7.150 已入页面 chunk (x{cl_hit})")
else:
    bad.append("changelog chunk 未含 8.7.150")
cl_new = 0
for n in z.namelist():
    if n.endswith(".js"):
        try:
            t = z.read(n).decode("utf-8", "ignore")
        except Exception:
            continue
        if "磨砂玻璃效果消失" in t:
            cl_new += 1
if cl_new >= 1:
    ok += 1
    print(f"  [OK] changelog 8.7.150 文案锚已入 chunk (x{cl_new})")
else:
    bad.append("changelog 8.7.150 文案锚缺失")

# ---- 门10) 云快照载荷 ----
print("—— 门10) 云快照通道 ——")
ssnf = zs.read("sniffer-float.js").decode("utf-8")
has(ssnf, "v8.7.147", "快照浮窗版本戳同步")
has(ssnf, '<details class="dy-more"', "快照含预载折叠")
scl = 0
for n in zs.namelist():
    if n.endswith(".js"):
        try:
            if "8.7.150" in zs.read(n).decode("utf-8", "ignore"):
                scl += 1
        except Exception:
            pass
if scl >= 1:
    ok += 1
    print(f"  [OK] 快照 changelog 8.7.150 已入 chunk (x{scl})")
else:
    bad.append("快照 chunk 未含 8.7.150")
scs = 0
for n in zs.namelist():
    if n.endswith(".css"):
        try:
            if "zen-fog" in zs.read(n).decode("utf-8", "ignore"):
                scs += 1
        except Exception:
            pass
if scs >= 1:
    ok += 1
    print(f"  [OK] 快照 CSS 含 zen-fog 改道 (x{scs})")
else:
    bad.append("快照 CSS 缺 zen-fog 改道")

# ---- 门11) 自绘注册表 + github 修复回归 ----
print("—— 门11) 自绘注册表回归 ——")
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
print(f"verify-zip-v8.7.150: {ok} 绿 / {len(bad)} 红")
if bad:
    print("FAILURES:")
    for b in bad:
        print("  -", b)
    sys.exit(1)
print("ALL GATES PASS")
