import { MigrationInterface, QueryRunner } from 'typeorm';

export class WeaponRegistryMovements1745200000000 implements MigrationInterface {
  name = 'WeaponRegistryMovements1745200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fieldtrack.weapon_registry_movements (
        id serial PRIMARY KEY,
        club_id integer NOT NULL REFERENCES fieldtrack.clubs (id) ON DELETE CASCADE,
        member_id integer NOT NULL REFERENCES fieldtrack.members (id) ON DELETE CASCADE,
        weapon_id integer,
        movement text NOT NULL,
        movement_on date NOT NULL,
        platform text NOT NULL DEFAULT '',
        modality text NOT NULL DEFAULT '',
        serial_number text NOT NULL DEFAULT '',
        brand text NOT NULL DEFAULT '',
        model text NOT NULL DEFAULT '',
        caliber text NOT NULL DEFAULT '',
        recorded_by_user_id integer REFERENCES fieldtrack.app_user (id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT weapon_registry_movements_kind_chk CHECK (movement IN ('alta', 'baja'))
      );
    `);
    await queryRunner.query(`
      CREATE INDEX weapon_registry_movements_club_date_idx
        ON fieldtrack.weapon_registry_movements (club_id, movement_on DESC);
    `);
    await queryRunner.query(`
      INSERT INTO fieldtrack.weapon_registry_movements (
        club_id,
        member_id,
        weapon_id,
        movement,
        movement_on,
        platform,
        modality,
        serial_number,
        brand,
        model,
        caliber,
        recorded_by_user_id,
        created_at
      )
      SELECT
        w.club_id,
        w.member_id,
        w.id,
        'alta',
        w.registered_on,
        w.platform,
        w.modality,
        coalesce(w.serial_number, ''),
        w.brand,
        w.model,
        w.caliber,
        NULL,
        w.created_at
      FROM fieldtrack.member_weapons w;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS fieldtrack.weapon_registry_movements;`);
  }
}