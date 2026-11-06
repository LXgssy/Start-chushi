#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.153 zip 内容门（verify-zip-v87152 骨架 + 学习通自绘图标入册改写）
本轮核心（用户指令：学习通磁贴补自绘图标，纯红底白流星描摹版）：
  ① 自绘注册表 187 → 188：新增 chaoxing 条目——potrace 描摹 App Store 官方
     「学习通」图标（Beijing Chaoxing，1024px），白流星全套（五角星 + 四道
     弧形扫尾）58 段平滑贝塞尔 1 轮轮廓，仅 2.4KB；底弃官方红渐变改纯色
     #E60012 平铺（用户审定），满幅底走 972×972 圆角方模板。
  ② HOST_MAP 增 "chaoxing.com" → suffix 覆盖 i./mooc1-2./passport2./csm.
     等全部子域；selfdraw-icons.ts 头注释 187→188 同步。
回归保留：v8.7.152 弱网卡加载双根因根修（AuroraBackground bootLoaded 门槛
+ QuickLinks favicon 竞速链延后 + 壳层 8s 硬揭兜底）、转圈强调色两级取色、
v8.7.151 禅雾化重建/录制根修、v8.7.150 禅雾化改道、v8.7.149 磁贴三改、
v8.7.148 行级划掉、v8.7.147 抖音预载折叠、v8.7.146 面板滚动壳、v8.7.145
录制正规化、auth SHA 钉定。MOUNT_VER 未动（本轮不涉浮窗）。
锚串纪律：不跨引号/换行边界；扩展脚本未 minify（源样注入），页面 chunk
锚只取字符串字面量与压缩后实态（已对产物实测）。"""
import zipfile, json, hashlib, sys

BASE = "/home/z/beta-wt/download/v8.7.153/"
ZIP = BASE + "ChuShi-NewTab-v8.7.153.zip"
SNAP = BASE + "ChuShi-CloudSnapshot-v8.7.153.zip"
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
if man.get("version") == "8.7.153":
    ok += 1
else:
    bad.append("manifest version != 8.7.153")

# ---- 门2) auth SHA 钉定 ----
sha = hashlib.sha256(z.read("ext-chushi-auth.js")).hexdigest()
print("auth sha256:", sha[:16], "…")
if sha == "b1776839307a6685752b62cb4875de366dfc6f8ade1ece4fc7a14b2e9e8fb794":
    ok += 1
else:
    bad.append("auth sha mismatch")

# ---- 门3) 本轮核心：自绘注册表 187→188 + chaoxing 描摹条目 ----
print("—— 门3) 自绘注册表 188 条 + chaoxing 学习通描摹版（本轮核心） ——")
sd = json.loads(z.read("selfdraw-icons.json"))
if isinstance(sd, dict) and len(sd) == 188:
    ok += 1
    print("  [OK] 注册表 188 条（187→188）")
else:
    bad.append(f"注册表条数异常 {len(sd) if isinstance(sd, dict) else type(sd)}")
cx = sd.get("chaoxing") if isinstance(sd, dict) else None
if isinstance(cx, list) and len(cx) == 3:
    ok += 1
    print("  [OK] chaoxing 条目三元组在位")
else:
    bad.append(f"chaoxing 条目缺失或结构异常: {type(cx)}")
    cx = ["", "", ""] if not isinstance(cx, list) else cx
vb, body, dom = (cx + ["", "", ""])[:3]
has(vb, "23.96 23.96 976.08 976.08", "chaoxing viewBox 模板值")
if dom == "#E60012":
    ok += 1
    print("  [OK] 主色 #E60012 纯红底")
else:
    bad.append(f"chaoxing dom != #E60012: {dom}")
has(body, '<path transform="translate(26.00 26.00)" fill="#E60012"', "满幅底模板（972 圆角方，纯红平铺）")
has(body, "M0 0 C320.76 0 641.52 0 972 0 C972 320.76 972 641.52 972 972 C651.24 972 330.48 972 0 972 C0 651.24 0 330.48 0 0 Z", "底 path 圆角方模板锚")
has(body, '<g transform="translate(26 26) scale(0.94921875)" fill="#FFFFFF">', "白流星组：0..1024→26..998 映射 + 白填充")
has(body, "M44.45 946.25C44.71 944.19", "potrace 描摹流星轮廓锚（左下起点贝塞尔）")
has(body, "</g>", "白流星组闭合")
if body.count("<path") == 2:
    ok += 1
    print(f"  [OK] 结构 2 path（底+描摹流星），body {len(body)}B")
else:
    bad.append(f"chaoxing path 数异常: {body.count('<path')}")
gh = json.dumps(sd.get("github", ""))
if "translate(103 91.902) scale(34)" in gh:
    ok += 1
    print("  [OK] github 官方 path 回归在位")
else:
    bad.append("github path 丢失")

# ---- 门4) HOST_MAP chaoxing.com 入页面 chunk ----
print("—— 门4) HOST_MAP chaoxing.com 入 chunk（本轮核心） ——")
cx_chunk = 0
for n in z.namelist():
    if n.endswith(".js"):
        try:
            t = z.read(n).decode("utf-8", "ignore")
            if '"chaoxing.com"' in t and '"chaoxing"' in t:
                cx_chunk += 1
        except Exception:
            pass
if cx_chunk >= 1:
    ok += 1
    print(f"  [OK] HOST_MAP chaoxing.com→chaoxing 已入 chunk (x{cx_chunk})")
else:
    bad.append("HOST_MAP chaoxing.com 未入 chunk")

# ---- 门5) v8.7.152 壳层：转圈强调色 + 8s 硬揭兜底（回归） ----
print("—— 门5) 壳层转圈强调色+硬揭兜底（v8.7.152 回归） ——")
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

# ---- 门6) v8.7.152 页面 chunk：弱网双门槛（回归） ----
print("—— 门6) 页面弱网双门槛（v8.7.152 回归） ——")
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
has(chunk, '"u"<typeof document||"complete"===document.readyState', "afterWindowLoad 快路径")
has(chunk, '()=>"u">typeof document&&"complete"===document.readyState', "bootLoaded 初始态（readyState 已 complete 直通）")
has(chunk, 'window.setInterval(()=>{"complete"===document.readyState', "bootLoaded readyState 轮询兜底")
has(chunk, "^https?:/i.test(", "远程源判定（门槛只 hold http/https）")
has(chunk, "?null:", "门槛端点：load 前远程源不进文档树")
has(chunk, 'if("complete"===document.readyState)', "favicon 竞速 load 门（快路径 kick）")
has(chunk, 'favicon-src2:', "记忆源键保留（竞速语义原样）")
has(chunk, "4e3", "4s 看门狗时长保留", count_ge=2)

# ---- 门7) v8.7.151 快捷磁贴墙雾化重建 CSS 回归 ----
print("—— 门7) 快捷磁贴墙雾化重建 CSS（v8.7.151 回归） ——")
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

# ---- 门8) v8.7.151/150 玻璃板消融 + 改道回归 ----
print("—— 门8) 玻璃板消融+禅雾化改道（v8.7.151/150 回归） ——")
has(css, ".zen-gone .glass-card{transition:background-color .65s cubic-bezier(.22,1,.36,1),border-color .65s cubic-bezier(.22,1,.36,1),box-shadow .3s cubic-bezier(.22,1,.36,1)}",
    "玻璃板基态过渡（不含 backdrop-filter=满血显影律）")
has(css, "html.zen .zen-gone .glass-card{backdrop-filter:blur(1px);background-color:#fff0;border-color:#18162400;transition:background-color .65s cubic-bezier(.22,1,.36,1),border-color .65s cubic-bezier(.22,1,.36,1),box-shadow .3s cubic-bezier(.22,1,.36,1),backdrop-filter .65s cubic-bezier(.22,1,.36,1);box-shadow:0 0 #0000}",
    "玻璃板禅态端点 blur(1px)+进禅方向 transition 含 backdrop-filter")
has(css, "html.zen .zen-gone{visibility:hidden;transition:visibility 0s .65s}", "外壳只留 visibility")
has(css, ".zen-gone .zen-fog{transition:opacity .65s cubic-bezier(.22,1,.36,1),filter .65s cubic-bezier(.22,1,.36,1);display:block}", "内容雾化层过渡")
has(css, "html.zen .zen-gone .zen-fog{opacity:0;filter:blur(12px)}", "内容雾化终态")

# ---- 门9) 磁贴 chunk v8.7.149/148 回归 ----
print("—— 门9) 磁贴 chunk 回归（v8.7.149/148） ——")
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

# ---- 门10) 嗅探浮窗 v8.7.151 录制根修 + v8.7.147/146/145 回归 ----
print("—— 门10) 嗅探浮窗回归（v8.7.151/147/146/145） ——")
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

# ---- 门11) changelog 8.7.153 入页面 chunk ----
print("—— 门11) changelog 通道 ——")
cl_new = 0
for n in z.namelist():
    if n.endswith(".js"):
        try:
            t = z.read(n).decode("utf-8", "ignore")
            if "学习通磁贴换上自绘矢量图标" in t:
                cl_new += 1
        except Exception:
            pass
if cl_new >= 1:
    ok += 1
    print(f"  [OK] changelog 8.7.153 文案锚已入 chunk (x{cl_new})")
else:
    bad.append("changelog 8.7.153 文案锚缺失")
cl_188 = 0
for n in z.namelist():
    if n.endswith(".js"):
        try:
            if "自绘图标库扩至 188 站" in z.read(n).decode("utf-8", "ignore"):
                cl_188 += 1
        except Exception:
            pass
if cl_188 >= 1:
    ok += 1
    print(f"  [OK] changelog 8.7.153 亮点锚（188 站）已入 chunk (x{cl_188})")
else:
    bad.append("changelog 8.7.153 亮点锚缺失")
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

# ---- 门12) 云快照载荷 ----
print("—— 门12) 云快照通道 ——")
ssnf = zs.read("sniffer-float.js").decode("utf-8")
has(ssnf, 'var MOUNT_VER = "v8.7.151"', "快照浮窗版本戳同步")
scl = 0
for n in zs.namelist():
    if n.endswith(".js"):
        try:
            t = zs.read(n).decode("utf-8", "ignore")
            if "学习通磁贴换上自绘矢量图标" in t:
                scl += 1
        except Exception:
            pass
if scl >= 1:
    ok += 1
    print(f"  [OK] 快照 changelog 8.7.153 已入 chunk (x{scl})")
else:
    bad.append("快照 chunk 未含 8.7.153")
ssd = json.loads(zs.read("selfdraw-icons.json"))
if isinstance(ssd, dict) and len(ssd) == 188:
    ok += 1
    print("  [OK] 快照自绘注册表 188 条")
else:
    bad.append(f"快照注册表条数异常 {len(ssd) if isinstance(ssd, dict) else type(ssd)}")
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

# ---- 汇总 ----
print()
print("=" * 46)
print(f"verify-zip-v8.7.153: {ok} 绿 / {len(bad)} 红")
if bad:
    print("FAILURES:")
    for b in bad:
        print("  -", b)
    sys.exit(1)
print("ALL GATES PASS")
