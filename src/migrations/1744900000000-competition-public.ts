import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompetitionPublic1744900000000 implements MigrationInterface {
  name = 'CompetitionPublic1744900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.competition_editions
        ADD COLUMN is_public boolean NOT NULL DEFAULT true;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.competition_editions DROP COLUMN IF EXISTS is_public;
    `);
  }
}
