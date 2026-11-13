import { Member } from '../members/entities/member.entity';
import { MemberWeapon } from '../members/entities/member-weapon.entity';
import { AppUser } from '../users/entities/app-user.entity';
import { ClubRequestComment } from './entities/club-request-comment.entity';
import { ClubRequestDocument } from './entities/club-request-document.entity';
import { ClubRequestEvent } from './entities/club-request-event.entity';
import { ClubRequest } from './entities/club-request.entity';

export function requestCode(number: number): string {
  return `SOL-${String(number).padStart(4, '0')}`;
}

export function memberName(member: Pick<Member, 'firstName' | 'paternalSurname' | 'maternalSurname'>): string {
  return [member.firstName, member.paternalSurname, member.maternalSurname]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
}

export function actorName(user: Pick<AppUser, 'displayName' | 'username'>): string {
  return user.displayName?.trim() || user.username;
}

export function mapRequest(row: ClubRequest & { documentCount?: number }) {
  return {
    id: row.id,
    code: requestCode(row.number),
    kind: row.kind,
    topic: row.topic,
    documentSlots: row.documentSlots ?? [],
    status: row.status,
    title: row.title,
    description: row.description,
    member: row.member
      ? { id: row.member.id, memberNumber: row.member.memberNumber, name: memberName(row.member) }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: actorOf(row.createdByUserId, row.createdBy),
    started: stamp(row.startedAt, row.startedByUserId, row.startedBy),
    completed: stamp(row.completedAt, row.completedByUserId, row.completedBy),
    documentCount: row.documentCount ?? row.documents?.length ?? 0,
  };
}

export function weaponLabel(weapon: Pick<MemberWeapon, 'brand' | 'model' | 'serialNumber'>): string {
  const name = `${weapon.brand} ${weapon.model}`.trim();
  return weapon.serialNumber ? `${name} (serie ${weapon.serialNumber.toLocaleUpperCase('es-MX')})` : name;
}

/** Elemento pedido al socio: un documento del expediente o la hoja de registro de un arma. */
export interface RequestItemTarget {
  slot: string | null;
  weaponId: number | null;
  label: string;
  /** El archivo ya está en el expediente o en el arma (p. ej. el staff lo cargó desde el drawer). */
  fulfilled: boolean;
}

export function requestItems(
  row: Pick<ClubRequest, 'documentSlots' | 'weaponIds' | 'topic' | 'createdAt'>,
  slotLabels: Readonly<Record<string, string>>,
  weapons: readonly MemberWeapon[],
  loadedSlots: ReadonlyMap<string, string>,
): RequestItemTarget[] {
  const byId = new Map(weapons.map((weapon) => [weapon.id, weapon]));
  const requestedOn = mexicoDay(row.createdAt);
  return [
    ...(row.documentSlots ?? []).map((slot) => {
      const loadedOn = loadedSlots.get(slot);
      return {
        slot,
        weaponId: null,
        label: slotLabels[slot] ?? slot,
        fulfilled:
          loadedOn != null && (row.topic !== 'document_renewal' || loadedOn.slice(0, 10) >= requestedOn),
      };
    }),
    ...(row.weaponIds ?? []).map((id) => {
      const weapon = byId.get(id);
      return {
        slot: null,
        weaponId: id,
        label: weapon ? weaponLabel(weapon) : 'Arma eliminada',
        fulfilled: !!weapon?.sheetFileName,
      };
    }),
  ];
}

export function isItemDocument(document: ClubRequestDocument, item: RequestItemTarget): boolean {
  return item.slot != null ? document.itemSlot === item.slot : document.itemWeaponId === item.weaponId;
}

/** Listo: su archivo se aprobó en la solicitud o ya está cargado en el expediente. */
export function isItemSettled(item: RequestItemTarget, documents: readonly ClubRequestDocument[]): boolean {
  return (
    item.fulfilled ||
    documents.some((document) => isItemDocument(document, item) && document.reviewStatus === 'approved')
  );
}

function mexicoDay(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(value);
}

export function mapRequestDetail(row: ClubRequest, items: readonly RequestItemTarget[] = []) {
  const documents = [...(row.documents ?? [])].sort(
    (a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime() || a.id - b.id,
  );
  return {
    ...mapRequest(row),
    items: items.map((item) => {
      const current = documents.filter((document) => isItemDocument(document, item)).at(-1);
      return { ...item, document: current ? mapDocument(current) : null };
    }),
    documents: documents
      .filter((document) => document.reviewStatus == null)
      .map(mapDocument),
    events: [...(row.events ?? [])]
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || a.id - b.id)
      .map(mapEvent),
    comments: [...(row.comments ?? [])]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
      .map(mapComment),
  };
}

function mapComment(comment: ClubRequestComment) {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    author: actorOf(comment.authorUserId, comment.author),
  };
}

function mapDocument(document: ClubRequestDocument) {
  return {
    id: document.id,
    fileName: document.fileName,
    contentType: document.contentType,
    sizeBytes: Number(document.sizeBytes),
    uploadedAt: document.uploadedAt.toISOString(),
    uploadedBy: actorOf(document.uploadedByUserId, document.uploadedBy),
    review: document.reviewStatus
      ? {
          status: document.reviewStatus,
          note: document.reviewNote,
          reviewed: stamp(document.reviewedAt, document.reviewedByUserId, document.reviewedBy),
        }
      : null,
  };
}

function mapEvent(event: ClubRequestEvent) {
  return {
    id: event.id,
    kind: event.kind,
    detail: event.detail,
    occurredAt: event.occurredAt.toISOString(),
    actor: actorOf(event.actorUserId, event.actor),
  };
}

function stamp(at: Date | null, userId: number | null, user: AppUser | null | undefined) {
  if (!at || userId == null) {
    return null;
  }
  return { at: at.toISOString(), by: actorOf(userId, user) };
}

function actorOf(id: number, user: AppUser | null | undefined) {
  return {
    id,
    name: user ? actorName(user) : 'Sistema',
    role: user?.role ?? 'staff',
  };
}
