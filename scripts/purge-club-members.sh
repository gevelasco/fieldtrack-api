#!/usr/bin/env bash
# Borra todos los socios (y datos ligados) en la BD local. No toca staff ni configuración del club.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/load-env.sh"
load_env_file "$ROOT/.env"

if [[ "${NODE_ENV:-local}" == "production" ]]; then
  echo "ERROR: NODE_ENV=production. Abortado." >&2
  exit 1
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5434}"
DB_USER="${DB_USERNAME:-fieldtrack-developer}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_DATABASE:-fieldtrack-dev}"

if [[ -z "$DB_PASSWORD" ]]; then
  echo "ERROR: DB_PASSWORD vacío en .env" >&2
  exit 1
fi

export PGPASSWORD="$DB_PASSWORD"

run_psql() {
  if command -v psql >/dev/null 2>&1; then
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
    return
  fi
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'fieldtrack-postgres'; then
    docker exec -i -e PGPASSWORD="$DB_PASSWORD" fieldtrack-postgres \
      psql -U "$DB_USER" -d "$DB_NAME" "$@"
    return
  fi
  echo "ERROR: psql no disponible y el contenedor fieldtrack-postgres no está activo." >&2
  exit 1
}

echo "Borrando socios en ${DB_NAME}@${DB_HOST}:${DB_PORT}…"

run_psql -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

DELETE FROM fieldtrack.club_request_documents
WHERE request_id IN (SELECT id FROM fieldtrack.club_requests WHERE member_id IS NOT NULL);

DELETE FROM fieldtrack.club_request_events
WHERE request_id IN (SELECT id FROM fieldtrack.club_requests WHERE member_id IS NOT NULL);

DELETE FROM fieldtrack.club_request_comments
WHERE request_id IN (SELECT id FROM fieldtrack.club_requests WHERE member_id IS NOT NULL);

DELETE FROM fieldtrack.club_requests WHERE member_id IS NOT NULL;

DELETE FROM fieldtrack.competition_registrations WHERE member_id IS NOT NULL;

DELETE FROM fieldtrack.weapon_registry_movements;

DELETE FROM fieldtrack.members;

DELETE FROM fieldtrack.app_user u
WHERE u.role = 'member'
  AND NOT EXISTS (SELECT 1 FROM fieldtrack.members m WHERE m.user_id = u.id);

COMMIT;

SELECT COUNT(*)::int AS socios_restantes FROM fieldtrack.members;
SQL

echo "Listo."