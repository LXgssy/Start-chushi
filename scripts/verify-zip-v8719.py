# verify-zip-v8719.py — zip 内嵌预设逐串新鲜度验证（Task 154 教训⑤律）
# 防假阴：探针读仓内 json 不够，必须验证最终 zip 里 chunk 的实际内容
import zipfile, pathlib, re, hashlib

Z = "/tmp/beta-wt/download/v8.7.19/ChuShi-NewTab-v8.7.19.zip"
MUST = [
    # v8.7.19 点击反馈三件套（CSS）
    "#csWordBtn:active{transform:scale(.82);color:var(--acc)}",
    "#csWordBtn.on{filter:drop-shadow(0 0 5px var(--acc32))}",
    "@keyframes cs-wpulse-kf{0%{transform:scale(.82)}45%{transform:scale(1.22)}100%{transform:scale(1)}}",
    "#csWordBtn.wpulse{animation:cs-wpulse-kf .32s var(--ez)}",
    # v8.7.19 点击反馈（JS）——widget js 经 json 转义内嵌（\\n+\\\"），
    # 锚串必须不跨引号/换行边界：void 算子+属性访问无引号
    "void wordBtn.offsetWidth",
    # v8.7.18 存量律不回归（抽样）
    "#csWordBtn:hover{background:transparent;color:var(--acc);transform:none}",
    "#csWordBtn{position:absolute;right:-4px;top:100%",
    # 版本串
    "8.7.19",
]
GONE = [
    "8.7.18-beta",  # 旧版本串不得再出现（chunk 里的版本号应是 8.7.19）
]

zf = zipfile.ZipFile(Z)
hits, misses = {}, []
for name in zf.namelist():
    if not name.endswith(".js"):
        continue
    data = zf.read(name).decode("utf-8", "ignore")
    for m in MUST:
        if m in data:
            hits.setdefault(m, name)

for m in MUST:
    ok = m in hits
    print(("PASS" if ok else "FAIL"), repr(m[:60]), "->", hits.get(m, "NOT FOUND"))
    if not ok:
        misses.append(m)

for g in GONE:
    found = [n for n in zf.namelist() if n.endswith(".js") and g in zf.read(n).decode("utf-8", "ignore")]
    # 注意：changelog 条目里历史版本串 "8.7.18" 合法存在，只验证带 -beta 的构建版本串
    print(("PASS" if not found else "FAIL"), "GONE", repr(g), found[:2] if found else "")
    if found:
        misses.append(g)

print("\nzip:", Z, pathlib.Path(Z).stat().st_size, "bytes")
print("sha256:", hashlib.sha256(pathlib.Path(Z).read_bytes()).hexdigest()[:16], "…")
raise SystemExit(1 if misses else 0)
