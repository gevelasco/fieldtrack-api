import { MigrationInterface, QueryRunner } from 'typeorm';

/** Solicitudes para que el socio suba las hojas de registro de armas que le faltan. */
export class RequestWeaponSheets1744700000000 implements MigrationInterface {
  name = 'RequestWeaponSheets1744700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_requests
        ADD COLUMN IF NOT EXISTS weapon_ids int[] NOT NULL DEFAULT '{}',
        DROP CONSTRAINT IF EXISTS club_requests_topic_check,
        DROP CONSTRAINT IF EXISTS club_requests_topic_slots_chk;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_requests
        ADD CONSTRAINT club_requests_topic_check
          CHECK (topic IN ('general', 'member_documents', 'document_renewal', 'weapon_sheets')),
        ADD CONSTRAINT club_requests_topic_slots_chk CHECK (
          CASE topic
            WHEN 'general' THEN cardinality(document_slots) = 0 AND cardinality(weapon_ids) = 0
            WHEN 'member_documents' THEN kind = 'member' AND cardinality(document_slots) > 0
            WHEN 'weapon_sheets' THEN
              kind = 'member' AND cardinality(document_slots) = 0 AND cardinality(weapon_ids) > 0
            ELSE kind = 'member' AND cardinality(document_slots) = 1
          END
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM fieldtrack.club_requests WHERE topic = 'weapon_sheets'`);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_requests
        DROP CONSTRAINT IF EXISTS club_requests_topic_check,
        DROP CONSTRAINT IF EXISTS club_requests_topic_slots_chk;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_requests
        DROP COLUMN IF EXISTS weapon_ids,
        ADD CONSTRAINT club_requests_topic_check
          CHECK (topic IN ('general', 'member_documents', 'document_renewal')),
        ADD CONSTRAINT club_requests_topic_slots_chk CHECK (
          CASE topic
            WHEN 'general' THEN cardinality(document_slots) = 0
            WHEN 'member_documents' THEN kind = 'member' AND cardinality(document_slots) > 0
            ELSE kind = 'member' AND cardinality(document_slots) = 1
          END
        );
    `);
  }
}
