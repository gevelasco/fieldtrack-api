import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { FileService } from '../common/file/file.service';
import { REQUEST_DOCUMENT_STORAGE_FOLDER } from '../common/file/storage-folders';
import {
  removeStorageKey,
  resolveStoredFile,
  uploadToStorage,
} from '../common/file/stored-file.util';
import { Member } from '../members/entities/member.entity';
import { MemberDocument } from '../members/entities/member-document.entity';
import { activeDocumentSlots, labelForSlot } from '../clubs/club-documents';
import { ClubSettingsService } from '../clubs/club-settings.service';
import { searchTerms } from '../members/members.queries';
import { NotificationsService } from '../notifications/notifications.service';
import { AppUser } from '../users/entities/app-user.entity';
import {
  ChangeRequestStatusDto,
  CreateRequestDto,
  ListRequestsQueryDto,
  MAX_REQUEST_DOCUMENTS,
  MemberCreateRequestDto,
  MemberSubmitRequestDto,
  RequestCommentDto,
  RequestFileDto,
  SaveRequestDto,
} from './dto/request.dto';
import { ClubRequestComment } from './entities/club-request-comment.entity';
import { ClubRequestDocument } from './entities/club-request-document.entity';
import { ClubRequestEvent, RequestEventKind } from './entities/club-request-event.entity';
import { ClubRequest, RequestStatus, RequestTopic } from './entities/club-request.entity';
import { actorName, mapRequest, mapRequestDetail, memberName, requestCode } from './request.mapper';
import {
  listRequests,
  nextRequestNumber,
  openRequestsByMember,
  requestSummary,
  requestSummaryForMember,
} from './request.queries';

const WORKER_ROLES = new Set(['admin', 'staff']);
const MAX_FILE_BYTES = 4 * 1024 * 1024;

const STATUS_LABEL: Record<RequestStatus, string> = {
  new: 'Nueva',
  in_progress: 'En proceso',
  completed: 'Completada',
};

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(ClubRequest) private readonly requests: Repository<ClubRequest>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly clubSettings: ClubSettingsService,
    private readonly files: FileService,
  ) {}

  async list(clubId: number, actor: AppUser, query: ListRequestsQueryDto) {
    const memberId = await this.memberScopeId(clubId, actor);
    const found = await listRequests(this.requests, {
      clubId,
      view: query.view ?? 'open',
      terms: searchTerms(query.search),
      page: query.page ?? 1,
      memberId,
    });
    return {
      items: found.rows.map(mapRequest),
      total: found.total,
      page: found.page,
      pageSize: found.pageSize,
    };
  }

  summary(clubId: number, actor: AppUser) {
    return this.memberScopeId(clubId, actor).then((memberId) =>
      memberId
        ? requestSummaryForMember(this.dataSource.manager, clubId, memberId)
        : requestSummary(this.dataSource.manager, clubId),
    );
  }

  async detail(clubId: number, requestId: number, actor?: AppUser) {
    const row = await this.load(this.dataSource.manager, clubId, requestId);
    if (actor) {
      await this.assertRequestReadable(clubId, actor, row);
    }
    return mapRequestDetail(row);
  }

  async create(clubId: number, actor: AppUser, dto: CreateRequestDto) {
    requireWorker(actor);
    const files = (dto.documents ?? []).map(decodeRequestFile);
    const created = await this.dataSource.transaction(async (manager) => {
      const fields = await this.fields(manager, clubId, dto);
      const number = await nextRequestNumber(manager, clubId);
      const saved = await manager.getRepository(ClubRequest).save(
        manager.getRepository(ClubRequest).create({
          clubId,
          number,
          ...fields,
          status: 'new',
          createdByUserId: actor.id,
        }),
      );
      const code = requestCode(number);
      await this.log(manager, saved, actor, 'created', `Creó la solicitud ${code}.`);
      for (const file of files) {
        await this.storeDocument(manager, saved, actor, file);
      }
      return saved;
    });
    const detail = await this.detail(clubId, created.id);
    await this.notify(clubId, actor, {
      kind: 'request_created',
      category: 'registration',
      title: 'Solicitud creada',
      detail: `${detail.code} · ${detail.title}${detail.member ? ` · ${detail.member.name}` : ''}.`,
      requestId: created.id,
      dedupeKey: `request-created:${created.id}`,
    });
    return detail;
  }

  /** Socio inicia un trámite vinculado a su expediente. */
  async createByMember(clubId: number, actor: AppUser, dto: MemberCreateRequestDto) {
    if (actor.role !== 'socio') {
      throw new ForbiddenException('Solo el socio puede usar este registro.');
    }
    const memberId = await this.memberScopeId(clubId, actor);
    if (!memberId) {
      throw new ForbiddenException('Tu usuario no está vinculado a un socio.');
    }
    const files = (dto.documents ?? []).map(decodeRequestFile);
    const created = await this.dataSource.transaction(async (manager) => {
      const fields = await this.fields(manager, clubId, {
        kind: 'member',
        memberId,
        title: dto.title,
        description: dto.description ?? '',
      });
      const number = await nextRequestNumber(manager, clubId);
      const saved = await manager.getRepository(ClubRequest).save(
        manager.getRepository(ClubRequest).create({
          clubId,
          number,
          ...fields,
          status: 'new',
          createdByUserId: actor.id,
        }),
      );
      const code = requestCode(number);
      await this.log(manager, saved, actor, 'created', `Creó la solicitud ${code}.`);
      for (const file of files) {
        await this.storeDocument(manager, saved, actor, file);
      }
      return saved;
    });
    const detail = await this.detail(clubId, created.id, actor);
    await this.notify(clubId, actor, {
      kind: 'request_created',
      category: 'registration',
      title: 'Solicitud creada',
      detail: `${detail.code} · ${detail.title}${detail.member ? ` · ${detail.member.name}` : ''}.`,
      requestId: created.id,
      dedupeKey: `request-created:${created.id}`,
    });
    return detail;
  }

  /** Sin `slot` pide todos los documentos que faltan; con `slot`, la renovación de uno ya cargado. */
  async requestMemberDocuments(clubId: number, memberId: number, actor: AppUser, slot?: string) {
    requireWorker(actor);
    const defs = await this.clubSettings.read(clubId);
    const labels = Object.fromEntries(defs.requiredDocuments.map((row) => [row.slot, row.label]));
    const required = activeDocumentSlots(defs.requiredDocuments);
    const created = await this.dataSource.transaction(async (manager) => {
      const number = await nextRequestNumber(manager, clubId);
      const member = await manager.getRepository(Member).findOne({
        where: { id: memberId, clubId },
        relations: { documents: true },
      });
      if (!member) {
        throw new NotFoundException('No se encontró el socio.');
      }
      const open = (await openRequestsByMember(manager, clubId, [member.id])).get(member.id) ?? [];
      const requestedIn = new Map<string, string>();
      for (const request of open) {
        for (const requested of request.documentSlots) {
          if (!requestedIn.has(requested)) {
            requestedIn.set(requested, request.code);
          }
        }
      }
      const loaded = new Map((member.documents ?? []).map((document) => [document.slot, document]));
      const plan = slot
        ? renewalPlan(slot, labels, loaded.get(slot), requestedIn.get(slot))
        : missingPlan(
            required.filter((candidate) => !loaded.has(candidate)),
            labels,
            requestedIn,
          );
      const code = requestCode(number);
      const saved = await manager.getRepository(ClubRequest).save(
        manager.getRepository(ClubRequest).create({
          clubId,
          number,
          kind: 'member',
          memberId: member.id,
          topic: plan.topic,
          documentSlots: plan.slots,
          title: plan.title,
          description: plan.description,
          status: 'new',
          createdByUserId: actor.id,
        }),
      );
      await this.log(manager, saved, actor, 'created', `Creó la solicitud ${code}. ${plan.logDetail}`);
      return saved;
    });
    const detail = await this.detail(clubId, created.id);
    await this.notify(clubId, actor, {
      kind: 'request_created',
      category: 'registration',
      title: 'Solicitud creada',
      detail: `${detail.code} · ${detail.title}${detail.member ? ` · ${detail.member.name}` : ''}.`,
      requestId: created.id,
      dedupeKey: `request-created:${created.id}`,
    });
    return detail;
  }

  async update(clubId: number, requestId: number, actor: AppUser, dto: SaveRequestDto) {
    requireWorker(actor);
    await this.dataSource.transaction(async (manager) => {
      const current = await this.load(manager, clubId, requestId);
      requireOpen(current);
      if (current.topic !== 'general' && (dto.kind !== 'member' || dto.memberId !== current.memberId)) {
        throw new BadRequestException('Una solicitud de documentos se queda con el socio al que se le pidieron.');
      }
      const fields = await this.fields(manager, clubId, dto);
      const changes: string[] = [];
      if (fields.title !== current.title) {
        changes.push(`Cambió el título de “${current.title}” a “${fields.title}”.`);
      }
      if (fields.description !== current.description) {
        changes.push('Actualizó la descripción.');
      }
      if (fields.memberId !== current.memberId) {
        changes.push(
          fields.member
            ? `Vinculó al socio ${fields.member.memberNumber} · ${memberName(fields.member)}.`
            : 'La marcó como trabajo interno, sin socio vinculado.',
        );
      }
      if (changes.length === 0) {
        return;
      }
      await manager.getRepository(ClubRequest).update(
        { id: current.id },
        { kind: fields.kind, memberId: fields.memberId, title: fields.title, description: fields.description },
      );
      await this.log(manager, current, actor, 'updated', changes.join(' '));
    });
    return this.detail(clubId, requestId);
  }

  async changeStatus(clubId: number, requestId: number, actor: AppUser, dto: ChangeRequestStatusDto) {
    requireWorker(actor);
    const next = dto.status;
    let previous: RequestStatus = 'new';
    await this.dataSource.transaction(async (manager) => {
      const current = await this.load(manager, clubId, requestId);
      previous = current.status;
      if (previous === next) {
        throw new ConflictException(`La solicitud ya está ${STATUS_LABEL[next].toLowerCase()}.`);
      }
      const repo = manager.getRepository(ClubRequest);
      const now = new Date();
      if (next === 'in_progress') {
        await repo.update(
          { id: current.id },
          {
            status: 'in_progress',
            completedAt: null,
            completedByUserId: null,
            startedAt: current.startedAt ?? now,
            startedByUserId: current.startedByUserId ?? actor.id,
          },
        );
        if (previous === 'completed') {
          await this.log(manager, current, actor, 'reopened', 'Reabrió la solicitud.');
        } else {
          await this.log(manager, current, actor, 'started', 'Pasó la solicitud a en proceso.');
        }
        return;
      }
      if (next === 'completed') {
        if (previous === 'new') {
          throw new BadRequestException('Pasa la solicitud a en proceso antes de completarla.');
        }
        await repo.update(
          { id: current.id },
          { status: 'completed', completedAt: now, completedByUserId: actor.id },
        );
        await this.log(manager, current, actor, 'completed', 'Marcó la solicitud como completada.');
        return;
      }
      if (previous === 'completed') {
        throw new BadRequestException('Reabre la solicitud antes de regresarla a nueva.');
      }
      await repo.update({ id: current.id }, { status: 'new', startedAt: null, startedByUserId: null });
      await this.log(manager, current, actor, 'returned', 'Regresó la solicitud a nueva.');
    });
    const detail = await this.detail(clubId, requestId);
    if (detail.kind === 'member' && detail.member) {
      if (next === 'completed' && detail.completed) {
        await this.notify(clubId, actor, {
          kind: 'request_completed',
          category: 'confirmation',
          title: 'Solicitud completada',
          detail: `${detail.code} · ${detail.title}.`,
          requestId,
          dedupeKey: `request-completed:${requestId}:${detail.completed.at}`,
        });
      } else if (next === 'in_progress' && previous === 'new') {
        await this.notify(clubId, actor, {
          kind: 'request_in_progress',
          category: 'update',
          title: 'Solicitud en proceso',
          detail: `${detail.code} · ${detail.title}. Ya puedes revisarla y enviar tu respuesta.`,
          requestId,
          dedupeKey: `request-in-progress:${requestId}:${detail.updatedAt}`,
        });
      } else if (next === 'new') {
        await this.notify(clubId, actor, {
          kind: 'request_returned',
          category: 'update',
          title: 'Solicitud requiere tu atención',
          detail: `${detail.code} · ${detail.title}. El club la regresó a pendiente.`,
          requestId,
          dedupeKey: `request-returned:${requestId}:${detail.updatedAt}`,
        });
      }
    }
    return detail;
  }

  async addDocument(clubId: number, requestId: number, actor: AppUser, dto: RequestFileDto) {
    if (actor.role === 'socio') {
      throw new ForbiddenException(
        'Usa «Enviar a revisión» para adjuntar archivos cuando la solicitud esté en proceso.',
      );
    }
    const file = decodeRequestFile(dto);
    await this.dataSource.transaction(async (manager) => {
      const current = await this.load(manager, clubId, requestId);
      requireWorker(actor);
      requireOpen(current);
      if ((current.documents ?? []).length >= MAX_REQUEST_DOCUMENTS) {
        throw new BadRequestException(`Una solicitud admite hasta ${MAX_REQUEST_DOCUMENTS} documentos.`);
      }
      await this.storeDocument(manager, current, actor, file);
    });
    return this.detail(clubId, requestId, actor);
  }

  async addComment(clubId: number, requestId: number, actor: AppUser, dto: RequestCommentDto) {
    const body = dto.body.trim();
    if (!body) {
      throw new BadRequestException('Escribe un comentario.');
    }
    await this.dataSource.transaction(async (manager) => {
      const current = await this.load(manager, clubId, requestId);
      if (actor.role === 'socio') {
        await this.assertRequestReadable(clubId, actor, current);
        requireMemberInProgress(current);
      } else {
        requireWorker(actor);
        requireOpen(current);
      }
      await this.storeComment(manager, current, actor, body);
      await this.log(manager, current, actor, 'comment_added', 'Agregó un comentario.');
    });
    const detail = await this.detail(clubId, requestId, actor);
    if (
      WORKER_ROLES.has(actor.role) &&
      detail.kind === 'member' &&
      detail.member &&
      detail.status !== 'completed'
    ) {
      await this.notify(clubId, actor, {
        kind: 'request_comment',
        category: 'update',
        title: 'Nuevo comentario en tu solicitud',
        detail: `${detail.code} · ${detail.title}.`,
        requestId,
        dedupeKey: `request-comment:${requestId}:${Date.now()}`,
      });
    }
    return detail;
  }

  async memberSubmit(clubId: number, requestId: number, actor: AppUser, dto: MemberSubmitRequestDto) {
    if (actor.role !== 'socio') {
      throw new ForbiddenException('Solo el socio puede enviar esta respuesta.');
    }
    const message = dto.message?.trim() ?? '';
    const files = (dto.documents ?? []).map(decodeRequestFile);
    if (!message && files.length === 0) {
      throw new BadRequestException('Adjunta al menos un archivo o escribe un comentario.');
    }
    await this.dataSource.transaction(async (manager) => {
      const current = await this.load(manager, clubId, requestId);
      await this.assertRequestReadable(clubId, actor, current);
      requireMemberInProgress(current);
      requireOpen(current);
      const existing = (current.documents ?? []).length;
      if (existing + files.length > MAX_REQUEST_DOCUMENTS) {
        throw new BadRequestException(`Una solicitud admite hasta ${MAX_REQUEST_DOCUMENTS} documentos.`);
      }
      if (message) {
        await this.storeComment(manager, current, actor, message);
      }
      for (const file of files) {
        await this.storeDocument(manager, current, actor, file);
      }
      const parts = [
        message ? 'comentario' : null,
        files.length ? `${files.length} archivo${files.length === 1 ? '' : 's'}` : null,
      ].filter(Boolean);
      await this.log(
        manager,
        current,
        actor,
        'member_submitted',
        `Envió a revisión (${parts.join(' y ')}).`,
      );
    });
    const detail = await this.detail(clubId, requestId, actor);
    await this.notify(clubId, actor, {
      kind: 'request_member_submitted',
      category: 'update',
      title: 'Respuesta del socio',
      detail: `${detail.code} · ${detail.title}.`,
      requestId,
      dedupeKey: `request-member-submitted:${requestId}:${detail.updatedAt}`,
    });
    return detail;
  }

  async removeDocument(clubId: number, requestId: number, documentId: number, actor: AppUser) {
    requireWorker(actor);
    await this.dataSource.transaction(async (manager) => {
      const current = await this.load(manager, clubId, requestId);
      requireOpen(current);
      const document = (current.documents ?? []).find((item) => item.id === documentId);
      if (!document) {
        throw new NotFoundException('No se encontró el documento.');
      }
      await removeStorageKey(this.files, document.storageKey);
      await manager.getRepository(ClubRequestDocument).delete({ id: document.id });
      await this.log(manager, current, actor, 'document_removed', `Quitó el documento ${document.fileName}.`);
    });
    return this.detail(clubId, requestId);
  }

  async readDocument(clubId: number, requestId: number, documentId: number, actor: AppUser) {
    const current = await this.load(this.dataSource.manager, clubId, requestId);
    await this.assertRequestReadable(clubId, actor, current);
    const row = await this.dataSource
      .getRepository(ClubRequestDocument)
      .createQueryBuilder('document')
      .innerJoin('document.request', 'request')
      .addSelect('document.content')
      .where('document.clubId = :clubId', { clubId })
      .andWhere('document.requestId = :requestId', { requestId })
      .andWhere('document.id = :documentId', { documentId })
      .andWhere('request.removedAt IS NULL')
      .getOne();
    if (!row) {
      throw new NotFoundException('No hay archivo.');
    }
    return resolveStoredFile(this.files, {
      fileName: row.fileName,
      contentType: row.contentType,
      storageKey: row.storageKey,
      content: row.content,
    });
  }

  async remove(clubId: number, requestId: number, actor: AppUser) {
    requireWorker(actor);
    const removed = await this.dataSource.transaction(async (manager) => {
      const current = await this.load(manager, clubId, requestId);
      await manager.getRepository(ClubRequest).update(
        { id: current.id },
        { removedAt: new Date(), removedByUserId: actor.id },
      );
      await this.log(manager, current, actor, 'removed', 'Removió la solicitud.');
      return current;
    });
    await this.notify(clubId, actor, {
      kind: 'request_removed',
      category: 'update',
      title: 'Solicitud removida',
      detail: `${requestCode(removed.number)} · ${removed.title}.`,
      requestId,
      dedupeKey: `request-removed:${requestId}`,
    });
  }

  private async load(manager: EntityManager, clubId: number, requestId: number): Promise<ClubRequest> {
    const row = await manager.getRepository(ClubRequest).findOne({
      where: { id: requestId, clubId },
      relations: {
        member: true,
        createdBy: true,
        startedBy: true,
        completedBy: true,
        documents: { uploadedBy: true },
        events: { actor: true },
        comments: { author: true },
      },
      relationLoadStrategy: 'query',
    });
    if (!row || row.removedAt) {
      throw new NotFoundException('No se encontró la solicitud.');
    }
    return row;
  }

  private async fields(manager: EntityManager, clubId: number, dto: SaveRequestDto) {
    const title = dto.title.trim();
    if (!title) {
      throw new BadRequestException('El título es obligatorio.');
    }
    const description = dto.description?.trim() ?? '';
    if (dto.kind === 'internal') {
      return { kind: dto.kind, memberId: null, member: null, title, description };
    }
    const member = dto.memberId
      ? await manager.getRepository(Member).findOne({ where: { id: dto.memberId, clubId } })
      : null;
    if (!member) {
      throw new BadRequestException('Selecciona el socio de la solicitud.');
    }
    return { kind: dto.kind, memberId: member.id, member, title, description };
  }

  private async storeDocument(manager: EntityManager, request: ClubRequest, actor: AppUser, file: DecodedRequestFile) {
    const uploaded = await uploadToStorage(
      this.files,
      REQUEST_DOCUMENT_STORAGE_FOLDER,
      { content: file.content, contentType: file.contentType, size: file.content.length },
      file.fileName,
    );
    await manager.getRepository(ClubRequestDocument).insert({
      clubId: request.clubId,
      requestId: request.id,
      fileName: file.fileName,
      contentType: uploaded.contentType,
      sizeBytes: uploaded.sizeBytes,
      storageKey: uploaded.storageKey,
      content: null,
      uploadedByUserId: actor.id,
    });
    await this.log(manager, request, actor, 'document_added', `Adjuntó el documento ${file.fileName}.`);
  }

  private async log(
    manager: EntityManager,
    request: ClubRequest,
    actor: AppUser,
    kind: RequestEventKind,
    detail: string,
  ) {
    await manager.getRepository(ClubRequestEvent).insert({
      clubId: request.clubId,
      requestId: request.id,
      kind,
      detail,
      actorUserId: actor.id,
    });
  }

  private notify(
    clubId: number,
    actor: AppUser,
    draft: {
      kind: string;
      category: 'registration' | 'confirmation' | 'update';
      title: string;
      detail: string;
      requestId: number;
      dedupeKey: string;
    },
  ) {
    return this.notifications.record({
      clubId,
      kind: draft.kind,
      category: draft.category,
      title: draft.title,
      detail: draft.detail,
      entityType: 'club_request',
      entityId: String(draft.requestId),
      actorUserId: actor.id,
      actorLabel: actorName(actor),
      dedupeKey: draft.dedupeKey,
    });
  }

  private async memberScopeId(clubId: number, actor: AppUser): Promise<number | undefined> {
    if (actor.role !== 'socio') {
      return undefined;
    }
    const member = await this.dataSource.getRepository(Member).findOne({
      where: { clubId, userId: actor.id },
    });
    if (!member) {
      throw new ForbiddenException('Tu usuario no está vinculado a un socio.');
    }
    return member.id;
  }

  private async storeComment(
    manager: EntityManager,
    request: ClubRequest,
    actor: AppUser,
    body: string,
  ) {
    await manager.getRepository(ClubRequestComment).save(
      manager.getRepository(ClubRequestComment).create({
        clubId: request.clubId,
        requestId: request.id,
        authorUserId: actor.id,
        body: body.trim(),
      }),
    );
  }

  private async assertRequestReadable(clubId: number, actor: AppUser, request: ClubRequest) {
    if (WORKER_ROLES.has(actor.role)) {
      return;
    }
    if (actor.role !== 'socio' || request.kind !== 'member' || !request.memberId) {
      throw new ForbiddenException('No puedes ver esta solicitud.');
    }
    const memberId = await this.memberScopeId(clubId, actor);
    if (request.memberId !== memberId) {
      throw new ForbiddenException('No puedes ver esta solicitud.');
    }
  }
}

interface DecodedRequestFile {
  fileName: string;
  contentType: string;
  content: Buffer;
}

function decodeRequestFile(dto: RequestFileDto): DecodedRequestFile {
  const raw = dto.contentBase64.replace(/^data:[^;]+;base64,/, '');
  const content = Buffer.from(raw, 'base64');
  if (content.length === 0) {
    throw new BadRequestException('El archivo está vacío.');
  }
  if (content.length > MAX_FILE_BYTES) {
    throw new BadRequestException('Cada documento puede pesar hasta 4 MB.');
  }
  return {
    fileName: dto.fileName.trim() || 'archivo',
    contentType: dto.contentType?.trim() || 'application/octet-stream',
    content,
  };
}

interface DocumentRequestPlan {
  topic: RequestTopic;
  slots: string[];
  title: string;
  description: string;
  logDetail: string;
}

function renewalPlan(
  slot: string,
  labels: Record<string, string>,
  current: MemberDocument | undefined,
  requestedIn: string | undefined,
): DocumentRequestPlan {
  const label = labelForSlot(labels, slot);
  if (!current) {
    throw new BadRequestException(`${label} aún no está cargado; pídelo con los documentos pendientes.`);
  }
  if (requestedIn) {
    throw new ConflictException(`${label} ya se pidió en ${requestedIn}.`);
  }
  return {
    topic: 'document_renewal',
    slots: [slot],
    title: `Renovar ${label}`,
    description: `Se pidió al socio subir una versión vigente de ${label}. El archivo actual es ${current.fileName}, cargado el ${formatDay(current.loadedOn)}.`,
    logDetail: `Pidió al socio renovar ${label}.`,
  };
}

function missingPlan(
  missing: readonly string[],
  labels: Record<string, string>,
  requestedIn: ReadonlyMap<string, string>,
): DocumentRequestPlan {
  if (missing.length === 0) {
    throw new ConflictException('El socio no tiene documentos pendientes.');
  }
  const slots = missing.filter((slot) => !requestedIn.has(slot));
  if (slots.length === 0) {
    const codes = [...new Set(missing.map((slot) => requestedIn.get(slot)))].join(', ');
    throw new ConflictException(`Los documentos pendientes ya se pidieron en ${codes}.`);
  }
  const slotLabels = slots.map((item) => labelForSlot(labels, item));
  return {
    topic: 'member_documents',
    slots,
    title: slots.length === 1 ? `Subir ${slotLabels[0]}` : `Subir ${slots.length} documentos pendientes`,
    description:
      slots.length === 1
        ? 'Se pidió al socio subir este documento que falta en su expediente.'
        : 'Se pidió al socio subir los documentos que faltan en su expediente.',
    logDetail: `Pidió al socio: ${slotLabels.join(', ')}.`,
  };
}

function formatDay(value: string | Date): string {
  const day = typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return new Date(`${day}T12:00:00`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function requireWorker(actor: AppUser) {
  if (!WORKER_ROLES.has(actor.role)) {
    throw new ForbiddenException('Solo el personal del club puede gestionar solicitudes.');
  }
}

function requireOpen(request: ClubRequest) {
  if (request.status === 'completed') {
    throw new ConflictException('Reabre la solicitud para modificarla.');
  }
}

function requireMemberInProgress(request: ClubRequest) {
  if (request.status === 'new') {
    throw new ConflictException(
      'La solicitud aún está nueva. El club debe pasarla a «En proceso» antes de que puedas responder.',
    );
  }
  if (request.status !== 'in_progress') {
    throw new ConflictException('Esta solicitud ya no acepta respuestas del socio.');
  }
}
