import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { actorName } from '../requests/request.mapper';
import { AppUser } from '../users/entities/app-user.entity';
import { ListEventsQueryDto, SaveEventDto } from './dto/event.dto';
import { ClubEvent } from './entities/club-event.entity';
import { daysBetween, occurrencesBetween, recurrenceFitsDate } from './event-recurrence';

const WORKER_ROLES = new Set(['admin', 'staff']);
/** Suficiente para la vista de mes (6 semanas) y la agenda de los próximos meses. */
const MAX_RANGE_DAYS = 400;

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(ClubEvent) private readonly events: Repository<ClubEvent>,
    private readonly notifications: NotificationsService,
  ) {}

  /** Los socios solo ven eventos públicos; el personal ve también los privados. */
  async list(clubId: number, actor: AppUser, query: ListEventsQueryDto) {
    const span = daysBetween(query.from, query.to);
    if (span < 0 || span > MAX_RANGE_DAYS) {
      throw new BadRequestException(`Pide un rango de hasta ${MAX_RANGE_DAYS} días.`);
    }
    const builder = this.events
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.createdBy', 'createdBy')
      .where('event.club_id = :clubId', { clubId })
      .andWhere('event.removed_at IS NULL')
      .andWhere('event.starts_on <= :to', { to: query.to })
      .andWhere("(event.recurrence <> 'none' OR COALESCE(event.ends_on, event.starts_on) >= :from)", {
        from: query.from,
      })
      .andWhere('(event.repeat_until IS NULL OR event.repeat_until >= :from)', { from: query.from });
    if (!WORKER_ROLES.has(actor.role)) {
      builder.andWhere("event.visibility = 'public'");
    }
    const rows = await builder.getMany();
    return rows
      .flatMap((row) =>
        (row.endsOn ? [row.startsOn] : occurrencesBetween(row, query.from, query.to)).map((date) => ({
          ...mapEvent(row),
          id: `${row.id}:${date}`,
          eventId: row.id,
          date,
        })),
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          (a.startTime ?? '').localeCompare(b.startTime ?? '') ||
          a.eventId - b.eventId,
      );
  }

  async detail(clubId: number, eventId: number, actor: AppUser) {
    const row = await this.load(clubId, eventId);
    if (!WORKER_ROLES.has(actor.role) && row.visibility !== 'public') {
      throw new ForbiddenException('No puedes ver este evento.');
    }
    return mapEvent(row);
  }

  async create(clubId: number, actor: AppUser, dto: SaveEventDto) {
    requireWorker(actor);
    const fields = eventFields(dto);
    const saved = await this.events.save(
      this.events.create({ clubId, ...fields, createdByUserId: actor.id }),
    );
    await this.notify(clubId, actor, saved, {
      kind: 'event_created',
      category: 'registration',
      title: 'Evento creado',
      dedupeKey: `event-created:${saved.id}`,
    });
    return mapEvent(await this.load(clubId, saved.id));
  }

  async update(clubId: number, eventId: number, actor: AppUser, dto: SaveEventDto) {
    requireWorker(actor);
    const current = await this.load(clubId, eventId);
    requireEditable(current);
    await this.events.update({ id: current.id, clubId }, eventFields(dto));
    return mapEvent(await this.load(clubId, eventId));
  }

  async remove(clubId: number, eventId: number, actor: AppUser) {
    requireWorker(actor);
    const current = await this.load(clubId, eventId);
    requireEditable(current);
    await this.events.update(
      { id: current.id, clubId },
      { removedAt: new Date(), removedByUserId: actor.id },
    );
    await this.notify(clubId, actor, current, {
      kind: 'event_removed',
      category: 'update',
      title: 'Evento removido',
      dedupeKey: `event-removed:${current.id}`,
    });
  }

  private async load(clubId: number, eventId: number) {
    const row = await this.events.findOne({
      where: { id: eventId, clubId, removedAt: IsNull() },
      relations: { createdBy: true },
    });
    if (!row) {
      throw new NotFoundException('No se encontró el evento.');
    }
    return row;
  }

  private notify(
    clubId: number,
    actor: AppUser,
    event: ClubEvent,
    draft: { kind: string; category: 'registration' | 'update'; title: string; dedupeKey: string },
  ) {
    const repeats = event.recurrence !== 'none' ? ' · se repite' : '';
    const time = event.startTime ? event.startTime.slice(0, 5) : 'todo el día';
    return this.notifications.record({
      clubId,
      kind: draft.kind,
      category: draft.category,
      title: draft.title,
      detail: `${event.title} · ${formatDay(event.startsOn)}, ${time}${repeats}.`,
      entityType: 'club_event',
      entityId: String(event.id),
      actorUserId: actor.id,
      actorLabel: actorName(actor),
      dedupeKey: draft.dedupeKey,
    });
  }
}

function eventFields(dto: SaveEventDto) {
  const title = dto.title.trim();
  if (!title) {
    throw new BadRequestException('El título es obligatorio.');
  }
  const startTime = dto.allDay ? null : (dto.startTime ?? null);
  const endTime = startTime ? dto.endTime || null : null;
  if (!dto.allDay && !startTime) {
    throw new BadRequestException('Elige la hora del evento o márcalo como de todo el día.');
  }
  if (startTime && endTime && endTime <= startTime) {
    throw new BadRequestException('La hora de término debe ser después de la de inicio.');
  }
  if (!recurrenceFitsDate(dto.recurrence, dto.startsOn)) {
    throw new BadRequestException('La forma de repetir no corresponde con la fecha elegida.');
  }
  const repeatUntil = dto.recurrence === 'none' ? null : dto.repeatUntil || null;
  if (repeatUntil && repeatUntil < dto.startsOn) {
    throw new BadRequestException('La fecha de fin debe ser igual o posterior a la del evento.');
  }
  return {
    title,
    description: (dto.description ?? '').trim(),
    visibility: dto.visibility,
    category: dto.category,
    startsOn: dto.startsOn,
    startTime,
    endTime,
    recurrence: dto.recurrence,
    repeatUntil,
  };
}

function mapEvent(row: ClubEvent) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    category: row.category,
    startsOn: row.startsOn,
    allDay: row.startTime === null,
    startTime: row.startTime ? row.startTime.slice(0, 5) : null,
    endTime: row.endTime ? row.endTime.slice(0, 5) : null,
    recurrence: row.recurrence,
    repeatUntil: row.repeatUntil,
    endsOn: row.endsOn,
    huntingSeasonId: row.huntingSeasonId,
    competitionEditionId: row.competitionEditionId,
    createdBy: row.createdBy
      ? { id: row.createdBy.id, name: actorName(row.createdBy), role: row.createdBy.role }
      : null,
  };
}

function requireWorker(actor: AppUser) {
  if (!WORKER_ROLES.has(actor.role)) {
    throw new ForbiddenException('Solo el personal del club puede gestionar el calendario.');
  }
}

function requireEditable(event: ClubEvent) {
  if (event.huntingSeasonId !== null) {
    throw new ConflictException('Esta temporada de caza se edita desde Cinegética.');
  }
  if (event.competitionEditionId !== null) {
    throw new ConflictException('Esta competencia se edita desde Torneos y competencias.');
  }
}

function formatDay(value: string): string {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
