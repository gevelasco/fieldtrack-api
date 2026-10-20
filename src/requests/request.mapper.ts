import { Member } from '../members/entities/member.entity';
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

export function mapRequestDetail(row: ClubRequest) {
  return {
    ...mapRequest(row),
    documents: [...(row.documents ?? [])]
      .sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime() || a.id - b.id)
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
