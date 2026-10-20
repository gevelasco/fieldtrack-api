import { Club } from '../clubs/entities/club.entity';
import { CompetitionRegistration } from '../competitions/entities/competition-registration.entity';
import { HuntingTagSale } from '../hunting/entities/hunting-tag-sale.entity';
import { AppUser } from '../users/entities/app-user.entity';
import { Member } from './entities/member.entity';
import { MemberDocument } from './entities/member-document.entity';
import { MemberPeta } from './entities/member-peta.entity';
import { MemberWeapon } from './entities/member-weapon.entity';
import { MembershipPayment } from './entities/membership-payment.entity';
import {
  MembershipCalendar,
  MembershipCode,
  membershipPeriod,
  pendingPeriods,
  periodForStart,
  periodLabel,
  resolveMemberStatus,
} from './membership-status';

export const DOCUMENT_SLOTS = [
  'carta-antecedentes',
  'cartilla-militar',
  'certificado-medico',
  'comprobante-domicilio',
  'csf',
  'curp',
  'examen-psicologico',
  'ine',
] as const;

export type DocumentSlot = (typeof DOCUMENT_SLOTS)[number];

export const DOCUMENT_SLOT_LABEL: Record<DocumentSlot, string> = {
  'carta-antecedentes': 'Carta de no antecedentes',
  'cartilla-militar': 'Cartilla militar',
  'certificado-medico': 'Certificado médico',
  'comprobante-domicilio': 'Comprobante de domicilio',
  csf: 'Constancia de situación fiscal',
  curp: 'CURP',
  'examen-psicologico': 'Examen psicológico',
  ine: 'Identificación oficial',
};

export function calendarFromClub(club: Club): MembershipCalendar {
  return {
    sportShooting: {
      startMonth: club.sportShootingStartMonth,
      startDay: club.sportShootingStartDay,
      endMonth: club.sportShootingEndMonth,
      endDay: club.sportShootingEndDay,
    },
    hunting: {
      startMonth: club.huntingStartMonth,
      startDay: club.huntingStartDay,
      endMonth: club.huntingEndMonth,
      endDay: club.huntingEndDay,
    },
  };
}

export function feeForMembership(club: Club, membership: string): number {
  const raw = membership === 'caza' ? club.huntingFeeMxn : club.sportShootingFeeMxn;
  return Number(raw);
}

export function mapMember(
  member: Member,
  club: Club,
  openRequests: readonly {
    id: number;
    code: string;
    title: string;
    topic: string;
    documentSlots: readonly string[];
  }[] = [],
  options: { includePetaHistory?: boolean } = {},
) {
  const includePetaHistory = options.includePetaHistory !== false;
  const membership = member.membership as MembershipCode;
  const calendar = calendarFromClub(club);
  const payments = (member.payments ?? []).map((row) => mapPayment(row, calendar));
  const slices = payments.map((payment) => ({
    membership: payment.membership,
    paidOn: payment.paidOn,
    periodStart: payment.periodStart,
    reverted: payment.reverted !== null,
  }));
  const currentPeriod = membershipPeriod(membership, calendar);
  const status = resolveMemberStatus({
    storedStatus: member.status,
    membership,
    joinedOn: asDate(member.joinedOn),
    payments: slices.filter((slice) => !slice.reverted),
    calendar,
  });
  const fee = feeForMembership(club, membership);
  const pending = pendingPeriods({
    membership,
    joinedOn: asDate(member.joinedOn),
    payments: slices,
    calendar,
  }).map((period) => ({
    ...period,
    amount: fee,
  }));
  return {
    id: member.id,
    clubId: member.clubId,
    memberNumber: member.memberNumber,
    firstName: member.firstName,
    paternalSurname: member.paternalSurname,
    maternalSurname: member.maternalSurname,
    email: member.email,
    phone: member.phone,
    joinedOn: asDate(member.joinedOn),
    sex: member.sex,
    membership,
    status,
    currentMembershipPeriod: {
      start: currentPeriod.start,
      end: currentPeriod.end,
      label: periodLabel(currentPeriod),
    },
    weapons: (member.weapons ?? []).map(mapWeapon),
    petas: sortPetas(member.petas ?? [])
      .filter((peta) => includePetaHistory || peta.isCurrent !== false)
      .map(mapPeta),
    documents: (member.documents ?? []).map(mapDocument),
    payments,
    pendingPeriods: pending,
    huntingTags: (member.huntingTags ?? []).map(mapMemberTag),
    competitionFees: (member.competitionRegistrations ?? [])
      .filter(isChargedCompetitionFee)
      .map(mapMemberCompetitionFee),
    permits: [],
    requests: openRequests,
  };
}

export function mapDocument(document: MemberDocument) {
  return {
    id: document.id,
    slot: document.slot,
    fileName: document.fileName,
    contentType: document.contentType,
    sizeBytes: document.sizeBytes == null ? null : Number(document.sizeBytes),
    loadedOn: asDate(document.loadedOn),
  };
}

export function mapWeapon(weapon: MemberWeapon) {
  return {
    id: weapon.id,
    brand: weapon.brand,
    model: weapon.model,
    caliber: weapon.caliber,
    serialNumber: weapon.serialNumber.toLocaleUpperCase('es-MX'),
    platform: weapon.platform,
    modality: weapon.modality,
    hasPeta: weapon.hasPeta,
    registeredOn: asDate(weapon.registeredOn),
    sheet: weapon.sheetFileName
      ? {
          fileName: weapon.sheetFileName,
          contentType: weapon.sheetContentType,
        }
      : null,
  };
}

function sortPetas(petas: MemberPeta[]): MemberPeta[] {
  return [...petas].sort((a, b) => {
    const current = Number(b.isCurrent !== false) - Number(a.isCurrent !== false);
    if (current !== 0) {
      return current;
    }
    return asDate(b.loadedOn).localeCompare(asDate(a.loadedOn));
  });
}

export function mapPeta(peta: MemberPeta) {
  return {
    id: peta.id,
    permitType: peta.permitType,
    fileName: peta.fileName,
    contentType: peta.contentType,
    sizeBytes: peta.sizeBytes == null ? null : Number(peta.sizeBytes),
    loadedOn: asDate(peta.loadedOn),
    isCurrent: peta.isCurrent !== false,
    supersededOn: peta.supersededOn ? asDate(peta.supersededOn) : null,
  };
}

export function mapPayment(payment: MembershipPayment, calendar: MembershipCalendar) {
  const recorder = payment.recordedBy;
  const membership = payment.membership as MembershipCode;
  const periodStart = asDate(payment.periodStart);
  const period = periodForStart(membership, calendar, periodStart);
  return {
    id: payment.id,
    clubId: payment.clubId,
    membership,
    paidOn: asDate(payment.paidOn),
    periodStart,
    periodEnd: period.end,
    periodLabel: periodLabel(period),
    amount: Number(payment.amount),
    recordedBy: actorOf(payment.recordedByUserId, recorder),
    reverted:
      payment.revertedAt && payment.revertedByUserId
        ? {
            on: asDate(payment.revertedAt),
            by: actorOf(payment.revertedByUserId, payment.revertedBy),
          }
        : null,
  };
}

function isChargedCompetitionFee(row: CompetitionRegistration): boolean {
  return row.participantKind === 'member' && row.status === 'confirmed' && row.confirmedAt !== null;
}

function mapMemberCompetitionFee(row: CompetitionRegistration) {
  return {
    id: row.id,
    editionId: row.editionId,
    discipline: row.edition?.discipline?.name ?? '',
    title: row.edition?.title ?? '',
    startsOn: row.edition ? asDate(row.edition.startsOn) : '',
    paidOn: row.confirmedAt ? asDate(row.confirmedAt) : '',
    amount: Number(row.edition?.entryFee ?? 0),
    recordedBy: row.confirmedByUserId
      ? actorOf(row.confirmedByUserId, row.confirmedBy)
      : { id: 0, name: 'Sistema', role: 'staff' },
    reverted: null,
  };
}

function mapMemberTag(sale: HuntingTagSale) {
  return {
    id: sale.id,
    seasonId: sale.seasonId,
    species: sale.season?.species?.name ?? '',
    season: sale.season?.label ?? '',
    folio: sale.folio,
    paidOn: asDate(sale.paidOn),
    amount: Number(sale.amount),
    recordedBy: actorOf(sale.recordedByUserId, sale.recordedBy),
    reverted:
      sale.revertedAt && sale.revertedByUserId
        ? { on: asDate(sale.revertedAt), by: actorOf(sale.revertedByUserId, sale.revertedBy) }
        : null,
  };
}

export function actorOf(id: number, user: AppUser | null | undefined) {
  return {
    id,
    name: user?.displayName?.trim() || user?.username || 'Sistema',
    role: user?.role ?? 'staff',
  };
}

export function isDocumentSlot(value: string): boolean {
  return (DOCUMENT_SLOTS as readonly string[]).includes(value);
}

export function asDate(value: string | Date): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function memberDisplayName(member: Pick<Member, 'firstName' | 'paternalSurname' | 'maternalSurname'>): string {
  return [member.firstName, member.paternalSurname, member.maternalSurname]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

export function formatPesos(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(amount);
}
