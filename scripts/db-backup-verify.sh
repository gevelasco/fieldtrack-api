#!/usr/bin/env bash
# Restaura el último backup en una DB temporal y comprueba que el schema fieldtrack existe.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/load-env.sh"
load_env_file "$ROOT/.env"

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
BACKUP_FILE="${1:-$BACKUP_DIR/fieldtrack-latest.sql.gz}"
VERIFY_DB="${VERIFY_DB:-fieldtrack_backup_verify}"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5434}"
DB_USER="${DB_USERNAME:-fieldtrack-developer}"
DB_PASSWORD="${DB_PASSWORD:-}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: no existe $BACKUP_FILE" >&2
  exit 1
fi

export PGPASSWORD="$DB_PASSWORD"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"${VERIFY_DB}\";" \
  -c "CREATE DATABASE \"${VERIFY_DB}\";"

gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$VERIFY_DB" -v ON_ERROR_STOP=1

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$VERIFY_DB" -v ON_ERROR_STOP=1 \
  -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'fieldtrack';" \
  | grep -q fieldtrack

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE \"${VERIFY_DB}\";"

echo "OK verify restore from $BACKUP_FILE"
