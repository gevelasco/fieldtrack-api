import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Claves en object storage (Railway Bucket / Tigris vía FileService).
 * Filas legacy conservan bytea; cargas nuevas usan storage_key.
 */
export class DocumentObjectStorage1744500000000 implements MigrationInterface {
  name = 'DocumentObjectStorage1744500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.member_documents
        ADD COLUMN IF NOT EXISTS storage_key text NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS member_documents_storage_key_idx
        ON fieldtrack.member_documents (storage_key)
        WHERE storage_key IS NOT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE fieldtrack.member_weapons
        ADD COLUMN IF NOT EXISTS sheet_storage_key text NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE fieldtrack.member_petas
        ADD COLUMN IF NOT EXISTS storage_key text NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_documents
        ADD COLUMN IF NOT EXISTS storage_key text NULL;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS club_request_documents_storage_key_idx
        ON fieldtrack.club_request_documents (storage_key)
        WHERE storage_key IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS fieldtrack.club_request_documents_storage_key_idx;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_documents DROP COLUMN IF EXISTS storage_key;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.member_petas DROP COLUMN IF EXISTS storage_key;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.member_weapons DROP COLUMN IF EXISTS sheet_storage_key;
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS fieldtrack.member_documents_storage_key_idx;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.member_documents DROP COLUMN IF EXISTS storage_key;
    `);
  }
}
