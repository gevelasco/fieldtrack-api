import { MigrationInterface, QueryRunner } from 'typeorm';

export class StaffModulePermissions1743600000000 implements MigrationInterface {
  name = 'StaffModulePermissions1743600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.app_user
        ADD COLUMN IF NOT EXISTS module_permissions jsonb NOT NULL DEFAULT '{}';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.app_user
        DROP COLUMN IF EXISTS module_permissions;
    `);
  }
}
