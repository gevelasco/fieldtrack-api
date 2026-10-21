import dataSource from '../config/migration.config';

const MIGRATION_LOCK_KEY = 74_028_001;
const MIGRATION_LOCK_TIMEOUT_MS = 90_000;

/** Alinea el esquema con S3 aunque falte registrar una migración en prod. */
async function ensureObjectStorageSchema(): Promise<void> {
  await dataSource.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'fieldtrack'
          AND table_name = 'club_request_documents'
          AND column_name = 'content'
          AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE fieldtrack.club_request_documents
          ALTER COLUMN content DROP NOT NULL;
      END IF;
    END $$;
  `);
}

async function acquireMigrationLock(): Promise<boolean> {
  const deadline = Date.now() + MIGRATION_LOCK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const rows = (await dataSource.query(`SELECT pg_try_advisory_lock($1) AS locked`, [
      MIGRATION_LOCK_KEY,
    ])) as { locked: boolean | string }[];
    const locked = rows[0]?.locked;
    if (locked === true || locked === 't') {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function main() {
  await dataSource.initialize();
  try {
    const locked = await acquireMigrationLock();
    if (!locked) {
      throw new Error(
        `No se pudo tomar el lock de migraciones en ${MIGRATION_LOCK_TIMEOUT_MS / 1000}s. Reintenta el deploy.`,
      );
    }
    try {
      const executed = await dataSource.runMigrations();
      console.log(
        executed.length === 0
          ? 'Migrations: none pending'
          : `Migrations: applied ${executed.length} → ${executed
              .map((m) => m.name)
              .join(', ')}`,
      );
      await ensureObjectStorageSchema();
    } finally {
      await dataSource.query(`SELECT pg_advisory_unlock($1)`, [MIGRATION_LOCK_KEY]);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
