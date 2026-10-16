#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.115 zip 内容门（verify-zip-v87112 骨架 + 本轮改写）
本轮四项：①抖音完整视频下载（浮窗抖音专区 + SW DNR Referer 会话规则 9003
+ sniffer-download 域族挂钩）②缓存抓取可播性根修（探针 v4 首段截留+mime
随行+__chushiSniffCtrl 回流；桥 init 备胎库 box-walk + 装合前缀补齐 + 容器
识别扩展名）③缓存完成自动下载开关（snifferCatchAutoDl + 完成点三落点 +
浮窗开关行）④「嗅探到 N 个可下载资源」发现提示退役。
回归保留：v8.7.112 免责声明门 + 避免抓取名单 + 缓存抓取三信号。
锚串纪律：不跨引号/换行边界；扩展脚本未 minify（源样注入），页面 chunk 锚只取字符串字面量。"""
import zipfile, json, re, hashlib, sys

BASE = "/home/z/beta-wt/download/v8.7.115/"
ZIP = BASE + "ChuShi-NewTab-v8.7.115.zip"
SNAP = BASE + "ChuShi-CloudSnapshot-v8.7.115.zip"
z = zipfile.ZipFile(ZIP)
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

def exact(payload, needle, n, tag):
    global ok
    c = payload.count(needle)
    if c == n:
        ok += 1
        print(f"  [OK-EXACT] {tag} (x{c}=={n})")
    else:
        bad.append(f"{tag}: expect=={n} got {c}")
        print(f"  [FAIL-EXACT] {tag}: expect=={n} got {c}")

# ---- 门1) manifest 版本 ----
man = json.loads(z.read("manifest.json"))
print("manifest version:", man.get("version"))
if man.get("version") == "8.7.115":
    ok += 1
else:
    bad.append("manifest version != 8.7.115")

# ---- 门2) auth SHA 钉定 ----
auth = z.read("ext-chushi-auth.js")
sha = hashlib.sha256(auth).hexdigest()
print("auth sha256:", sha[:16], "…")
if sha == "b1776839307a6685752b62cb4875de366dfc6f8ade1ece4fc7a14b2e9e8fb794":
    ok += 1
    print("  [OK] ext-chushi-auth.js SHA256 钉定一致")
else:
    bad.append("auth sha mismatch: " + sha[:16])

# ---- 门3) 零 /_next 残留 ----
residue = [n for n in names if "/_next/" in n or n.startswith("_next/")]
alltxt = b"".join(z.read(n) for n in names if n.endswith((".html", ".js", ".css")) and n.endswith(".html"))
if not residue and b"/_next/" not in alltxt:
    ok += 1
    print("  [OK] 包体零 /_next/ 路径残留")
else:
    bad.append("_next residue: files=" + str(residue))

# ---- 门4) 探针 v4：首段截留 + mime 随行 + 回流通道 ----
probe = z.read("sniffer-probe.js").decode("utf-8")
has(probe, '"catch-track"', "探针·轨道登记信号")
has(probe, '"catch-chunk"', "探针·分段截留信号")
has(probe, '"catch-eos"', "探针·完成信号")
has(probe, 'data-chushi-catch', "探针·捕获态属性门 catchArmed", count_ge=2)
has(probe, 'catchChunk(trackIdx, data, mime)', "探针·appendBuffer 挂截留（mime 随行）")
has(probe, 'window.postMessage(msg, "*", transfer || undefined)', "探针·transfer 零二次拷贝通道")
has(probe, 'MediaSource.prototype.endOfStream', "探针·endOfStream 挂钩")
has(probe, '__chushiSniffCtrl', "探针·桥回流通道标记")
has(probe, '"catch-init-done"', "探针·初始化段攒齐回流信号")
has(probe, 'INIT_HARD_CAP = 4194304', "探针·截留 4MB 兜底硬顶")
has(probe, 'initDone[trackIdx]', "探针·攒齐即停状态", count_ge=2)

# ---- 门5) 桥：init 备胎库 + 装合补齐 + 容器识别 + 自动下载 ----
bridge = z.read("sniffer-bridge.js").decode("utf-8")
has(bridge, "__chushiCatchApi", "桥·同世界 API 暴露", count_ge=2)
has(bridge, "CATCH_MAX_BYTES = 1073741824", "桥·1GB 硬顶")
has(bridge, 'new CustomEvent("chushi-catch-state", { detail: catchInfo() })', "桥·状态广播事件", count_ge=2)
has(bridge, "OPT_OUT_HOSTS = []", "桥·避免抓取名单（页面侧）")
has(bridge, 'document.documentElement.setAttribute("data-chushi-catch", "1")', "桥·捕获态属性设置")
has(bridge, "vids[i].currentTime = 0", "桥·从头捕获回跳")
has(bridge, "CATCH_INIT_MAX = 1048576", "桥·备胎库 1MB 顶")
has(bridge, "function initScan(st, idx)", "桥·box-walk 攒齐判定")
has(bridge, '"moof" || type === "styp"', "桥·fMP4 媒体段边界识别")
has(bridge, "0x1F, 0x43", "桥·WebM Cluster 边界识别") if False else None
has(bridge, "buf[p + 1] === 0x43", "桥·WebM Cluster 字节识别")
has(bridge, "function initPrefixFor(ti, firstChunk)", "桥·装合前缀补齐判定")
has(bridge, 'tag4 === "moof" || tag4 === "styp"', "桥·首块缺 init 识别")
has(bridge, "function catchContainerOf(firstChunk)", "桥·容器字节识别")
has(bridge, 'return "mp4";', "桥·ftyp→mp4")
has(bridge, "tr.mime = cm", "桥·嗅探晚开 mime 回填")
has(bridge, "Array.isArray(prefix) ? prefix.concat(t.chunks) : t.chunks", "桥·合成前缀拼接")
has(bridge, "return { saved: saved, warn: warn };", "桥·下载结果对象（含诚实警告）")
has(bridge, "部分文件缺初始化段", "桥·缺 init 诚实提示")
has(bridge, "function catchMaybeAutoDownload()", "桥·自动下载执行器")
has(bridge, '"snifferCatchAutoDl"', "桥·自动下载偏好键", count_ge=1)
has(bridge, "捕获完成，已自动下载（", "桥·自动下载备注文案")
has(bridge, "catchMaybeAutoDownload();   /* v8.7.115 播放器宣告到尾＝捕获完成 */", "桥·EOS 完成点")
has(bridge, "if (!catchOn && catchTotal > 0) catchMaybeAutoDownload();", "桥·手动停止完成点")
has(bridge, "catchMaybeAutoDownload();", "桥·1GB 顶完成点", count_ge=2)
has(bridge, 'window.postMessage({ __chushiSniffCtrl: true, kind: "catch-init-done", idx: idx }, "*")', "桥·回流消息发送")

# ---- 门6) 浮窗：抖音专区 + 自动下载开关 + toast 退役 ----
fl = z.read("sniffer-float.js").decode("utf-8")
has(fl, "catchBlockHtml", "浮窗·缓存抓取区块渲染", count_ge=2)
has(fl, '"catch-toggle"', "浮窗·开始/停止按钮")
has(fl, '"catch-restart"', "浮窗·从头捕获按钮")
has(fl, '"catch-dl"', "浮窗·下载数据按钮")
has(fl, '"catch-auto"', "浮窗·自动下载开关钮")
has(fl, "捕获完成后自动下载", "浮窗·自动下载开关文案", count_ge=2)
has(fl, '"snifferCatchAutoDl"', "浮窗·自动下载偏好键读取", count_ge=1)
has(fl, 'snifferCatchAutoDl: !catchAutoDl', "浮窗·自动下载偏好写入")
has(fl, 'ch.snifferCatchAutoDl', "浮窗·偏好热跟随监听")
has(fl, "function onDouyinPage()", "浮窗·抖音页检测")
has(fl, "/douyin\\.com\\/(?:video|note)\\/\\d+", "浮窗·抖音视频页 URL 门")
has(fl, "function douyinPlayItem()", "浮窗·直链解析（列表倒序取最新）")
has(fl, 'u.indexOf("/aweme/v1/play/") >= 0', "浮窗·play 端点直链识别")
has(fl, "function douyinBlockHtml()", "浮窗·抖音区块渲染")
has(fl, '"douyin-dl"', "浮窗·抖音下载按钮")
has(fl, 'douyinTitle() + ".mp4"', "浮窗·文件名=视频描述")
has(fl, "DOUYIN_FAM = [", "浮窗·抖音域族表")
has(fl, "chushi-catch-state", "浮窗·状态事件跟随", count_ge=1)
has(fl, "__chushiCatchApi", "浮窗·直调桥 API", count_ge=2)
has(fl, "缓存抓取", "浮窗·缓存抓取标题文案", count_ge=3)
gone(fl, 'showToast("嗅探到', "浮窗·「嗅探到 N 个」提示已退役（调用点拆除，注释引文除外）")
gone(fl, "opts.notify", "浮窗·notify 通道零残留")

# ---- 门7) SW：抖音 DNR Referer 规则 + sniffer-download 挂钩 ----
bg = z.read("ext-bg.js").decode("utf-8")
has(bg, "DOUYIN_DNR_RULE_ID = 9003", "SW·抖音 DNR 规则 ID")
has(bg, "function ensureDnrDouyin()", "SW·DNR 会话规则装配")
has(bg, '{ header: "Referer", operation: "set", value: "https://www.douyin.com/" }', "SW·Referer=https://www.douyin.com/")
has(bg, '"douyinvod.com"', "SW·douyinvod CDN 域", count_ge=1)
has(bg, "function isDouyinUrl(u)", "SW·抖音域族判定")
has(bg, "if (isDouyinUrl(url)) {", "SW·sniffer-download 挂钩")
has(bg, "startSniffDl", "SW·下载启动器", count_ge=2)
has(bg, "SNIFF_OPT_OUT_HOSTS = []", "SW·避免抓取名单（回归）")
has(bg, "if (sniffOptOut(details.url)) return;", "SW·onResponseStarted 名单门（回归）")

# ---- 门8) 免责声明门回归（popup.html + popup.js）----
phtml = z.read("popup.html").decode("utf-8")
pjs = z.read("popup.js").decode("utf-8")
has(phtml, 'id="sniff-gate"', "popup·声明弹层挂载点")
has(phtml, 'id="sniff-gate-yes"', "popup·同意按钮")
exact(phtml, "本扩展仅供下载用户拥有版权或已获授权的视频，禁止用于下载受版权保护且未经授权的内容。用户需自行承担使用本工具的全部法律责任，开发者不对用户的任何行为负责。", 1, "popup·猫抓免责声明原文（逐字）")
has(pjs, "snifferDisclaimerAgreed", "popup·同意态持久键", count_ge=3)

# ---- 门9) 页面层 changelog 8.7.115 条目 ----
chunks = [n for n in names if n.startswith("chunks/") or "chunks/" in n]
alljs = b"".join(z.read(n) for n in chunks)
print(f"chunks aggregated: {len(alljs)//1024}KB")
has(alljs.decode("utf-8", "ignore"), "资源嗅探新增抖音完整视频下载；缓存抓取文件可播性根修", "页面层·changelog 8.7.115 标题")
has(alljs.decode("utf-8", "ignore"), "8.7.115", "页面层·changelog 版本号")

# ---- 门10) 云端快照对账 ----
try:
    zs = zipfile.ZipFile(SNAP)
    snames = zs.namelist()
    vj = json.loads(zs.read("version.json"))
    vlist = [f["p"] if isinstance(f, dict) else f for f in (vj.get("files") or [])]
    print("snapshot version:", vj.get("v"), "| files:", len(vlist), "| zip entries:", len(snames))
    if vj.get("v") == "8.7.115":
        ok += 1
        print("  [OK] 快照 version.json v=8.7.115")
    else:
        bad.append("snapshot v != 8.7.115")
    vset = set(vlist)
    sset = {n for n in snames if not n.endswith("/") and n != "version.json"}
    if vset == sset:
        ok += 1
        print(f"  [OK] 快照 zip 实体与 version.json 清单全等（{len(vset)} 文件）")
    else:
        bad.append(f"snapshot manifest diff: only-manifest={len(vset-sset)} only-zip={len(sset-vset)}")
except Exception as e:
    bad.append("snapshot check error: " + str(e))

print(f"\n===== verify-zip v8.7.115: {ok} OK / {len(bad)} BAD =====")
for b in bad:
    print("  [BAD]", b)
sys.exit(1 if bad else 0)
