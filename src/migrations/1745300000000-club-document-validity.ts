import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClubDocumentValidity1745300000000 implements MigrationInterface {
  name = 'ClubDocumentValidity1745300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_member_document_defs
        ADD COLUMN IF NOT EXISTS validity_code text NOT NULL DEFAULT 'na';
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_member_document_defs
        ADD CONSTRAINT club_member_document_defs_validity_chk
        CHECK (validity_code IN ('na', '3m', '6m', '1y', '2y'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_member_document_defs
        DROP CONSTRAINT IF EXISTS club_member_document_defs_validity_chk;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_member_document_defs
        DROP COLUMN IF EXISTS validity_code;
    `);
  }
}