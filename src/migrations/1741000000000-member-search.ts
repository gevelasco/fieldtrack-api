import { MigrationInterface, QueryRunner } from 'typeorm';

const FOLD_FROM = 'ÁÉÍÓÚÜÑáéíóúüñ';
const FOLD_TO = 'AEIOUUNaeiouun';

export class MemberSearch1741000000000 implements MigrationInterface {
  name = 'MemberSearch1741000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        ADD COLUMN search_text text GENERATED ALWAYS AS (
          lower(translate(
            member_number || ' ' || first_name || ' ' || paternal_surname || ' ' || maternal_surname,
            '${FOLD_FROM}', '${FOLD_TO}'
          ))
        ) STORED;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.member_weapons
        ADD COLUMN search_text text GENERATED ALWAYS AS (
          lower(translate(
            brand || ' ' || model || ' ' || caliber || ' ' || serial_number,
            '${FOLD_FROM}', '${FOLD_TO}'
          ))
        ) STORED;
    `);
    await queryRunner.query(`
      CREATE INDEX members_search_trgm_idx
        ON fieldtrack.members USING gin (search_text gin_trgm_ops);
    `);
    await queryRunner.query(`
      CREATE INDEX member_weapons_search_trgm_idx
        ON fieldtrack.member_weapons USING gin (search_text gin_trgm_ops);
    `);
    await queryRunner.query(`
      CREATE INDEX members_club_membership_number_idx
        ON fieldtrack.members (club_id, membership, member_number);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS fieldtrack.members_club_membership_number_idx;`);
    await queryRunner.query(`DROP INDEX IF EXISTS fieldtrack.member_weapons_search_trgm_idx;`);
    await queryRunner.query(`DROP INDEX IF EXISTS fieldtrack.members_search_trgm_idx;`);
    await queryRunner.query(`ALTER TABLE fieldtrack.member_weapons DROP COLUMN IF EXISTS search_text;`);
    await queryRunner.query(`ALTER TABLE fieldtrack.members DROP COLUMN IF EXISTS search_text;`);
  }
}
