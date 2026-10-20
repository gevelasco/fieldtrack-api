import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentDateIndexes1744400000000 implements MigrationInterface {
  name = 'PaymentDateIndexes1744400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS membership_payments_club_paid_idx
        ON fieldtrack.membership_payments (club_id, paid_on DESC)
        WHERE reverted_at IS NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS hunting_tag_sales_club_paid_idx
        ON fieldtrack.hunting_tag_sales (club_id, paid_on DESC)
        WHERE reverted_at IS NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS competition_registrations_club_confirmed_idx
        ON fieldtrack.competition_registrations (club_id, confirmed_at DESC)
        WHERE status = 'confirmed' AND confirmed_at IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS fieldtrack.competition_registrations_club_confirmed_idx;`);
    await queryRunner.query(`DROP INDEX IF EXISTS fieldtrack.hunting_tag_sales_club_paid_idx;`);
    await queryRunner.query(`DROP INDEX IF EXISTS fieldtrack.membership_payments_club_paid_idx;`);
  }
}
