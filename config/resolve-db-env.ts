/**
 * Railway / Render inyectan PG*, POSTGRES_* o DATABASE_* — no siempre DB_*.
 * Normaliza antes de TypeORM (migrate.js y Nest).
 */
const URL_KEYS = [
  'DATABASE_PRIVATE_URL',
  'DATABASE_URL',
  'DATABASE_PUBLIC_URL',
  'POSTGRES_URL',
  'POSTGRESQL_URL',
] as const;

const PASSWORD_KEYS = ['DB_PASSWORD', 'PGPASSWORD', 'POSTGRES_PASSWORD', 'POSTGRESQL_PASSWORD'] as const;

const HOST_KEYS = ['DB_HOST', 'PGHOST', 'POSTGRES_HOST', 'POSTGRESQL_HOST'] as const;

const PORT_KEYS = ['DB_PORT', 'PGPORT', 'POSTGRES_PORT'] as const;

const USER_KEYS = ['DB_USERNAME', 'PGUSER', 'POSTGRES_USER', 'POSTGRESQL_USER'] as const;

const DATABASE_KEYS = ['DB_DATABASE', 'PGDATABASE', 'POSTGRES_DB', 'POSTGRES_DATABASE'] as const;

export function resolveDbEnv(): void {
  if (firstNonEmpty(...PASSWORD_KEYS)) {
    if (!process.env.DB_PASSWORD?.trim()) {
      process.env.DB_PASSWORD = firstNonEmpty('PGPASSWORD', 'POSTGRES_PASSWORD', 'POSTGRESQL_PASSWORD');
    }
    fillMissingDbFieldsFromAliases();
    return;
  }

  if (applyFromDatabaseUrls()) {
    return;
  }

  if (applyFromPostgresAliases()) {
    return;
  }

  fillMissingDbFieldsFromAliases();
}

function firstNonEmpty(...keys: readonly string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return '';
}

function fillMissingDbFieldsFromAliases(): void {
  process.env.DB_HOST ||= firstNonEmpty(...HOST_KEYS);
  process.env.DB_PORT ||= firstNonEmpty(...PORT_KEYS) || '5432';
  process.env.DB_USERNAME ||= firstNonEmpty(...USER_KEYS);
  process.env.DB_DATABASE ||= firstNonEmpty(...DATABASE_KEYS);
  if (process.env.DB_PASSWORD?.trim()) {
    suggestDbSslForCloud();
  }
}

function applyFromDatabaseUrls(): boolean {
  for (const key of URL_KEYS) {
    const raw = process.env[key]?.trim();
    if (raw && applyFromDatabaseUrl(raw)) {
      return true;
    }
  }
  return false;
}

function applyFromDatabaseUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    const password = decodeURIComponent(parsed.password);
    if (!password) {
      return false;
    }
    process.env.DB_HOST ??= parsed.hostname;
    process.env.DB_PORT ??= parsed.port || '5432';
    process.env.DB_USERNAME ??= decodeURIComponent(parsed.username);
    process.env.DB_PASSWORD = password;
    process.env.DB_DATABASE ??= parsed.pathname.replace(/^\//, '').split('?')[0];
    const sslmode = parsed.searchParams.get('sslmode');
    if (sslmode === 'require' || sslmode === 'verify-full' || sslmode === 'verify-ca') {
      process.env.DB_SSL ??= 'true';
    } else {
      suggestDbSslForCloud();
    }
    return true;
  } catch {
    return false;
  }
}

function applyFromPostgresAliases(): boolean {
  const password = firstNonEmpty('PGPASSWORD', 'POSTGRES_PASSWORD', 'POSTGRESQL_PASSWORD');
  if (!password) {
    return false;
  }
  process.env.DB_PASSWORD = password;
  fillMissingDbFieldsFromAliases();
  suggestDbSslForCloud();
  return true;
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

/** Para logs de error sin secretos. */
export function dbEnvProbe(): string {
  const keys = [
    ...PASSWORD_KEYS,
    ...URL_KEYS,
    'PGHOST',
    'PGUSER',
    'PGDATABASE',
    'RAILWAY_ENVIRONMENT',
  ];
  return keys.map((key) => `${key}=${process.env[key]?.trim() ? 'set' : 'missing'}`).join(', ');
}

export function assertDbPasswordPresent(): void {
  resolveDbEnv();
  if (typeof process.env.DB_PASSWORD !== 'string' || process.env.DB_PASSWORD.length === 0) {
    throw new Error(
      [
        'Falta DB_PASSWORD para Postgres.',
        'Railway: en el servicio fieldtrack-api → Variables → Add Reference → elige Postgres →',
        'DATABASE_PRIVATE_URL o DATABASE_URL (una basta), o las cinco DB_* / PG*.',
        'Sin referencias, el contenedor API no recibe credenciales del plugin.',
        `Probe: ${dbEnvProbe()}`,
      ].join(' '),
    );
  }
}
