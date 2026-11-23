import { MigrationInterface, QueryRunner } from 'typeorm';

export class MembershipPlans1745400000000 implements MigrationInterface {
  name = 'MembershipPlans1745400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_membership_types
        ADD COLUMN IF NOT EXISTS allows_sport_shooting boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS allows_hunting boolean NOT NULL DEFAULT true;
    `);

    await queryRunner.query(`
      UPDATE fieldtrack.club_membership_types
      SET allows_sport_shooting = true, allows_hunting = false
      WHERE code = 'tiro-deportivo';
    `);

    await queryRunner.query(`
      UPDATE fieldtrack.club_membership_types
      SET allows_sport_shooting = false, allows_hunting = true
      WHERE code = 'caza';
    `);

    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        ADD COLUMN IF NOT EXISTS membership_plan_code text;
    `);

    await queryRunner.query(`
      UPDATE fieldtrack.members m
      SET membership_plan_code = m.membership
      WHERE m.membership_plan_code IS NULL;
    `);

    await queryRunner.query(`
      UPDATE fieldtrack.members m
      SET membership_plan_code = fallback.plan_code
      FROM (
        SELECT m2.id AS member_id,
          (
            SELECT t.code
            FROM fieldtrack.club_membership_types t
            WHERE t.club_id = m2.club_id
            ORDER BY t.sort_order ASC, t.id ASC
            LIMIT 1
          ) AS plan_code
        FROM fieldtrack.members m2
        WHERE m2.membership_plan_code IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM fieldtrack.club_membership_types t
             WHERE t.club_id = m2.club_id AND t.code = m2.membership_plan_code
           )
      ) AS fallback
      WHERE m.id = fallback.member_id;
    `);

    await queryRunner.query(`
      INSERT INTO fieldtrack.club_membership_types (
        club_id, code, name, start_month, start_day, end_month, end_day, fee_mxn, sort_order,
        allows_sport_shooting, allows_hunting
      )
      SELECT
        c.id,
        'general',
        'Membresía general',
        c.sport_shooting_start_month,
        c.sport_shooting_start_day,
        c.sport_shooting_end_month,
        c.sport_shooting_end_day,
        c.sport_shooting_fee_mxn,
        0,
        true,
        true
      FROM fieldtrack.clubs c
      WHERE EXISTS (
        SELECT 1 FROM fieldtrack.club_membership_types tiro
        JOIN fieldtrack.club_membership_types caza ON caza.club_id = tiro.club_id
        WHERE tiro.club_id = c.id
          AND tiro.code = 'tiro-deportivo'
          AND caza.code = 'caza'
          AND tiro.fee_mxn = caza.fee_mxn
      )
      AND NOT EXISTS (
        SELECT 1 FROM fieldtrack.club_membership_types t
        WHERE t.club_id = c.id AND t.code = 'general'
      );
    `);

    await queryRunner.query(`
      UPDATE fieldtrack.members m
      SET membership_plan_code = 'general'
      FROM fieldtrack.clubs c
      WHERE m.club_id = c.id
        AND m.membership_plan_code IN ('tiro-deportivo', 'caza')
        AND EXISTS (
          SELECT 1 FROM fieldtrack.club_membership_types g
          WHERE g.club_id = c.id AND g.code = 'general'
        );
    `);

    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        ALTER COLUMN membership_plan_code SET NOT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        ADD CONSTRAINT members_membership_plan_code_chk
        CHECK (membership_plan_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        DROP CONSTRAINT IF EXISTS members_membership_plan_code_chk;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.members
        DROP COLUMN IF EXISTS membership_plan_code;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_membership_types
        DROP COLUMN IF EXISTS allows_hunting,
        DROP COLUMN IF EXISTS allows_sport_shooting;
    `);
  }
}