import { MigrationInterface, QueryRunner } from 'typeorm';

/** Quita podio/puntuación demo de Chivo 2025 para probar publicación manual del ranking. */
export class ClearChivo2025Ranking1742300000000 implements MigrationInterface {
  name = 'ClearChivo2025Ranking1742300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE fieldtrack.competition_registrations r
       SET score = NULL, rank = NULL
       FROM fieldtrack.competition_editions e
       WHERE r.edition_id = e.id
         AND lower(btrim(e.title)) = lower(btrim('Chivo 2025'))`,
    );
  }

  public async down(): Promise<void> {
    // Sin restaurar datos demo.
  }
}
