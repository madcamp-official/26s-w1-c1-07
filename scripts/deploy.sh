#!/usr/bin/env bash
#
# MADPUMP 배포 스크립트.
#   client 빌드 → 코드 rsync → 원격 서버 재기동(tmux) → health 확인.
#
# 비밀은 커밋하지 않는다:
#   · server/.env (DATABASE_URL·DB 비밀번호) — VM 안에 각자 1회 세팅, rsync에서 제외됨(덮어쓰지 않음)
#   · SSH 키 — 각자 ~/.ssh 에. 배포 대상은 deploy.env(=git 제외)에서 읽는다.
#
# 사용:
#   cp deploy.env.example deploy.env   # 1회: 내 배포 대상/포트 채우기
#   bash scripts/deploy.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."   # repo 루트

# ── 배포 설정 로드 (deploy.env = git 제외) ─────────────────────────
if [ -f deploy.env ]; then
  set -a; . ./deploy.env; set +a
fi
: "${DEPLOY_HOST:?deploy.env 에 DEPLOY_HOST 필요 (예: kaistvm 또는 root@172.10.8.242). 'cp deploy.env.example deploy.env' 후 채우세요}"
DEPLOY_PATH="${DEPLOY_PATH:-/root/madpump}"
PORT="${PORT:-80}"
CLIENT_ORIGIN="${CLIENT_ORIGIN:-http://172.10.8.242}"
# HTTPS(도메인/터널) 뒤에 둘 때만 1. HTTP 직결이면 비워둔다(쿠키 Secure 끄기).
COOKIE_SECURE="${COOKIE_SECURE:-}"

echo "▶ 1/4 client 빌드"
npm --prefix client run build

echo "▶ 2/4 rsync → ${DEPLOY_HOST}:${DEPLOY_PATH}  (비밀·잡파일 제외)"
rsync -az --delete \
  --exclude node_modules --exclude .git \
  --exclude 'design-lab' --exclude 'game-lab' \
  --exclude '*.log' --exclude 'server/_*' \
  --exclude '.env' --exclude 'server/.env' --exclude 'deploy.env' \
  -e "ssh -o BatchMode=yes" ./ "${DEPLOY_HOST}:${DEPLOY_PATH}/"

echo "▶ 3/4 원격 의존성 설치 + 서버 재기동(tmux: madpump)"
ssh -o BatchMode=yes "${DEPLOY_HOST}" bash -s <<REMOTE
set -e
cd "${DEPLOY_PATH}"
npm install            # tsx(서버 런타임)가 devDependency 라 --omit=dev 금지
tmux kill-session -t madpump 2>/dev/null || true
sleep 1
tmux new-session -d -s madpump \
  "cd ${DEPLOY_PATH} && PORT=${PORT} NODE_ENV=production CLIENT_ORIGIN=${CLIENT_ORIGIN} COOKIE_SECURE=${COOKIE_SECURE} npm --prefix server run start 2>&1 | tee ${DEPLOY_PATH}/server.log"
sleep 4
echo '--- health ---'
curl -s --max-time 8 "http://localhost:${PORT}/api/health" || echo '(health 응답 없음 — server.log 확인)'
REMOTE

echo ""
echo "✅ 4/4 배포 완료 → ${CLIENT_ORIGIN}"
