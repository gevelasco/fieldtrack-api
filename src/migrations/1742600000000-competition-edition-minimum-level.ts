import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nivel mínimo sugerido por competencia (referencia sporting/compak: Iniciados, C, B, A).
 */
export class CompetitionEditionMinimumLevel1742600000000 implements MigrationInterface {
  name = 'CompetitionEditionMinimumLevel1742600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.competition_editions
        ADD COLUMN minimum_level text;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.competition_editions
        ADD CONSTRAINT competition_editions_minimum_level_chk
          CHECK (minimum_level IS NULL OR minimum_level IN ('iniciados', 'c', 'b', 'a'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.competition_editions
        DROP CONSTRAINT IF EXISTS competition_editions_minimum_level_chk;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.competition_editions DROP COLUMN IF EXISTS minimum_level;
    `);
  }
}
