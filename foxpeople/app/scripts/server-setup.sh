#!/usr/bin/env bash
# Fox & People – Server-Ersteinrichtung (Ubuntu 24.04, als root ausführen)
# Installiert Docker, legt /opt/foxpeople an, erzeugt .env mit sicheren Geheimnissen, richtet Firewall + automatische Sicherheitsupdates ein.
set -euo pipefail
echo "== 1/6 System aktualisieren"
apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -q
apt-get install -y -q ca-certificates curl gnupg ufw unattended-upgrades unzip
echo "== 2/6 Docker installieren"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update -q && apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker
echo "== 3/6 Firewall (nur SSH, HTTP, HTTPS)"
ufw default deny incoming && ufw default allow outgoing
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp
ufw --force enable
echo "== 4/6 Automatische Sicherheitsupdates"
dpkg-reconfigure -f noninteractive unattended-upgrades
echo "== 5/6 Verzeichnis und Geheimnisse"
mkdir -p /opt/foxpeople/backups && cd /opt/foxpeople
if [ ! -f .env ]; then
  DBPW=$(openssl rand -hex 24)
  cat > .env <<ENV
# Fox & People – Produktion (NIE weitergeben, Kopie im Passwortmanager!)
DB_PASSWORD="$DBPW"
DATABASE_URL="postgresql://foxpeople:$DBPW@db:5432/foxpeople"
SESSION_SECRET="$(openssl rand -hex 32)"
FIELD_ENCRYPTION_KEY="$(openssl rand -hex 32)"
APP_URL="https://app.foxandpeople.at"
MAIL_MODE="test"
SMTP_HOST="smtp.office365.com"
SMTP_PORT="587"
SMTP_USER="office@foxandpeople.at"
SMTP_PASS=""
MAIL_FROM="Fox & People <office@foxandpeople.at>"
FILE_STORAGE_DIR="/app/storage"
SEED_PASSWORD="$(openssl rand -base64 12 | tr -d '/+=')"
# ANTHROPIC_API_KEY="sk-ant-..."   # optional: Wissensassistent mit ausformulierten Antworten
ENV
  chmod 600 .env
  echo "   .env erzeugt – Datenbank-Passwort, Session-Secret und Verschlüsselungsschlüssel sind zufällig gesetzt."
else
  echo "   .env existiert bereits – unverändert gelassen."
fi
echo "== 6/6 Fertig. Nächster Schritt: ZIP nach /opt/foxpeople entpacken und 'docker compose up -d --build' ausführen."
