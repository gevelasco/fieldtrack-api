import { MigrationInterface, QueryRunner } from 'typeorm';

export class MemberPetaHistory1744300000000 implements MigrationInterface {
  name = 'MemberPetaHistory1744300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.member_petas
        ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS superseded_on date NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.member_petas
        DROP CONSTRAINT IF EXISTS member_petas_type_uidx;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS member_petas_current_type_uidx
        ON fieldtrack.member_petas (member_id, permit_type)
        WHERE is_current = true;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS member_petas_member_history_idx
        ON fieldtrack.member_petas (member_id, permit_type, loaded_on DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS fieldtrack.member_petas_member_history_idx;`);
    await queryRunner.query(`DROP INDEX IF EXISTS fieldtrack.member_petas_current_type_uidx;`);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.member_petas
        DROP COLUMN IF EXISTS superseded_on,
        DROP COLUMN IF EXISTS is_current;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.member_petas
        ADD CONSTRAINT member_petas_type_uidx UNIQUE (member_id, permit_type);
    `);
  }
}
