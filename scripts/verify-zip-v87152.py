#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.152 zip 内容门（verify-zip-v87151 骨架 + 弱网卡加载根修/转圈强调色改写）
本轮核心一（用户实测：网络差时「初始」有概率一直转圈卡加载）：
双根因双门槛 + 壳层兜底三层修复：
  ① AuroraBackground 弱网门槛：图库壁纸同步解析 → hydration 初始树内即有
     <img src="https://images.unsplash.com/…"> = 文档级阻塞资源；bootLoaded
     门槛把远程源（http/https）媒体在 window load 前挡在文档树外，本地源
     （/gallery/…、blob:、data:）零影响；afterWindowLoad() 同门槛套住
     preloadImage/preloadVideo 的 JS 预载。
  ② QuickLinks favicon 竞速链延至 window load 起跑：new Image() 即使不进
     DOM 也 delay 所属文档 load 事件（HTML 规范 delaying-the-load-event），
     弱网下悬挂请求把 load 拖到分钟级（探针实测 bootGone=-1 ×3 复现）。
  ③ 壳层兜底：shell-bridge.js setTimeout(fadeBoot, 8000)——转圈最多 8s，
     正常路径 iframe load 先到则空转；fadeBoot 幂等守卫 dataset.csFaded。
本轮核心二（转圈动画不跟随强调色）：shell.html 默认色 #7c8cf8→#8b5cf6
（对齐应用 --ui-accent 默认值）；shell-bridge.js bootAccent() 两级取色——
同步 localStorage start:settings.accent 即刻上色 + chrome.storage.local
cardAcc（v8.2.3 浮窗镜像通道）权威覆盖，非法/缺省回落默认。
回归保留：v8.7.151 禅雾化重建/录制根修、v8.7.150 禅雾化改道、v8.7.149
磁贴三改、v8.7.148 行级划掉、v8.7.147 抖音预载折叠、v8.7.146 面板滚动壳、
v8.7.145 录制正规化、auth SHA 钉定、自绘 187 条。MOUNT_VER 未动（本轮
不涉浮窗）。
锚串纪律：不跨引号/换行边界；扩展脚本未 minify（源样注入），页面 chunk
锚只取字符串字面量与压缩后实态（已对产物实测）。"""
import zipfile, json, hashlib, sys

BASE = "/home/z/beta-wt/download/v8.7.152/"
ZIP = BASE + "ChuShi-NewTab-v8.7.152.zip"
SNAP = BASE + "ChuShi-CloudSnapshot-v8.7.152.zip"
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
if man.get("version") == "8.7.152":
    ok += 1
else:
    bad.append("manifest version != 8.7.152")

# ---- 门2) auth SHA 钉定 ----
sha = hashlib.sha256(z.read("ext-chushi-auth.js")).hexdigest()
print("auth sha256:", sha[:16], "…")
if sha == "b1776839307a6685752b62cb4875de366dfc6f8ade1ece4fc7a14b2e9e8fb794":
    ok += 1
else:
    bad.append("auth sha mismatch")

# ---- 门3) v8.7.152 壳层：转圈强调色 + 8s 硬揭兜底（本轮核心） ----
print("—— 门3) 壳层转圈强调色+硬揭兜底（v8.7.152） ——")
sh = z.read("shell.html").decode("utf-8")
has(sh, "border-top-color: #8b5cf6", "shell.html 转圈默认色对齐应用 --ui-accent")
gone(sh, "#7c8cf8", "旧硬编码 #7c8cf8 零残留")
br = z.read("shell-bridge.js").decode("utf-8")
has(br, '(function bootAccent() {', "bootAccent 两级取色入口")
has(br, 'boot.querySelector(".cs-boot-dot")', "转圈节点定位")
has(br, "/^#[0-9a-fA-F]{3,8}$/.test(v.trim())", "hex 合法性校验")
has(br, 'localStorage.getItem("start:settings")', "同步通道：localStorage accent")
has(br, 'chrome.storage.local.get("cardAcc", (o) => {', "权威通道：cardAcc 覆盖", count_ge=1)
has(br, "dot.style.borderTopColor = v.trim()", "borderTopColor 落地")
has(br, "setTimeout(fadeBoot, 8000)", "8s 硬揭兜底")
has(br, 'if (!boot || boot.dataset.csFaded) return;', "fadeBoot 幂等守卫")
has(br, 'boot.dataset.csFaded = "1";', "守卫置位")

# ---- 门4) v8.7.152 页面 chunk：弱网双门槛（本轮核心） ----
print("—— 门4) 页面弱网双门槛（v8.7.152） ——")
chunk = ""
for n in z.namelist():
    if n.endswith(".js"):
        try:
            t = z.read(n).decode("utf-8", "ignore")
        except Exception:
            continue
        if "data-wallpaper" in t and "favicon-src2:" in t:
            chunk = t
if chunk:
    ok += 1
    print("  [OK] 磁贴+壁纸共 chunk 定位")
else:
    bad.append("壁纸/磁贴 chunk 未找到")
    print("  [FAIL] 壁纸/磁贴 chunk 未找到")
# AuroraBackground bootLoaded 门槛（压缩实态，产物实测）
has(chunk, '"u"<typeof document||"complete"===document.readyState', "afterWindowLoad 快路径")
has(chunk, '()=>"u">typeof document&&"complete"===document.readyState', "bootLoaded 初始态（readyState 已 complete 直通）")
has(chunk, 'window.setInterval(()=>{"complete"===document.readyState', "bootLoaded readyState 轮询兜底")
has(chunk, "^https?:/i.test(", "远程源判定（门槛只 hold http/https）")
has(chunk, "?null:", "门槛端点：load 前远程源不进文档树")
# QuickLinks favicon 竞速链门槛（压缩实态，产物实测）
has(chunk, 'if("complete"===document.readyState)', "favicon 竞速 load 门（快路径 kick）")
has(chunk, 'favicon-src2:', "记忆源键保留（竞速语义原样）")
has(chunk, "4e3", "4s 看门狗时长保留", count_ge=2)

# ---- 门5) v8.7.151 快捷磁贴墙雾化重建 CSS 回归 ----
print("—— 门5) 快捷磁贴墙雾化重建 CSS（v8.7.151 回归） ——")
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
has(css, "html.zen .zen-gone .cl-fade-veil{opacity:0}", "顶缘羽化遮罩随雾化隐没")
gone(css, "saturate()", "压缩器陷阱零实例（saturate(1) 非法发射清零）")
gone(css, "backdrop-filter:blur()", "blur(0px) 陷阱零实例")

# ---- 门6) v8.7.151/150 玻璃板消融 + 改道回归 ----
print("—— 门6) 玻璃板消融+禅雾化改道（v8.7.151/150 回归） ——")
has(css, ".zen-gone .glass-card{transition:background-color .65s cubic-bezier(.22,1,.36,1),border-color .65s cubic-bezier(.22,1,.36,1),box-shadow .3s cubic-bezier(.22,1,.36,1)}",
    "玻璃板基态过渡（不含 backdrop-filter=满血显影律）")
has(css, "html.zen .zen-gone .glass-card{backdrop-filter:blur(1px);background-color:#fff0;border-color:#18162400;transition:background-color .65s cubic-bezier(.22,1,.36,1),border-color .65s cubic-bezier(.22,1,.36,1),box-shadow .3s cubic-bezier(.22,1,.36,1),backdrop-filter .65s cubic-bezier(.22,1,.36,1);box-shadow:0 0 #0000}",
    "玻璃板禅态端点 blur(1px)+进禅方向 transition 含 backdrop-filter")
has(css, "html.zen .zen-gone{visibility:hidden;transition:visibility 0s .65s}", "外壳只留 visibility")
has(css, ".zen-gone .zen-fog{transition:opacity .65s cubic-bezier(.22,1,.36,1),filter .65s cubic-bezier(.22,1,.36,1);display:block}", "内容雾化层过渡")
has(css, "html.zen .zen-gone .zen-fog{opacity:0;filter:blur(12px)}", "内容雾化终态")

# ---- 门7) 磁贴 chunk v8.7.149/148 回归 ----
print("—— 门7) 磁贴 chunk 回归（v8.7.149/148） ——")
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
has(tile, "layoutDependency", "layoutDependency 测量锁（行+本体 ≥3）", count_ge=3)
has(tile, "duration:.38", "layout 拉伸过渡 0.38s（≥3）", count_ge=3)
has(tile, '"data-tile-body"', "磁贴本域标记", count_ge=2)
has(tile, "打开待办面板", "待办磁贴 aria")
has(tile, "打开便签面板", "便签磁贴 aria")

# ---- 门8) 嗅探浮窗 v8.7.151 录制根修 + v8.7.147/146/145 回归 ----
print("—— 门8) 嗅探浮窗回归（v8.7.151/147/146/145） ——")
snf = z.read("sniffer-float.js").decode("utf-8")
has(snf, 'var MOUNT_VER = "v8.7.151"', "浮窗挂载版本戳（本轮未动=8.7.151）")
has(snf, "data-rec-live", "录制中区块保持标记", count_ge=2)
has(snf, "data-rec-slot", "重渲染占位槽")
has(snf, "state.rec.stopping", "停止中状态门（判定+守卫 ≥3）", count_ge=3)
has(snf, "function recFinished", "收尾统一出口")
has(snf, "__chushiRecOnEnded", "源断自动收尾回调注册")
has(snf, ".pbody{flex:1 1 auto;min-height:0;overflow-y:auto;", "滚动壳核心 CSS")
has(snf, "overscroll-behavior:contain", "滚动链隔离")
has(snf, "border-bottom:1px solid rgba(24,22,36,.07);flex-shrink:0;}", ".ph 头部锁死")
has(snf, "pbNew.scrollTop = keepScroll", "scrollTop 保持")
has(snf, '<details class="dy-more"', "折叠 details 容器")
has(snf, '"douyin-dl" data-i="', "预载行独立下载钮")
has(snf, "2147483647", "z-index 恒顶律")
prb = z.read("sniffer-probe.js").decode("utf-8")
has(prb, "sessOpen", "会话开闭戳（幂等 finalize）", count_ge=3)
has(prb, "function autoFinish", "源断自动收尾（350ms 宽限避让内建自停 flush）")
has(prb, "lastAuto", "已收尾成品缓存（迟到 stop 可取）", count_ge=3)
brg = z.read("sniffer-bridge.js").decode("utf-8")
has(brg, 'd.__chushiRecEvt === "rec-ended"', "桥接收源断事件")
has(brg, "window.__chushiRecOnEnded", "无挂起转发浮窗自动落盘", count_ge=2)

# ---- 门9) changelog 8.7.152 入页面 chunk ----
print("—— 门9) changelog 通道 ——")
cl_new = 0
for n in z.namelist():
    if n.endswith(".js"):
        try:
            t = z.read(n).decode("utf-8", "ignore")
        except Exception:
            continue
        if "弱网不再卡在加载转圈" in t:
            cl_new += 1
if cl_new >= 1:
    ok += 1
    print(f"  [OK] changelog 8.7.152 文案锚已入 chunk (x{cl_new})")
else:
    bad.append("changelog 8.7.152 文案锚缺失")
cl_old = 0
for n in z.namelist():
    if n.endswith(".js"):
        try:
            if "8.7.151" in z.read(n).decode("utf-8", "ignore"):
                cl_old += 1
        except Exception:
            pass
if cl_old >= 1:
    ok += 1
    print(f"  [OK] changelog 8.7.151 历史条目仍在 (x{cl_old})")
else:
    bad.append("changelog 8.7.151 历史条目缺失")

# ---- 门10) 云快照载荷 ----
print("—— 门10) 云快照通道 ——")
ssnf = zs.read("sniffer-float.js").decode("utf-8")
has(ssnf, 'var MOUNT_VER = "v8.7.151"', "快照浮窗版本戳同步")
scl = 0
for n in zs.namelist():
    if n.endswith(".js"):
        try:
            t = zs.read(n).decode("utf-8", "ignore")
            if "弱网不再卡在加载转圈" in t:
                scl += 1
        except Exception:
            pass
if scl >= 1:
    ok += 1
    print(f"  [OK] 快照 changelog 8.7.152 已入 chunk (x{scl})")
else:
    bad.append("快照 chunk 未含 8.7.152")
snew = 0
for n in zs.namelist():
    if n.endswith(".js"):
        try:
            t = zs.read(n).decode("utf-8", "ignore")
            if "^https?:/i.test(" in t and 'if("complete"===document.readyState)' in t:
                snew += 1
        except Exception:
            pass
if snew >= 1:
    ok += 1
    print(f"  [OK] 快照含弱网双门槛代码 (x{snew})")
else:
    bad.append("快照缺弱网双门槛")
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
    bad.append("快照 CSS 缺禅雾化改道")

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
print(f"verify-zip-v8.7.152: {ok} 绿 / {len(bad)} 红")
if bad:
    print("FAILURES:")
    for b in bad:
        print("  -", b)
    sys.exit(1)
print("ALL GATES PASS")
