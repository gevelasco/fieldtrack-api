import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClubExpenses1745100000000 implements MigrationInterface {
  name = 'ClubExpenses1745100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE fieldtrack.club_expenses (
        id serial PRIMARY KEY,
        club_id integer NOT NULL REFERENCES fieldtrack.clubs (id) ON DELETE CASCADE,
        spent_on date NOT NULL,
        expense_type text NOT NULL,
        concept text NOT NULL,
        amount numeric(12, 2) NOT NULL,
        recorded_by_user_id integer NOT NULL REFERENCES fieldtrack.app_user(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT club_expenses_amount_positive_chk CHECK (amount > 0),
        CONSTRAINT club_expenses_type_chk CHECK (
          expense_type IN ('oficina', 'administracion', 'reparacion', 'mantenimiento', 'deuda')
        )
      );
    `);
    await queryRunner.query(`
      CREATE INDEX club_expenses_club_spent_on_idx
        ON fieldtrack.club_expenses (club_id, spent_on DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS fieldtrack.club_expenses;`);
  }
}