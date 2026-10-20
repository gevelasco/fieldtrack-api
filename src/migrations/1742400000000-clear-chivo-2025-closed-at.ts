import { MigrationInterface, QueryRunner } from 'typeorm';

/** Chivo 2025 demo: pasada por fechas, sin podio; closed_at no debe bloquear publicar ranking. */
export class ClearChivo2025ClosedAt1742400000000 implements MigrationInterface {
  name = 'ClearChivo2025ClosedAt1742400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE fieldtrack.competition_editions e
       SET closed_at = NULL
       WHERE lower(btrim(e.title)) = lower(btrim('Chivo 2025'))
         AND NOT EXISTS (
           SELECT 1 FROM fieldtrack.competition_registrations r
           WHERE r.edition_id = e.id AND r.rank IS NOT NULL
         )`,
    );
  }

  public async down(): Promise<void> {
    // Sin restaurar closed_at demo.
  }
}
