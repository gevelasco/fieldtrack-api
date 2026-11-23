import { EntityManager } from 'typeorm';
import { escapeLikePattern, normalizeSearchTerm } from '../common/text-search';
import { EXPENSE_TYPE_LABEL } from './expense-type-label';
import { type RecaudacionKind } from './dto/list-recaudacion.dto';

export type RecaudacionDirection = 'income' | 'expense';

export type RecaudacionExpenseType = keyof typeof EXPENSE_TYPE_LABEL;

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
  kind: RecaudacionKind | 'expense';
  sourceId: number;
  paidOn: string;
  amount: number;
  direction: RecaudacionDirection;
  expenseType: RecaudacionExpenseType | null;
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
  expenseCount: number;
  sumExpense: number;
  netBalance: number;
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
        CASE
          WHEN coalesce(nullif(trim(mt.name), ''), '') <> ''
            AND coalesce(nullif(trim(mt.name), ''), '') ~* '^membres[ií]a(\s|$)'
            THEN trim(mt.name)
          WHEN coalesce(nullif(trim(mt.name), ''), '') <> ''
            THEN 'Membresía ' || trim(mt.name)
          ELSE 'Membresía ' || coalesce(nullif(trim(m.membership), ''), 'General')
        END
        || ' · '
        || CASE p.modality WHEN 'caza' THEN 'Cacería' ELSE 'Tiro deportivo' END
        || ' · '
        || CASE mt.billing_period
          WHEN 'mensual' THEN 'Mensualidad '
          WHEN 'semestral' THEN 'Semestre '
          ELSE 'Anualidad '
        END
        || CASE
          WHEN to_char(p.period_start, 'YYYY') = to_char((p.period_start + interval '1 year' - interval '1 day')::date, 'YYYY')
            THEN to_char(p.period_start, 'YYYY')
          ELSE to_char(p.period_start, 'YYYY')
            || '–'
            || to_char((p.period_start + interval '1 year' - interval '1 day')::date, 'YYYY')
        END AS concept,
        coalesce(nullif(trim(u.display_name), ''), u.username, 'Sistema') AS recorded_by_name,
        m.search_text AS member_search,
        NULL::text AS expense_type
      FROM fieldtrack.membership_payments p
      INNER JOIN fieldtrack.members m ON m.id = p.member_id
      LEFT JOIN fieldtrack.club_membership_types mt
        ON mt.club_id = m.club_id AND mt.code = m.membership
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
        m.search_text AS member_search,
        NULL::text AS expense_type
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
        END AS member_search,
        NULL::text AS expense_type
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

function expensesCteSql(): string {
  return `
      SELECT
        'expense'::text AS kind,
        e.id AS source_id,
        e.spent_on AS paid_on,
        e.amount::numeric AS amount,
        NULL::text AS member_number,
        NULL::text AS member_name,
        NULL::text AS guest_name,
        'Gasto · '
        || CASE e.expense_type
          WHEN 'oficina' THEN 'Oficina'
          WHEN 'administracion' THEN 'Administración'
          WHEN 'reparacion' THEN 'Reparación'
          WHEN 'mantenimiento' THEN 'Mantenimiento'
          WHEN 'deuda' THEN 'Deuda'
          ELSE e.expense_type
        END
        || CASE WHEN trim(e.concept) <> '' THEN ' · ' || trim(e.concept) ELSE '' END AS concept,
        coalesce(nullif(trim(u.display_name), ''), u.username, 'Sistema') AS recorded_by_name,
        lower(
          coalesce(e.concept, '')
          || ' '
          || coalesce(e.expense_type, '')
        ) AS member_search,
        e.expense_type AS expense_type
      FROM fieldtrack.club_expenses e
      INNER JOIN fieldtrack.app_user u ON u.id = e.recorded_by_user_id
      WHERE e.club_id = $1`;
}

function unionIncomeAndExpenses(incomeCte: string): string {
  if (!incomeCte) {
    return expensesCteSql();
  }
  return `${incomeCte}\nUNION ALL\n${expensesCteSql()}`;
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
  const incomeCte = entriesCteSql(kinds);
  const cte = unionIncomeAndExpenses(incomeCte);

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

  const counted: Array<{
    total: number;
    sum_amount: string | null;
    expense_count: number;
    sum_expense: string | null;
  }> = await manager.query(
    `WITH entries AS (${cte})
     SELECT
       count(*)::int AS total,
       coalesce(sum(CASE WHEN kind <> 'expense' THEN amount END), 0)::text AS sum_amount,
       count(*) FILTER (WHERE kind = 'expense')::int AS expense_count,
       coalesce(sum(CASE WHEN kind = 'expense' THEN amount END), 0)::text AS sum_expense
     FROM entries
     WHERE ${baseWhere}`,
    params,
  );
  const total = counted[0]?.total ?? 0;
  const sumAmount = Number(counted[0]?.sum_amount ?? 0);
  const expenseCount = counted[0]?.expense_count ?? 0;
  const sumExpense = Number(counted[0]?.sum_expense ?? 0);
  const netBalance = sumAmount - sumExpense;
  const lastPage = Math.max(1, Math.ceil(total / input.pageSize));
  const page = Math.min(Math.max(1, input.page), lastPage);

  if (total === 0) {
    return {
      items: [],
      total: 0,
      page,
      pageSize: input.pageSize,
      sumAmount: 0,
      expenseCount: 0,
      sumExpense: 0,
      netBalance: 0,
    };
  }

  const listParams = [...params];
  listParams.push(input.pageSize);
  const limitParam = `$${listParams.length}`;
  listParams.push((page - 1) * input.pageSize);
  const offsetParam = `$${listParams.length}`;

  const rows: Array<{
    kind: RecaudacionKind | 'expense';
    source_id: number;
    paid_on: string;
    amount: string;
    payer_label: string;
    concept: string;
    recorded_by_name: string;
    expense_type: string | null;
  }> = await manager.query(
    `WITH entries AS (${cte}),
     filtered AS (
       SELECT
         kind,
         source_id,
         paid_on,
         amount,
         expense_type,
         ${payerLabelSql()} AS payer_label,
         concept,
         recorded_by_name,
         member_search,
         guest_name,
         member_number
       FROM entries
     )
     SELECT kind, source_id, paid_on, amount, payer_label, concept, recorded_by_name, expense_type
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
      direction: row.kind === 'expense' ? 'expense' : 'income',
      expenseType:
        row.kind === 'expense' && row.expense_type && row.expense_type in EXPENSE_TYPE_LABEL
          ? (row.expense_type as RecaudacionExpenseType)
          : null,
      payerLabel: row.payer_label,
      concept: row.concept,
      recordedByName: row.recorded_by_name,
    })),
    total,
    page,
    pageSize: input.pageSize,
    sumAmount,
    expenseCount,
    sumExpense,
    netBalance,
  };
}

export async function insertClubExpense(
  manager: EntityManager,
  input: {
    clubId: number;
    spentOn: string;
    expenseType: RecaudacionExpenseType;
    concept: string;
    amount: number;
    recordedByUserId: number;
  },
): Promise<number> {
  const rows: Array<{ id: number }> = await manager.query(
    `INSERT INTO fieldtrack.club_expenses (
       club_id, spent_on, expense_type, concept, amount, recorded_by_user_id
     ) VALUES ($1, $2::date, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.clubId,
      input.spentOn,
      input.expenseType,
      input.concept.trim(),
      input.amount,
      input.recordedByUserId,
    ],
  );
  return Number(rows[0]?.id ?? 0);
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
