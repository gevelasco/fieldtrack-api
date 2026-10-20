import { MigrationInterface, QueryRunner } from 'typeorm';

const DISCIPLINE_NAME = 'Tiro con escopeta';
const EDITION_TITLE = 'Copa Escopeta 2025';

/**
 * Demo: disciplina de escopeta, competencia pasada con inscripciones y podio publicado.
 */
export class SeedEscopetaPast1742500000000 implements MigrationInterface {
  name = 'SeedEscopetaPast1742500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const clubs = await queryRunner.query(`SELECT id FROM fieldtrack.clubs ORDER BY id LIMIT 1`);
    if (!clubs.length) {
      return;
    }
    const clubId = clubs[0].id as number;

    const admins = await queryRunner.query(
      `SELECT id FROM fieldtrack.app_user WHERE club_id = $1 AND role = 'admin' ORDER BY id LIMIT 1`,
      [clubId],
    );
    const staffRows = await queryRunner.query(
      `SELECT id FROM fieldtrack.app_user WHERE club_id = $1 AND role = 'staff' ORDER BY id LIMIT 1`,
      [clubId],
    );
    const staffId = admins[0]?.id ?? staffRows[0]?.id;
    if (!staffId) {
      return;
    }

    let disciplineId: number;
    const existingDiscipline = await queryRunner.query(
      `SELECT id FROM fieldtrack.competition_disciplines
       WHERE club_id = $1 AND lower(btrim(name)) = lower(btrim($2))`,
      [clubId, DISCIPLINE_NAME],
    );
    if (existingDiscipline.length) {
      disciplineId = existingDiscipline[0].id as number;
    } else {
      const insertedDiscipline = await queryRunner.query(
        `INSERT INTO fieldtrack.competition_disciplines (club_id, name, notes, created_by_user_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          clubId,
          DISCIPLINE_NAME,
          'Trap, skeet y competencias de tiro con escopeta en el club.',
          staffId,
        ],
      );
      disciplineId = insertedDiscipline[0].id as number;
    }

    const existingEdition = await queryRunner.query(
      `SELECT id FROM fieldtrack.competition_editions
       WHERE discipline_id = $1 AND lower(btrim(title)) = lower(btrim($2))`,
      [disciplineId, EDITION_TITLE],
    );
    if (existingEdition.length) {
      return;
    }

    const members = await queryRunner.query(
      `SELECT id FROM fieldtrack.members
       WHERE club_id = $1 AND status = 'vigente'
       ORDER BY member_number
       LIMIT 8`,
      [clubId],
    );
    if (members.length < 3) {
      return;
    }

    const startsOn = '2025-06-14';
    const regOpen = '2025-05-01T08:00:00.000Z';
    const regClose = '2025-06-13T20:00:00.000Z';
    const confirmedAt = '2025-06-13T20:00:00.000Z';

    const insertedEdition = await queryRunner.query(
      `INSERT INTO fieldtrack.competition_editions (
        club_id, discipline_id, title, venue, starts_on, ends_on,
        start_time, end_time, max_participants, entry_fee,
        registration_opens, registration_closes, payment_deadline,
        notes, closed_at, created_by_user_id
      ) VALUES (
        $1, $2, $3, 'Campo de trap', $4, $4,
        '09:00:00', '16:00:00', 20, 450,
        $5, $6, $6,
        '', NOW() - interval '3 months', $7
      )
      RETURNING id`,
      [clubId, disciplineId, EDITION_TITLE, startsOn, regOpen, regClose, staffId],
    );
    const editionId = insertedEdition[0].id as number;

    await queryRunner.query(
      `INSERT INTO fieldtrack.club_events (
        club_id, competition_edition_id, title, description, visibility, category,
        starts_on, ends_on, start_time, end_time, recurrence, repeat_until, created_by_user_id
      ) VALUES (
        $1, $2, $3, $4, 'public', 'competition',
        $5, NULL, '09:00:00', '16:00:00', 'none', NULL, $6
      )`,
      [
        clubId,
        editionId,
        `${DISCIPLINE_NAME} — ${EDITION_TITLE}`,
        `Campo de trap · ${EDITION_TITLE}.`,
        startsOn,
        staffId,
      ],
    );

    /** Podio demo: puntuaciones trap; el resto confirmados sin lugar. */
    const podiumScores = [98.5, 96.0, 94.5, 92.0, 90.0] as const;

    for (let index = 0; index < members.length; index += 1) {
      const memberId = members[index].id as number;
      const place = index < podiumScores.length ? index + 1 : null;
      const score = index < podiumScores.length ? podiumScores[index] : null;
      await queryRunner.query(
        `INSERT INTO fieldtrack.competition_registrations (
          club_id, edition_id, participant_kind, member_id, status,
          pre_registered_at, confirmed_at, confirmed_by_user_id, score, rank
        ) VALUES (
          $1, $2, 'member', $3, 'confirmed',
          $4, $4, $5, $6, $7
        )`,
        [clubId, editionId, memberId, confirmedAt, staffId, score, place],
      );
    }

    if (members.length >= 6) {
      await queryRunner.query(
        `INSERT INTO fieldtrack.competition_registrations (
          club_id, edition_id, participant_kind, guest_name, status,
          pre_registered_at, confirmed_at, confirmed_by_user_id, score, rank
        ) VALUES (
          $1, $2, 'guest', 'Invitado Trap Norte', 'confirmed',
          $3, $3, $4, NULL, NULL
        )`,
        [clubId, editionId, confirmedAt, staffId],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM fieldtrack.competition_editions
       WHERE lower(btrim(title)) = lower(btrim($1))`,
      [EDITION_TITLE],
    );
    await queryRunner.query(
      `DELETE FROM fieldtrack.competition_disciplines d
       WHERE lower(btrim(d.name)) = lower(btrim($1))
         AND NOT EXISTS (
           SELECT 1 FROM fieldtrack.competition_editions e WHERE e.discipline_id = d.id
         )`,
      [DISCIPLINE_NAME],
    );
  }
}
