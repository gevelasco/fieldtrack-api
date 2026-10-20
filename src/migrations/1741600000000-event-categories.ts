import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventCategories1741600000000 implements MigrationInterface {
  name = 'EventCategories1741600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_events
        ADD COLUMN category text NOT NULL DEFAULT 'event' CHECK (category IN (
          'assembly', 'competition', 'practice', 'course', 'outing', 'maintenance', 'event'
        ));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE fieldtrack.club_events DROP COLUMN IF EXISTS category;`);
  }
}
