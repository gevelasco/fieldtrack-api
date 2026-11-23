import { EntityManager } from 'typeorm';
import { monthBounds } from '../recaudacion/recaudacion.queries';

export interface ReportesSummary {
  membersTotal: number;
  membersComplete: number;
  weaponsTotal: number;
  weaponsRegistered: number;
  movementsCount: number;
}

export interface ReportesMovementRow {
  id: number;
  movementOn: string;
  movement: 'alta' | 'baja';
  platform: string;
  modality: string;
  serialNumber: string;
  memberNumber: string;
  memberName: string;
}

export interface ReportesPage {
  summary: ReportesSummary;
  items: ReportesMovementRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReportesQuery {
  clubId: number;
  fromYm: string;
  toYm: string;
  page: number;
  pageSize: number;
}

export async function loadReportes(
  manager: EntityManager,
  input: ReportesQuery,
): Promise<ReportesPage> {
  const { fromDate, toDate } = monthBounds(input.fromYm, input.toYm);
  const clubId = input.clubId;

  const [kpi] = await manager.query<
    Array<{
      members_total: number;
      members_complete: number;
      weapons_total: number;
      weapons_registered: number;
      movements_count: number;
    }>
  >(
    `WITH slot_count AS (
       SELECT count(*)::int AS n
       FROM fieldtrack.club_member_document_defs
       WHERE club_id = $1
     ),
     members_complete AS (
       SELECT m.id
       FROM fieldtrack.members m
       CROSS JOIN slot_count sc
       WHERE m.club_id = $1
         AND sc.n > 0
         AND (
           SELECT count(DISTINCT d.slot)::int
           FROM fieldtrack.member_documents d
           WHERE d.member_id = m.id
             AND coalesce(nullif(trim(d.file_name), ''), d.storage_key, '') <> ''
         ) >= sc.n
     )
     SELECT
       (SELECT count(*)::int FROM fieldtrack.members WHERE club_id = $1) AS members_total,
       (SELECT count(*)::int FROM members_complete) AS members_complete,
       (SELECT count(*)::int FROM fieldtrack.member_weapons WHERE club_id = $1) AS weapons_total,
       (SELECT count(*)::int FROM fieldtrack.member_weapons
        WHERE club_id = $1
          AND coalesce(nullif(trim(sheet_storage_key), ''), nullif(trim(sheet_file_name), '')) IS NOT NULL
       ) AS weapons_registered,
       (SELECT count(*)::int FROM fieldtrack.weapon_registry_movements
        WHERE club_id = $1 AND movement_on >= $2::date AND movement_on <= $3::date
       ) AS movements_count`,
    [clubId, fromDate, toDate],
  );

  const summary: ReportesSummary = {
    membersTotal: kpi?.members_total ?? 0,
    membersComplete: kpi?.members_complete ?? 0,
    weaponsTotal: kpi?.weapons_total ?? 0,
    weaponsRegistered: kpi?.weapons_registered ?? 0,
    movementsCount: kpi?.movements_count ?? 0,
  };

  const countRows = await manager.query<Array<{ total: number }>>(
    `SELECT count(*)::int AS total
     FROM fieldtrack.weapon_registry_movements w
     WHERE w.club_id = $1 AND w.movement_on >= $2::date AND w.movement_on <= $3::date`,
    [clubId, fromDate, toDate],
  );
  const total = countRows[0]?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / input.pageSize));
  const page = Math.min(Math.max(1, input.page), lastPage);

  if (total === 0) {
    return { summary, items: [], total: 0, page, pageSize: input.pageSize };
  }

  const offset = (page - 1) * input.pageSize;
  const items = await loadSedenaMovementRows(manager, clubId, fromDate, toDate, input.pageSize, offset);
  return {
    summary,
    items,
    total,
    page,
    pageSize: input.pageSize,
  };
}

export async function loadSedenaMovementRows(
  manager: EntityManager,
  clubId: number,
  fromDate: string,
  toDate: string,
  limit?: number,
  offset?: number,
): Promise<ReportesMovementRow[]> {
  const paging =
    limit != null && offset != null
      ? `LIMIT ${Number(limit)} OFFSET ${Number(offset)}`
      : '';
  const rows = await manager.query<
    Array<{
      id: number;
      movement_on: string;
      movement: 'alta' | 'baja';
      platform: string;
      modality: string;
      serial_number: string;
      member_number: string;
      member_name: string;
    }>
  >(
    `SELECT
       w.id,
       w.movement_on,
       w.movement,
       w.platform,
       w.modality,
       w.serial_number,
       m.member_number,
       trim(concat_ws(' ', m.first_name, m.paternal_surname, m.maternal_surname)) AS member_name
     FROM fieldtrack.weapon_registry_movements w
     INNER JOIN fieldtrack.members m ON m.id = w.member_id
     WHERE w.club_id = $1 AND w.movement_on >= $2::date AND w.movement_on <= $3::date
     ORDER BY w.movement_on DESC, w.id DESC
     ${paging}`,
    [clubId, fromDate, toDate],
  );

  return rows.map((row) => ({
    id: Number(row.id),
    movementOn: asIsoDate(row.movement_on),
    movement: row.movement,
    platform: row.platform,
    modality: row.modality,
    serialNumber: row.serial_number,
    memberNumber: row.member_number,
    memberName: row.member_name,
  }));
}

function asIsoDate(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}