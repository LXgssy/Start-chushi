#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.146 zip 内容门（verify-zip-v87145 骨架 + 面板整体滚动改写）
本轮单项：嗅探弹窗面板整体可上下滚动 + 顶部「资源嗅探」标题行锁死——
①.pbody 滚动壳（flex:1 min-height:0 overflow-y:auto + overscroll-behavior
contain）收拢 B站/YouTube/抖音/录制/缓存抓取五区与资源列表；
②.ph flex-shrink:0 锁死；③.panel overflow:hidden 防滚动条越圆角；
④.renderPanel 重渲染 scrollTop 保存/恢复（500ms 状态回刷不打断滚动）；
⑤.list 退役自带滚动（变普通分区块）；⑥.MOUNT_VER 升 v8.7.146；
⑦changelog 8.7.146 头插。
回归保留：v8.7.145 缓存抓取区重排 / 录制区正规化 / 抖音全域 + video_id
指纹、v8.7.141 图标钮、bili/yt 区、自绘注册表 187 条 + github 修复、
auth SHA 钉定、探针/桥数据面原样。
锚串纪律：不跨引号/换行边界；扩展脚本未 minify（源样注入），页面 chunk
锚只取字符串字面量。"""
import zipfile, json, re, hashlib, sys

BASE = "/home/z/beta-wt/download/v8.7.146/"
ZIP = BASE + "ChuShi-NewTab-v8.7.146.zip"
SNAP = BASE + "ChuShi-CloudSnapshot-v8.7.146.zip"
z = zipfile.ZipFile(ZIP)
zs = zipfile.ZipFile(SNAP)
names = z.namelist()
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
if man.get("version") == "8.7.146":
    ok += 1
else:
    bad.append("manifest version != 8.7.146")

# ---- 门2) auth SHA 钉定 ----
auth = z.read("ext-chushi-auth.js")
sha = hashlib.sha256(auth).hexdigest()
print("auth sha256:", sha[:16], "…")
if sha == "b1776839307a6685752b62cb4875de366dfc6f8ade1ece4fc7a14b2e9e8fb794":
    ok += 1
else:
    bad.append("auth sha mismatch")

snf = z.read("sniffer-float.js").decode("utf-8")

# ---- 门3) 面板整体滚动新布局锚 ----
print("—— 门3) .pbody 滚动壳 + 头部锁死 ——")
has(snf, "v8.7.146", "浮窗挂载版本戳 MOUNT_VER")
has(snf, ".pbody{flex:1 1 auto;min-height:0;overflow-y:auto;", "滚动壳核心 CSS")
has(snf, "overscroll-behavior:contain", "滚动链隔离（滑到头不带动页面）")
has(snf, ".pbody::-webkit-scrollbar{width:5px;", "滚动壳 webkit 细滚动条")
has(snf, "border-bottom:1px solid rgba(24,22,36,.07);flex-shrink:0;}", ".ph 头部 flex-shrink:0 锁死")
has(snf, "flex-direction:column;overflow:hidden;", ".panel overflow:hidden 防越圆角")
has(snf, "'<div class=\"pbody\">' +", "renderPanel 滚动壳开标签")
has(snf, "pbody::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15)}".replace("}", ";}"), "深色主题滚动条迁移")
gone(snf, ":host(.framedark) .list::-webkit-scrollbar-thumb", "旧深色 .list 滚动条规则退役")

# ---- 门4) 重渲染滚动位置保持 ----
print("—— 门4) scrollTop 保存/恢复 ——")
has(snf, 'panel.querySelector(".pbody")', "渲染前后 .pbody 查询", count_ge=2)
has(snf, "keepScroll", "scrollTop 暂存变量", count_ge=2)
has(snf, "pbNew.scrollTop = keepScroll", "重建后恢复滚动位置")
has(snf, "pbOld ? pbOld.scrollTop : 0", "重建前保存滚动位置")

# ---- 门5) .list 退役自带滚动（普通分区块回归） ----
print("—— 门5) .list 滚动退役 ——")
gone(snf, ".list{overflow-y:auto", "旧 .list 自带滚动退役")
has(snf, ".list{padding:7px;}", ".list 保留为分区块")
has(snf, 'class="list"', "资源列表容器保留")

# ---- 门6) v8.7.145 缓存抓取区重排回归 ----
print("—— 门6) 缓存抓取区回归 ——")
has(snf, "catchPulse", "状态胶囊脉冲动画 CSS")
has(snf, '"pill live"', "捕获中胶囊态值")
has(snf, ".catch-pill.live{", "捕获中胶囊 CSS")
has(snf, "catch-bar", "流光条容器 CSS")
has(snf, "catch-stat", "统计行 CSS")
has(snf, '<details class="catch-tip">', "折叠提示 details")
has(snf, "ICON_CATCH_REC", "录音图标", count_ge=2)
has(snf, '"catch-toggle"', "开始/停止动作")
has(snf, '"catch-restart"', "从头捕获动作")
has(snf, '"catch-dl"', "下载数据动作")
has(snf, '"catch-auto"', "自动下载开关动作")
has(snf, "snifferCatchAutoDl", "自动下载偏好键", count_ge=2)

# ---- 门7) 录制区 + 探针/桥数据面回归 ----
print("—— 门7) 视频录制区回归 ——")
has(snf, '<span class="catch-t">视频录制</span>', "录制区标题保留")
has(snf, ".catch-sec .ib{", "录制区钮同族化 CSS")
has(snf, 'data-act="rec-list"', "扫描动作保留")
has(snf, 'data-act="rec-start"', "选录动作保留")
has(snf, 'data-act="rec-stop"', "停止动作保留")
has(snf, "__chushiRecBridge", "录制桥引用保留", count_ge=3)
prb = z.read("sniffer-probe.js").decode("utf-8")
brg = z.read("sniffer-bridge.js").decode("utf-8")
has(prb, "__chushiRec", "探针录制面原样")
has(brg, "__chushiCatchApi", "桥抓取 API 保留")

# ---- 门8) 抖音全域 + 指纹修复回归 ----
print("—— 门8) 抖音推荐页回归 ——")
has(snf, 'douyin.com" || ', "douyin.com 全域判定")
has(snf, "video_id=", "fpOf video_id 分辨锚")
has(snf, 'data-act="douyin-dl"', "抖音下载动作保留")

# ---- 门9) 面板动作护栏（头部按钮随 .ph 锁死常驻可点） ----
print("—— 门9) 面板动作护栏 ——")
has(snf, 'data-act="show-all"', "全部/精选切换保留")
has(snf, 'M7 12h10M10 18h4', "v8.7.141 切换按钮图标保留")
has(snf, 'data-act="clear"', "清空动作保留")
has(snf, 'data-act="hide"', "收起动作保留")
has(snf, 'data-act="bili-dl"', "B 站区动作保留")
has(snf, 'data-act="yt-dl"', "YouTube 区动作保留")
has(snf, 'data-act="dl"', "列表下载动作保留")
has(snf, 'data-act="cp"', "列表复制动作保留")
has(snf, "chushi-catch-state", "桥状态事件监听保留")
has(snf, "2147483647", "z-index 恒顶律保留")

# ---- 门10) 云快照：sniffer-float 热更载荷 + changelog ----
print("—— 门10) 云快照通道 ——")
ssnf = zs.read("sniffer-float.js").decode("utf-8")
has(ssnf, "v8.7.146", "快照浮窗版本戳同步")
has(ssnf, ".pbody{flex:1 1 auto;min-height:0;overflow-y:auto;", "快照含滚动壳 CSS")
cl_hit = 0
for n in zs.namelist():
    if n.endswith(".js"):
        try:
            if "8.7.146" in zs.read(n).decode("utf-8", "ignore"):
                cl_hit += 1
        except Exception:
            pass
if cl_hit >= 1:
    ok += 1
    print(f"  [OK] changelog 8.7.146 已入页面 chunk (x{cl_hit})")
else:
    bad.append("changelog chunk 未含 8.7.146")

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
print(f"verify-zip-v8.7.146: {ok} 绿 / {len(bad)} 红")
if bad:
    print("红灯:")
    for b in bad:
        print("  -", b)
    sys.exit(1)
print("全绿")
