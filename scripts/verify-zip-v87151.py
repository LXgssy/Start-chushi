#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.151 zip 内容门（verify-zip-v87150 骨架 + 禅雾化重建/录制根修改写）
本轮核心一（用户实测：常驻快捷服务磁贴进禅没有模糊过渡、延迟一秒直接消失）：
v8.7.150 删 .zen-gone 外壳雾化后磁贴墙雾化通道全灭——重建三路零毒通道：
玻璃板 .tile-frost 走 backdrop-filter 值通道（blur 14px→1px 只插值不改链，
进禅方向 transition 含 backdrop-filter、退禅方向不含=显影首帧满血律），
板内容 .tile-ring/.tile-body 与墙内无玻璃元素（.tile-label/添加位）走
opacity+blur(12px) 雾化。核心二（待办/便签玻璃板滞后外壳 1s 才消失）：
.zen-gone .glass-card 禅态端点补 backdrop-filter blur(20px)→1px 值过渡，
与内容雾化同拍整板消融；基态 transition 表不含 backdrop-filter 保满血显影。
压缩器陷阱：端点只写 blur(1px)、不带 saturate（L27/28 法典：blur(0px)→
非法 blur()、saturate(1)→非法 saturate()）——门里加 saturate() 零实例。
核心三（抖音结束录制没反应）：①录制中 rec 区跨重渲染保持（data-rec-live/
data-rec-slot 摘下回插，高频 sniffer-new 重建不再吞点击）＋停止中态
（stopping/disabled）＋1s 实时走秒 tick；②探针 onstop/onerror/轨道
onended 从 start() 即挂，源断自动收尾 postMessage __chushiRecEvt、
lastAuto 缓存、5s stop 兜底；③桥 rec-ended 事件按 op=stop 匹配应答/
转发 __chushiRecOnEnded 自动落盘。
回归保留：v8.7.150 禅雾化改道、v8.7.149 磁贴三改、v8.7.148 行级划掉、
v8.7.147 抖音预载折叠、v8.7.146 面板滚动壳、v8.7.145 录制正规化、
auth SHA 钉定、自绘 187 条。
锚串纪律：不跨引号/换行边界；扩展脚本未 minify（源样注入），页面 chunk
锚只取字符串字面量与对象 key；CSS 锚取 Lightning CSS 压缩后实态（已对
产物实测）。"""
import zipfile, json, hashlib, sys

BASE = "/home/z/beta-wt/download/v8.7.151/"
ZIP = BASE + "ChuShi-NewTab-v8.7.151.zip"
SNAP = BASE + "ChuShi-CloudSnapshot-v8.7.151.zip"
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
if man.get("version") == "8.7.151":
    ok += 1
else:
    bad.append("manifest version != 8.7.151")

# ---- 门2) auth SHA 钉定 ----
sha = hashlib.sha256(z.read("ext-chushi-auth.js")).hexdigest()
print("auth sha256:", sha[:16], "…")
if sha == "b1776839307a6685752b62cb4875de366dfc6f8ade1ece4fc7a14b2e9e8fb794":
    ok += 1
else:
    bad.append("auth sha mismatch")

# ---- 门3) v8.7.151 快捷磁贴墙雾化重建 CSS（本轮核心一） ----
print("—— 门3) 快捷磁贴墙雾化重建 CSS（v8.7.151） ——")
css = ""
for n in z.namelist():
    if n.endswith(".css"):
        css += z.read(n).decode("utf-8", "ignore")
has(css, ".zen-gone .tile-shell .tile-frost{transition:background-color .65s cubic-bezier(.22,1,.36,1),clip-path .35s cubic-bezier(.22,1,.36,1)}",
    "墙玻璃板基态过渡（无 backdrop-filter=退禅显影首帧满血律）")
has(css, "html.zen .zen-gone .tile-shell .tile-frost{backdrop-filter:blur(1px);background-color:#0000;transition:background-color .65s cubic-bezier(.22,1,.36,1),clip-path .35s cubic-bezier(.22,1,.36,1),backdrop-filter .65s cubic-bezier(.22,1,.36,1)}",
    "墙玻璃板禅态端点 blur(1px)+进禅方向 transition 含 backdrop-filter")
has(css, ".zen-gone .tile-shell .tile-frost .tile-ring,.zen-gone .tile-shell .tile-frost>.tile-body{transition:transform .35s cubic-bezier(.22,1,.36,1),opacity .65s cubic-bezier(.22,1,.36,1),filter .65s cubic-bezier(.22,1,.36,1)}",
    "板内容雾化过渡（transform 并表保 h-14 hover 配方）")
has(css, "html.zen .zen-gone .tile-shell .tile-frost .tile-ring,html.zen .zen-gone .tile-shell .tile-frost>.tile-body{opacity:0;filter:blur(12px)}",
    "板内容雾化终态")
has(css, ".zen-gone .tile-label,.zen-gone .cl-links-docked button[data-cl-tile=add]{transition:opacity .65s cubic-bezier(.22,1,.36,1),filter .65s cubic-bezier(.22,1,.36,1)}",
    "墙内无玻璃元素雾化过渡（label+添加位）")
has(css, "html.zen .zen-gone .tile-label,html.zen .zen-gone .cl-links-docked button[data-cl-tile=add]{opacity:0;filter:blur(12px)}",
    "墙内无玻璃元素雾化终态")
has(css, "html.zen .zen-gone .cl-fade-veil{opacity:0}", "顶缘羽化遮罩随雾化隐没")
gone(css, "saturate()", "压缩器陷阱零实例（saturate(1) 非法发射清零）")
gone(css, "backdrop-filter:blur()", "本轮通道 blur(0px) 陷阱零实例")
has(css, "filter:blur()", "存量 keyframes 终帧 blur() 良性工件仍在（回归锚，非本轮引入）", count_ge=10)

# ---- 门4) v8.7.151 玻璃板同步消融 CSS（本轮核心二） ----
print("—— 门4) 待办/便签玻璃板同步消融 CSS（v8.7.151） ——")
has(css, ".zen-gone .glass-card{transition:background-color .65s cubic-bezier(.22,1,.36,1),border-color .65s cubic-bezier(.22,1,.36,1),box-shadow .3s cubic-bezier(.22,1,.36,1)}",
    "玻璃板基态过渡（不含 backdrop-filter=满血显影律）")
has(css, "html.zen .zen-gone .glass-card{backdrop-filter:blur(1px);background-color:#fff0;border-color:#18162400;transition:background-color .65s cubic-bezier(.22,1,.36,1),border-color .65s cubic-bezier(.22,1,.36,1),box-shadow .3s cubic-bezier(.22,1,.36,1),backdrop-filter .65s cubic-bezier(.22,1,.36,1);box-shadow:0 0 #0000}",
    "玻璃板禅态端点 blur(1px)+进禅方向 transition 含 backdrop-filter")
has(css, ".dark html.zen .zen-gone .glass-card{background-color:#16161b00;border-color:#fff0}",
    "暗色禅态玻璃板 α=0 端点（v8.7.150 回归）")

# ---- 门5) v8.7.150 禅雾化改道回归 ----
print("—— 门5) 禅雾化改道回归（v8.7.150） ——")
has(css, "html.zen .zen-gone{visibility:hidden;transition:visibility 0s .65s}",
    "外壳只留 visibility")
has(css, ".zen-gone{transition:visibility}", "外壳基线过渡零雾化")
has(css, ".zen-gone .zen-fog{transition:opacity .65s cubic-bezier(.22,1,.36,1),filter .65s cubic-bezier(.22,1,.36,1);display:block}",
    "内容雾化层过渡（.zen-fog）")
has(css, "html.zen .zen-gone .zen-fog{opacity:0;filter:blur(12px)}", "内容雾化终态")
gone(css, ".zen-gone{transition:opacity", "旧外壳雾化过渡退役")
gone(css, "html.zen .zen-gone{opacity:0", "旧外壳禅态雾化终态退役")

# ---- 门6) 磁贴 chunk v8.7.149 全量回归 ----
print("—— 门6) 磁贴 chunk 回归（v8.7.149/148） ——")
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
has(tile, "划掉待办：", "行级 aria「划掉待办：」")
has(tile, "恢复待办：", "行级 aria「恢复待办：」")
has(tile, '"data-todo-row"', "行级 data-todo-row 标记")
has(tile, '"data-todo-id"', "行级 data-todo-id")
has(tile, "layoutDependency", "layoutDependency 测量锁（行+本体 ≥3）", count_ge=3)
has(tile, "onExitComplete", "exit 卸载补测量")
has(tile, "layout:!0", "layout 投影启用（≥3 处）", count_ge=3)
has(tile, "duration:.38", "layout 拉伸过渡 0.38s（≥3）", count_ge=3)
has(tile, 'elementFromPoint', "capture 重定向落点还原")
has(tile, '"data-tile-body"', "磁贴本域标记", count_ge=2)
has(tile, "打开待办面板", "待办磁贴 aria")
has(tile, "打开便签面板", "便签磁贴 aria")

# ---- 门7) 嗅探浮窗 v8.7.151 录制根修 ----
print("—— 门7) 嗅探浮窗录制根修（v8.7.151） ——")
snf = z.read("sniffer-float.js").decode("utf-8")
has(snf, 'var MOUNT_VER = "v8.7.151"', "浮窗挂载版本戳升 v8.7.151")
has(snf, "data-rec-live", "录制中区块保持标记", count_ge=2)
has(snf, "data-rec-slot", "重渲染占位槽")
has(snf, "data-rec-time", "实时走秒 span", count_ge=2)
has(snf, '录制中 <span data-rec-time>', "录制中走秒文案锚")
has(snf, "state.rec.stopping", "停止中状态门（判定+守卫 ≥3）", count_ge=3)
has(snf, '<button class="ib stop" disabled>', "停止中按钮禁用")
has(snf, "function recFinished", "收尾统一出口")
has(snf, "recFinUrl", "blob URL 去重防双保存")
has(snf, "function startRecTicker", "1s 走秒 tick 启动")
has(snf, "function stopRecTicker", "走秒 tick 停止")
has(snf, "__chushiRecOnEnded", "源断自动收尾回调注册")
has(snf, 'liveRec.parentNode.removeChild(liveRec)', "重渲染前摘下 rec 区节点")
has(snf, "recSlot.parentNode.replaceChild(liveRec, recSlot)", "重建后原节点回插")
has(snf, "br2.stop().then(recFinished", "点停走统一出口")
print("—— 门8) 探针生命周期根修（v8.7.151） ——")
prb = z.read("sniffer-probe.js").decode("utf-8")
has(prb, "sessOpen", "会话开闭戳（幂等 finalize）", count_ge=3)
has(prb, "function autoFinish", "源断自动收尾（350ms 宽限避让内建自停 flush）")
has(prb, "rec.onstop = function () { finalize(null, autoFlag); };", "onstop 从 start() 即挂（autoFlag 随源断置位）")
has(prb, "rec.onerror", "录制器 onerror 兜底")
has(prb, "t.onended = function () { autoFinish(); };", "轨道 onended 自动收尾")
has(prb, '__chushiRecEvt: "rec-ended"', "源断事件上报")
has(prb, "lastAuto", "已收尾成品缓存（迟到 stop 可取）", count_ge=3)
has(prb, 'setTimeout(function () { finalize("stop-timeout", false); }, 300);', "stop 5s 兜底")
print("—— 门9) 桥事件通道（v8.7.151） ——")
brg = z.read("sniffer-bridge.js").decode("utf-8")
has(brg, 'd.__chushiRecEvt === "rec-ended"', "桥接收源断事件")
has(brg, 'pending[k].op === "stop"', "挂起请求按 op 匹配")
has(brg, "p.fn(Object.assign({ auto: true }, d.payload))", "挂起 stop 以事件负载应答")
has(brg, "window.__chushiRecOnEnded", "无挂起转发浮窗自动落盘", count_ge=2)
has(brg, "pending[id] = { fn: resolve, op: op };", "pending 记录 op")

# ---- 门10) 嗅探浮窗 v8.7.147/146/145 回归 ----
print("—— 门10) 嗅探浮窗回归（v8.7.147/146/145） ——")
has(snf, '<details class="dy-more"', "折叠 details 容器")
has(snf, '"douyin-dl" data-i="', "预载行独立下载钮")
has(snf, 'data-nm="', "预载行文件名直传属性")
has(snf, '"抖音视频_" + vm3[1].slice(-12)', "video_id 尾 12 位命名")
has(snf, 'if (qAt >= 0 && /\\/$/.test(u)) {', "fpOf 尾斜杠判定锚")
has(snf, ".pbody{flex:1 1 auto;min-height:0;overflow-y:auto;", "滚动壳核心 CSS")
has(snf, "overscroll-behavior:contain", "滚动链隔离")
has(snf, "border-bottom:1px solid rgba(24,22,36,.07);flex-shrink:0;}", ".ph 头部锁死")
has(snf, "pbNew.scrollTop = keepScroll", "scrollTop 保持")
has(snf, "catchPulse", "状态胶囊脉冲 CSS")
has(snf, '"catch-toggle"', "开始/停止动作")
has(snf, '<span class="catch-t">视频录制</span>', "录制区标题")
has(snf, 'data-act="rec-list"', "扫描动作")
has(snf, 'data-act="rec-stop"', "停止动作")
has(snf, "__chushiRecBridge", "录制桥引用", count_ge=3)
has(snf, 'douyin.com" || ', "douyin.com 全域判定")
has(snf, "video_id=", "video_id 锚", count_ge=3)
has(snf, 'data-act="douyin-dl"', "抖音下载动作", count_ge=2)
has(snf, "sniffer-download", "SW 下载代理通道")
has(snf, 'data-act="show-all"', "全部/精选切换")
has(snf, 'data-act="clear"', "清空动作")
has(snf, 'data-act="hide"', "收起动作")
has(snf, "2147483647", "z-index 恒顶律")

# ---- 门11) changelog 8.7.151 入页面 chunk ----
print("—— 门11) changelog 通道 ——")
cl_hit = 0
for n in z.namelist():
    if n.endswith(".js"):
        try:
            if "8.7.151" in z.read(n).decode("utf-8", "ignore"):
                cl_hit += 1
        except Exception:
            pass
if cl_hit >= 1:
    ok += 1
    print(f"  [OK] changelog 8.7.151 已入页面 chunk (x{cl_hit})")
else:
    bad.append("changelog chunk 未含 8.7.151")
cl_new = 0
for n in z.namelist():
    if n.endswith(".js"):
        try:
            t = z.read(n).decode("utf-8", "ignore")
        except Exception:
            continue
        if "磨砂底板现在与内容同步消散" in t:
            cl_new += 1
if cl_new >= 1:
    ok += 1
    print(f"  [OK] changelog 8.7.151 文案锚已入 chunk (x{cl_new})")
else:
    bad.append("changelog 8.7.151 文案锚缺失")

# ---- 门12) 云快照载荷 ----
print("—— 门12) 云快照通道 ——")
ssnf = zs.read("sniffer-float.js").decode("utf-8")
has(ssnf, 'var MOUNT_VER = "v8.7.151"', "快照浮窗版本戳同步")
has(ssnf, "data-rec-live", "快照含录制保持标记")
has(ssnf, '<details class="dy-more"', "快照含预载折叠")
scl = 0
for n in zs.namelist():
    if n.endswith(".js"):
        try:
            if "8.7.151" in zs.read(n).decode("utf-8", "ignore"):
                scl += 1
        except Exception:
            pass
if scl >= 1:
    ok += 1
    print(f"  [OK] 快照 changelog 8.7.151 已入 chunk (x{scl})")
else:
    bad.append("快照 chunk 未含 8.7.151")
scs = 0
for n in zs.namelist():
    if n.endswith(".css"):
        try:
            t = zs.read(n).decode("utf-8", "ignore")
            if "zen-fog" in t and "backdrop-filter:blur(1px)" in t:
                scs += 1
        except Exception:
            pass
if scs >= 1:
    ok += 1
    print(f"  [OK] 快照 CSS 含 zen-fog+blur 值通道 (x{scs})")
else:
    bad.append("快照 CSS 缺本轮 CSS 改道")

# ---- 门13) 自绘注册表 + github 修复回归 ----
print("—— 门13) 自绘注册表回归 ——")
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
print(f"verify-zip-v8.7.151: {ok} 绿 / {len(bad)} 红")
if bad:
    print("FAILURES:")
    for b in bad:
        print("  -", b)
    sys.exit(1)
print("ALL GATES PASS")
