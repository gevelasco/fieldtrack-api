import { MigrationInterface, QueryRunner } from 'typeorm';

export class RequestMemberSubmittedEvent1744100000000 implements MigrationInterface {
  name = 'RequestMemberSubmittedEvent1744100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_events DROP CONSTRAINT IF EXISTS club_request_events_kind_check;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_events ADD CONSTRAINT club_request_events_kind_check CHECK (kind IN (
        'created', 'updated', 'started', 'returned', 'completed', 'reopened',
        'document_added', 'document_removed', 'removed',
        'member_submitted', 'comment_added'
      ));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fieldtrack.club_request_events SET kind = 'updated'
      WHERE kind IN ('member_submitted', 'comment_added');
    `);
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
}
