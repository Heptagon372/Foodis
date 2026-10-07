#!/usr/bin/env bash
# Foodis 서버 초기 세팅 스크립트 (Ubuntu 22.04 / 24.04)
# 한 번만 실행 — SSH로 서버 접속한 뒤:
#   curl -fsSL https://raw.githubusercontent.com/Heptagon372/Foodis/main/scripts/deploy/server-setup.sh -o setup.sh
#   chmod +x setup.sh
#   sudo ./setup.sh
# 또는 레포 클론 뒤 `sudo bash scripts/deploy/server-setup.sh`

set -euo pipefail

# ──────────────────────────────────────────────────────────────
# 바꿀 값
# ──────────────────────────────────────────────────────────────
DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="${APP_DIR:-/var/www/foodis}"
NODE_MAJOR="${NODE_MAJOR:-20}"
REPO_URL="${REPO_URL:-https://github.com/Heptagon372/Foodis.git}"
DOMAIN="${DOMAIN:-foodis.cloud}"

say() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "sudo 로 실행하세요: sudo ./server-setup.sh"
  exit 1
fi

say "0. 시스템 업데이트"
apt-get update -y
apt-get upgrade -y
apt-get install -y curl git build-essential ca-certificates ufw unattended-upgrades

say "1. 배포 유저 ${DEPLOY_USER} 생성 (없으면)"
if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
  usermod -aG sudo "${DEPLOY_USER}"
  # root의 SSH 키를 그대로 복사 — 처음에는 이 방법이 가장 안전
  if [[ -f /root/.ssh/authorized_keys ]]; then
    mkdir -p "/home/${DEPLOY_USER}/.ssh"
    cp /root/.ssh/authorized_keys "/home/${DEPLOY_USER}/.ssh/authorized_keys"
    chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
    chmod 700 "/home/${DEPLOY_USER}/.ssh"
    chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
  fi
fi

say "2. Node.js ${NODE_MAJOR} 설치 (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt "${NODE_MAJOR}" ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

say "3. pnpm 설치 (전역)"
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@10
fi
pnpm -v

say "4. PM2 설치 (전역, 프로세스 매니저)"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
pm2 -v

say "5. Nginx 설치"
apt-get install -y nginx
systemctl enable --now nginx

say "6. Certbot 설치 (Let's Encrypt SSL)"
apt-get install -y certbot python3-certbot-nginx

say "7. UFW 방화벽 설정 — SSH + HTTP + HTTPS만 허용"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status

say "8. 앱 디렉터리 준비: ${APP_DIR}"
mkdir -p "${APP_DIR}"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}"

say "9. 첫 clone (${REPO_URL})"
if [[ ! -d "${APP_DIR}/.git" ]]; then
  sudo -u "${DEPLOY_USER}" git clone "${REPO_URL}" "${APP_DIR}"
else
  echo "이미 clone 되어 있음 — 건너뜀"
fi

say "10. 자동 보안 업데이트 활성화"
dpkg-reconfigure -plow unattended-upgrades || true

cat <<EOF

────────────────────────────────────────────────────────────
✅ 서버 초기 세팅 완료.

다음 단계:
  1) 도메인 DNS A레코드 설정:
       ${DOMAIN}      → 이 서버 공인 IP
       www.${DOMAIN}  → 이 서버 공인 IP

  2) 환경변수(.env.local) 업로드 — 로컬 PC 터미널에서:
       scp apps/web/.env.local ${DEPLOY_USER}@${DOMAIN}:${APP_DIR}/apps/web/.env.local

  3) 서버에서 ${DEPLOY_USER} 로 전환해서 Nginx + SSL 설정:
       sudo su - ${DEPLOY_USER}
       cd ${APP_DIR}
       sudo cp scripts/deploy/nginx-foodis.cloud.conf /etc/nginx/sites-available/foodis
       sudo ln -sf /etc/nginx/sites-available/foodis /etc/nginx/sites-enabled/foodis
       sudo rm -f /etc/nginx/sites-enabled/default
       sudo nginx -t && sudo systemctl reload nginx
       sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}

  4) 첫 빌드 & PM2 start:
       cd ${APP_DIR}
       pnpm install --frozen-lockfile
       pnpm --filter web build
       pm2 start scripts/deploy/pm2.config.cjs
       pm2 save
       sudo env PATH=\$PATH:/usr/bin pm2 startup systemd -u ${DEPLOY_USER} --hp /home/${DEPLOY_USER}

  5) GitHub Actions 자동 배포 세팅은 docs/deploy/서버_배포_가이드.md 참고.
────────────────────────────────────────────────────────────
EOF
