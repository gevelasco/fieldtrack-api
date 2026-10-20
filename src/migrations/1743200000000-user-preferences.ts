import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tema por usuario y foto de perfil, el mismo criterio que terminalOps. */
export class UserPreferences1743200000000 implements MigrationInterface {
  name = 'UserPreferences1743200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.app_user
        ADD COLUMN IF NOT EXISTS photo_data_url text;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS fieldtrack.user_preferences (
        user_id integer PRIMARY KEY REFERENCES fieldtrack.app_user (id) ON DELETE CASCADE,
        theme_scheme text NOT NULL DEFAULT 'light' CHECK (theme_scheme IN ('light', 'dark')),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      INSERT INTO fieldtrack.user_preferences (user_id, theme_scheme)
      SELECT id, 'light'
        FROM fieldtrack.app_user
      ON CONFLICT (user_id) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS fieldtrack.user_preferences;`);
    await queryRunner.query(`ALTER TABLE fieldtrack.app_user DROP COLUMN IF EXISTS photo_data_url;`);
  }
}
