import { memberDisplayName } from '../members/member.mapper';
import { actorName } from '../requests/request.mapper';
import { CompetitionDiscipline } from './entities/competition-discipline.entity';
import { CompetitionEdition } from './entities/competition-edition.entity';
import { CompetitionRegistration } from './entities/competition-registration.entity';

export type EditionStatus = 'upcoming' | 'active' | 'closed';

export function editionStatus(edition: Pick<CompetitionEdition, 'startsOn' | 'endsOn' | 'closedAt'>, today: string): EditionStatus {
  if (edition.closedAt) {
    return 'closed';
  }
  if (today < edition.startsOn) {
    return 'upcoming';
  }
  if (today > edition.endsOn) {
    return 'closed';
  }
  return 'active';
}

export function mapDiscipline(row: CompetitionDiscipline, today: string) {
  const editions = [...(row.editions ?? [])].sort((a, b) => b.startsOn.localeCompare(a.startsOn));
  return {
    id: row.id,
    name: row.name,
    notes: row.notes,
    editions: editions.map((edition) => mapEditionSummary(edition, row.name, today)),
  };
}

export function mapEditionSummary(
  edition: CompetitionEdition,
  disciplineName: string,
  today: string,
) {
  const counts = countRegistrations(edition.registrations ?? []);
  const rankingCount = countRanked(edition.registrations ?? []);
  return {
    id: edition.id,
    disciplineId: edition.disciplineId,
    disciplineName,
    title: edition.title,
    venue: edition.venue ?? '',
    label: `${disciplineName} · ${edition.title}`,
    startsOn: edition.startsOn,
    endsOn: edition.endsOn,
    startTime: edition.startTime ? edition.startTime.slice(0, 5) : null,
    endTime: edition.endTime ? edition.endTime.slice(0, 5) : null,
    maxParticipants: edition.maxParticipants,
    entryFee: Number(edition.entryFee),
    registrationOpens: edition.registrationOpens.toISOString(),
    registrationCloses: edition.registrationCloses.toISOString(),
    paymentDeadline: edition.paymentDeadline.toISOString(),
    notes: edition.notes,
    minimumLevel: edition.minimumLevel,
    status: editionStatus(edition, today),
    confirmedCount: counts.confirmed,
    pendingCount: counts.pending,
    rankingCount,
  };
}

export function mapEditionDetail(
  edition: CompetitionEdition,
  discipline: CompetitionDiscipline,
  today: string,
) {
  const registrations = [...(edition.registrations ?? [])].sort(
    (a, b) => a.preRegisteredAt.getTime() - b.preRegisteredAt.getTime(),
  );
  return {
    ...mapEditionSummary(edition, discipline.name, today),
    registrations: registrations.map(mapRegistration),
    ranking: buildRanking(registrations),
  };
}

function mapRegistration(row: CompetitionRegistration) {
  return {
    id: row.id,
    participantKind: row.participantKind,
    status: row.status,
    preRegisteredAt: row.preRegisteredAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    score: row.score !== null ? Number(row.score) : null,
    rank: row.rank,
    member:
      row.member && row.memberId
        ? {
            id: row.member.id,
            memberNumber: row.member.memberNumber,
            name: memberDisplayName(row.member),
          }
        : null,
    guestName: row.guestName,
    guestPhone: row.guestPhone,
    confirmedBy: row.confirmedBy
      ? { id: row.confirmedBy.id, name: actorName(row.confirmedBy), role: row.confirmedBy.role }
      : null,
  };
}

function countRanked(rows: CompetitionRegistration[]) {
  let ranked = 0;
  for (const row of rows) {
    if (row.status === 'confirmed' && row.rank != null) {
      ranked += 1;
    }
  }
  return ranked;
}

function countRegistrations(rows: CompetitionRegistration[]) {
  let confirmed = 0;
  let pending = 0;
  for (const row of rows) {
    if (row.status === 'confirmed') {
      confirmed += 1;
    } else if (row.status === 'pre_registered') {
      pending += 1;
    }
  }
  return { confirmed, pending };
}

function buildRanking(registrations: CompetitionRegistration[]) {
  return registrations
    .filter((row) => row.status === 'confirmed' && row.rank !== null)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((row) => ({
      rank: row.rank,
      score: row.score !== null ? Number(row.score) : null,
      name:
        row.participantKind === 'member' && row.member
          ? memberDisplayName(row.member)
          : (row.guestName ?? ''),
      memberNumber: row.member?.memberNumber ?? null,
      participantKind: row.participantKind,
      registrationId: row.id,
    }));
}

export function asDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
