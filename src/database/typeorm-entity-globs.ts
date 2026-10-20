import { join } from 'path';

type EntityGlobOptions = {
  includeTypeScript?: boolean;
};

export function typeOrmEntityGlobsFromDir(
  baseDir: string,
  options: EntityGlobOptions = {},
): string[] {
  const pattern = options.includeTypeScript
    ? '*.entity.{ts,js}'
    : '*.entity.js';
  return [join(baseDir, '**', pattern)];
}
