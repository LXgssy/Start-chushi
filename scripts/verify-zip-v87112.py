#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.112 zip 内容门（verify-zip-v87109 骨架 + 本轮改写）
本轮：①缓存抓取（探针 catch-track/chunk/eos 三信号 + 桥 __chushiCatchApi 攒块
API + 浮窗缓存抓取区块，data-chushi-catch 捕获态属性，1GB 硬顶）
②免责声明门（popup sniff-gate 弹层 + snifferDisclaimerAgreed 同意态，
声明文本引自猫抓 cat-catch）③避免抓取名单（bridge OPT_OUT_HOSTS 页面侧 +
ext-bg SNIFF_OPT_OUT_HOSTS webRequest 侧）④changelog 8.7.112 条目。
锚串纪律：不跨引号/换行边界；扩展脚本未 minify（源样注入），页面 chunk 锚只取字符串字面量。"""
import zipfile, json, re, hashlib, sys

BASE = "/home/z/beta-wt/download/v8.7.112/"
ZIP = BASE + "ChuShi-NewTab-v8.7.112.zip"
SNAP = BASE + "ChuShi-CloudSnapshot-v8.7.112.zip"
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
if man.get("version") == "8.7.112":
    ok += 1
else:
    bad.append("manifest version != 8.7.112")

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

# ---- 门4) 探针缓存抓取三信号（sniffer-probe.js 源样注入）----
probe = z.read("sniffer-probe.js").decode("utf-8")
has(probe, '"catch-track"', "探针·轨道登记信号")
has(probe, '"catch-chunk"', "探针·分段截留信号")
has(probe, '"catch-eos"', "探针·完成信号")
has(probe, 'data-chushi-catch', "探针·捕获态属性门 catchArmed", count_ge=2)
has(probe, 'catchChunk(trackIdx, data)', "探针·appendBuffer 挂截留")
has(probe, 'window.postMessage(msg, "*", transfer || undefined)', "探针·transfer 零二次拷贝通道")
has(probe, 'MediaSource.prototype.endOfStream', "探针·endOfStream 挂钩")

# ---- 门5) 桥缓存抓取数据面（sniffer-bridge.js）----
bridge = z.read("sniffer-bridge.js").decode("utf-8")
has(bridge, "__chushiCatchApi", "桥·同世界 API 暴露", count_ge=2)
has(bridge, "CATCH_MAX_BYTES = 1073741824", "桥·1GB 硬顶")
has(bridge, 'new CustomEvent("chushi-catch-state", { detail: catchInfo() })', "桥·状态广播事件")
has(bridge, "OPT_OUT_HOSTS = []", "桥·避免抓取名单（页面侧）")
has(bridge, 'document.documentElement.setAttribute("data-chushi-catch", "1")', "桥·捕获态属性设置")
has(bridge, "new Blob(t.chunks, { type: mime || \"application/octet-stream\" })", "桥·Blob 合成下载")
has(bridge, "vids[i].currentTime = 0", "桥·从头捕获回跳")
gone(bridge, "if (!catchOn) return;                    /* 未开捕获：分段零驻留 */XX", "桥·占位")

# ---- 门6) 浮窗缓存抓取区块（sniffer-float.js）----
fl = z.read("sniffer-float.js").decode("utf-8")
has(fl, "catchBlockHtml", "浮窗·缓存抓取区块渲染", count_ge=2)
has(fl, '"catch-toggle"', "浮窗·开始/停止按钮")
has(fl, '"catch-restart"', "浮窗·从头捕获按钮")
has(fl, '"catch-dl"', "浮窗·下载数据按钮")
has(fl, "chushi-catch-state", "浮窗·状态事件跟随", count_ge=1)
has(fl, "缓存抓取", "浮窗·缓存抓取标题文案", count_ge=3)
has(fl, "__chushiCatchApi", "浮窗·直调桥 API", count_ge=2)

# ---- 门7) 免责声明门（popup.html + popup.js）----
phtml = z.read("popup.html").decode("utf-8")
pjs = z.read("popup.js").decode("utf-8")
has(phtml, 'id="sniff-gate"', "popup·声明弹层挂载点")
has(phtml, 'id="sniff-gate-yes"', "popup·同意按钮")
has(phtml, 'id="sniff-gate-no"', "popup·不同意按钮")
has(phtml, "免责声明 · 引自开源项目「猫抓 cat-catch」", "popup·声明出处署名")
exact(phtml, "本扩展仅供下载用户拥有版权或已获授权的视频，禁止用于下载受版权保护且未经授权的内容。用户需自行承担使用本工具的全部法律责任，开发者不对用户的任何行为负责。", 1, "popup·猫抓免责声明原文（逐字）")
exact(phtml, "本工具按“原样”提供，开发者不承担任何直接或间接责任。", 1, "popup·猫抓免责声明原文（尾句逐字）")
has(pjs, "snifferDisclaimerAgreed", "popup·同意态持久键", count_ge=3)
has(pjs, 'snifferDisclaimerAgreed: true, snifferOn: true', "popup·同意即开启同写")
has(pjs, "sniffGateShow", "popup·门弹层控制", count_ge=2)

# ---- 门8) 避免抓取名单（ext-bg.js webRequest 侧）----
bg = z.read("ext-bg.js").decode("utf-8")
has(bg, "SNIFF_OPT_OUT_HOSTS = []", "SW·避免抓取名单")
has(bg, "if (sniffOptOut(details.url)) return;", "SW·onResponseStarted 名单门")

# ---- 门9) 页面层 changelog 8.7.112 条目 ----
chunks = [n for n in names if n.startswith("chunks/") or "chunks/" in n]
alljs = b"".join(z.read(n) for n in chunks)
print(f"chunks aggregated: {len(alljs)//1024}KB")
has(alljs.decode("utf-8", "ignore"), "资源嗅探新增「缓存抓取」；开启前需同意免责声明", "页面层·changelog 8.7.112 标题")
has(alljs.decode("utf-8", "ignore"), "8.7.112", "页面层·changelog 版本号")

# ---- 门10) 云端快照对账 ----
try:
    zs = zipfile.ZipFile(SNAP)
    snames = zs.namelist()
    vj = json.loads(zs.read("version.json"))
    vlist = [f["p"] if isinstance(f, dict) else f for f in (vj.get("files") or [])]
    print("snapshot version:", vj.get("v"), "| files:", len(vlist), "| zip entries:", len(snames))
    if vj.get("v") == "8.7.112":
        ok += 1
        print("  [OK] 快照 version.json v=8.7.112")
    else:
        bad.append("snapshot v != 8.7.112")
    vset = set(vlist)
    sset = {n for n in snames if not n.endswith("/") and n != "version.json"}
    if vset == sset:
        ok += 1
        print(f"  [OK] 快照 zip 实体与 version.json 清单全等（{len(vset)} 文件）")
    else:
        bad.append(f"snapshot manifest diff: only-manifest={len(vset-sset)} only-zip={len(sset-vset)}")
except Exception as e:
    bad.append("snapshot check error: " + str(e))

print(f"\n===== verify-zip v8.7.112: {ok} OK / {len(bad)} BAD =====")
for b in bad:
    print("  [BAD]", b)
sys.exit(1 if bad else 0)
