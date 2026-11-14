import { MigrationInterface, QueryRunner } from 'typeorm';

export class MemberIdentity1745000000000 implements MigrationInterface {
  name = 'MemberIdentity1745000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        ADD COLUMN curp text NOT NULL DEFAULT '',
        ADD COLUMN rfc text NOT NULL DEFAULT '',
        ADD COLUMN address text NOT NULL DEFAULT '',
        ADD COLUMN photo_file_name text,
        ADD COLUMN photo_content_type text,
        ADD COLUMN photo_storage_key text,
        ADD COLUMN photo_size_bytes bigint;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        DROP COLUMN IF EXISTS curp,
        DROP COLUMN IF EXISTS rfc,
        DROP COLUMN IF EXISTS address,
        DROP COLUMN IF EXISTS photo_file_name,
        DROP COLUMN IF EXISTS photo_content_type,
        DROP COLUMN IF EXISTS photo_storage_key,
        DROP COLUMN IF EXISTS photo_size_bytes;
    `);
  }
}
