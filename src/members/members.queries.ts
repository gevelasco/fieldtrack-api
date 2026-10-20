import { EntityManager, FindOptionsRelations, In, Repository } from 'typeorm';
import { normalizeSearchTerm, escapeLikePattern } from '../common/text-search';
import { Member } from './entities/member.entity';
import { type MembershipCode, type MembershipPeriod } from './membership-status';

/** Qué relaciones cargar según el caso de uso (consultas separadas, sin JOIN cartesiano). */
export type MemberLoadProfile = 'list' | 'portal' | 'detail';

const RELATIONS_BY_PROFILE: Record<MemberLoadProfile, FindOptionsRelations<Member>> = {
  list: {
    weapons: true,
    payments: { recordedBy: true, revertedBy: true },
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
  membership?: string;
  terms: readonly string[];
  page: number;
  pageSize: number;
  order?: MemberOrder;
}

export interface MemberOrder {
  sort: 'requests' | 'status' | 'seniority';
  direction: 'asc' | 'desc';
  /** El estatus depende del periodo en curso de cada membresía, que cambia con la fecha. */
  periods: Record<MembershipCode, MembershipPeriod>;
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
  if (search.membership) {
    params.push(search.membership);
    where.push(`m.membership = $${params.length}`);
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
      return [`${statusRank(order.periods, params)} ${direction}`];
    case 'requests':
      return [
        `(SELECT count(*) FROM fieldtrack.club_requests r
          WHERE r.member_id = m.id AND r.removed_at IS NULL AND r.status <> 'completed') ${direction}`,
      ];
  }
}

/** Misma regla que `resolveMemberStatus`: 0 vigente, 1 pendiente, 2 vetado. */
function statusRank(periods: Record<MembershipCode, MembershipPeriod>, params: unknown[]): string {
  const param = (value: string) => {
    params.push(value);
    return `$${params.length}::date`;
  };
  const start = `CASE m.membership WHEN 'caza' THEN ${param(periods.caza.start)} ELSE ${param(periods['tiro-deportivo'].start)} END`;
  return `(CASE
    WHEN m.status = 'vetado' THEN 2
    WHEN EXISTS (
      SELECT 1 FROM fieldtrack.membership_payments p
      WHERE p.member_id = m.id AND p.reverted_at IS NULL
        AND p.membership = m.membership AND p.period_start = ${start}
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
    row.payments?.sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)));
    row.huntingTags?.sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)) || b.id - a.id);
    row.competitionRegistrations?.sort(
      (a, b) => String(b.confirmedAt ?? '').localeCompare(String(a.confirmedAt ?? '')) || b.id - a.id,
    );
    return [row];
  });
}

export async function memberSummary(
  manager: EntityManager,
  clubId: number,
  periods: Record<MembershipCode, MembershipPeriod>,
) {
  const [members]: Array<{ total: number; sport: number; hunting: number }> = await manager.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE membership = 'tiro-deportivo')::int AS sport,
            count(*) FILTER (WHERE membership = 'caza')::int AS hunting
     FROM fieldtrack.members WHERE club_id = $1`,
    [clubId],
  );
  const [weapons]: Array<{ total: number; permits: number }> = await manager.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE has_peta)::int AS permits
     FROM fieldtrack.member_weapons WHERE club_id = $1`,
    [clubId],
  );
  const statusParams: unknown[] = [clubId];
  const statusCase = statusRank(periods, statusParams);
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
    permits: weapons?.permits ?? 0,
    byMembership: {
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
