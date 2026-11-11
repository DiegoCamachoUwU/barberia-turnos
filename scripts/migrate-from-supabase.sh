#!/usr/bin/env bash
# migrate-from-supabase.sh — Migra datos desde Supabase al PostgreSQL en Docker.
# Uso: bash migrate-from-supabase.sh <ARCHIVO_PG_DUMP> [--force] [--expected "tabla=valor,tabla=valor"]
#
# Seguridad:
#   - Hace backup automático del destino antes de vaciar las tablas.
#   - Valida que el dump no esté vacío y contenga al menos una tabla esperada.
#   - Requiere confirmación explícita (o --force) para vaciar tablas.
#   - Opcionalmente compara los conteos importados con los esperados.
#   - Solo debe ejecutarse después de que el stack Docker esté activo.

set -euo pipefail

FORCE=false
DUMP_FILE=""
EXPECTED=""

# Parsear argumentos
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=true ;;
    --expected) EXPECTED="$2"; shift ;;
    *) DUMP_FILE="$1" ;;
  esac
  shift
done

if [ -z "$DUMP_FILE" ]; then
  echo "Uso: bash $0 <ARCHIVO_PG_DUMP> [--force] [--expected 'tabla=valor,tabla=valor']"
  echo "  --force: Salta la confirmación interactiva para vaciar tablas."
  echo "  --expected: Compara conteos finales (ej. --expected 'organization=1,service=3')."
  exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "ERROR: El archivo $DUMP_FILE no existe."
  exit 1
fi

# Tamaño mínimo de un dump válido (1 KB)
DUMP_SIZE=$(stat -c%s "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")
if [ "$DUMP_SIZE" -lt 1024 ]; then
  echo "ERROR: El dump $DUMP_FILE parece vacío o corrupto ($DUMP_SIZE bytes)."
  exit 1
fi

COMPOSE_DIR="$(cd "$(dirname "$0")/.." && pwd)/backend"
DB_USER="${POSTGRES_USER:-barberia}"
DB_NAME="${POSTGRES_DB:-barberia_turnos}"
DB_CONTAINER="$(cd "$COMPOSE_DIR" && docker-compose ps -q db 2>/dev/null || true)"

if [ -z "$DB_CONTAINER" ]; then
  echo "ERROR: El contenedor 'db' no está en ejecución."
  echo "Ejecuta primero: cd backend && docker-compose up -d"
  exit 1
fi

echo "==> 1. Verificando que el contenedor db esté saludable..."
docker-compose -f "$COMPOSE_DIR/docker-compose.yml" exec db pg_isready -U "$DB_USER" -d "$DB_NAME"

echo "==> 2. Haciendo backup del destino antes de migrar..."
BACKUP_FILE="/tmp/pre-migration-backup-$(date +%Y%m%d-%H%M%S).sql"
docker-compose -f "$COMPOSE_DIR/docker-compose.yml" exec db pg_dump \
  -U "$DB_USER" -d "$DB_NAME" --no-owner -f "$BACKUP_FILE"
echo "Backup guardado en el contenedor: $BACKUP_FILE"
docker cp "$BACKUP_FILE" "/tmp/$(basename "$BACKUP_FILE")"
docker-compose -f "$COMPOSE_DIR/docker-compose.yml" exec db rm -f "$BACKUP_FILE"
echo "Backup copiado a /tmp/$(basename "$BACKUP_FILE")"

echo "==> 3. Validando formato del dump de Supabase..."
# El dump debe contener al menos una sentencia COPY o INSERT
if ! grep -qE "^(COPY |INSERT INTO )" "$DUMP_FILE"; then
  echo "ERROR: El dump no parece tener contenido de datos (COPY o INSERT)."
  exit 1
fi

echo "==> 4. Confirmando operación destructiva..."
if [ "$FORCE" = false ]; then
  read -r -p "Esto VACIARÁ las tablas antes de importar. ¿Continuar? (s/N): " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[sS]$ ]]; then
    echo "Cancelado por el usuario."
    exit 1
  fi
fi

echo "==> 5. Limpiando datos existentes..."
docker-compose -f "$COMPOSE_DIR/docker-compose.yml" exec db psql \
  -U "$DB_USER" -d "$DB_NAME" \
  -c "TRUNCATE organization, service, barber, staff_user, working_hours, schedule_exception, time_off, appointment CASCADE;"

echo "==> 6. Importando dump desde Supabase..."
docker cp "$DUMP_FILE" "$DB_CONTAINER:/tmp/supabase_dump.sql"
docker-compose -f "$COMPOSE_DIR/docker-compose.yml" exec db psql \
  -U "$DB_USER" -d "$DB_NAME" \
  -f /tmp/supabase_dump.sql

echo "==> 7. Reiniciando la API para recargar el esquema..."
docker-compose -f "$COMPOSE_DIR/docker-compose.yml" restart api

echo "==> 8. Verificando conteo de registros..."
ACTUAL_COUNTS=$(docker-compose -f "$COMPOSE_DIR/docker-compose.yml" exec db psql \
  -U "$DB_USER" -d "$DB_NAME" -t -A -c \
  "SELECT 'organization=' || count(*) FROM organization
    UNION ALL SELECT 'service=' || count(*) FROM service
    UNION ALL SELECT 'barber=' || count(*) FROM barber
    UNION ALL SELECT 'appointment=' || count(*) FROM appointment
    UNION ALL SELECT 'staff_user=' || count(*) FROM staff_user;" | tr '\n' ',' | sed 's/,$//')
echo "Conteos actuales: $ACTUAL_COUNTS"

if [ -n "$EXPECTED" ]; then
  echo "Conteos esperados: $EXPECTED"
  MISMATCH=""
  IFS=',' read -ra EXPECTED_PAIRS <<< "$EXPECTED"
  for pair in "${EXPECTED_PAIRS[@]}"; do
    tabla="${pair%%=*}"
    valor="${pair##*=}"
    actual=$(echo "$ACTUAL_COUNTS" | tr ',' '\n' | grep "^${tabla}=" | cut -d= -f2)
    if [ "$actual" != "$valor" ]; then
      MISMATCH="$MISMATCH $tabla(esperado=$valor, actual=$actual)"
    fi
  done
  if [ -n "$MISMATCH" ]; then
    echo "ERROR: Los conteos no coinciden:$MISMATCH"
    echo "Verifica el dump y vuelve a intentarlo."
    exit 1
  fi
  echo "Los conteos coinciden con los esperados."
fi

echo "==> ¡Migración completada!"