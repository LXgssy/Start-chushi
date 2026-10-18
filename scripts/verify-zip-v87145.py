#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.145 zip 内容门（verify-zip-v87141 骨架 + v8.7.144 录制版合流改写）
本轮五项：①缓存抓取区重排美化（状态胶囊 catchPulse/主次按钮/流光条
catch-bar/统计行 catch-stat/折叠提示 details，data-act 四动作零变化）
②视频录制区（v8.7.144 引入）样式正规化（catch-sec 分区 + .ib 同族化 +
停止钮 stop 态 + 候选行色块底色），rec 三动作回归 ③抖音推荐页放开
（douyin.com 全域，旧三形态门退役）④fpOf video_id 分辨 ⑤远端 v8.7.141
show-all 图标按钮保留 + changelog 8.7.145 头插 + MOUNT_VER 升版。
回归保留：bili/yt 区、资源列表动作、自绘注册表 187 条 + github 修复、
auth SHA 钉定、远端录制数据面（probe/bridge）原样。
锚串纪律：不跨引号/换行边界；扩展脚本未 minify（源样注入），页面 chunk
锚只取字符串字面量。"""
import zipfile, json, re, hashlib, sys

BASE = "/home/z/beta-wt/download/v8.7.145/"
ZIP = BASE + "ChuShi-NewTab-v8.7.145.zip"
SNAP = BASE + "ChuShi-CloudSnapshot-v8.7.145.zip"
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
if man.get("version") == "8.7.145":
    ok += 1
else:
    bad.append("manifest version != 8.7.145")

# ---- 门2) auth SHA 钉定 ----
auth = z.read("ext-chushi-auth.js")
sha = hashlib.sha256(auth).hexdigest()
print("auth sha256:", sha[:16], "…")
if sha == "b1776839307a6685752b62cb4875de366dfc6f8ade1ece4fc7a14b2e9e8fb794":
    ok += 1
else:
    bad.append("auth sha mismatch")

snf = z.read("sniffer-float.js").decode("utf-8")

# ---- 门3) 缓存抓取区新 UI 锚 ----
print("—— 门3) 缓存抓取区重排锚 ——")
has(snf, "v8.7.145", "浮窗挂载版本戳")
has(snf, "catchPulse", "状态胶囊脉冲动画 CSS")
has(snf, 'class="catch-', "胶囊 class 前缀拼接")
has(snf, '"pill live"', "捕获中胶囊态值")
has(snf, ".catch-pill.live{", "捕获中胶囊 CSS")
has(snf, "catch-bar", "流光条容器 CSS")
has(snf, "catchFlow", "流光动画 CSS")
has(snf, "catch-stat", "统计行 CSS")
has(snf, '<details class="catch-tip">', "折叠提示 details")
has(snf, "<summary>使用提示", "折叠提示 summary")
has(snf, "ICON_CATCH_REC", "录音图标", count_ge=2)
has(snf, "ICON_CATCH_STOP", "停止图标", count_ge=2)
has(snf, "ICON_CATCH_RESTART", "回转图标", count_ge=2)
has(snf, "ICON_CATCH_CHEV", "旋针图标", count_ge=2)
has(snf, "条媒体轨", "媒体轨统计文案")
has(snf, "组已忽略", "其他源忽略文案")
has(snf, "捕获完成后自动下载", "自动下载开关行文案保留")
gone(snf, ".catch-s{", "旧状态行样式 .catch-s 退役")
gone(snf, "catch-s live", "旧捕获中状态串退役")
gone(snf, "把页面播放器已缓存的分段数据", "旧整段裸提示文案退役")

# ---- 门4) 缓存抓取动作语义零变化 ----
print("—— 门4) 缓存抓取动作语义回归 ——")
has(snf, '"catch-toggle"', "开始/停止动作", count_ge=1)
has(snf, '"catch-restart"', "从头捕获动作", count_ge=1)
has(snf, '"catch-dl"', "下载数据动作", count_ge=1)
has(snf, '"catch-auto"', "自动下载开关动作", count_ge=1)
has(snf, "snifferCatchAutoDl", "自动下载偏好键", count_ge=2)

# ---- 门5) 视频录制区（远端 v8.7.144 数据面 + 本轮样式正规化） ----
print("—— 门5) 视频录制区共存 ——")
has(snf, '<span class="catch-t">视频录制</span>', "录制区标题保留")
has(snf, '"catch-sec"', "录制区容器保留")
has(snf, ".catch-sec{", "录制区容器分区 CSS")
has(snf, ".catch-sec .ib{", "录制区钮同族化 CSS")
has(snf, 'ib stop" data-act="rec-stop"', "停止钮 stop 态+图标化")
has(snf, 'data-act="rec-list"', "扫描动作保留")
has(snf, 'data-act="rec-start"', "选录动作保留", count_ge=1)
has(snf, 'data-act="rec-stop"', "停止动作保留")
has(snf, "__chushiRecBridge", "录制桥引用保留", count_ge=3)
has(snf, 'style="background:#ef4444"', "候选行色块底色补齐")
has(snf, "hls-done", "落盘分支复用保留")
prb = z.read("sniffer-probe.js").decode("utf-8")
brg = z.read("sniffer-bridge.js").decode("utf-8")
has(prb, "__chushiRec", "探针录制面原样（远端 v8.7.142）")
has(brg, "__chushiRecBridge", "桥录制面原样（远端 v8.7.143）")
has(brg, "__chushiCatchApi", "桥抓取 API 保留")

# ---- 门6) 抖音推荐页放开 ----
print("—— 门6) 抖音推荐页放开 ——")
has(snf, 'douyin.com" || ', "douyin.com 全域判定")
has(snf, "/\\.douyin\\.com$/.test(h)", "子域判定保留")
gone(snf, "modal_id=", "旧 video/note/modal_id 三形态门退役")
has(snf, "相邻视频预加载", "预加载直链提示文案")
has(snf, "条直链", "其余直链报条数文案")
has(snf, 'data-act="douyin-dl"', "抖音下载动作保留")

# ---- 门7) fpOf video_id 分辨 ----
print("—— 门7) URL 指纹修复 ——")
has(snf, "video_id=", "fpOf video_id 分辨锚")
has(snf, 'seg === "play"', "play 末段特判锚")

# ---- 门8) 面板回归护栏（含远端 v8.7.141 图标钮） ----
print("—— 门8) 面板回归护栏 ——")
has(snf, 'data-act="bili-dl"', "B 站区动作保留")
has(snf, 'data-act="yt-dl"', "YouTube 区动作保留")
has(snf, 'data-act="show-all"', "全部/精选切换保留")
has(snf, 'M7 12h10M10 18h4', "v8.7.141 切换按钮图标保留")
has(snf, 'data-act="clear"', "清空动作保留")
has(snf, 'data-act="dl"', "列表下载动作保留")
has(snf, 'data-act="cp"', "列表复制动作保留")
has(snf, "chushi-catch-state", "桥状态事件监听保留")
has(snf, "2147483647", "z-index 恒顶律保留")

# ---- 门9) 云快照：sniffer-float 热更载荷 + changelog ----
print("—— 门9) 云快照通道 ——")
ssnf = zs.read("sniffer-float.js").decode("utf-8")
has(ssnf, "v8.7.145", "快照浮窗版本戳同步")
has(ssnf, "catchPulse", "快照含新录制区 UI")
cl_hit = 0
for n in zs.namelist():
    if n.endswith(".js"):
        try:
            if "8.7.145" in zs.read(n).decode("utf-8", "ignore"):
                cl_hit += 1
        except Exception:
            pass
if cl_hit >= 1:
    ok += 1
    print(f"  [OK] changelog 8.7.145 已入页面 chunk (x{cl_hit})")
else:
    bad.append("changelog chunk 未含 8.7.145")

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
print(f"verify-zip-v8.7.145: {ok} 绿 / {len(bad)} 红")
if bad:
    print("红灯:")
    for b in bad:
        print("  -", b)
    sys.exit(1)
print("全绿")
