import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClubSubscriptionBonusMonths1743900000000 implements MigrationInterface {
  name = 'ClubSubscriptionBonusMonths1743900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.clubs
        ADD COLUMN IF NOT EXISTS subscription_bonus_months integer NOT NULL DEFAULT 0;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.clubs
        DROP COLUMN IF EXISTS subscription_bonus_months;
    `);
  }
}
