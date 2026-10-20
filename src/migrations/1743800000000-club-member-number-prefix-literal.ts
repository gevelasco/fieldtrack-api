import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClubMemberNumberPrefixLiteral1743800000000 implements MigrationInterface {
  name = 'ClubMemberNumberPrefixLiteral1743800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.clubs
        ALTER COLUMN member_number_prefix SET DEFAULT 'SOC-';
    `);
    await queryRunner.query(`
      UPDATE fieldtrack.clubs
         SET member_number_prefix = member_number_prefix || '-'
       WHERE member_number_prefix <> ''
         AND member_number_prefix !~ '[-_/ ]$';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fieldtrack.clubs
         SET member_number_prefix = regexp_replace(member_number_prefix, '[-_/ ]$', '')
       WHERE member_number_prefix ~ '[-_/ ]$';
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.clubs
        ALTER COLUMN member_number_prefix SET DEFAULT 'SOC';
    `);
  }
}
