import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClubOfficialFormFees1745900000000 implements MigrationInterface {
  name = 'ClubOfficialFormFees1745900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.clubs
        ADD COLUMN IF NOT EXISTS official_form_fees jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.clubs
        DROP COLUMN IF EXISTS official_form_fees;
    `);
  }
}