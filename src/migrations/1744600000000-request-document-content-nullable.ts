import { MigrationInterface, QueryRunner } from 'typeorm';

/** Cargas nuevas van a object storage; bytea legacy puede quedar vacío. */
export class RequestDocumentContentNullable1744600000000 implements MigrationInterface {
  name = 'RequestDocumentContentNullable1744600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_documents
        ALTER COLUMN content DROP NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_documents
        ALTER COLUMN content SET NOT NULL;
    `);
  }
}
