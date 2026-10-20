import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClubDocumentCreatedAt1743400000000 implements MigrationInterface {
  name = 'ClubDocumentCreatedAt1743400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_member_document_defs
        ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_member_document_defs
        DROP COLUMN IF EXISTS created_at;
    `);
  }
}
