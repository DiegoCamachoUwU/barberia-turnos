#!/usr/bin/env bash
# deploy-vps.sh — Despliegue de barberia-turnos en VPS Ubuntu 24.04.
# Ejecutar como root: bash deploy-vps.sh
# Las variables de entorno pueden pasarse por línea de comandos o por entorno.
# El script NUNCA elimina un directorio existente sin confirmación explícita.

set -euo pipefail

# ---------------- Parámetros (pasar por entorno o por línea de comandos) ----------------
VPS_USER="${VPS_USER:-barberia}"
REPO_URL="${REPO_URL:-}"
DEST_DIR="${DEST_DIR:-/opt/barberia-turnos}"
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
# -------------------------------------------------------------------------------

if [ -z "$REPO_URL" ]; then
  echo "ERROR: Define REPO_URL (ej. export REPO_URL='https://github.com/usuario/repo.git')."
  exit 1
fi
if [ -z "$DOMAIN" ]; then
  echo "ERROR: Define DOMAIN (ej. export DOMAIN='api.tudominio.com')."
  exit 1
fi
if [ -z "$EMAIL" ]; then
  echo "ERROR: Define EMAIL (ej. export EMAIL='admin@tudominio.com')."
  exit 1
fi

VPS_HOME="/home/$VPS_USER"

echo "==> 1. Creando usuario no privilegiado $VPS_USER (si no existe)..."
if ! id "$VPS_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$VPS_USER"
  echo "Usuario $VPS_USER creado."
fi

echo "==> 2. Configurando sudo sin contraseña..."
echo "$VPS_USER ALL=(ALL) NOPASSWD: ALL" > "/etc/sudoers.d/$VPS_USER"
chmod 0440 "/etc/sudoers.d/$VPS_USER"

echo "==> 3. Deshabilitando login root por contraseña..."
sed -i 's/^#PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
sed -i 's/^PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload ssh

echo "==> 4. Instalando Docker y Docker Compose..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com -o get-docker.sh
  sh get-docker.sh
  rm -f get-docker.sh
fi
usermod -aG docker "$VPS_USER"

if ! command -v docker-compose &>/dev/null; then
  apt install -y docker-compose-plugin
fi

echo "==> 5. Instalando Nginx y Certbot..."
apt install -y nginx certbot python3-certbot-nginx

echo "==> 6. Configurando Reverse Proxy en Nginx..."
tee "/etc/nginx/sites-available/$DOMAIN" > /dev/null <<EOF
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

ln -sf "/etc/nginx/sites-available/$DOMAIN" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> 7. Obteniendo certificado SSL con Let's Encrypt..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"

echo "==> 8. Clonando repositorio en $DEST_DIR..."
if [ -d "$DEST_DIR" ]; then
  echo "ADVERTENCIA: El directorio $DEST_DIR ya existe. No se eliminará."
  read -r -p "¿Deseas sobrescribirlo? (s/N): " OVERWRITE
  if [[ ! "$OVERWRITE" =~ ^[sS]$ ]]; then
    echo "Cancelado por el usuario."
    exit 1
  fi
  rm -rf "$DEST_DIR"
fi
sudo -u "$VPS_USER" bash -c "
  git clone '$REPO_URL' '$DEST_DIR'
"

echo "==> 9. Configurando backend/.env..."
if [ ! -f "$DEST_DIR/backend/.env" ]; then
  sudo -u "$VPS_USER" cp "$DEST_DIR/backend/.env.example" "$DEST_DIR/backend/.env"
  echo ">>> ¡IMPORTANTE! Edita $DEST_DIR/backend/.env con los secretos reales ANTES de continuar."
  read -r -p "Presiona ENTER después de configurar backend/.env..." _
fi

echo "==> 10. Configurando frontend/.env..."
if [ ! -f "$DEST_DIR/frontend/.env" ]; then
  sudo -u "$VPS_USER" cp "$DEST_DIR/frontend/.env.example" "$DEST_DIR/frontend/.env"
  echo ">>> ¡IMPORTANTE! Edita $DEST_DIR/frontend/.env con VITE_API_URL=https://$DOMAIN/api/v1"
  read -r -p "Presiona ENTER después de configurar frontend/.env..." _
fi

echo "==> 11. Levantando contenedores..."
sudo -u "$VPS_USER" bash -c "cd $DEST_DIR/backend && docker-compose up -d --build"

echo "==> 12. Verificando estado..."
sudo -u "$VPS_USER" bash -c "cd $DEST_DIR/backend && docker-compose ps"
echo ">>> Logs de la API:"
sudo -u "$VPS_USER" bash -c "cd $DEST_DIR/backend && docker-compose logs api --tail=20"

echo "==> ¡Despliegue completado!"
echo "API interna: http://127.0.0.1:3000/api/v1"
echo "Público:    https://$DOMAIN/api/v1"
echo "Salud:      curl https://$DOMAIN/api/v1/health"