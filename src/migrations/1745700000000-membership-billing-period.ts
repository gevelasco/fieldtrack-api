import { MigrationInterface, QueryRunner } from 'typeorm';

export class MembershipBillingPeriod1745700000000 implements MigrationInterface {
  name = 'MembershipBillingPeriod1745700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_membership_types
      ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'anual'
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_membership_types
      ADD CONSTRAINT club_membership_types_billing_period_chk
      CHECK (billing_period IN ('mensual', 'semestral', 'anual'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_membership_types
      DROP CONSTRAINT IF EXISTS club_membership_types_billing_period_chk
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_membership_types
      DROP COLUMN IF EXISTS billing_period
    `);
  }
}