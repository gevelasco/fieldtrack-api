import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Separa conceptos en columnas:
 * - modality: tiro deportivo / cacería
 * - membership: código del plan de membresía del club
 */
export class MemberModalityMembershipColumns1745600000000 implements MigrationInterface {
  name = 'MemberModalityMembershipColumns1745600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        DROP CONSTRAINT IF EXISTS members_membership_plan_code_chk;
    `);

    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        RENAME COLUMN membership TO modality;
    `);

    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        RENAME COLUMN membership_plan_code TO membership;
    `);

    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        ADD CONSTRAINT members_membership_chk
        CHECK (membership ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
    `);

    await queryRunner.query(`
      ALTER TABLE fieldtrack.membership_payments
        RENAME COLUMN membership TO modality;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.membership_payments
        RENAME COLUMN modality TO membership;
    `);

    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        DROP CONSTRAINT IF EXISTS members_membership_chk;
    `);

    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        RENAME COLUMN membership TO membership_plan_code;
    `);

    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        RENAME COLUMN modality TO membership;
    `);

    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        ADD CONSTRAINT members_membership_plan_code_chk
        CHECK (membership_plan_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
    `);
  }
}