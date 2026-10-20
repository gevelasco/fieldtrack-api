import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentReversals1740800000000 implements MigrationInterface {
  name = 'PaymentReversals1740800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.membership_payments
        ADD COLUMN reverted_at timestamptz,
        ADD COLUMN reverted_by_user_id integer,
        ADD CONSTRAINT membership_payments_reverter_same_club_fk
          FOREIGN KEY (reverted_by_user_id, club_id) REFERENCES fieldtrack.app_user (id, club_id),
        ADD CONSTRAINT membership_payments_reversal_chk
          CHECK ((reverted_at IS NULL) = (reverted_by_user_id IS NULL));
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_notifications
        DROP CONSTRAINT club_notifications_category_chk,
        ADD CONSTRAINT club_notifications_category_chk
          CHECK (category IN ('registration', 'confirmation', 'update', 'reversal'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fieldtrack.club_notifications SET category = 'update' WHERE category = 'reversal';
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_notifications
        DROP CONSTRAINT club_notifications_category_chk,
        ADD CONSTRAINT club_notifications_category_chk
          CHECK (category IN ('registration', 'confirmation', 'update'));
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.membership_payments
        DROP CONSTRAINT IF EXISTS membership_payments_reversal_chk,
        DROP CONSTRAINT IF EXISTS membership_payments_reverter_same_club_fk,
        DROP COLUMN IF EXISTS reverted_by_user_id,
        DROP COLUMN IF EXISTS reverted_at;
    `);
  }
}
