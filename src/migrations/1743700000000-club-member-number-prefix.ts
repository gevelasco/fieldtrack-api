import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClubMemberNumberPrefix1743700000000 implements MigrationInterface {
  name = 'ClubMemberNumberPrefix1743700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.clubs
        ADD COLUMN IF NOT EXISTS member_number_prefix text NOT NULL DEFAULT 'SOC';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.clubs
        DROP COLUMN IF EXISTS member_number_prefix;
    `);
  }
}
