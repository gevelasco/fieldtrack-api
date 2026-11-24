import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClubModalityLabels1745800000000 implements MigrationInterface {
  name = 'ClubModalityLabels1745800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.clubs
        ADD COLUMN IF NOT EXISTS sport_shooting_modality_label text NOT NULL DEFAULT 'Tiro deportivo',
        ADD COLUMN IF NOT EXISTS hunting_modality_label text NOT NULL DEFAULT 'Cacería';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.clubs
        DROP COLUMN IF EXISTS sport_shooting_modality_label,
        DROP COLUMN IF EXISTS hunting_modality_label;
    `);
  }
}