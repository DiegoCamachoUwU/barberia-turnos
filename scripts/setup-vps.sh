#!/usr/bin/env bash
# setup-vps.sh — Instala Docker, Docker Compose, Nginx y Certbot en Ubuntu 24.04.
# Uso: bash setup-vps.sh
# Reemplaza DOMAIN y EMAIL pasándolos por entorno o editando las líneas al inicio.

set -euo pipefail

DOMAIN="${DOMAIN:-api.tudominio.com}"
EMAIL="${EMAIL:-admin@tudominio.com}"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "ERROR: Define DOMAIN y EMAIL (ej. export DOMAIN='api.tudominio.com' export EMAIL='admin@tudominio.com')."
  exit 1
fi

echo "==> 1. Actualizando paquetes del sistema..."
sudo apt update && sudo apt upgrade -y

echo "==> 2. Instalando Docker y Docker Compose..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  sudo usermod -aG docker "$USER"
  rm -f get-docker.sh
fi

if ! command -v docker-compose &>/dev/null; then
  sudo apt install -y docker-compose-plugin
fi

echo "==> 3. Instalando Nginx y Certbot..."
sudo apt install -y nginx certbot python3-certbot-nginx

echo "==> 4. Configurando Reverse Proxy en Nginx..."
sudo tee "/etc/nginx/sites-available/$DOMAIN" > /dev/null <<EOF
server {
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

sudo ln -sf "/etc/nginx/sites-available/$DOMAIN" /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "==> 5. Obteniendo certificado SSL gratuito con Let's Encrypt..."
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"

echo "==> ¡Configuración completada con éxito para $DOMAIN!"
echo "La API escucha en http://127.0.0.1:3000 y el dominio público es https://$DOMAIN"