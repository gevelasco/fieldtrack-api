import { MigrationInterface, QueryRunner } from 'typeorm';

/** Un evento de todo el día no tiene hora: `start_time` y `end_time` quedan vacíos. */
export class EventAllDay1741500000000 implements MigrationInterface {
  name = 'EventAllDay1741500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_events
        ALTER COLUMN start_time DROP NOT NULL,
        DROP CONSTRAINT club_events_end_after_start_chk,
        ADD CONSTRAINT club_events_end_after_start_chk CHECK (
          end_time IS NULL OR (start_time IS NOT NULL AND end_time > start_time)
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fieldtrack.club_events SET start_time = '00:00' WHERE start_time IS NULL;
      ALTER TABLE fieldtrack.club_events
        ALTER COLUMN start_time SET NOT NULL,
        DROP CONSTRAINT club_events_end_after_start_chk,
        ADD CONSTRAINT club_events_end_after_start_chk CHECK (end_time IS NULL OR end_time > start_time);
    `);
  }
}
