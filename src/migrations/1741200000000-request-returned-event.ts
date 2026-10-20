import { MigrationInterface, QueryRunner } from 'typeorm';

export class RequestReturnedEvent1741200000000 implements MigrationInterface {
  name = 'RequestReturnedEvent1741200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_events DROP CONSTRAINT IF EXISTS club_request_events_kind_check;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_events ADD CONSTRAINT club_request_events_kind_check CHECK (kind IN (
        'created', 'updated', 'started', 'returned', 'completed', 'reopened',
        'document_added', 'document_removed', 'removed'
      ));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fieldtrack.club_request_events SET kind = 'updated' WHERE kind = 'returned';
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_events DROP CONSTRAINT IF EXISTS club_request_events_kind_check;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_events ADD CONSTRAINT club_request_events_kind_check CHECK (kind IN (
        'created', 'updated', 'started', 'completed', 'reopened',
        'document_added', 'document_removed', 'removed'
      ));
    `);
  }
}
