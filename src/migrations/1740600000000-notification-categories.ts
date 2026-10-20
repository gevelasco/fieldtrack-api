import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationCategories1740600000000 implements MigrationInterface {
  name = 'NotificationCategories1740600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_notifications
        ADD COLUMN category text;
    `);
    await queryRunner.query(`
      UPDATE fieldtrack.club_notifications
      SET category = CASE kind
        WHEN 'member_registered' THEN 'registration'
        WHEN 'membership_paid' THEN 'confirmation'
        ELSE 'update'
      END;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_notifications
        ALTER COLUMN category SET NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_notifications
        ADD CONSTRAINT club_notifications_category_chk
        CHECK (category IN ('registration', 'confirmation', 'update'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_notifications
        DROP CONSTRAINT IF EXISTS club_notifications_category_chk;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_notifications
        DROP COLUMN IF EXISTS category;
    `);
  }
}
