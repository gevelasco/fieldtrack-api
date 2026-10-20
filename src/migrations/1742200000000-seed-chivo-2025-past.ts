import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Datos demo: competencia pasada "Chivo 2025" con inscripciones (sin ranking; se publica desde la app).
 * Idempotente: no inserta si ya existe el título en la disciplina Chivo (o la primera).
 */
export class SeedChivo2025Past1742200000000 implements MigrationInterface {
  name = 'SeedChivo2025Past1742200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const disciplines = await queryRunner.query(
      `SELECT id, club_id, name FROM fieldtrack.competition_disciplines ORDER BY id LIMIT 20`,
    );
    if (!disciplines.length) {
      return;
    }
    const discipline =
      disciplines.find((row: { name: string }) => row.name.toLowerCase().includes('chivo')) ??
      disciplines[0];

    const existing = await queryRunner.query(
      `SELECT id FROM fieldtrack.competition_editions
       WHERE discipline_id = $1 AND lower(btrim(title)) = lower(btrim('Chivo 2025'))`,
      [discipline.id],
    );
    if (existing.length) {
      return;
    }

    const admins = await queryRunner.query(
      `SELECT id FROM fieldtrack.app_user WHERE club_id = $1 AND role = 'admin' ORDER BY id LIMIT 1`,
      [discipline.club_id],
    );
    const staffRows = await queryRunner.query(
      `SELECT id FROM fieldtrack.app_user WHERE club_id = $1 AND role = 'staff' ORDER BY id LIMIT 1`,
      [discipline.club_id],
    );
    const staffId = admins[0]?.id ?? staffRows[0]?.id;
    if (!staffId) {
      return;
    }

    const members = await queryRunner.query(
      `SELECT id FROM fieldtrack.members
       WHERE club_id = $1 AND status = 'vigente'
       ORDER BY member_number
       LIMIT 12`,
      [discipline.club_id],
    );
    if (members.length < 1) {
      return;
    }

    const startsOn = '2025-09-20';
    const regOpen = '2025-08-01T08:00:00.000Z';
    const regClose = '2025-09-20T07:59:00.000Z';

    const inserted = await queryRunner.query(
      `INSERT INTO fieldtrack.competition_editions (
        club_id, discipline_id, title, venue, starts_on, ends_on,
        start_time, end_time, max_participants, entry_fee,
        registration_opens, registration_closes, payment_deadline,
        notes, closed_at, created_by_user_id
      ) VALUES (
        $1, $2, 'Chivo 2025', 'Campo de tiro norte', $3, $3,
        '08:00:00', '14:00:00', $4, 350,
        $5, $6, $6,
        '', NULL, $7
      )
      RETURNING id`,
      [discipline.club_id, discipline.id, startsOn, members.length, regOpen, regClose, staffId],
    );
    const editionId = inserted[0].id as number;

    await queryRunner.query(
      `INSERT INTO fieldtrack.club_events (
        club_id, competition_edition_id, title, description, visibility, category,
        starts_on, ends_on, start_time, end_time, recurrence, repeat_until, created_by_user_id
      ) VALUES (
        $1, $2, $3, $4, 'public', 'competition',
        $5, NULL, '08:00:00', '14:00:00', 'none', NULL, $6
      )`,
      [
        discipline.club_id,
        editionId,
        `${discipline.name} — Chivo 2025`,
        `Campo de tiro norte · Competencia de ${discipline.name}.`,
        startsOn,
        staffId,
      ],
    );

    for (const member of members) {
      await queryRunner.query(
        `INSERT INTO fieldtrack.competition_registrations (
          club_id, edition_id, participant_kind, member_id, status,
          pre_registered_at, confirmed_at, confirmed_by_user_id, score, rank
        ) VALUES (
          $1, $2, 'member', $3, 'confirmed',
          $4, $4, $5, NULL, NULL
        )`,
        [discipline.club_id, editionId, member.id, regClose, staffId],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM fieldtrack.competition_editions
       WHERE lower(btrim(title)) = lower(btrim('Chivo 2025'))`,
    );
  }
}
