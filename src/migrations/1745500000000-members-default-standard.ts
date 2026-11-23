import { MigrationInterface, QueryRunner } from 'typeorm';

/** Asigna plan «standard» a todos los socios (datos locales / legado). */
export class MembersDefaultStandard1745500000000 implements MigrationInterface {
  name = 'MembersDefaultStandard1745500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fieldtrack.members
      SET membership_plan_code = 'standard'
      WHERE membership_plan_code IS DISTINCT FROM 'standard';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fieldtrack.members m
      SET membership_plan_code = COALESCE(
        (
          SELECT t.code
          FROM fieldtrack.club_membership_types t
          WHERE t.club_id = m.club_id
          ORDER BY t.sort_order ASC, t.id ASC
          LIMIT 1
        ),
        'general'
      );
    `);
  }
}