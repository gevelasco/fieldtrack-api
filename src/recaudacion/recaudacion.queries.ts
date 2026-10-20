import { EntityManager } from 'typeorm';
import { escapeLikePattern, normalizeSearchTerm } from '../common/text-search';
import { type RecaudacionKind } from './dto/list-recaudacion.dto';

export interface RecaudacionSearch {
  clubId: number;
  search: string;
  fromDate: string;
  toDate: string;
  kinds: RecaudacionKind[];
  page: number;
  pageSize: number;
}

export interface RecaudacionRow {
  kind: RecaudacionKind;
  sourceId: number;
  paidOn: string;
  amount: number;
  payerLabel: string;
  concept: string;
  recordedByName: string;
}

export interface RecaudacionPage {
  items: RecaudacionRow[];
  total: number;
  page: number;
  pageSize: number;
  sumAmount: number;
}

const ALL_KINDS: RecaudacionKind[] = ['membership', 'hunting_tag', 'competition'];

export function monthBounds(fromYm: string, toYm: string): { fromDate: string; toDate: string } {
  const [fromYear, fromMonth] = fromYm.split('-').map(Number);
  const [toYear, toMonth] = toYm.split('-').map(Number);
  const fromDate = `${fromYear}-${String(fromMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(toYear, toMonth, 0).getDate();
  const toDate = `${toYear}-${String(toMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { fromDate, toDate };
}

function entriesCteSql(kinds: RecaudacionKind[]): string {
  const parts: string[] = [];
  if (kinds.includes('membership')) {
    parts.push(`
      SELECT
        'membership'::text AS kind,
        p.id AS source_id,
        p.paid_on AS paid_on,
        p.amount::numeric AS amount,
        m.member_number AS member_number,
        trim(concat_ws(' ', m.first_name, m.paternal_surname, m.maternal_surname)) AS member_name,
        NULL::text AS guest_name,
        CASE p.membership
          WHEN 'caza' THEN
            'Membresía · Cacería · Anualidad '
            || to_char(p.period_start, 'YYYY')
            || '–'
            || to_char((p.period_start + interval '1 year')::date, 'YYYY')
          ELSE 'Membresía · Tiro deportivo · Anualidad ' || to_char(p.period_start, 'YYYY')
        END AS concept,
        coalesce(nullif(trim(u.display_name), ''), u.username, 'Sistema') AS recorded_by_name,
        m.search_text AS member_search
      FROM fieldtrack.membership_payments p
      INNER JOIN fieldtrack.members m ON m.id = p.member_id
      INNER JOIN fieldtrack.app_user u ON u.id = p.recorded_by_user_id
      WHERE p.club_id = $1 AND p.reverted_at IS NULL`);
  }
  if (kinds.includes('hunting_tag')) {
    parts.push(`
      SELECT
        'hunting_tag'::text AS kind,
        s.id AS source_id,
        s.paid_on AS paid_on,
        s.amount::numeric AS amount,
        m.member_number AS member_number,
        trim(concat_ws(' ', m.first_name, m.paternal_surname, m.maternal_surname)) AS member_name,
        NULL::text AS guest_name,
        'Cinegética · '
        || coalesce(sp.name, 'Especie')
        || ' · '
        || coalesce(nullif(trim(hs.label), ''), 'Temporada') AS concept,
        coalesce(nullif(trim(u.display_name), ''), u.username, 'Sistema') AS recorded_by_name,
        m.search_text AS member_search
      FROM fieldtrack.hunting_tag_sales s
      INNER JOIN fieldtrack.members m ON m.id = s.member_id
      INNER JOIN fieldtrack.hunting_seasons hs ON hs.id = s.season_id
      LEFT JOIN fieldtrack.hunting_species sp ON sp.id = hs.species_id
      INNER JOIN fieldtrack.app_user u ON u.id = s.recorded_by_user_id
      WHERE s.club_id = $1 AND s.reverted_at IS NULL`);
  }
  if (kinds.includes('competition')) {
    parts.push(`
      SELECT
        'competition'::text AS kind,
        r.id AS source_id,
        (r.confirmed_at AT TIME ZONE 'UTC')::date AS paid_on,
        e.entry_fee::numeric AS amount,
        m.member_number AS member_number,
        CASE
          WHEN r.participant_kind = 'member' THEN trim(concat_ws(' ', m.first_name, m.paternal_surname, m.maternal_surname))
          ELSE NULL
        END AS member_name,
        CASE
          WHEN r.participant_kind = 'guest' THEN coalesce(nullif(trim(r.guest_name), ''), 'Invitado')
          ELSE NULL
        END AS guest_name,
        'Competencia · ' || d.name || ' · ' || e.title AS concept,
        coalesce(nullif(trim(u.display_name), ''), u.username, 'Sistema') AS recorded_by_name,
        CASE
          WHEN r.participant_kind = 'member' THEN m.search_text
          ELSE lower(coalesce(r.guest_name, ''))
        END AS member_search
      FROM fieldtrack.competition_registrations r
      INNER JOIN fieldtrack.competition_editions e ON e.id = r.edition_id
      INNER JOIN fieldtrack.competition_disciplines d ON d.id = e.discipline_id
      LEFT JOIN fieldtrack.members m ON m.id = r.member_id
      LEFT JOIN fieldtrack.app_user u ON u.id = r.confirmed_by_user_id
      WHERE r.club_id = $1
        AND r.status = 'confirmed'
        AND r.confirmed_at IS NOT NULL`);
  }
  return parts.join('\nUNION ALL\n');
}

function payerLabelSql(): string {
  return `CASE
    WHEN guest_name IS NOT NULL THEN 'Invitado · ' || guest_name
    ELSE coalesce(member_number, '') || CASE WHEN member_name IS NOT NULL AND member_name <> '' THEN ' · ' || member_name ELSE '' END
  END`;
}

function searchClause(search: string, params: unknown[]): string {
  const term = search.trim();
  if (!term) {
    return '';
  }
  params.push(`%${escapeLike(normalizeSearch(term))}%`);
  const pattern = `$${params.length}`;
  return `AND (
    member_search LIKE ${pattern}
    OR lower(concept) LIKE ${pattern}
    OR lower(guest_name) LIKE ${pattern}
    OR lower(member_number) LIKE ${pattern}
  )`;
}

export async function searchRecaudacion(
  manager: EntityManager,
  input: RecaudacionSearch,
): Promise<RecaudacionPage> {
  const kinds = input.kinds.length > 0 ? input.kinds : ALL_KINDS;
  const cte = entriesCteSql(kinds);
  if (!cte) {
    return { items: [], total: 0, page: input.page, pageSize: input.pageSize, sumAmount: 0 };
  }

  const params: unknown[] = [input.clubId];
  const dateParams = () => {
    params.push(input.fromDate);
    const fromParam = `$${params.length}`;
    params.push(input.toDate);
    const toParam = `$${params.length}`;
    return { fromParam, toParam };
  };

  const { fromParam, toParam } = dateParams();
  const searchSql = searchClause(input.search, params);
  const baseWhere = `paid_on >= ${fromParam}::date AND paid_on <= ${toParam}::date ${searchSql}`;

  const counted: Array<{ total: number; sum_amount: string | null }> = await manager.query(
    `WITH entries AS (${cte})
     SELECT count(*)::int AS total, coalesce(sum(amount), 0)::text AS sum_amount
     FROM entries
     WHERE ${baseWhere}`,
    params,
  );
  const total = counted[0]?.total ?? 0;
  const sumAmount = Number(counted[0]?.sum_amount ?? 0);
  const lastPage = Math.max(1, Math.ceil(total / input.pageSize));
  const page = Math.min(Math.max(1, input.page), lastPage);

  if (total === 0) {
    return { items: [], total: 0, page, pageSize: input.pageSize, sumAmount: 0 };
  }

  const listParams = [...params];
  listParams.push(input.pageSize);
  const limitParam = `$${listParams.length}`;
  listParams.push((page - 1) * input.pageSize);
  const offsetParam = `$${listParams.length}`;

  const rows: Array<{
    kind: RecaudacionKind;
    source_id: number;
    paid_on: string;
    amount: string;
    payer_label: string;
    concept: string;
    recorded_by_name: string;
  }> = await manager.query(
    `WITH entries AS (${cte}),
     filtered AS (
       SELECT
         kind,
         source_id,
         paid_on,
         amount,
         ${payerLabelSql()} AS payer_label,
         concept,
         recorded_by_name,
         member_search,
         guest_name,
         member_number
       FROM entries
     )
     SELECT kind, source_id, paid_on, amount, payer_label, concept, recorded_by_name
     FROM filtered
     WHERE ${baseWhere}
     ORDER BY paid_on DESC, kind ASC, source_id DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    listParams,
  );

  return {
    items: rows.map((row) => ({
      kind: row.kind,
      sourceId: Number(row.source_id),
      paidOn: asIsoDate(row.paid_on),
      amount: Number(row.amount),
      payerLabel: row.payer_label,
      concept: row.concept,
      recordedByName: row.recorded_by_name,
    })),
    total,
    page,
    pageSize: input.pageSize,
    sumAmount,
  };
}

function normalizeSearch(raw: string): string {
  return normalizeSearchTerm(raw);
}

function escapeLike(value: string): string {
  return escapeLikePattern(value);
}

function asIsoDate(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}
