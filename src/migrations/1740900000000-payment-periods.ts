import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentPeriods1740900000000 implements MigrationInterface {
  name = 'PaymentPeriods1740900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.membership_payments
        ADD COLUMN period_start date;
    `);
    await queryRunner.query(`
      UPDATE fieldtrack.membership_payments p
      SET period_start = make_date(
        CASE
          WHEN r.end_month < r.start_month
            AND (EXTRACT(MONTH FROM p.paid_on)::int < r.start_month
              OR (EXTRACT(MONTH FROM p.paid_on)::int = r.start_month
                AND EXTRACT(DAY FROM p.paid_on)::int < r.start_day))
          THEN EXTRACT(YEAR FROM p.paid_on)::int - 1
          ELSE EXTRACT(YEAR FROM p.paid_on)::int
        END,
        r.start_month,
        r.start_day
      )
      FROM (
        SELECT id AS club_id, 'tiro-deportivo' AS membership,
               sport_shooting_start_month AS start_month,
               sport_shooting_start_day AS start_day,
               sport_shooting_end_month AS end_month
        FROM fieldtrack.clubs
        UNION ALL
        SELECT id, 'caza', hunting_start_month, hunting_start_day, hunting_end_month
        FROM fieldtrack.clubs
      ) r
      WHERE r.club_id = p.club_id AND r.membership = p.membership;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.membership_payments
        ALTER COLUMN period_start SET NOT NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX membership_payments_active_period_uidx
        ON fieldtrack.membership_payments (member_id, membership, period_start)
        WHERE reverted_at IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS fieldtrack.membership_payments_active_period_uidx;`);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.membership_payments
        DROP COLUMN IF EXISTS period_start;
    `);
  }
}
