#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v8.7.155 zip 验证（verify-zip-v8729 骨架 + v8.7.155 拆分门 + 全量回归）
本轮：多开新标签页掉帧根修。
  A. 自绘注册表拆分：selfdraw-icons.json（15.4MB 全册）退役 →
     selfdraw/i/<key>.json ×188（[vb,body,dom] 裸三元组，字节级一致）；
     加载器 per-key 按需 fetch + force-cache + ?v= 版本钉（SELFDRAW_REG_VER=2）。
  B. 背景冻结律：globals 三闸门（cs-bg-frozen 纱罩 / cs-drawer 抽屉 / cs-hidden
     隐藏页）animation-play-state 暂停极光 drift ×4 + kenburns；useBgFreeze
     引用计数挂类（ChangelogDialog/CommandPalette/LinkDialog/PdfTools/
     PresetDocs）；AuroraBackground 视频同三闸门 pause/play。
回归：v8.7.154（shape-rendering 精度档）/ v8.7.153（chaoxing 描摹锚 +
HOST_MAP 入 chunk）/ v8.7.152（壳 bootAccent 两级取色 + 快照更新器 +
data-wallpaper 门槛）/ auth SHA 钉定 / MOUNT_VER 未动。
锚串纪律：不跨引号/换行边界；swc minify 改名免疫——行为锚只取字符串
字面量/模板串片段/URL 片段。"""
import zipfile, json, re, sys, hashlib, pathlib

ZIP = "/home/z/beta-wt/download/v8.7.155/ChuShi-NewTab-v8.7.155.zip"
SRC_TS = pathlib.Path("/home/z/beta-wt/src/lib/startpage/selfdraw-icons.ts")
z = zipfile.ZipFile(ZIP)
names = z.namelist()
ok, bad = 0, []

def gate(cond, tag, detail=""):
    global ok
    if cond:
        ok += 1
        print(f"  [OK] {tag}")
    else:
        bad.append(f"{tag}: {detail}")
        print(f"  [FAIL] {tag} {detail}")

def has(payload, needle, tag, count_ge=1):
    gate(payload.count(needle) >= count_ge, tag, f"expect>={count_ge} got {payload.count(needle)}")

def gone(payload, needle, tag):
    gate(needle not in payload, "[GONE] " + tag, "still present")

# ---- 门1) manifest 版本 ----
man = json.loads(z.read("manifest.json"))
print("manifest version:", man.get("version"))
gate(man.get("version") == "8.7.155", "manifest 8.7.155")

# ---- 门2) auth SHA 钉定 ----
sha = hashlib.sha256(z.read("ext-chushi-auth.js")).hexdigest()
print("auth sha256:", sha[:16], "…")
gate(sha == "b1776839307a6685752b62cb4875de366dfc6f8ade1ece4fc7a14b2e9e8fb794",
     "auth SHA 钉定", sha)

# ---- 门3) 全册退役 + 拆分文件集 ----
gate("selfdraw-icons.json" not in names, "全册 selfdraw-icons.json 退役")
split = sorted(n for n in names if re.match(r"^selfdraw/i/[\w-]+\.json$", n))
print("split files:", len(split))
gate(len(split) == 188, "拆分条目 188 文件", str(len(split)))
# 逐文件三元组形状 + 总量
total = 0
shape_bad = []
for n in split:
    try:
        t = json.loads(z.read(n))
        if not (isinstance(t, list) and len(t) == 3 and all(isinstance(x, str) and x for x in t)):
            shape_bad.append(n); continue
        if not re.match(r"^#[0-9a-fA-F]{6}$", t[2]):
            shape_bad.append(n + ":dom"); continue
        total += len(t[1])
    except Exception as e:
        shape_bad.append(f"{n}:{e}")
gate(not shape_bad, "拆分条目三元组形状 + dom 色值", str(shape_bad[:5]))
print(f"split body total: {total:,} bytes")
gate(15_000_000 < total < 16_000_000, "拆分笔迹总量守恒（≈15.2MB）", str(total))
# HOST_MAP 键集（源码提取）⊆ 文件集（子集律：gershui 等孤儿条目随册保留，
# 数量门 188 已另卡）
src = SRC_TS.read_text()
keys_src = set(re.findall(r'"[\w.-]+":\s*"([\w-]+)"', src.split("const HOST_MAP")[1].split("};")[0]))
keys_zip = {n[len("selfdraw/i/"):-len(".json")] for n in split}
orphans = sorted(keys_zip - keys_src)
print("orphan keys (registry-only):", orphans)
gate(keys_src <= keys_zip, "HOST_MAP 值集 ⊆ 文件集",
     f"missing={sorted(keys_src-keys_zip)[:5]}")

# ---- 门4) chaoxing 描摹锚（v8.7.153 回归，落拆分文件） ----
t = json.loads(z.read("selfdraw/i/chaoxing.json"))
vb, body, dom = t
gate(dom == "#E60012", "chaoxing dom 纯红底")
gate('fill="#E60012"' in body, "chaoxing 满幅底模板")
gate("M44.45 946.25" in body, "chaoxing 白流星贝塞尔锚")
gate(body.count("<path") == 2 and body.count("<g") == 1, "chaoxing 2 path + 1 g")
gate(vb.startswith("23.96 23.96 976.08 976.08"), "chaoxing viewBox 锚")

# ---- 门5) 页面 chunk 锚 ----
chunks = [n for n in names if re.match(r"next/static/chunks/.*\.js$", n)]
print(f"chunks: {len(chunks)}")
alljs = "".join(z.read(n).decode("utf-8", "ignore") for n in chunks)
has(alljs, "selfdraw/i/", "chunk: 拆分 URL 模板前缀")
has(alljs, ".json?v=", "chunk: 版本钉 ?v= 模板")
has(alljs, "force-cache", "chunk: force-cache 长缓存")
has(alljs, "chaoxing.com", "chunk: HOST_MAP chaoxing 回归")
has(alljs, "geometricPrecision", "chunk: v8.7.154 精度档回归")
has(alljs, "cs-bg-frozen", "chunk: 冻结律挂类（useBgFreeze/cs-hidden）", count_ge=2)
has(alljs, "cs-hidden", "chunk: 隐藏页闸门", count_ge=2)
has(alljs, "多开新标签页掉帧根修", "chunk: changelog 8.7.155 标题")
has(alljs, "data-wallpaper", "chunk: v8.7.152 data-wallpaper 回归")
# css 三闸门（css 产物在 next/static/chunks/ 下）
css = "".join(z.read(n).decode("utf-8", "ignore")
              for n in names if re.match(r"next/static/chunks/.*\.css$", n))
has(css, "animation-play-state:paused", "css: 冻结 play-state（minify 形态）")
for cls in ("cs-bg-frozen", "cs-drawer", "cs-hidden"):
    has(css, f"html.{cls} .aurora-blob", f"css: {cls} 极光闸门")
has(css, "html.cs-drawer .kenburns", "css: 抽屉 kenburns 闸门")

# ---- 门6) 壳层 v8.7.152 回归 ----
sb = z.read("shell-bridge.js").decode("utf-8")
has(sb, "bootAccent", "shell-bridge: bootAccent 两级取色")
has(sb, "start:settings", "shell-bridge: localStorage 同源取色")
extbg = z.read("ext-bg.js").decode("utf-8")
has(extbg, "SNAP_MIRRORS", "ext-bg: 快照更新器镜像列表")
has(extbg, "version.json", "ext-bg: 云端 manifest 比对")

# ---- 门7) MOUNT_VER 未动 + manifest 权限 ----
snf = z.read("sniffer-float.js").decode("utf-8")
has(snf, 'var MOUNT_VER = "v8.7.151"', "浮窗 MOUNT_VER 未动")
gate("alarms" in man.get("permissions", []), "manifest alarms")
gate(any("cs-snap/sandbox.html" in p for p in man.get("sandbox", {}).get("pages", [])),
     "manifest 快照沙箱特权")

# ---- 门8) 云端快照载荷 ----
snap = json.loads(z.read("cs-snap/version.json")) if "cs-snap/version.json" in names else None
# 快照 version.json 在扩展包内的镜像（若打包注入）；主校验放 cloud-snapshot 目录
snap_dir = pathlib.Path("/home/z/beta-wt/download/v8.7.155/cloud-snapshot")
vj = json.loads((snap_dir / "version.json").read_text())
files = vj.get("files", [])
paths = {f["p"] for f in files}
gate(vj.get("v") == "8.7.155", "快照 version.json v8.7.155")
gate("selfdraw-icons.json" not in paths, "快照载荷全册退役")
gate(sum(1 for p in paths if p.startswith("selfdraw/i/")) == 188, "快照载荷拆分 188")
gate("index.html" in paths and "shell.html" not in paths, "快照载荷页面文件集形态")

print(f"\n===== verify-zip-v87155: {ok} 绿 / {len(bad)} 红 =====")
for b in bad:
    print("  RED:", b)
sys.exit(1 if bad else 0)
