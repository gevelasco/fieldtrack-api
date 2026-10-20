import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompetitionEditionVenue1742100000000 implements MigrationInterface {
  name = 'CompetitionEditionVenue1742100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.competition_editions
        ADD COLUMN venue text NOT NULL DEFAULT '';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.competition_editions DROP COLUMN venue;
    `);
  }
}
