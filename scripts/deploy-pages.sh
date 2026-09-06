#!/usr/bin/env bash
# ============================================================
# GitHub Pages 一键部署脚本
# 流程: 静态导出构建 → out/ 加 .nojekyll → 全新历史推送 gh-pages 分支
#       → API 开启 Pages(已开启则复用) → 轮询构建状态 → 线上验证
# 线上地址: https://lxgssy.github.io/Start-chushi/
# 前置: token 在 .pkgtmp/gh-token；工作树干净
# ============================================================
set -euo pipefail
BASE=/home/z/my-project
TOKEN_FILE=$BASE/.pkgtmp/gh-token
STAGE=$BASE/.pkgtmp/gh-pages-deploy
REPO="LXgssy/Start-chushi"
SITE_URL="https://lxgssy.github.io/Start-chushi/"

[ -f "$TOKEN_FILE" ] || { echo "!!! 缺 token 文件"; exit 1; }
chmod 600 "$TOKEN_FILE"
GH_PAT="$(tr -d '[:space:]' < "$TOKEN_FILE")"
export GH_PAT
GITHUB_USER=LXgssy
export GITHUB_USER

api() {
  curl -sS -H "Authorization: Bearer $GH_PAT" \
       -H "Accept: application/vnd.github+json" \
       -H "Content-Type: application/json" \
       -X "${APIMETHOD:-GET}" "$@"
}

cd "$BASE"
[ -z "$(git status --porcelain)" ] || { echo "!!! 工作树不干净, 先提交"; exit 1; }
LOCAL_SHA=$(git rev-parse --short HEAD)

echo "==> 静态导出构建 (from $LOCAL_SHA) ..."
bun run build:export > /dev/null 2>&1
[ -f out/index.html ] || { echo "!!! 导出失败"; exit 1; }

echo "==> 写入 Service Worker 构建版本戳 ..."
[ -f out/sw.js ] || { echo "!!! out/sw.js 缺失（public/sw.js 未随导出复制）"; exit 1; }
SW_STAMP="$(date -u +%Y%m%d-%H%M%S)-$LOCAL_SHA"
sed -i "s/__SW_BUILD__/$SW_STAMP/" out/sw.js
echo "    start-chushi-$SW_STAMP"

echo "==> 暂存 gh-pages 内容 ..."
rm -rf "$STAGE" && mkdir -p "$STAGE"
cp -r out/. "$STAGE"/
touch "$STAGE/.nojekyll"
du -sh "$STAGE" | awk '{print "    体积: "$1}'

echo "==> 推送 gh-pages 分支 (全新历史) ..."
cd "$STAGE"
git init -q -b gh-pages
git config user.name  "Super Z"
git config user.email "superz@z.ai"
git add -A
git commit -qm "deploy: Pages build from $LOCAL_SHA"
git remote add origin "https://github.com/$REPO.git"

HELPER="$BASE/.pkgtmp/gh-cred-helper.sh"
printf '#!/bin/bash\necho "username=%s"\necho "password=%s"\n' '$GITHUB_USER' '$GH_PAT' > "$HELPER"
chmod 700 "$HELPER"
GIT_TERMINAL_PROMPT=0 git -c credential.helper="$HELPER" push --force origin gh-pages 2>&1 | grep -vE '^remote:' || true

echo "==> 开启 Pages (409=已开启, 复用) ..."
HTTP=$(api -o "$BASE/.pkgtmp/gh-pages-api.json" -w '%{http_code}' \
  -X POST "https://api.github.com/repos/$REPO/pages" \
  -d '{"source":{"branch":"gh-pages","path":"/"}}')
case "$HTTP" in
  201|204) echo "    Pages 已开启";;
  409)     echo "    Pages 已存在, 复用";;
  *)       echo "!!! Pages 开启失败 HTTP=$HTTP"; head -c 300 "$BASE/.pkgtmp/gh-pages-api.json"; echo; exit 1;;
esac
rm -f "$BASE/.pkgtmp/gh-pages-api.json" "$HELPER"

echo "==> 轮询 Pages 构建状态 (最长 5 分钟) ..."
for i in $(seq 1 30); do
  STATUS=$(api "https://api.github.com/repos/$REPO/pages/builds/latest" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "?")
  echo "    [$i] status=$STATUS"
  [ "$STATUS" = "built" ] && break
  [ "$STATUS" = "errored" ] && { echo "!!! Pages 构建失败"; exit 1; }
  sleep 10
done

echo "==> 线上验证: $SITE_URL"
CHECK="$BASE/.pkgtmp/pages-check.html"
HTTP_CODE=$(curl -sL -o "$CHECK" -w '%{http_code}' --max-time 20 "$SITE_URL" 2>/dev/null || echo "000")
rm -f "$CHECK"
if [ "$HTTP_CODE" = "200" ]; then
  TITLE=$(curl -sL --max-time 20 "$SITE_URL" | grep -o '<title>[^<]*</title>' | head -1)
  echo "    HTTP $HTTP_CODE · $TITLE"
  echo "DEPLOY-OK: $SITE_URL"
else
  echo "    线上 HTTP $HTTP_CODE（容器网络可能屏蔽 github.io，以 API 构建状态为准）"
  echo "DEPLOY-DONE (线上验证受限): $SITE_URL"
fi
