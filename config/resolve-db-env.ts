/**
 * Railway / Render suelen inyectar PG* o DATABASE_URL, no DB_*.
 * Normaliza a DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE
 * antes de TypeORM (migrate.js y Nest).
 */
export function resolveDbEnv(): void {
  if (typeof process.env.DB_PASSWORD === 'string' && process.env.DB_PASSWORD.length > 0) {
    return;
  }

  const pgPassword = process.env.PGPASSWORD?.trim();
  if (pgPassword) {
    process.env.DB_PASSWORD = pgPassword;
    process.env.DB_HOST ??= process.env.PGHOST?.trim() ?? '';
    process.env.DB_PORT ??= process.env.PGPORT?.trim() ?? '5432';
    process.env.DB_USERNAME ??= process.env.PGUSER?.trim() ?? '';
    process.env.DB_DATABASE ??= process.env.PGDATABASE?.trim() ?? '';
    suggestDbSslForCloud();
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      process.env.DB_HOST ??= parsed.hostname;
      process.env.DB_PORT ??= parsed.port || '5432';
      process.env.DB_USERNAME ??= decodeURIComponent(parsed.username);
      process.env.DB_PASSWORD = decodeURIComponent(parsed.password);
      process.env.DB_DATABASE ??= parsed.pathname.replace(/^\//, '');
      const sslmode = parsed.searchParams.get('sslmode');
      if (sslmode === 'require' || sslmode === 'verify-full' || sslmode === 'verify-ca') {
        process.env.DB_SSL ??= 'true';
      } else {
        suggestDbSslForCloud();
      }
    } catch {
      /* URL inválida — caerá el check de DB_PASSWORD */
    }
  }
}

function suggestDbSslForCloud(): void {
  if (process.env.DB_SSL?.trim()) {
    return;
  }
  if (
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.RENDER
  ) {
    process.env.DB_SSL ??= 'true';
  }
}

export function assertDbPasswordPresent(): void {
  resolveDbEnv();
  if (typeof process.env.DB_PASSWORD !== 'string' || process.env.DB_PASSWORD.length === 0) {
    throw new Error(
      [
        'Falta DB_PASSWORD para Postgres.',
        'Local: cp .env.example .env',
        'Railway: referencia el plugin Postgres → DB_* o deja PG*/DATABASE_URL (se mapean solos).',
        'Ej. DB_PASSWORD=${{Postgres.PGPASSWORD}}',
      ].join(' '),
    );
  }
}
