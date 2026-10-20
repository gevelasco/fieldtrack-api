import { EntityManager, Repository } from 'typeorm';
import { REQUEST_PAGE_SIZE, type RequestView } from './dto/request.dto';
import { ClubRequest } from './entities/club-request.entity';
import { requestCode } from './request.mapper';

const FOLD_FROM = 'ÁÉÍÓÚÜÑáéíóúüñ';
const FOLD_TO = 'AEIOUUNaeiouun';

export interface RequestListQuery {
  clubId: number;
  view: RequestView;
  terms: readonly string[];
  page: number;
  memberId?: number;
}

/**
 * Abiertas: primero las nuevas y luego las en proceso, cada grupo de la que más tiempo lleva esperando.
 * Completadas: de la cerrada más reciente a la más antigua.
 */
export async function listRequests(requests: Repository<ClubRequest>, query: RequestListQuery) {
  const builder = requests
    .createQueryBuilder('request')
    .leftJoinAndSelect('request.member', 'member')
    .leftJoinAndSelect('request.createdBy', 'createdBy')
    .leftJoinAndSelect('request.startedBy', 'startedBy')
    .leftJoinAndSelect('request.completedBy', 'completedBy')
    .loadRelationCountAndMap('request.documentCount', 'request.documents')
    .where('request.clubId = :clubId', { clubId: query.clubId })
    .andWhere('request.removedAt IS NULL');

  if (query.memberId) {
    builder.andWhere('request.memberId = :memberId', { memberId: query.memberId });
    builder.andWhere("request.kind = 'member'");
  }

  if (query.view === 'all') {
    // Sin filtro por estado.
  } else if (query.view === 'open') {
    builder.andWhere(`request.status IN ('new', 'in_progress')`);
  } else {
    builder.andWhere('request.status = :status', { status: query.view });
  }

  query.terms.forEach((term, index) => {
    const key = `term${index}`;
    builder.andWhere(
      `(
        lower(translate(request.title || ' ' || request.description, '${FOLD_FROM}', '${FOLD_TO}')) LIKE :${key}
        OR ('sol-' || lpad(request.number::text, 4, '0')) LIKE :${key}
        OR member.search_text LIKE :${key}
      )`,
      { [key]: `%${escapeLike(term)}%` },
    );
  });

  if (query.view === 'completed') {
    builder.orderBy('request.completedAt', 'DESC');
  } else if (query.view === 'all') {
    builder.orderBy('request.updatedAt', 'DESC');
  } else {
    builder
      .orderBy(`CASE request.status WHEN 'new' THEN 0 ELSE 1 END`, 'ASC')
      .addOrderBy('request.createdAt', 'ASC');
  }
  builder.addOrderBy('request.id', 'ASC');

  const total = await builder.getCount();
  const lastPage = Math.max(1, Math.ceil(total / REQUEST_PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page), lastPage);
  const rows = await builder
    .offset((page - 1) * REQUEST_PAGE_SIZE)
    .limit(REQUEST_PAGE_SIZE)
    .getMany();
  return { rows, total, page, pageSize: REQUEST_PAGE_SIZE };
}

export async function requestSummary(manager: EntityManager, clubId: number) {
  const [row]: Array<{ new: number; in_progress: number; completed: number }> = await manager.query(
    `SELECT count(*) FILTER (WHERE status = 'new')::int AS new,
            count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
            count(*) FILTER (WHERE status = 'completed')::int AS completed
     FROM fieldtrack.club_requests
     WHERE club_id = $1 AND removed_at IS NULL`,
    [clubId],
  );
  const pending = row?.new ?? 0;
  const inProgress = row?.in_progress ?? 0;
  return {
    open: pending + inProgress,
    new: pending,
    inProgress,
    completed: row?.completed ?? 0,
  };
}

export async function requestSummaryForMember(manager: EntityManager, clubId: number, memberId: number) {
  const [row]: Array<{ new: number; in_progress: number; completed: number }> = await manager.query(
    `SELECT count(*) FILTER (WHERE status = 'new')::int AS new,
            count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
            count(*) FILTER (WHERE status = 'completed')::int AS completed
     FROM fieldtrack.club_requests
     WHERE club_id = $1 AND removed_at IS NULL AND kind = 'member' AND member_id = $2`,
    [clubId, memberId],
  );
  const pending = row?.new ?? 0;
  const inProgress = row?.in_progress ?? 0;
  return {
    open: pending + inProgress,
    new: pending,
    inProgress,
    completed: row?.completed ?? 0,
  };
}

export interface OpenMemberRequest {
  id: number;
  code: string;
  title: string;
  topic: string;
  documentSlots: string[];
}

/** Solicitudes nuevas o en proceso de cada socio, para la columna del padrón. */
export async function openRequestsByMember(
  manager: EntityManager,
  clubId: number,
  memberIds: readonly number[],
): Promise<Map<number, OpenMemberRequest[]>> {
  const byMember = new Map<number, OpenMemberRequest[]>();
  if (memberIds.length === 0) {
    return byMember;
  }
  const rows: Array<{
    id: number;
    member_id: number;
    number: number;
    title: string;
    topic: string;
    document_slots: string[];
  }> = await manager.query(
    `SELECT id, member_id, number, title, topic, document_slots
     FROM fieldtrack.club_requests
     WHERE club_id = $1 AND member_id = ANY($2::int[])
       AND removed_at IS NULL AND status <> 'completed'
     ORDER BY created_at ASC, id ASC`,
    [clubId, [...memberIds]],
  );
  for (const row of rows) {
    const list = byMember.get(row.member_id) ?? [];
    list.push({
      id: row.id,
      code: requestCode(row.number),
      title: row.title,
      topic: row.topic,
      documentSlots: row.document_slots ?? [],
    });
    byMember.set(row.member_id, list);
  }
  return byMember;
}

export async function nextRequestNumber(manager: EntityManager, clubId: number): Promise<number> {
  await manager.query(`SELECT id FROM fieldtrack.clubs WHERE id = $1 FOR UPDATE`, [clubId]);
  const [row]: Array<{ next: number }> = await manager.query(
    `SELECT coalesce(max(number), 0)::int + 1 AS next FROM fieldtrack.club_requests WHERE club_id = $1`,
    [clubId],
  );
  return row?.next ?? 1;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
