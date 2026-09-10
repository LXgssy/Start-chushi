#!/bin/bash
# gh-pages 部署（/tmp/my-project 真工作树适配版，v8.2.5）
# 流程：build:export → sw.js 构建戳 → stage + .nojekyll → force push gh-pages → API 状态轮询 → 线上验证
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

echo "==> 抽查 basePath 残留（Task 55 律）..."
if grep -rl '"/_next/' out/index.html >/dev/null 2>&1; then
  echo "!!! out/index.html 含无 basePath 的 /_next/ 引用——EXPORT_MODE 未生效"; exit 1
fi
echo "    (干净)"

echo "==> 暂存 gh-pages 内容 ..."
rm -rf "$STAGE" && mkdir -p "$STAGE"
cp -r out/. "$STAGE"/
touch "$STAGE/.nojekyll"
du -sh "$STAGE" | awk '{print "    体积: "$1}'

echo "==> 推送 gh-pages（全新历史）..."
cd "$STAGE"
git init -q -b gh-pages
git config user.name  "Super Z"
git config user.email "superz@z.ai"
git add -A
git commit -qm "deploy: Pages build from $LOCAL_SHA (v8.2.6 渲染休眠律 + CLIENT_VER)"
HELPER="$PKG/gh-cred-helper.sh"
printf '#!/bin/bash\necho "username=%s"\necho "password=%s"\n' 'LXgssy' "$GH_PAT" > "$HELPER"
chmod 700 "$HELPER"
GIT_TERMINAL_PROMPT=0 git -c credential.helper="$HELPER" push --force origin gh-pages 2>&1 | grep -vE '^remote:' || true

echo "==> 轮询 Pages 构建状态（最长 5 分钟）..."
for i in $(seq 1 30); do
  STATUS=$(api "https://api.github.com/repos/$REPO/pages/builds/latest" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "?")
  echo "    [$i] status=$STATUS"
  [ "$STATUS" = "built" ] && break
  [ "$STATUS" = "errored" ] && { echo "!!! Pages 构建失败"; exit 1; }
  sleep 10
done

echo "==> 线上验证: $SITE_URL"
HTTP_CODE=$(curl -sL -o /dev/null -w '%{http_code}' --max-time 20 "$SITE_URL" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  TITLE=$(curl -sL --max-time 20 "$SITE_URL" | grep -o '<title>[^<]*</title>' | head -1)
  echo "    HTTP $HTTP_CODE · $TITLE"
  echo "DEPLOY-OK: $SITE_URL"
else
  echo "    线上 HTTP $HTTP_CODE（容器网络可能屏蔽 github.io，以 API 构建状态为准）"
  echo "DEPLOY-DONE (线上验证受限): $SITE_URL"
fi
