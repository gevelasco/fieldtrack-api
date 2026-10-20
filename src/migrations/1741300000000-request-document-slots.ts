import { MigrationInterface, QueryRunner } from 'typeorm';

export class RequestDocumentSlots1741300000000 implements MigrationInterface {
  name = 'RequestDocumentSlots1741300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_requests
        ADD COLUMN topic text NOT NULL DEFAULT 'general'
          CHECK (topic IN ('general', 'member_documents', 'document_renewal')),
        ADD COLUMN document_slots text[] NOT NULL DEFAULT '{}'
          CHECK (document_slots <@ ARRAY[
            'carta-antecedentes', 'cartilla-militar', 'certificado-medico', 'comprobante-domicilio',
            'csf', 'curp', 'examen-psicologico', 'ine'
          ]::text[]),
        ADD CONSTRAINT club_requests_topic_slots_chk CHECK (
          CASE topic
            WHEN 'general' THEN cardinality(document_slots) = 0
            WHEN 'member_documents' THEN kind = 'member' AND cardinality(document_slots) > 0
            ELSE kind = 'member' AND cardinality(document_slots) = 1
          END
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_requests
        DROP CONSTRAINT IF EXISTS club_requests_topic_slots_chk,
        DROP COLUMN IF EXISTS document_slots,
        DROP COLUMN IF EXISTS topic;
    `);
  }
}
