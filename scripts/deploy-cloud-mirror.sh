#!/usr/bin/env bash
# ============================================================
# v8.4.5+ 云端推送部署器——「之后所有更新就靠云推」的落地脚本
#
# 把 ChuShi-CloudSnapshot-v<ver>.zip（build-extension.py 第 7 段产出）
# 铺到公开仓 gh-pages 根 = SNAP_MIRRORS[0]
#   https://lxgssy.github.io/Start-chushi/version.json
#
# 用法: bash scripts/deploy-cloud-mirror.sh [版本号]
#   缺省版本号时自动取 download/ 下最新载荷
#
# 未来云推全链（每次发新版照此执行）:
#   1) 改 scripts/build-extension.py 的 VERSION
#   2) bun run build:extension && python3 scripts/build-extension.py
#      （产出 download/v<新>/ChuShi-NewTab-v<新>.zip + ChuShi-CloudSnapshot-v<新>.zip）
#   3) bash scripts/deploy-cloud-mirror.sh <新版本号>   ← 本脚本
#   4) 装机端后台 ≤6h 内自动静默更新（onStartup / alarms 双触发）
# ============================================================
set -euo pipefail
ROOT=/tmp/my-project
WT=/tmp/cs-mirror
BASE_URL="https://lxgssy.github.io/Start-chushi"

if [ -n "${1:-}" ]; then
  ZIP="$ROOT/download/v$1/ChuShi-CloudSnapshot-v$1.zip"
else
  ZIP=$(ls -t "$ROOT"/download/v*/ChuShi-CloudSnapshot-v*.zip | head -1)
fi
test -f "$ZIP" || { echo "载荷不存在: $ZIP"; exit 1; }
VER=$(basename "$ZIP" | sed 's/.*-v\(.*\)\.zip/\1/')
echo "==> 载荷: $ZIP (v$VER)"

cd "$ROOT"
git worktree remove --force "$WT" 2>/dev/null || true
git fetch origin gh-pages
git worktree add --detach "$WT" origin/gh-pages

# 清树铺载荷
find "$WT" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
unzip -q -o "$ZIP" -d "$WT"
# v8.4.7：gh-pages 需要 .nojekyll（version.json 清单含它，s=0）
touch "$WT/.nojekyll"
# v8.4.7：网页版回归——/web/ 子路径部署 basePath 独立构建（与载荷共存零碰撞）
WEB_DIR="$ROOT/download/v$VER/web-export"
if [ -d "$WEB_DIR" ]; then
  rm -rf "$WT/web"
  cp -r "$WEB_DIR" "$WT/web"
  echo "==> 网页版已并入: web/ ($(find "$WT/web" -type f | wc -l) 文件)"
fi

# 清单一致性门（推前）：version.json 与树逐文件对齐，零缺零多尺寸全符
python3 - "$WT" <<'PY'
import json, os, sys
os.chdir(sys.argv[1])
m = json.load(open("version.json"))
mf = {f["p"]: f["s"] for f in m["files"]}
bad = []
for p, s in mf.items():
    if not os.path.isfile(p):
        bad.append("缺 " + p)
    elif s and os.path.getsize(p) != s:
        bad.append(f"尺寸 {p}: {os.path.getsize(p)}!={s}")
extra = []
for dp, _, fns in os.walk("."):
    if dp.startswith("./.git"):
        continue
    for fn in fns:
        p = os.path.relpath(os.path.join(dp, fn))
        if p == ".git" or p.startswith(".git/"):  # worktree 的 .git 指针文件
            continue
        if p not in mf and p != "version.json" and not p.startswith("web/"):
            extra.append(p)
if bad or extra:
    print("清单门未过:", bad[:10], extra[:10]); sys.exit(1)
print(f"清单门过：{len(mf)} 文件全对齐 (v{m['v']})")
PY

cd "$WT"
git add -A
git commit -q -m "deploy: cloud mirror v$VER — gh-pages 根=云端快照载荷（清单一致性门通过）"
git push origin HEAD:gh-pages
echo "==> gh-pages 已推送，等待 Pages 构建收敛到 v$VER ..."

V=""
for i in $(seq 1 18); do
  sleep 10
  V=$(curl -s "$BASE_URL/version.json" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("v",""))' 2>/dev/null || true)
  if [ "$V" = "$VER" ]; then echo "==> version.json 已上线: v=$V"; break; fi
  echo "    attempt $i: v=${V:-无}"
done
if [ "$V" != "$VER" ]; then echo "Pages 未在 3 分钟内收敛到 v$VER"; exit 1; fi

cd "$ROOT"
python3 "$ROOT/scripts/verify-cloud-mirror.py" "$ZIP"
echo "==> 云端镜像 v$VER 部署完成，装机端将在后台自动更新"
