#!/usr/bin/env bash
#
# MADPUMP deploy script.
#   build client → rsync code → restart remote server (tmux) → health check.
#
# Secrets are not committed:
#   · server/.env (DATABASE_URL·DB password) — set once per person inside the VM, excluded from rsync (not overwritten)
#   · SSH key — in each person's ~/.ssh. The deploy target is read from deploy.env (=git-excluded).
#
# Usage:
#   cp deploy.env.example deploy.env   # once: fill in my deploy target/port
#   bash scripts/deploy.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

# ── Load deploy config (deploy.env = git-excluded) ─────────────────────────
if [ -f deploy.env ]; then
  set -a; . ./deploy.env; set +a
fi
: "${DEPLOY_HOST:?DEPLOY_HOST is required in deploy.env (e.g. kaistvm or root@172.10.8.242). Run 'cp deploy.env.example deploy.env' and fill it in}"
DEPLOY_PATH="${DEPLOY_PATH:-/root/madpump}"
PORT="${PORT:-80}"
CLIENT_ORIGIN="${CLIENT_ORIGIN:-http://172.10.8.242}"
# Set to 1 only when placed behind HTTPS (domain/tunnel). Leave empty for direct HTTP (disables cookie Secure).
COOKIE_SECURE="${COOKIE_SECURE:-}"

echo "▶ 1/4 build client"
npm --prefix client run build

echo "▶ 2/4 rsync → ${DEPLOY_HOST}:${DEPLOY_PATH}  (secrets·junk files excluded)"
rsync -az --delete \
  --exclude node_modules --exclude .git \
  --exclude 'design-lab' --exclude 'game-lab' \
  --exclude '*.log' --exclude 'server/_*' \
  --exclude '.env' --exclude 'server/.env' --exclude 'deploy.env' \
  -e "ssh -o BatchMode=yes" ./ "${DEPLOY_HOST}:${DEPLOY_PATH}/"

echo "▶ 3/4 install remote dependencies + restart server (tmux: madpump)"
ssh -o BatchMode=yes "${DEPLOY_HOST}" bash -s <<REMOTE
set -e
cd "${DEPLOY_PATH}"
npm install            # tsx (the server runtime) is a devDependency, so no --omit=dev
tmux kill-session -t madpump 2>/dev/null || true
sleep 1
tmux new-session -d -s madpump \
  "cd ${DEPLOY_PATH} && PORT=${PORT} NODE_ENV=production CLIENT_ORIGIN=${CLIENT_ORIGIN} COOKIE_SECURE=${COOKIE_SECURE} npm --prefix server run start 2>&1 | tee ${DEPLOY_PATH}/server.log"
sleep 4
echo '--- health ---'
curl -s --max-time 8 "http://localhost:${PORT}/api/health" || echo '(no health response — check server.log)'
REMOTE

echo ""
echo "✅ 4/4 deploy complete → ${CLIENT_ORIGIN}"
