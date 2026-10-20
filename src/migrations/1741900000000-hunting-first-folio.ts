import { MigrationInterface, QueryRunner } from 'typeorm';

/** Folio inicial opcional por temporada; solo sirve para sugerir el siguiente al vender, no restringe el rango. */
export class HuntingFirstFolio1741900000000 implements MigrationInterface {
  name = 'HuntingFirstFolio1741900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.hunting_seasons
        ADD COLUMN first_folio text CHECK (first_folio IS NULL OR first_folio ~ '^[0-9]{1,12}$');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE fieldtrack.hunting_seasons DROP COLUMN IF EXISTS first_folio;`);
  }
}
