import { INestApplication } from '@nestjs/common';
import { DataSource, EntityTarget } from 'typeorm';

const REQUIRED_ENTITIES: EntityTarget<unknown>[] = [];

export function assertRequiredTypeOrmEntities(app: INestApplication): void {
  if (REQUIRED_ENTITIES.length === 0) {
    return;
  }

  const dataSource = app.get(DataSource);
  const missing = REQUIRED_ENTITIES.map((entity) => {
    const ctor = entity as { name?: string };
    return ctor.name ?? String(entity);
  }).filter((name, index) => !dataSource.hasMetadata(REQUIRED_ENTITIES[index]));

  if (missing.length === 0) {
    return;
  }

  throw new Error(
    `TypeORM metadata missing for: ${missing.join(', ')}. ` +
      'Rebuild the API (`npm run build`) and restart the process.',
  );
}
