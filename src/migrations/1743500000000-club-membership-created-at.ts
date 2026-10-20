import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClubMembershipCreatedAt1743500000000 implements MigrationInterface {
  name = 'ClubMembershipCreatedAt1743500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_membership_types
        ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_membership_types
        DROP COLUMN IF EXISTS created_at;
    `);
  }
}
