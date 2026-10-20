import { MigrationInterface, QueryRunner } from 'typeorm';

export class SocioAccounts1740700000000 implements MigrationInterface {
  name = 'SocioAccounts1740700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.app_user
        DROP CONSTRAINT IF EXISTS app_user_club_email_uidx;
    `);
    await queryRunner.query(`
      WITH created AS (
        INSERT INTO fieldtrack.app_user (
          club_id, username, display_name, email, phone, password_hash, role, status
        )
        SELECT
          member.club_id,
          member.member_number,
          trim(both ' ' FROM concat_ws(
            ' ',
            member.first_name,
            member.paternal_surname,
            nullif(member.maternal_surname, '')
          )),
          nullif(trim(member.email), ''),
          nullif(trim(member.phone), ''),
          crypt(gen_random_uuid()::text, gen_salt('bf', 10)),
          'socio',
          'active'
        FROM fieldtrack.members member
        WHERE member.user_id IS NULL
        RETURNING id, club_id, username
      )
      UPDATE fieldtrack.members member
      SET user_id = created.id
      FROM created
      WHERE member.club_id = created.club_id
        AND member.member_number = created.username;
    `);
    await queryRunner.query(`
      INSERT INTO fieldtrack.user_preferences (user_id, theme_scheme)
      SELECT app_user.id, 'light'
      FROM fieldtrack.app_user app_user
      WHERE app_user.role = 'socio'
        AND NOT EXISTS (
          SELECT 1
          FROM fieldtrack.user_preferences preference
          WHERE preference.user_id = app_user.id
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fieldtrack.members
      SET user_id = NULL
      WHERE user_id IN (SELECT id FROM fieldtrack.app_user WHERE role = 'socio');
    `);
    await queryRunner.query(`
      DELETE FROM fieldtrack.user_preferences
      WHERE user_id IN (SELECT id FROM fieldtrack.app_user WHERE role = 'socio');
    `);
    await queryRunner.query(`
      DELETE FROM fieldtrack.app_user WHERE role = 'socio';
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.app_user
        ADD CONSTRAINT app_user_club_email_uidx UNIQUE (club_id, email);
    `);
  }
}
