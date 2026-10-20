import { MigrationInterface, QueryRunner } from 'typeorm';

export class MemberWeaponPlatformRevolver1744200000000 implements MigrationInterface {
  name = 'MemberWeaponPlatformRevolver1744200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.member_weapons
        DROP CONSTRAINT IF EXISTS member_weapons_platform_check;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.member_weapons
        ADD CONSTRAINT member_weapons_platform_check
        CHECK (platform IN ('pistola', 'revolver', 'escopeta', 'rifle', 'otro'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.member_weapons
        DROP CONSTRAINT IF EXISTS member_weapons_platform_check;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.member_weapons
        ADD CONSTRAINT member_weapons_platform_check
        CHECK (platform IN ('pistola', 'escopeta', 'rifle', 'otro'));
    `);
  }
}
