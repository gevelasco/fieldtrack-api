import { EntityManager, FindOptionsRelations, In, Repository } from 'typeorm';
import { normalizeSearchTerm, escapeLikePattern } from '../common/text-search';
import { Member } from './entities/member.entity';
import { MemberPeta } from './entities/member-peta.entity';
import { MembershipPayment } from './entities/membership-payment.entity';
import { type MembershipCode, type MembershipPeriod } from './membership-status';

/** Qué relaciones cargar según el caso de uso (consultas separadas, sin JOIN cartesiano). */
export type MemberLoadProfile = 'list' | 'portal' | 'detail';

const RELATIONS_BY_PROFILE: Record<MemberLoadProfile, FindOptionsRelations<Member>> = {
  list: {
    weapons: true,
  },
  portal: {
    weapons: true,
    petas: true,
    payments: { recordedBy: true, revertedBy: true },
  },
  detail: {
    documents: true,
    weapons: true,
    petas: true,
    payments: { recordedBy: true, revertedBy: true },
    huntingTags: { season: { species: true }, recordedBy: true, revertedBy: true },
    competitionRegistrations: { edition: { discipline: true }, confirmedBy: true },
  },
};

export interface MemberSearch {
  clubId: number;
  modality?: string;
  terms: readonly string[];
  page: number;
  pageSize: number;
  order?: MemberOrder;
}

export interface MemberOrder {
  sort: 'requests' | 'status' | 'seniority';
  direction: 'asc' | 'desc';
  /** Calendarios por modalidad (PETAs y armas). */
  periods: Record<MembershipCode, MembershipPeriod>;
  /** Inicio del tramo de cobro vigente por código de plan de membresía. */
  billingPeriodStarts: Record<string, string>;
}

/** Misma normalización que las columnas `search_text`: minúsculas y sin acentos. */
export function searchTerms(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/\s+/)
    .map((part) => normalizeSearchTerm(part))
    .filter(Boolean)
    .slice(0, 5)
    .map((term) => term.slice(0, 60));
}

/**
 * Un socio coincide si todos los términos aparecen en sus datos, o si todos aparecen en una misma arma suya.
 * Solo devuelve los ids de la página; el detalle se carga aparte.
 */
export async function searchMemberIds(
  manager: EntityManager,
  search: MemberSearch,
): Promise<{ ids: number[]; total: number; page: number }> {
  const params: unknown[] = [search.clubId];
  const where = ['m.club_id = $1'];
  if (search.modality) {
    params.push(search.modality);
    where.push(`m.modality = $${params.length}`);
  }
  if (search.terms.length > 0) {
    const patterns = search.terms.map((term) => {
      params.push(`%${escapeLike(term)}%`);
      return `$${params.length}`;
    });
    const onMember = patterns.map((pattern) => `m.search_text LIKE ${pattern}`).join(' AND ');
    const onWeapon = patterns.map((pattern) => `w.search_text LIKE ${pattern}`).join(' AND ');
    where.push(`(
      (${onMember})
      OR m.id IN (
        SELECT w.member_id FROM fieldtrack.member_weapons w
        WHERE w.club_id = $1 AND ${onWeapon}
      )
    )`);
  }
  const clause = where.join(' AND ');
  const counted: Array<{ total: number }> = await manager.query(
    `SELECT count(*)::int AS total FROM fieldtrack.members m WHERE ${clause}`,
    params,
  );
  const total = counted[0]?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / search.pageSize));
  const page = Math.min(Math.max(1, search.page), lastPage);
  if (total === 0) {
    return { ids: [], total, page };
  }
  const pageParams = [...params];
  const orderBy = [...orderTerms(search.order, pageParams), 'm.member_number ASC', 'm.id ASC'];
  const rows: Array<{ id: number }> = await manager.query(
    `SELECT m.id FROM fieldtrack.members m
     WHERE ${clause}
     ORDER BY ${orderBy.join(', ')}
     LIMIT $${pageParams.length + 1} OFFSET $${pageParams.length + 2}`,
    [...pageParams, search.pageSize, (page - 1) * search.pageSize],
  );
  return { ids: rows.map((row) => Number(row.id)), total, page };
}

function orderTerms(order: MemberOrder | undefined, params: unknown[]): string[] {
  if (!order) {
    return [];
  }
  const direction = order.direction === 'desc' ? 'DESC' : 'ASC';
  switch (order.sort) {
    case 'seniority':
      // Ascendente = menor antigüedad primero, es decir, ingreso más reciente.
      return [`m.joined_on ${direction === 'ASC' ? 'DESC' : 'ASC'}`];
    case 'status':
      return [`${statusRank(order.periods, order.billingPeriodStarts, params)} ${direction}`];
    case 'requests':
      return [
        `(SELECT count(*) FROM fieldtrack.club_requests r
          WHERE r.member_id = m.id AND r.removed_at IS NULL AND r.status <> 'completed') ${direction}`,
      ];
  }
}

/** Misma regla que `resolveMemberStatusForPlan`: 0 vigente, 1 pendiente, 2 vetado. */
function statusRank(
  periods: Record<MembershipCode, MembershipPeriod>,
  billingPeriodStarts: Record<string, string>,
  params: unknown[],
): string {
  const entries = Object.entries(billingPeriodStarts);
  const param = (value: string) => {
    params.push(value);
    return `$${params.length}::date`;
  };
  const periodStart =
    entries.length > 0
      ? `CASE m.membership ${entries
          .map(([code, start]) => `WHEN '${code.replace(/'/g, "''")}' THEN ${param(start)}`)
          .join(' ')} ELSE ${param(periods['tiro-deportivo'].start)} END`
      : param(periods['tiro-deportivo'].start);
  return `(CASE
    WHEN m.status = 'vetado' THEN 2
    WHEN EXISTS (
      SELECT 1 FROM fieldtrack.membership_payments p
      WHERE p.member_id = m.id AND p.reverted_at IS NULL
        AND p.period_start = ${periodStart}
    ) THEN 0
    ELSE 1
  END)`;
}

/** Carga cada relación en su propia consulta para no multiplicar filas por documentos × armas × pagos. */
export async function membersByIds(
  members: Repository<Member>,
  clubId: number,
  ids: readonly number[],
  profile: MemberLoadProfile = 'detail',
): Promise<Member[]> {
  if (ids.length === 0) {
    return [];
  }
  const rows = await members.find({
    where: { clubId, id: In([...ids]) },
    relations: RELATIONS_BY_PROFILE[profile],
    relationLoadStrategy: 'query',
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row) {
      return [];
    }
    row.weapons?.sort((a, b) => String(a.registeredOn).localeCompare(String(b.registeredOn)));
    if (profile !== 'list') {
      row.payments?.sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)));
    }
    row.huntingTags?.sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)) || b.id - a.id);
    row.competitionRegistrations?.sort(
      (a, b) => String(b.confirmedAt ?? '').localeCompare(String(a.confirmedAt ?? '')) || b.id - a.id,
    );
    return [row];
  });
}

const PETA_FOR_WEAPON_SQL = `p.member_id = w.member_id AND p.is_current
  AND (CASE w.modality
    WHEN 'caceria' THEN p.permit_type = 'caceria'
    WHEN 'tiro-deportivo' THEN p.permit_type IN ('tiro-competencia', 'tiro-campo')
    ELSE false END)`;

/**
 * Misma regla que `weaponPetaActive`. Un PETA sigue vigente si se cargó en el periodo actual de su rubro
 * ($2 = inicio del periodo de cacería, $3 = inicio del de tiro deportivo).
 */
const WEAPON_PETA_ACTIVE_SQL = `(w.has_peta
  AND w.modality NOT IN ('proteccion-domicilio', 'proteccion-parcela') AND (
  NOT EXISTS (SELECT 1 FROM fieldtrack.member_petas p WHERE ${PETA_FOR_WEAPON_SQL})
  OR EXISTS (
    SELECT 1 FROM fieldtrack.member_petas p
    WHERE ${PETA_FOR_WEAPON_SQL}
      AND p.loaded_on >= CASE p.permit_type WHEN 'caceria' THEN $2::date ELSE $3::date END
  )
))`;

export async function memberSummary(
  manager: EntityManager,
  clubId: number,
  input: Record<MembershipCode, MembershipPeriod> & { billingPeriodStarts?: Record<string, string> },
) {
  const periods: Record<MembershipCode, MembershipPeriod> = {
    'tiro-deportivo': input['tiro-deportivo'],
    caza: input.caza,
  };
  const billingPeriodStarts = input.billingPeriodStarts ?? {};
  const [members]: Array<{ total: number; sport: number; hunting: number }> = await manager.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE modality = 'tiro-deportivo')::int AS sport,
            count(*) FILTER (WHERE modality = 'caza')::int AS hunting
     FROM fieldtrack.members WHERE club_id = $1`,
    [clubId],
  );
  const [weapons]: Array<{
    total: number;
    without_sheet: number;
    permits: number;
    hunting_permits: number;
    sport_permits: number;
  }> = await manager.query(
    `WITH w AS (
       SELECT w.sheet_file_name, w.modality, ${WEAPON_PETA_ACTIVE_SQL} AS peta_active
       FROM fieldtrack.member_weapons w WHERE w.club_id = $1
     )
     SELECT count(*)::int AS total,
            count(*) FILTER (WHERE sheet_file_name IS NULL)::int AS without_sheet,
            count(*) FILTER (WHERE peta_active)::int AS permits,
            count(*) FILTER (WHERE peta_active AND modality = 'caceria')::int AS hunting_permits,
            count(*) FILTER (WHERE peta_active AND modality = 'tiro-deportivo')::int AS sport_permits
     FROM w`,
    [clubId, periods.caza.start, periods['tiro-deportivo'].start],
  );
  const statusParams: unknown[] = [clubId];
  const statusCase = statusRank(periods, billingPeriodStarts, statusParams);
  const [status]: Array<{ vigente: number; pendiente: number; vetado: number }> = await manager.query(
    `SELECT count(*) FILTER (WHERE (${statusCase}) = 0)::int AS vigente,
            count(*) FILTER (WHERE (${statusCase}) = 1)::int AS pendiente,
            count(*) FILTER (WHERE (${statusCase}) = 2)::int AS vetado
     FROM fieldtrack.members m WHERE m.club_id = $1`,
    statusParams,
  );
  return {
    members: members?.total ?? 0,
    weapons: weapons?.total ?? 0,
    weaponsWithoutSheet: weapons?.without_sheet ?? 0,
    permits: weapons?.permits ?? 0,
    permitsByModality: {
      caceria: weapons?.hunting_permits ?? 0,
      'tiro-deportivo': weapons?.sport_permits ?? 0,
    },
    byModality: {
      'tiro-deportivo': members?.sport ?? 0,
      caza: members?.hunting ?? 0,
    },
    byMembershipStatus: {
      vigente: status?.vigente ?? 0,
      pendiente: status?.pendiente ?? 0,
      vetado: status?.vetado ?? 0,
    },
  };
}

export async function memberNumbers(manager: EntityManager, clubId: number): Promise<string[]> {
  const rows: Array<{ member_number: string }> = await manager.query(
    `SELECT member_number FROM fieldtrack.members WHERE club_id = $1 ORDER BY member_number`,
    [clubId],
  );
  return rows.map((row) => row.member_number);
}

function escapeLike(value: string): string {
  return escapeLikePattern(value);
}

/** Pagos vigentes y PETAs actuales para el listado (evita cargar historial por socio). */
export async function attachListMemberExtras(
  manager: EntityManager,
  clubId: number,
  members: Member[],
): Promise<void> {
  if (members.length === 0) {
    return;
  }
  const ids = members.map((row) => row.id);
  const [paymentRows, petaRows]: [
    Array<{ member_id: number; modality: string; paid_on: string; period_start: string }>,
    Array<{ member_id: number; id: number; permit_type: string; loaded_on: string; is_current: boolean }>,
  ] = await Promise.all([
    manager.query(
      `SELECT member_id, modality, paid_on::text AS paid_on, period_start::text AS period_start
       FROM fieldtrack.membership_payments
       WHERE club_id = $1 AND member_id = ANY($2::int[]) AND reverted_at IS NULL`,
      [clubId, ids],
    ),
    manager.query(
      `SELECT member_id, id, permit_type, loaded_on::text AS loaded_on, is_current
       FROM fieldtrack.member_petas
       WHERE club_id = $1 AND member_id = ANY($2::int[]) AND is_current = true`,
      [clubId, ids],
    ),
  ]);
  const paymentsByMember = new Map<number, MembershipPayment[]>();
  for (const row of paymentRows) {
    const memberId = Number(row.member_id);
    const list = paymentsByMember.get(memberId) ?? [];
    list.push({
      memberId,
      clubId,
      modality: row.modality,
      paidOn: row.paid_on,
      periodStart: row.period_start,
      revertedAt: null,
    } as MembershipPayment);
    paymentsByMember.set(memberId, list);
  }
  const petasByMember = new Map<number, MemberPeta[]>();
  for (const row of petaRows) {
    const memberId = Number(row.member_id);
    const list = petasByMember.get(memberId) ?? [];
    list.push({
      id: Number(row.id),
      memberId,
      clubId,
      permitType: row.permit_type,
      loadedOn: row.loaded_on,
      isCurrent: row.is_current !== false,
    } as MemberPeta);
    petasByMember.set(memberId, list);
  }
  for (const member of members) {
    member.payments = paymentsByMember.get(member.id) ?? [];
    member.petas = petasByMember.get(member.id) ?? [];
  }
}

export async function loadMemberById(
  members: Repository<Member>,
  clubId: number,
  memberId: number,
  profile: MemberLoadProfile,
): Promise<Member | null> {
  const loaded = await membersByIds(members, clubId, [memberId], profile);
  return loaded[0] ?? null;
}

export async function loadMemberByUserId(
  members: Repository<Member>,
  clubId: number,
  userId: number,
  profile: MemberLoadProfile,
): Promise<Member | null> {
  const row = await members.findOne({ where: { clubId, userId }, select: ['id'] });
  if (!row) {
    return null;
  }
  return loadMemberById(members, clubId, row.id, profile);
}
