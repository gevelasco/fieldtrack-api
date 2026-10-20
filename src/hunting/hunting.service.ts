import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Club } from '../clubs/entities/club.entity';
import { ClubEvent } from '../events/entities/club-event.entity';
import { Member } from '../members/entities/member.entity';
import { asDate, formatPesos, mapMember, memberDisplayName } from '../members/member.mapper';
import { loadMemberById, membersByIds, searchMemberIds, searchTerms } from '../members/members.queries';
import { isUniqueViolation, NotificationsService } from '../notifications/notifications.service';
import { actorName } from '../requests/request.mapper';
import { AppUser } from '../users/entities/app-user.entity';
import { CreateSeasonDto, CreateSpeciesDto, SaveSeasonDto, SaveSpeciesDto, SellTagDto } from './dto/hunting.dto';
import { HuntingSeason } from './entities/hunting-season.entity';
import { HuntingSpecies } from './entities/hunting-species.entity';
import { HuntingTagSale } from './entities/hunting-tag-sale.entity';
import { activeSales, mapSeasonDetail, mapSpecies, normalizeName, seasonStatus } from './hunting.mapper';

const WORKER_ROLES = new Set(['admin', 'staff']);

@Injectable()
export class HuntingService {
  constructor(
    @InjectRepository(HuntingSpecies) private readonly species: Repository<HuntingSpecies>,
    @InjectRepository(HuntingSeason) private readonly seasons: Repository<HuntingSeason>,
    @InjectRepository(Member) private readonly members: Repository<Member>,
    @InjectRepository(Club) private readonly clubs: Repository<Club>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  async list(clubId: number) {
    const rows = await this.species.find({
      where: { clubId },
      relations: { seasons: { sales: true } },
      order: { name: 'ASC' },
    });
    const today = asDate(new Date());
    return rows.map((row) => mapSpecies(row, today));
  }

  /** Registra la especie junto con su temporada actual (aunque ya haya pasado) en una sola operación. */
  async createSpecies(clubId: number, actor: AppUser, dto: CreateSpeciesDto) {
    requireWorker(actor);
    const fields = speciesFields(dto);
    const seasonData = seasonFields(dto.season);
    const created = await this.dataSource.transaction(async (manager) => {
      await this.assertUniqueName(manager, clubId, fields.name);
      const repo = manager.getRepository(HuntingSpecies);
      const species = await this.saveUnique(
        () => repo.save(repo.create({ clubId, ...fields, createdByUserId: actor.id })),
        `Ya existe la especie ${fields.name}.`,
      );
      const seasonId = await this.insertSeason(manager, { ...species, seasons: [] }, seasonData, actor);
      return { speciesId: species.id, seasonId };
    });
    await this.recordSeasonCreated(clubId, created.seasonId, actor);
    const row = await this.species.findOneOrFail({
      where: { id: created.speciesId, clubId },
      relations: { seasons: { sales: true } },
    });
    return mapSpecies(row, asDate(new Date()));
  }

  async updateSpecies(clubId: number, speciesId: number, actor: AppUser, dto: SaveSpeciesDto) {
    requireWorker(actor);
    const fields = speciesFields(dto);
    await this.dataSource.transaction(async (manager) => {
      const current = await this.requireSpecies(manager, clubId, speciesId);
      await this.assertUniqueName(manager, clubId, fields.name, current.id);
      await this.saveUnique(
        () => manager.getRepository(HuntingSpecies).update({ id: current.id, clubId }, fields),
        `Ya existe la especie ${fields.name}.`,
      );
      for (const season of current.seasons ?? []) {
        const label = renamedLabel(season.label, current.name, fields.name);
        if (label !== season.label) {
          await manager.getRepository(HuntingSeason).update({ id: season.id, clubId }, { label });
        }
        await this.syncEvent(manager, { ...season, label, species: { ...current, ...fields } }, actor);
      }
    });
    const row = await this.species.findOneOrFail({
      where: { id: speciesId, clubId },
      relations: { seasons: { sales: true } },
    });
    return mapSpecies(row, asDate(new Date()));
  }

  async removeSpecies(clubId: number, speciesId: number, actor: AppUser) {
    requireWorker(actor);
    await this.requireSpecies(this.dataSource.manager, clubId, speciesId);
    await this.species.delete({ id: speciesId, clubId });
  }

  async season(clubId: number, seasonId: number) {
    const season = await this.requireSeason(this.dataSource.manager, clubId, seasonId);
    return mapSeasonDetail(season, season.species, asDate(new Date()));
  }

  async createSeason(clubId: number, actor: AppUser, dto: CreateSeasonDto) {
    requireWorker(actor);
    const fields = seasonFields(dto);
    const seasonId = await this.dataSource.transaction(async (manager) => {
      const species = await this.requireSpecies(manager, clubId, dto.speciesId);
      return this.insertSeason(manager, species, fields, actor);
    });
    return this.recordSeasonCreated(clubId, seasonId, actor);
  }

  async updateSeason(clubId: number, seasonId: number, actor: AppUser, dto: SaveSeasonDto) {
    requireWorker(actor);
    const fields = seasonFields(dto);
    await this.dataSource.transaction(async (manager) => {
      const current = await this.requireSeason(manager, clubId, seasonId);
      const species = await this.requireSpecies(manager, clubId, current.speciesId);
      assertNoOverlap(species, fields, current.id);
      const sold = activeSales(current);
      if (fields.tagCount < sold.length) {
        throw new ConflictException(
          `Ya se vendieron ${sold.length} cintillos; la temporada no puede tener menos.`,
        );
      }
      await this.saveUnique(
        () => manager.getRepository(HuntingSeason).update({ id: current.id, clubId }, fields),
        `Ya existe la temporada ${fields.label}.`,
      );
      await this.syncEvent(manager, { ...current, ...fields, species }, actor);
    });
    return this.season(clubId, seasonId);
  }

  async removeSeason(clubId: number, seasonId: number, actor: AppUser) {
    requireWorker(actor);
    const current = await this.requireSeason(this.dataSource.manager, clubId, seasonId);
    if ((current.sales ?? []).length > 0) {
      throw new ConflictException('No se puede quitar una temporada que ya tiene cintillos vendidos.');
    }
    await this.seasons.delete({ id: current.id, clubId });
  }

  /** Socios de cacería vigentes que coinciden con la búsqueda (mínimo 3 caracteres). */
  async searchEligibleMembers(clubId: number, raw?: string) {
    const club = await this.requireClub(clubId);
    const terms = searchTerms(raw);
    const compact = terms.join('');
    if (compact.length < 3) {
      return [];
    }
    const { ids } = await searchMemberIds(this.dataSource.manager, {
      clubId,
      membership: 'caza',
      terms,
      page: 1,
      pageSize: 12,
    });
    if (ids.length === 0) {
      return [];
    }
    const rows = await membersByIds(this.members, clubId, ids);
    return rows
      .map((row) => mapMember(row, club))
      .filter((member) => member.status === 'vigente')
      .map((member) => ({
        id: member.id,
        memberNumber: member.memberNumber,
        name: memberDisplayName(member),
      }));
  }

  async sellTag(clubId: number, seasonId: number, actor: AppUser, dto: SellTagDto) {
    requireWorker(actor);
    const folio = dto.folio.trim();
    if (!folio) {
      throw new BadRequestException('Escribe el folio del cintillo.');
    }
    const today = asDate(new Date());
    if (dto.paidOn > today) {
      throw new BadRequestException('La fecha de pago no puede ser futura.');
    }
    const buyer = await this.requireEligibleBuyer(clubId, dto.memberId);
    const sale = await this.dataSource.transaction(async (manager) => {
      const season = await this.requireSeason(manager, clubId, seasonId, true);
      if (seasonStatus(season, today) === 'closed') {
        throw new ConflictException('La temporada ya terminó; solo queda como registro.');
      }
      const sold = activeSales(season);
      if (sold.length >= season.tagCount) {
        throw new ConflictException('Ya no quedan cintillos disponibles en esta temporada.');
      }
      if (sold.some((item) => item.folio === folio)) {
        throw new ConflictException(`El folio ${folio} ya está asignado.`);
      }
      const saved = await this.saveUnique(
        () =>
          manager.getRepository(HuntingTagSale).save(
            manager.getRepository(HuntingTagSale).create({
              clubId,
              seasonId: season.id,
              memberId: buyer.id,
              folio,
              paidOn: dto.paidOn,
              amount: Number(season.tagPrice).toFixed(2),
              recordedByUserId: actor.id,
            }),
          ),
        `El folio ${folio} ya está asignado.`,
      );
      return { id: saved.id, season, amount: Number(season.tagPrice) };
    });
    await this.notifications.record({
      clubId,
      kind: 'hunting_tag_sold',
      category: 'confirmation',
      title: 'Cintillo asignado',
      detail: `Cintillo ${folio} de ${sale.season.label} para ${buyer.name} · ${formatPesos(sale.amount)}.`,
      entityType: 'hunting_tag_sale',
      entityId: String(sale.id),
      actorUserId: actor.id,
      actorLabel: actorName(actor),
      occurredAt: new Date(`${dto.paidOn}T12:00:00.000Z`),
      dedupeKey: `hunting-tag:${sale.id}`,
    });
    return this.season(clubId, seasonId);
  }

  async revertSale(clubId: number, seasonId: number, saleId: number, actor: AppUser) {
    if (actor.role !== 'admin') {
      throw new ForbiddenException('Solo un administrador puede revertir la venta de un cintillo.');
    }
    const reverted = await this.dataSource.transaction(async (manager) => {
      const season = await this.requireSeason(manager, clubId, seasonId, true);
      const sale = (season.sales ?? []).find((item) => item.id === saleId);
      if (!sale) {
        throw new NotFoundException('No se encontró la venta.');
      }
      if (sale.revertedAt) {
        throw new ConflictException('Esta venta ya fue revertida.');
      }
      if (seasonStatus(season, asDate(new Date())) === 'closed') {
        throw new ConflictException('La temporada ya terminó; sus ventas ya no se pueden revertir.');
      }
      await manager
        .getRepository(HuntingTagSale)
        .update({ id: sale.id, clubId }, { revertedAt: new Date(), revertedByUserId: actor.id });
      return { sale, season };
    });
    await this.notifications.record({
      clubId,
      kind: 'hunting_tag_reverted',
      category: 'reversal',
      title: 'Venta de cintillo revertida',
      detail: `Cintillo ${reverted.sale.folio} de ${reverted.season.label}${
        reverted.sale.member ? ` de ${memberDisplayName(reverted.sale.member)}` : ''
      }.`,
      entityType: 'hunting_tag_sale',
      entityId: String(saleId),
      actorUserId: actor.id,
      actorLabel: actorName(actor),
      dedupeKey: `hunting-tag-reverted:${saleId}`,
    });
    return this.season(clubId, seasonId);
  }

  /** La temporada aparece en el calendario como un evento público de todo el día que cubre sus fechas. */
  private async syncEvent(
    manager: EntityManager,
    season: Pick<HuntingSeason, 'id' | 'clubId' | 'label' | 'startsOn' | 'endsOn'> & {
      species: Pick<HuntingSpecies, 'name'>;
    },
    actor: AppUser,
  ) {
    const repo = manager.getRepository(ClubEvent);
    const startsOn = asDate(season.startsOn);
    const endsOn = asDate(season.endsOn);
    const fields = {
      title: `Temporada ${season.label}`,
      description: `Temporada de caza de ${season.species.name}. Los cintillos se adquieren con el club.`,
      visibility: 'public' as const,
      category: 'hunting_season' as const,
      startsOn,
      endsOn: endsOn > startsOn ? endsOn : null,
      startTime: null,
      endTime: null,
      recurrence: 'none' as const,
      repeatUntil: null,
    };
    const existing = await repo.findOne({ where: { clubId: season.clubId, huntingSeasonId: season.id } });
    if (existing) {
      await repo.update({ id: existing.id }, { ...fields, removedAt: null, removedByUserId: null });
      return;
    }
    await repo.save(
      repo.create({ clubId: season.clubId, huntingSeasonId: season.id, ...fields, createdByUserId: actor.id }),
    );
  }

  private async insertSeason(
    manager: EntityManager,
    species: HuntingSpecies,
    fields: ReturnType<typeof seasonFields>,
    actor: AppUser,
  ): Promise<number> {
    assertNoOverlap(species, fields);
    const repo = manager.getRepository(HuntingSeason);
    const saved = await this.saveUnique(
      () => repo.save(repo.create({ clubId: species.clubId, speciesId: species.id, ...fields, createdByUserId: actor.id })),
      `Ya existe la temporada ${fields.label}.`,
    );
    await this.syncEvent(manager, { ...saved, species }, actor);
    return saved.id;
  }

  private async recordSeasonCreated(clubId: number, seasonId: number, actor: AppUser) {
    const detail = await this.season(clubId, seasonId);
    await this.notifications.record({
      clubId,
      kind: 'hunting_season_created',
      category: 'registration',
      title: 'Temporada de caza registrada',
      detail: `${detail.label} · ${detail.tagCount} cintillos de ${formatPesos(detail.tagPrice)}.`,
      entityType: 'hunting_season',
      entityId: String(seasonId),
      actorUserId: actor.id,
      actorLabel: actorName(actor),
      dedupeKey: `hunting-season-created:${seasonId}`,
    });
    return detail;
  }

  /** El índice único solo ignora mayúsculas; aquí también se ignoran acentos («Jabalí» = «jabali»). */
  private async assertUniqueName(manager: EntityManager, clubId: number, name: string, ignoreId?: number) {
    const rows = await manager.getRepository(HuntingSpecies).find({ where: { clubId }, select: { id: true, name: true } });
    const wanted = normalizeName(name);
    const clash = rows.find((row) => row.id !== ignoreId && normalizeName(row.name) === wanted);
    if (clash) {
      throw new ConflictException(`Ya existe la especie ${clash.name}.`);
    }
  }

  private async saveUnique<T>(save: () => Promise<T>, message: string): Promise<T> {
    try {
      return await save();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(message);
      }
      throw error;
    }
  }

  private async requireEligibleBuyer(clubId: number, memberId: number) {
    const club = await this.requireClub(clubId);
    const row = await loadMemberById(this.members, clubId, memberId, 'list');
    if (!row) {
      throw new ConflictException('No se encontró al socio.');
    }
    const member = mapMember(row, club);
    if (member.membership !== 'caza' || member.status !== 'vigente') {
      throw new ConflictException('Solo se pueden asignar cintillos a socios de cacería con la membresía vigente.');
    }
    return {
      id: member.id,
      memberNumber: member.memberNumber,
      name: memberDisplayName(member),
    };
  }

  private async requireClub(clubId: number): Promise<Club> {
    const club = await this.clubs.findOne({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('No se encontró el club.');
    }
    return club;
  }

  private async requireSpecies(manager: EntityManager, clubId: number, speciesId: number) {
    const row = await manager.getRepository(HuntingSpecies).findOne({
      where: { id: speciesId, clubId },
      relations: { seasons: true },
    });
    if (!row) {
      throw new NotFoundException('No se encontró la especie.');
    }
    return row;
  }

  /** Con `lock`, bloquea la temporada para que dos ventas simultáneas no rebasen los cintillos. */
  private async requireSeason(manager: EntityManager, clubId: number, seasonId: number, lock = false) {
    if (lock) {
      await manager.query(
        'SELECT id FROM fieldtrack.hunting_seasons WHERE id = $1 AND club_id = $2 FOR UPDATE',
        [seasonId, clubId],
      );
    }
    const row = await manager.getRepository(HuntingSeason).findOne({
      where: { id: seasonId, clubId },
      relations: {
        species: true,
        sales: { member: true, recordedBy: true, revertedBy: true },
      },
    });
    if (!row) {
      throw new NotFoundException('No se encontró la temporada.');
    }
    return row;
  }
}

function requireWorker(actor: AppUser) {
  if (!WORKER_ROLES.has(actor.role)) {
    throw new ForbiddenException('Solo el personal del club puede gestionar la cinegética.');
  }
}

function speciesFields(dto: SaveSpeciesDto) {
  const name = dto.name.trim().replace(/\s+/g, ' ');
  if (!name) {
    throw new BadRequestException('Escribe el nombre de la especie.');
  }
  return { name, scientificName: (dto.scientificName ?? '').trim(), icon: dto.icon };
}

/** Si la temporada lleva el nombre anterior de la especie al inicio, lo cambia por el nuevo. */
function renamedLabel(label: string, previous: string, next: string): string {
  if (previous === next || !label.toLowerCase().startsWith(previous.toLowerCase())) {
    return label;
  }
  return `${next}${label.slice(previous.length)}`;
}

function seasonFields(dto: SaveSeasonDto) {
  const label = dto.label.trim();
  if (!label) {
    throw new BadRequestException('Escribe el nombre de la temporada.');
  }
  if (dto.endsOn < dto.startsOn) {
    throw new BadRequestException('La temporada debe cerrar el mismo día o después de que abre.');
  }
  return {
    label,
    startsOn: dto.startsOn,
    endsOn: dto.endsOn,
    tagCount: dto.tagCount,
    tagPrice: dto.tagPrice.toFixed(2),
    notes: (dto.notes ?? '').trim(),
    firstFolio: dto.firstFolio?.trim() || null,
  };
}

function assertNoOverlap(
  species: HuntingSpecies,
  fields: { startsOn: string; endsOn: string },
  ignoreId?: number,
) {
  const clash = (species.seasons ?? []).find(
    (season) =>
      season.id !== ignoreId &&
      asDate(season.startsOn) <= fields.endsOn &&
      asDate(season.endsOn) >= fields.startsOn,
  );
  if (clash) {
    throw new ConflictException(
      `Las fechas se cruzan con la temporada ${clash.label} de ${species.name}.`,
    );
  }
}
