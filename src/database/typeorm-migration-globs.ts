import { join } from 'path';

export function typeOrmMigrationGlobsFromDir(
  baseDir: string,
  options: { includeTypeScript?: boolean } = {},
): string[] {
  const migrationsDir = join(baseDir, 'migrations');
  if (options.includeTypeScript) {
    return [join(migrationsDir, '*.ts')];
  }
  return [join(migrationsDir, '*.js')];
}
