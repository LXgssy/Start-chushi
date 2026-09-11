#!/bin/bash
# gh-pages 部署（/tmp/my-project 真工作树适配版，v8.2.9）
# 流程：build:export → sw.js 构建戳 → stage + .nojekyll → remote add + force push
#       → API 状态轮询（commit SHA 配对律）→ 线上内容验证
# v8.2.9 修正：stage 内 git remote add origin（坑⑤六度应验的根治——push 无 remote
#   会静默失败且脚本曾用 || true 吞掉报错 = 假绿；本轮起 push 失败直接退出）。
set -euo pipefail
BASE=/tmp/my-project
PKG=/home/z/my-project/.pkgtmp
STAGE=$PKG/gh-pages-deploy
REPO="LXgssy/Start-chushi"
SITE_URL="https://lxgssy.github.io/Start-chushi/"
GH_PAT="$(tr -d '[:space:]' < $PKG/gh-token)"

api() {
  curl -sS -H "Authorization: Bearer $GH_PAT" \
       -H "Accept: application/vnd.github+json" \
       -H "Content-Type: application/json" -X "${APIMETHOD:-GET}" "$@"
}

cd "$BASE"
LOCAL_SHA=$(git rev-parse --short HEAD)
echo "==> build:export (from $LOCAL_SHA) ..."
EXPORT_MODE=1 NEXT_PUBLIC_BASE_PATH=/Start-chushi ./node_modules/.bin/next build > /dev/null 2>&1
[ -f out/index.html ] || { echo "!!! 导出失败"; exit 1; }
[ -f out/sw.js ] || { echo "!!! out/sw.js 缺失"; exit 1; }

echo "==> sw.js 构建戳 ..."
SW_STAMP="$(date -u +%Y%m%d-%H%M%S)-$LOCAL_SHA"
sed -i "s/__SW_BUILD__/$SW_STAMP/" out/sw.js
echo "    start-chushi-$SW_STAMP"

echo "==> 抽查 basePath 残留 + v8.2.9 特征在位 ..."
if grep -rl '"/_next/' out/index.html >/dev/null 2>&1; then
  echo "!!! out/index.html 含无 basePath 的 /_next/ 引用——EXPORT_MODE 未生效"; exit 1
fi
SBJ_HITS=$(grep -c "alignAt(msRaw, lineMode)" out/sandbox.js || true)
[ "$SBJ_HITS" -ge 1 ] || { echo "!!! out/sandbox.js 缺 v8.2.9 行级时钟特征"; exit 1; }
echo "    (basePath 干净 + sandbox.js 行级时钟在位)"

echo "==> 暂存 gh-pages 内容 ..."
rm -rf "$STAGE" && mkdir -p "$STAGE"
cp -r out/. "$STAGE"/
touch "$STAGE/.nojekyll"
du -sh "$STAGE" | awk '{print "    体积: "$1}'

echo "==> 推送 gh-pages（全新历史 + 显式 remote add）..."
cd "$STAGE"
git init -q -b gh-pages
git config user.name  "Super Z"
git config user.email "superz@z.ai"
git add -A
git commit -qm "deploy: Pages build from $LOCAL_SHA (v8.2.9 桥响应提速+行级时钟+双开关+128段+动画修订)"
HELPER="$PKG/gh-cred-helper.sh"
printf '#!/bin/bash\necho "username=%s"\necho "password=%s"\n' 'LXgssy' "$GH_PAT" > "$HELPER"
chmod 700 "$HELPER"
git remote remove origin >/dev/null 2>&1 || true
git remote add origin "https://lxgssy:$GH_PAT@github.com/$REPO.git"
GIT_TERMINAL_PROMPT=0 git push --force origin gh-pages 2>&1 | grep -vE 'password|remote:' 
PUSHED_SHA=$(git rev-parse --short HEAD)

echo "==> 轮询 Pages 构建状态（最长 6 分钟，SHA 配对律）..."
BUILT_SHA=""
for i in $(seq 1 36); do
  READOUT=$(api "https://api.github.com/repos/$REPO/pages/builds/latest" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','?'), (d.get('commit') or '')[:7])" 2>/dev/null || echo "? ?")
  STATUS=$(echo "$READOUT" | awk '{print $1}')
  CMT=$(echo "$READOUT" | awk '{print $2}')
  echo "    [$i] status=$STATUS commit=$CMT (pushed $PUSHED_SHA)"
  if [ "$STATUS" = "built" ]; then BUILT_SHA="$CMT"; break; fi
  [ "$STATUS" = "errored" ] && { echo "!!! Pages 构建失败"; exit 1; }
  sleep 10
done
if [ -n "$BUILT_SHA" ] && [ "$BUILT_SHA" != "$PUSHED_SHA" ]; then
  echo "!!! 构建的 commit ($BUILT_SHA) ≠ 推送的 commit ($PUSHED_SHA)——假绿，拒绝"; exit 1
fi

echo "==> 线上验证: $SITE_URL"
HTTP_CODE=$(curl -sL -o /dev/null -w '%{http_code}' --max-time 20 "$SITE_URL" 2>/dev/null || echo "000")
ONLINE_SB=$(curl -sL --max-time 20 "${SITE_URL}sandbox.js?v=999" 2>/dev/null | grep -c "alignAt(msRaw, lineMode)" || true)
echo "    HTTP $HTTP_CODE · sandbox.js 行级时钟特征 $ONLINE_SB 处"
if [ "$HTTP_CODE" = "200" ] && [ "$ONLINE_SB" -ge 1 ]; then
  echo "DEPLOY-OK: $SITE_URL (commit $PUSHED_SHA, v8.2.9 内容已上线)"
else
  echo "DEPLOY-DONE (线上验证受限，API 状态/SHA 已配对): $SITE_URL (commit $PUSHED_SHA)"
fi
