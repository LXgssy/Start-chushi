#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.125 zip 内容门（verify-zip-v87115 骨架 + 本轮改写）
用户指令：「修复资源嗅探里的缓存抓捕里没有正确抓取当前播放视频的缓存的
bug，抓取出来的缓存视频文件也有一堆乱码并且音画不同步」——三连根修：
①抓错目标根修＝媒体源实例分组：探针 v5 WeakMap 懒分配 msId，catch-track
  /catch-chunk/catch-eos 三信号随行 ms；桥轨道记 ms+lastTs，下载只合成
  「最近活跃组」，其余组按组计数忽略并提示（浮窗状态行 extra）。
②乱码根修＝needsInit box-walk：fMP4 媒体分段首顶层 box 可能是 emsg/prft/
  sidx 前置（v4 只认 moof/styp 开头 → init 漏补 → 缺 ftyp+moov 解析崩）。
③乱码+音画不同步根修＝多 init 拆分：ABR/换源使流中间再次出现 init
  （ftyp/EBML 头），直接拼接则文件中间嵌第二个 init；按 chunk 首 box 拆段
  各自可播，TS 自包含不拆。
回归保留：v8.7.115 备胎库/自动下载开关/抖音专区+DNR 9003/免责门/toast 退役
/避免抓取名单；v8.7.112 三信号。
锚串纪律：不跨引号/换行边界；扩展脚本未 minify（源样注入），页面 chunk 锚只取字符串字面量。"""
import zipfile, json, re, hashlib, sys

BASE = "/home/z/beta-wt/download/v8.7.125/"
ZIP = BASE + "ChuShi-NewTab-v8.7.125.zip"
SNAP = BASE + "ChuShi-CloudSnapshot-v8.7.125.zip"
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
if man.get("version") == "8.7.125":
    ok += 1
else:
    bad.append("manifest version != 8.7.125")

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
alltxt = b"".join(z.read(n) for n in names if n.endswith(".html"))
if not residue and b"/_next/" not in alltxt:
    ok += 1
    print("  [OK] 包体零 /_next/ 路径残留")
else:
    bad.append("_next residue: files=" + str(residue))

# ---- 门4) 探针 v5：媒体源实例分组（msId 随行三信号） ----
probe = z.read("sniffer-probe.js").decode("utf-8")
has(probe, "sniffer-probe v5（v8.7.125，+媒体源实例分组）", "探针·v5 版本头")
has(probe, "var msSeq = 0;", "探针·msId 序号")
has(probe, "var msIds = typeof WeakMap === \"function\" ? new WeakMap() : null;", "探针·WeakMap 实例表")
has(probe, "function msIdOf(msObj)", "探针·msId 懒分配器")
has(probe, "var msId = msIdOf(this);", "探针·addSourceBuffer 处取实例 id")
has(probe, '"catch-track", idx: trackIdx, mime: mime, ms: msId', "探针·轨道登记随行 ms")
has(probe, '"catch-chunk", idx: idx, mime: mime || "", ms: ms || 0', "探针·分段随行 ms")
has(probe, '"catch-eos", ms: msIdOf(this)', "探针·EOS 随行 ms")
has(probe, "catchChunk(trackIdx, data, mime, msId)", "探针·appendBuffer 截留带 msId", count_ge=2)
has(probe, "INIT_HARD_CAP = 4194304", "探针·截留 4MB 兜底硬顶（回归）")
has(probe, '"catch-init-done"', "探针·初始化段攒齐回流信号（回归）")

# ---- 门5) 桥 v5：分组过滤 + needsInit box-walk + 多 init 拆分 ----
bridge = z.read("sniffer-bridge.js").decode("utf-8")
has(bridge, "sniffer-bridge v5（v8.7.125，+媒体源分组过滤）", "桥·v5 版本头")
has(bridge, "{mime, ms, chunks:[], size, lastTs}", "桥·轨道结构（ms+lastTs）")
has(bridge, "function activeMs()", "桥·活跃媒体源组判定")
has(bridge, "tr.lastTs = Date.now();", "桥·chunk 到达记活跃时刻")
has(bridge, "(tt.ms || 0) === act", "桥·下载池按活跃组过滤")
has(bridge, "{ t: tt, ti: pi }", "桥·下载池保留原索引（备胎对账）")
has(bridge, "initPrefixFor(pool[i].ti, head)", "桥·备胎按原索引取用")
has(bridge, "function needsInit(firstChunk)", "桥·box-walk 缺 init 判定")
has(bridge, 'if (type === "ftyp") return false;', "桥·见 ftyp 即已有 init")
has(bridge, 'if (type === "moof" || type === "styp") return true;', "桥·见媒体 box 即需补 init")
has(bridge, "if (!needsInit(firstChunk)) return null;", "桥·initPrefixFor 改用 box-walk")
has(bridge, "function splitByInit(chunks, mime)", "桥·多 init 拆分器")
has(bridge, '"video/mp2t"', "桥·TS 自包含不拆", count_ge=1)
has(bridge, "if (u8[0] === 0x1A && u8[1] === 0x45 && u8[2] === 0xDF && u8[3] === 0xA3) head = true;", "桥·EBML 头识别为 init 头")
has(bridge, 'if (t === "ftyp") head = true;', "桥·ftyp 头识别为 init 头")
has(bridge, 'if (segs.length > 1) label += "-" + (s + 1);', "桥·拆段文件名序号")
has(bridge, "检测到清晰度/流切换，已按切换点拆成", "桥·拆段提示文案")
has(bridge, "个其他媒体源（广告/预加载等，非当前播放）", "桥·忽略组提示文案")
has(bridge, "extra: g > 1 ? g - 1 : 0", "桥·info() 忽略组计数")
has(bridge, "return \"mp4\";", "桥·容器识别 ftyp→mp4（回归）", count_ge=1)
has(bridge, "tr.mime = cm", "桥·嗅探晚开 mime 回填（回归）")
has(bridge, "CATCH_INIT_MAX = 1048576", "桥·备胎库 1MB 顶（回归）")
has(bridge, "function initScan(st, idx)", "桥·box-walk 攒齐判定（回归）")
has(bridge, "var sawMoov = false;", "桥·initScan sawMoov 状态")
has(bridge, 'if (sawMoov) { initMarkDone(st, idx, off); return true; }', "桥·moov 后任意 box 即媒体段边界（emsg 前置精确截断）")
has(bridge, "buf[p + 1] === 0x43", "桥·WebM Cluster 字节识别（回归）")
has(bridge, "部分文件缺初始化段", "桥·缺 init 诚实提示（回归）")
has(bridge, "function catchMaybeAutoDownload()", "桥·自动下载执行器（回归）")
has(bridge, '"snifferCatchAutoDl"', "桥·自动下载偏好键（回归）")
has(bridge, "捕获完成，已自动下载（", "桥·自动下载备注文案（回归）")
has(bridge, "CATCH_MAX_BYTES = 1073741824", "桥·1GB 硬顶（回归）")
has(bridge, "__chushiCatchApi", "桥·同世界 API 暴露（回归）", count_ge=2)
has(bridge, "OPT_OUT_HOSTS = []", "桥·避免抓取名单（回归）")
gone(bridge, 'Array.isArray(prefix) ? prefix.concat(t.chunks) : t.chunks', "桥·v4 全量拼接旧路径已退役")
gone(bridge, 'tag4 === "moof" || tag4 === "styp"', "桥·v4 只认 moof/styp 的漏判旧路径已退役")

# ---- 门6) 浮窗：分组提示 + 新 tip + 回归 ----
fl = z.read("sniffer-float.js").decode("utf-8")
has(fl, "inf.extra > 0", "浮窗·忽略组计数读 info()")
has(fl, '" · 其他源"', "浮窗·状态行其他源提示")
has(fl, "只保存当前播放的媒体源，广告/预加载自动忽略；播放中切换清晰度会按切换点拆成多段；多音轨分文件保存。", "浮窗·tip 新文案（逐字）")
has(fl, '"catch-toggle"', "浮窗·开始/停止按钮（回归）")
has(fl, '"catch-restart"', "浮窗·从头捕获按钮（回归）")
has(fl, '"catch-dl"', "浮窗·下载数据按钮（回归）")
has(fl, '"catch-auto"', "浮窗·自动下载开关钮（回归）")
has(fl, "捕获完成后自动下载", "浮窗·自动下载开关文案（回归）", count_ge=2)
has(fl, "function onDouyinPage()", "浮窗·抖音页检测（回归）")
has(fl, "function douyinBlockHtml()", "浮窗·抖音区块渲染（回归）")
has(fl, "chushi-catch-state", "浮窗·状态事件跟随（回归）", count_ge=1)
has(fl, "缓存抓取", "浮窗·缓存抓取标题文案（回归）", count_ge=3)
gone(fl, 'showToast("嗅探到', "浮窗·「嗅探到 N 个」提示退役保持（回归）")
gone(fl, "opts.notify", "浮窗·notify 通道零残留（回归）")

# ---- 门7) SW：抖音 DNR + 名单回归 ----
bg = z.read("ext-bg.js").decode("utf-8")
has(bg, "DOUYIN_DNR_RULE_ID = 9003", "SW·抖音 DNR 规则 ID（回归）")
has(bg, '{ header: "Referer", operation: "set", value: "https://www.douyin.com/" }', "SW·Referer 会话规则（回归）")
has(bg, "function isDouyinUrl(u)", "SW·抖音域族判定（回归）")
has(bg, "SNIFF_OPT_OUT_HOSTS = []", "SW·避免抓取名单（回归）")

# ---- 门8) 免责声明门回归 ----
phtml = z.read("popup.html").decode("utf-8")
pjs = z.read("popup.js").decode("utf-8")
has(phtml, 'id="sniff-gate"', "popup·声明弹层挂载点（回归）")
exact(phtml, "本扩展仅供下载用户拥有版权或已获授权的视频，禁止用于下载受版权保护且未经授权的内容。用户需自行承担使用本工具的全部法律责任，开发者不对用户的任何行为负责。", 1, "popup·猫抓免责声明原文（逐字，回归）")
has(pjs, "snifferDisclaimerAgreed", "popup·同意态持久键（回归）", count_ge=3)

# ---- 门9) 页面层 changelog 8.7.125 条目 ----
chunks = [n for n in names if "chunks/" in n]
alljs = b"".join(z.read(n) for n in chunks)
print(f"chunks aggregated: {len(alljs)//1024}KB")
has(alljs.decode("utf-8", "ignore"), "缓存抓取三连根修：只抓当前播放视频、乱码与音画不同步", "页面层·changelog 8.7.125 标题")
has(alljs.decode("utf-8", "ignore"), "8.7.125", "页面层·changelog 版本号")

# ---- 门10) 云端快照对账 ----
try:
    zs = zipfile.ZipFile(SNAP)
    snames = zs.namelist()
    vj = json.loads(zs.read("version.json"))
    vlist = [f["p"] if isinstance(f, dict) else f for f in (vj.get("files") or [])]
    print("snapshot version:", vj.get("v"), "| files:", len(vlist), "| zip entries:", len(snames))
    if vj.get("v") == "8.7.125":
        ok += 1
        print("  [OK] 快照 version.json v=8.7.125")
    else:
        bad.append("snapshot v != 8.7.125")
    vset = set(vlist)
    sset = {n for n in snames if not n.endswith("/") and n != "version.json"}
    if vset == sset:
        ok += 1
        print(f"  [OK] 快照 zip 实体与 version.json 清单全等（{len(vset)} 文件）")
    else:
        bad.append(f"snapshot manifest diff: only-manifest={len(vset-sset)} only-zip={len(sset-vset)}")
except Exception as e:
    bad.append("snapshot check error: " + str(e))

print(f"\n===== verify-zip v8.7.125: {ok} OK / {len(bad)} BAD =====")
for b in bad:
    print("  [BAD]", b)
sys.exit(1 if bad else 0)
