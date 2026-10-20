import { DataSource } from 'typeorm';
import { config as loadEnv } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { typeOrmEntityGlobsFromDir } from '../src/database/typeorm-entity-globs';
import { typeOrmMigrationGlobsFromDir } from '../src/database/typeorm-migration-globs';

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  loadEnv({ path: envPath });
} else {
  loadEnv();
}

if (typeof process.env.DB_PASSWORD !== 'string' || process.env.DB_PASSWORD.length === 0) {
  throw new Error(
    'Falta DB_PASSWORD. Copia .env.example a .env:  cp .env.example .env',
  );
}

const configFile = __filename.replace(/\\/g, '/');
const compiledConfig = configFile.includes('/dist/config/');

const isLocalSource =
  !compiledConfig &&
  (process.env.NODE_ENV === 'local' ||
    process.env.NODE_ENV === 'development' ||
    !process.env.NODE_ENV);

const entitiesRoot = path.join(
  process.cwd(),
  compiledConfig || !isLocalSource ? 'dist/src' : 'src',
);

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: typeOrmEntityGlobsFromDir(entitiesRoot, {
    includeTypeScript: isLocalSource,
  }),
  migrations: typeOrmMigrationGlobsFromDir(entitiesRoot, {
    includeTypeScript: isLocalSource,
  }),
  migrationsTableName: 'migrations_list',
  migrationsTransactionMode: 'each',
  ssl:
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

export default dataSource;
