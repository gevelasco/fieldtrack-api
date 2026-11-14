import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, Repository } from 'typeorm';
import { ClubEvent } from '../events/entities/club-event.entity';
import { asDate } from '../members/member.mapper';
import { Member } from '../members/entities/member.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { actorName } from '../requests/request.mapper';
import { AppUser } from '../users/entities/app-user.entity';
import {
  asDateOnly,
  buildRanking,
  editionStatus,
  mapDiscipline,
  mapEditionDetail,
} from './competitions.mapper';
import {
  CreateDisciplineDto,
  CreateEditionDto,
  PreRegisterDto,
  RegisterGuestDto,
  SaveDisciplineDto,
  SaveEditionDto,
  PublishWinnersDto,
  SaveScoreDto,
} from './dto/competitions.dto';
import { CompetitionDiscipline } from './entities/competition-discipline.entity';
import { CompetitionEdition } from './entities/competition-edition.entity';
import { CompetitionRegistration } from './entities/competition-registration.entity';

const WORKER_ROLES = new Set(['admin', 'staff']);
const RESULTS_WINDOW_DAYS = 30;

@Injectable()
export class CompetitionsService {
  constructor(
    @InjectRepository(CompetitionDiscipline) private readonly disciplines: Repository<CompetitionDiscipline>,
    @InjectRepository(CompetitionEdition) private readonly editions: Repository<CompetitionEdition>,
    @InjectRepository(Member) private readonly members: Repository<Member>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  async list(clubId: number) {
    await this.expireAllPending(clubId);
    const today = asDateOnly(new Date());
    const rows = await this.disciplines.find({
      where: { clubId },
      relations: { editions: { registrations: { member: true, confirmedBy: true } } },
      order: { name: 'ASC' },
    });
    return rows.map((row) => mapDiscipline(row, today));
  }

  /** Ganadores de competencias que terminaron en los últimos 30 días (visible para todo el club). */
  async recentResults(clubId: number) {
    const today = asDateOnly(new Date());
    const cutoff = new Date(`${today}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - RESULTS_WINDOW_DAYS);
    const rows = await this.editions.find({
      where: { clubId, endsOn: Between(asDateOnly(cutoff), today) },
      relations: { discipline: true, registrations: { member: true } },
      order: { endsOn: 'DESC' },
    });
    return rows
      .map((edition) => ({
        id: edition.id,
        disciplineName: edition.discipline?.name ?? '',
        title: edition.title,
        venue: edition.venue ?? '',
        startsOn: edition.startsOn,
        endsOn: edition.endsOn,
        ranking: buildRanking(edition.registrations ?? []).map(({ registrationId: _id, ...row }) => row),
      }))
      .filter((row) => row.ranking.length > 0);
  }

  async openForMembers(clubId: number, actor: AppUser) {
    await this.expireAllPending(clubId);
    const memberId = await this.memberIdForActor(clubId, actor, undefined, false);
    const now = new Date();
    const today = asDateOnly(now);
    const rows = await this.editions.find({
      where: { clubId },
      relations: { discipline: true, registrations: true },
      order: { startsOn: 'ASC' },
    });
    return rows
      .filter(
        (edition) =>
          !edition.closedAt &&
          edition.registrationOpens <= now &&
          edition.registrationCloses >= now &&
          editionStatus(edition, today) !== 'closed',
      )
      .map((edition) => {
        const mine = (edition.registrations ?? []).find(
          (row) => row.memberId === memberId && row.status !== 'cancelled',
        );
        return {
          id: edition.id,
          disciplineName: edition.discipline?.name ?? '',
          title: edition.title,
          startsOn: edition.startsOn,
          endsOn: edition.endsOn,
          entryFee: Number(edition.entryFee),
          maxParticipants: edition.maxParticipants,
          paymentDeadline: edition.paymentDeadline.toISOString(),
          confirmedCount: (edition.registrations ?? []).filter((r) => r.status === 'confirmed').length,
          pendingCount: (edition.registrations ?? []).filter((r) => r.status === 'pre_registered').length,
          myRegistration: mine
            ? { id: mine.id, status: mine.status, preRegisteredAt: mine.preRegisteredAt.toISOString() }
            : null,
        };
      });
  }

  async createDiscipline(clubId: number, actor: AppUser, dto: CreateDisciplineDto) {
    requireWorker(actor);
    const fields = disciplineFields(dto);
    const editionDto = dto.edition;
    const created = await this.dataSource.transaction(async (manager) => {
      await this.assertUniqueDiscipline(manager, clubId, fields.name);
      const discipline = await manager.getRepository(CompetitionDiscipline).save(
        manager.getRepository(CompetitionDiscipline).create({
          clubId,
          ...fields,
          createdByUserId: actor.id,
        }),
      );
      const editionId = await this.insertEdition(manager, clubId, discipline, editionFields(editionDto), actor);
      return { disciplineId: discipline.id, editionId };
    });
    return this.edition(clubId, created.editionId);
  }

  async updateDiscipline(clubId: number, disciplineId: number, actor: AppUser, dto: SaveDisciplineDto) {
    requireWorker(actor);
    const fields = disciplineFields(dto);
    await this.dataSource.transaction(async (manager) => {
      const current = await this.requireDiscipline(manager, clubId, disciplineId);
      await this.assertUniqueDiscipline(manager, clubId, fields.name, current.id);
      await manager.getRepository(CompetitionDiscipline).update({ id: current.id, clubId }, fields);
      for (const edition of current.editions ?? []) {
        await this.syncEvent(manager, edition, fields.name, actor);
      }
    });
    return this.listDiscipline(clubId, disciplineId);
  }

  async removeDiscipline(clubId: number, disciplineId: number, actor: AppUser) {
    requireWorker(actor);
    await this.requireDiscipline(this.dataSource.manager, clubId, disciplineId);
    await this.disciplines.delete({ id: disciplineId, clubId });
  }

  async createEdition(clubId: number, actor: AppUser, dto: CreateEditionDto) {
    requireWorker(actor);
    const fields = editionFields(dto);
    const editionId = await this.dataSource.transaction(async (manager) => {
      const discipline = await this.requireDiscipline(manager, clubId, dto.disciplineId);
      return this.insertEdition(manager, clubId, discipline, fields, actor);
    });
    return this.edition(clubId, editionId);
  }

  async edition(clubId: number, editionId: number) {
    await this.expireEditionPending(clubId, editionId);
    const today = asDateOnly(new Date());
    const row = await this.requireEdition(this.dataSource.manager, clubId, editionId);
    return mapEditionDetail(row, row.discipline!, today);
  }

  async updateEdition(clubId: number, editionId: number, actor: AppUser, dto: SaveEditionDto) {
    requireWorker(actor);
    const fields = editionFields(dto);
    await this.dataSource.transaction(async (manager) => {
      const current = await this.requireEdition(manager, clubId, editionId);
      if (current.closedAt) {
        throw new ConflictException('Esta competencia ya está cerrada.');
      }
      const activeGuests = (current.registrations ?? []).some(
        (row) => row.participantKind === 'guest' && (row.status === 'pre_registered' || row.status === 'confirmed'),
      );
      if (!fields.isPublic && activeGuests) {
        throw new ConflictException('Hay invitados inscritos; quítalos antes de hacerla solo para socios.');
      }
      await this.saveUniqueEditionTitle(manager, current.disciplineId, fields.title, current.id);
      await manager.getRepository(CompetitionEdition).update({ id: current.id, clubId }, fields);
      const updated = await this.requireEdition(manager, clubId, editionId);
      await this.syncEvent(manager, updated, updated.discipline!.name, actor);
    });
    return this.edition(clubId, editionId);
  }

  async removeEdition(clubId: number, editionId: number, actor: AppUser) {
    requireWorker(actor);
    const current = await this.requireEdition(this.dataSource.manager, clubId, editionId);
    if ((current.registrations ?? []).some((row) => row.status === 'confirmed')) {
      throw new ConflictException('No se puede quitar una competencia con participantes confirmados.');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(ClubEvent).delete({ clubId, competitionEditionId: current.id });
      await manager.getRepository(CompetitionEdition).delete({ id: current.id, clubId });
    });
  }

  async preRegister(clubId: number, editionId: number, actor: AppUser, dto: PreRegisterDto) {
    const memberId = await this.memberIdForActor(clubId, actor, dto.memberId, actor.role !== 'socio');
    await this.expireEditionPending(clubId, editionId);
    await this.dataSource.transaction(async (manager) => {
      const edition = await this.requireEdition(manager, clubId, editionId, true);
      if (actor.role === 'socio') {
        assertRegistrationWindow(edition);
      }
      if (edition.closedAt) {
        throw new ConflictException('Esta competencia ya no acepta inscripciones.');
      }
      const repo = manager.getRepository(CompetitionRegistration);
      const active = (edition.registrations ?? []).find(
        (row) =>
          row.memberId === memberId && (row.status === 'pre_registered' || row.status === 'confirmed'),
      );
      if (active) {
        throw new ConflictException('Este socio ya tiene una inscripción activa.');
      }
      await repo.save(
        repo.create({
          clubId,
          editionId,
          participantKind: 'member',
          memberId,
          status: 'pre_registered',
          preRegisteredAt: new Date(),
        }),
      );
    });
    return this.edition(clubId, editionId);
  }

  async registerGuest(clubId: number, editionId: number, actor: AppUser, dto: RegisterGuestDto) {
    requireWorker(actor);
    const guestName = dto.guestName.trim();
    if (!guestName) {
      throw new BadRequestException('Escribe el nombre del invitado.');
    }
    await this.expireEditionPending(clubId, editionId);
    await this.dataSource.transaction(async (manager) => {
      const edition = await this.requireEdition(manager, clubId, editionId, true);
      if (edition.closedAt) {
        throw new ConflictException('Esta competencia ya no acepta inscripciones.');
      }
      if (!edition.isPublic) {
        throw new ConflictException('Esta competencia es solo para socios; no admite invitados.');
      }
      await manager.getRepository(CompetitionRegistration).save(
        manager.getRepository(CompetitionRegistration).create({
          clubId,
          editionId,
          participantKind: 'guest',
          guestName,
          guestPhone: (dto.guestPhone ?? '').trim() || null,
          status: 'pre_registered',
          preRegisteredAt: new Date(),
        }),
      );
    });
    return this.edition(clubId, editionId);
  }

  async confirmRegistration(clubId: number, editionId: number, registrationId: number, actor: AppUser) {
    requireWorker(actor);
    await this.expireEditionPending(clubId, editionId);
    await this.dataSource.transaction(async (manager) => {
      const edition = await this.requireEdition(manager, clubId, editionId, true);
      if (edition.closedAt) {
        throw new ConflictException('Esta competencia ya está cerrada.');
      }
      const confirmedCount = (edition.registrations ?? []).filter((r) => r.status === 'confirmed').length;
      if (edition.maxParticipants !== null && confirmedCount >= edition.maxParticipants) {
        throw new ConflictException('Ya se confirmaron todos los lugares disponibles.');
      }
      const repo = manager.getRepository(CompetitionRegistration);
      const row = await repo.findOne({ where: { id: registrationId, clubId, editionId } });
      if (!row) {
        throw new NotFoundException('No se encontró la inscripción.');
      }
      if (row.status !== 'pre_registered') {
        throw new ConflictException('Solo se confirman preinscripciones pendientes.');
      }
      await repo.update(
        { id: row.id },
        {
          status: 'confirmed',
          confirmedAt: new Date(),
          confirmedByUserId: actor.id,
        },
      );
    });
    const detail = await this.edition(clubId, editionId);
    const confirmed = detail.registrations.find((row) => row.id === registrationId);
    const participant = confirmed?.member?.name ?? confirmed?.guestName ?? null;
    await this.notifications.record({
      clubId,
      kind: 'competition_confirmed',
      category: 'confirmation',
      title: 'Lugar confirmado en competencia',
      detail: [participant, detail.label, `${detail.confirmedCount} confirmados.`].filter(Boolean).join(' · '),
      entityType: 'competition_edition',
      entityId: String(editionId),
      actorUserId: actor.id,
      actorLabel: actorName(actor),
      dedupeKey: `competition-confirmed:${registrationId}`,
    });
    return detail;
  }

  async cancelRegistration(clubId: number, editionId: number, registrationId: number, actor: AppUser) {
    const row = await this.dataSource.manager.getRepository(CompetitionRegistration).findOne({
      where: { id: registrationId, clubId, editionId },
    });
    if (!row) {
      throw new NotFoundException('No se encontró la inscripción.');
    }
    if (actor.role === 'socio') {
      const memberId = await this.memberIdForActor(clubId, actor, undefined, false);
      if (row.memberId !== memberId || row.status !== 'pre_registered') {
        throw new ForbiddenException('Solo puedes cancelar tu preinscripción pendiente.');
      }
    } else {
      requireWorker(actor);
      if (row.status !== 'pre_registered' && row.status !== 'confirmed') {
        throw new ConflictException('Esta inscripción ya no está activa.');
      }
      if (row.rank !== null) {
        throw new ConflictException('No se puede quitar a un participante con lugar en el ranking.');
      }
    }
    await this.dataSource.manager.getRepository(CompetitionRegistration).update(
      { id: row.id },
      { status: 'cancelled' },
    );
    const detail = await this.edition(clubId, editionId);
    if (actor.role !== 'socio' && row.participantKind === 'member') {
      await this.notifications.record({
        clubId,
        kind: 'competition_cancelled',
        category: 'reversal',
        title: 'Inscripción cancelada en competencia',
        detail: [
          detail.registrations.find((item) => item.id === row.id)?.member?.name ?? null,
          detail.label,
        ]
          .filter(Boolean)
          .join(' · '),
        entityType: 'competition_edition',
        entityId: String(editionId),
        actorUserId: actor.id,
        actorLabel: actorName(actor),
        dedupeKey: `competition-cancelled:${row.id}`,
      });
    }
    return detail;
  }

  async saveScore(clubId: number, editionId: number, registrationId: number, actor: AppUser, dto: SaveScoreDto) {
    requireWorker(actor);
    const row = await this.dataSource.manager.getRepository(CompetitionRegistration).findOne({
      where: { id: registrationId, clubId, editionId, status: 'confirmed' as const },
    });
    if (!row) {
      throw new NotFoundException('Solo participantes confirmados pueden tener puntuación.');
    }
    await this.dataSource.manager.getRepository(CompetitionRegistration).update(
      { id: row.id },
      { score: dto.score.toFixed(2) },
    );
    return this.edition(clubId, editionId);
  }

  async closeEdition(clubId: number, editionId: number, actor: AppUser) {
    requireWorker(actor);
    await this.expireEditionPending(clubId, editionId);
    const today = asDateOnly(new Date());
    await this.dataSource.transaction(async (manager) => {
      const edition = await this.requireEdition(manager, clubId, editionId, true);
      assertEditionCalendarEnded(edition, today);
      assertEditionHasNoPublishedRanking(edition.registrations ?? []);
      const repo = manager.getRepository(CompetitionRegistration);
      const confirmed = (edition.registrations ?? []).filter((r) => r.status === 'confirmed');
      const ranked = confirmed
        .filter((r) => r.score !== null)
        .sort((a, b) => Number(b.score) - Number(a.score));
      if (!ranked.length) {
        throw new ConflictException('Captura puntuaciones o asigna ganadores antes de publicar.');
      }
      let place = 1;
      for (const row of ranked) {
        await repo.update({ id: row.id }, { rank: place });
        place += 1;
      }
      await finalizeEdition(manager, edition.id, clubId);
    });
    return this.edition(clubId, editionId);
  }

  async publishWinners(clubId: number, editionId: number, actor: AppUser, dto: PublishWinnersDto) {
    requireWorker(actor);
    const today = asDateOnly(new Date());
    await this.dataSource.transaction(async (manager) => {
      const edition = await this.requireEdition(manager, clubId, editionId, true);
      assertEditionCalendarEnded(edition, today);
      const repo = manager.getRepository(CompetitionRegistration);
      const usedRegistrationIds = new Set<number>();
      await repo.update({ clubId, editionId }, { rank: null, score: null });
      let place = 1;
      for (const winner of dto.places) {
        const row = (edition.registrations ?? []).find(
          (item) => item.id === winner.registrationId && item.status === 'confirmed',
        );
        if (!row) {
          throw new BadRequestException('El ranking solo admite participantes confirmados.');
        }
        if (usedRegistrationIds.has(row.id)) {
          throw new BadRequestException('No repitas participantes en el ranking.');
        }
        usedRegistrationIds.add(row.id);
        await repo.update(
          { id: row.id },
          {
            rank: place,
            score: winner.score !== undefined && winner.score !== null ? winner.score.toFixed(2) : null,
          },
        );
        place += 1;
      }
      await finalizeEdition(manager, edition.id, clubId);
    });
    return this.edition(clubId, editionId);
  }

  private async listDiscipline(clubId: number, disciplineId: number) {
    const today = asDateOnly(new Date());
    const row = await this.disciplines.findOneOrFail({
      where: { id: disciplineId, clubId },
      relations: { editions: { registrations: { member: true, confirmedBy: true } } },
    });
    return mapDiscipline(row, today);
  }

  private async insertEdition(
    manager: EntityManager,
    clubId: number,
    discipline: CompetitionDiscipline,
    fields: ReturnType<typeof editionFields>,
    actor: AppUser,
  ) {
    await this.saveUniqueEditionTitle(manager, discipline.id, fields.title);
    const repo = manager.getRepository(CompetitionEdition);
    const saved = await repo.save(
      repo.create({
        clubId,
        disciplineId: discipline.id,
        ...fields,
        createdByUserId: actor.id,
      }),
    );
    await this.syncEvent(manager, saved, discipline.name, actor);
    return saved.id;
  }

  private async syncEvent(
    manager: EntityManager,
    edition: CompetitionEdition,
    disciplineName: string,
    actor: AppUser,
  ) {
    const repo = manager.getRepository(ClubEvent);
    const startsOn = asDate(edition.startsOn);
    const endsOn = asDate(edition.endsOn);
    const allDay = edition.startTime === null;
    /** El calendario exige hora de fin > hora de inicio; en eventos de varios días puede no cumplirse. */
    const endTime =
      allDay || !edition.endTime || edition.endTime.slice(0, 5) <= edition.startTime!.slice(0, 5)
        ? null
        : edition.endTime;
    const fields = {
      title: `${disciplineName} — ${edition.title}`,
      description:
        edition.notes ||
        [edition.venue?.trim(), `Competencia de ${disciplineName}.`].filter(Boolean).join(' · '),
      visibility: 'public' as const,
      category: 'competition' as const,
      startsOn,
      endsOn: endsOn > startsOn ? endsOn : null,
      startTime: allDay ? null : edition.startTime,
      endTime,
      recurrence: 'none' as const,
      repeatUntil: null,
    };
    const existing = await repo.findOne({ where: { clubId: edition.clubId, competitionEditionId: edition.id } });
    if (existing) {
      await repo.update({ id: existing.id }, { ...fields, removedAt: null, removedByUserId: null });
      return;
    }
    await repo.save(
      repo.create({
        clubId: edition.clubId,
        competitionEditionId: edition.id,
        ...fields,
        createdByUserId: actor.id,
      }),
    );
  }

  private async expireAllPending(clubId: number) {
    const now = new Date();
    const overdue = await this.editions.find({
      where: { clubId },
      select: { id: true, paymentDeadline: true },
    });
    const ids = overdue.filter((row) => row.paymentDeadline < now).map((row) => row.id);
    if (!ids.length) {
      return;
    }
    await this.dataSource.manager
      .createQueryBuilder()
      .update(CompetitionRegistration)
      .set({ status: 'expired' })
      .where('club_id = :clubId', { clubId })
      .andWhere("status = 'pre_registered'")
      .andWhere('edition_id IN (:...ids)', { ids })
      .execute();
  }

  private async expireEditionPending(clubId: number, editionId: number) {
    const edition = await this.editions.findOne({ where: { id: editionId, clubId } });
    if (!edition || edition.paymentDeadline >= new Date()) {
      return;
    }
    await this.dataSource.manager.getRepository(CompetitionRegistration).update(
      { clubId, editionId, status: 'pre_registered' },
      { status: 'expired' },
    );
  }

  private async memberIdForActor(clubId: number, actor: AppUser, memberId: number | undefined, allowStaffPick: boolean) {
    if (actor.role === 'socio') {
      const row = await this.members.findOne({ where: { clubId, userId: actor.id } });
      if (!row) {
        throw new ForbiddenException('Tu cuenta no está vinculada a un socio.');
      }
      return row.id;
    }
    if (!allowStaffPick && !WORKER_ROLES.has(actor.role)) {
      throw new ForbiddenException('No tienes permiso para inscribir participantes.');
    }
    requireWorker(actor);
    if (!memberId) {
      throw new BadRequestException('Indica el socio.');
    }
    const row = await this.members.findOne({ where: { id: memberId, clubId }, select: ['id'] });
    if (!row) {
      throw new NotFoundException('No se encontró al socio.');
    }
    return row.id;
  }

  private async requireDiscipline(manager: EntityManager, clubId: number, disciplineId: number) {
    const row = await manager.getRepository(CompetitionDiscipline).findOne({
      where: { id: disciplineId, clubId },
      relations: { editions: true },
    });
    if (!row) {
      throw new NotFoundException('No se encontró la disciplina.');
    }
    return row;
  }

  private async requireEdition(manager: EntityManager, clubId: number, editionId: number, lock = false) {
    if (lock) {
      await manager.query(
        'SELECT id FROM fieldtrack.competition_editions WHERE id = $1 AND club_id = $2 FOR UPDATE',
        [editionId, clubId],
      );
    }
    const row = await manager.getRepository(CompetitionEdition).findOne({
      where: { id: editionId, clubId },
      relations: {
        discipline: true,
        registrations: { member: true, confirmedBy: true },
      },
    });
    if (!row) {
      throw new NotFoundException('No se encontró la competencia.');
    }
    return row;
  }

  private async assertUniqueDiscipline(manager: EntityManager, clubId: number, name: string, ignoreId?: number) {
    const rows = await manager.getRepository(CompetitionDiscipline).find({ where: { clubId } });
    const wanted = name.trim().toLowerCase();
    const clash = rows.find((row) => row.id !== ignoreId && row.name.trim().toLowerCase() === wanted);
    if (clash) {
      throw new ConflictException(`Ya existe la disciplina ${clash.name}.`);
    }
  }

  private async saveUniqueEditionTitle(manager: EntityManager, disciplineId: number, title: string, ignoreId?: number) {
    const rows = await manager.getRepository(CompetitionEdition).find({ where: { disciplineId } });
    const wanted = title.trim().toLowerCase();
    const clash = rows.find((row) => row.id !== ignoreId && row.title.trim().toLowerCase() === wanted);
    if (clash) {
      throw new ConflictException(`Ya existe la edición ${clash.title}.`);
    }
  }
}

function requireWorker(actor: AppUser) {
  if (!WORKER_ROLES.has(actor.role)) {
    throw new ForbiddenException('Solo el personal del club puede gestionar competencias.');
  }
}

function disciplineFields(dto: SaveDisciplineDto) {
  const name = dto.name.trim().replace(/\s+/g, ' ');
  if (!name) {
    throw new BadRequestException('Escribe el nombre de la disciplina.');
  }
  return { name, notes: (dto.notes ?? '').trim() };
}

function editionFields(dto: SaveEditionDto) {
  const title = dto.title.trim();
  if (!title) {
    throw new BadRequestException('Escribe el nombre de la competencia.');
  }
  if (dto.endsOn < dto.startsOn) {
    throw new BadRequestException('La fecha final debe ser igual o posterior a la inicial.');
  }
  if (
    dto.endsOn === dto.startsOn &&
    dto.startTime &&
    dto.endTime &&
    dto.endTime.slice(0, 5) <= dto.startTime.slice(0, 5)
  ) {
    throw new BadRequestException('El fin del cronograma debe ser después del inicio.');
  }
  const registrationOpens = new Date(dto.registrationOpens);
  const registrationCloses = new Date(dto.registrationCloses);
  const paymentDeadline = new Date(dto.paymentDeadline);
  if (Number.isNaN(registrationOpens.getTime()) || Number.isNaN(registrationCloses.getTime()) || Number.isNaN(paymentDeadline.getTime())) {
    throw new BadRequestException('Revisa las fechas de inscripción y límite de pago.');
  }
  if (registrationCloses < registrationOpens) {
    throw new BadRequestException('El cierre de inscripciones debe ser después de la apertura.');
  }
  if (paymentDeadline < registrationOpens) {
    throw new BadRequestException('El límite de pago debe ser posterior a la apertura de inscripciones.');
  }
  const startTime = dto.startTime?.trim() || null;
  const endTime = dto.endTime?.trim() || null;
  const minimumLevel = parseMinimumLevel(dto.minimumLevel);
  return {
    title,
    venue: (dto.venue ?? '').trim(),
    startsOn: dto.startsOn,
    endsOn: dto.endsOn,
    startTime,
    endTime,
    maxParticipants: dto.maxParticipants ?? null,
    entryFee: dto.entryFee.toFixed(2),
    registrationOpens,
    registrationCloses,
    paymentDeadline,
    notes: (dto.notes ?? '').trim(),
    minimumLevel,
    isPublic: dto.isPublic ?? true,
  };
}

function parseMinimumLevel(value: SaveEditionDto['minimumLevel']) {
  if (value == null || value === 'open') {
    return null;
  }
  return value;
}

function assertRegistrationWindow(edition: CompetitionEdition) {
  const now = new Date();
  if (now < edition.registrationOpens || now > edition.registrationCloses) {
    throw new ConflictException('Las preinscripciones no están abiertas en este momento.');
  }
}

function assertEditionCalendarEnded(edition: Pick<CompetitionEdition, 'endsOn'>, today: string) {
  if (today <= edition.endsOn) {
    throw new ConflictException('Los resultados se publican cuando termina la competencia.');
  }
}

function assertEditionHasNoPublishedRanking(registrations: Pick<CompetitionRegistration, 'rank'>[]) {
  if (registrations.some((row) => row.rank != null)) {
    throw new ConflictException('Esta competencia ya tiene resultados publicados.');
  }
}

async function finalizeEdition(manager: EntityManager, editionId: number, clubId: number) {
  await manager.getRepository(CompetitionEdition).update({ id: editionId, clubId }, { closedAt: new Date() });
}
