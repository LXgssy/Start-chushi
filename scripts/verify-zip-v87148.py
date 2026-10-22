#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.148 zip 内容门（verify-zip-v87147 骨架 + 待办磁贴行级划掉改写）
本轮一项：待办浮窗磁贴可交互——点行即「划掉」（标记完成）：行级按钮化
（motion.button + data-todo-row/aria-pressed）+ 划线动画（.strike 与面板
同语言）+ 划掉后驻留 1.1s 再退场（linger 表 + AnimatePresence exit）+
驻留期再点反悔（恢复未完成）；磁贴本体 <button> 退为 role="button" div
（行级真按钮禁嵌套），键盘开面板仅响应自身焦点；拖拽 4px 容差 + 拖后
300ms 吞 click 两律对行级点击同样生效。
回归保留：TodoPanel 面板交互、v8.7.147 抖音预载折叠、v8.7.146 面板滚动
壳、v8.7.145 两区美化+录制正规化、auth SHA 钉定、自绘 187 条。
锚串纪律：不跨引号/换行边界；扩展脚本未 minify（源样注入），页面 chunk
锚只取字符串字面量。"""
import zipfile, json, hashlib, sys

BASE = "/home/z/beta-wt/download/v8.7.148/"
ZIP = BASE + "ChuShi-NewTab-v8.7.148.zip"
SNAP = BASE + "ChuShi-CloudSnapshot-v8.7.148.zip"
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
if man.get("version") == "8.7.148":
    ok += 1
else:
    bad.append("manifest version != 8.7.148")

# ---- 门2) auth SHA 钉定 ----
sha = hashlib.sha256(z.read("ext-chushi-auth.js")).hexdigest()
print("auth sha256:", sha[:16], "…")
if sha == "b1776839307a6685752b62cb4875de366dfc6f8ade1ece4fc7a14b2e9e8fb794":
    ok += 1
else:
    bad.append("auth sha mismatch")

# ---- 门3) 待办磁贴行级划掉（本轮核心，页面 chunk 扫描） ----
print("—— 门3) 待办磁贴行级划掉 ——")
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
has(tile, "划掉待办：", "行级 aria「划掉待办：」")
has(tile, "恢复待办：", "行级 aria「恢复待办：」（驻留反悔）")
has(tile, '"data-todo-row"', "行级 data-todo-row 标记")
has(tile, '"data-todo-id"', "行级 data-todo-id（宿主代理按 id 查条目）")
has(tile, '"data-tile-body"', "磁贴本域标记（宿主代理识别）")
has(tile, 'elementFromPoint', "capture 重定向落点还原（宿主代理核心）")
has(tile, '"aria-pressed"', "行级 aria-pressed 状态位")
has(tile, 'role:"button"', "磁贴本体 role=button div（button 禁嵌套退役）")
has(tile, "打开待办面板", "磁贴开面板 aria 保留")
has(tile, "今日无事，从容一些", "空态文案（磁贴+面板 ≥2）", count_ge=2)
has(tile, "scaleX(1)", "划线扫入态（磁贴+面板）", count_ge=2)
has(tile, " 项…", "「还有 N 项」溢出行保留")

# ---- 门4) TodoPanel 面板交互回归 ----
print("—— 门4) TodoPanel 回归 ——")
has(tile, "添加待办，回车确认", "面板输入框 placeholder")
has(tile, "清除已完成（", "面板清除已完成钮")

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

# ---- 门9) changelog 8.7.148 入页面 chunk ----
print("—— 门9) changelog 通道 ——")
cl_hit = 0
for n in z.namelist():
    if n.endswith(".js"):
        try:
            if "8.7.148" in z.read(n).decode("utf-8", "ignore"):
                cl_hit += 1
        except Exception:
            pass
if cl_hit >= 1:
    ok += 1
    print(f"  [OK] changelog 8.7.148 已入页面 chunk (x{cl_hit})")
else:
    bad.append("changelog chunk 未含 8.7.148")

# ---- 门10) 云快照载荷 ----
print("—— 门10) 云快照通道 ——")
ssnf = zs.read("sniffer-float.js").decode("utf-8")
has(ssnf, "v8.7.147", "快照浮窗版本戳同步")
has(ssnf, '<details class="dy-more"', "快照含预载折叠")
scl = 0
for n in zs.namelist():
    if n.endswith(".js"):
        try:
            if "8.7.148" in zs.read(n).decode("utf-8", "ignore"):
                scl += 1
        except Exception:
            pass
if scl >= 1:
    ok += 1
    print(f"  [OK] 快照 changelog 8.7.148 已入 chunk (x{scl})")
else:
    bad.append("快照 chunk 未含 8.7.148")

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
print(f"verify-zip-v8.7.148: {ok} 绿 / {len(bad)} 红")
if bad:
    print("红灯:")
    for b in bad:
        print("  -", b)
    sys.exit(1)
print("全绿")
