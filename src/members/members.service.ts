import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { FileService } from '../common/file/file.service';
import {
  MEMBER_DOCUMENT_STORAGE_FOLDER,
  MEMBER_PETA_STORAGE_FOLDER,
  MEMBER_WEAPON_SHEET_STORAGE_FOLDER,
} from '../common/file/storage-folders';
import {
  removeStorageKey,
  resolveStoredFile,
  uploadToStorage,
} from '../common/file/stored-file.util';
import { hashPassword } from '../common/hash-password';
import { assertStaffModuleAccess } from '../clubs/staff-access';
import { Club } from '../clubs/entities/club.entity';
import { formatMemberNumber } from '../clubs/member-number';
import { isUniqueViolation, NotificationsService } from '../notifications/notifications.service';
import { AppUser } from '../users/entities/app-user.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import {
  CreateMemberDto,
  DocumentPayloadDto,
  FilePayloadDto,
  ListMembersQueryDto,
  PAGE_SIZES,
  PetaPayloadDto,
  RecordPaymentDto,
  ReplacePetasDto,
  ReplaceWeaponsDto,
  ResetMemberPasswordDto,
  UpdateMemberDto,
  WeaponPayloadDto,
} from './dto/member.dto';
import { MemberDocument } from './entities/member-document.entity';
import { MemberPeta } from './entities/member-peta.entity';
import { MemberWeapon } from './entities/member-weapon.entity';
import { Member } from './entities/member.entity';
import { MembershipPayment } from './entities/membership-payment.entity';
import {
  asDate,
  calendarFromClub,
  feeForMembership,
  formatPesos,
  mapMember,
  memberDisplayName,
} from './member.mapper';
import {
  firstPaymentDate,
  MembershipCode,
  membershipPeriod,
  pendingPeriods,
  periodCovered,
  periodLabel,
  resolveMemberStatus,
  withinPeriod,
} from './membership-status';
import {
  loadMemberById,
  loadMemberByUserId,
  memberNumbers,
  membersByIds,
  memberSummary,
  searchMemberIds,
  searchTerms,
} from './members.queries';
import { openRequestsByMember } from '../requests/request.queries';
import EnvConfig from '../types/env-config.type';

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(Member) private readonly members: Repository<Member>,
    @InjectRepository(Club) private readonly clubs: Repository<Club>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<EnvConfig>,
    private readonly files: FileService,
  ) {}

  async search(clubId: number, query: ListMembersQueryDto) {
    const club = await this.requireClub(clubId);
    const pageSize = query.pageSize ?? PAGE_SIZES[0];
    const calendar = calendarFromClub(club);
    const found = await searchMemberIds(this.dataSource.manager, {
      clubId,
      membership: query.membership,
      terms: searchTerms(query.search),
      page: query.page ?? 1,
      pageSize,
      order: query.sort
        ? {
            sort: query.sort,
            direction: query.direction ?? 'asc',
            periods: {
              'tiro-deportivo': membershipPeriod('tiro-deportivo', calendar),
              caza: membershipPeriod('caza', calendar),
            },
          }
        : undefined,
    });
    const rows = await membersByIds(this.members, clubId, found.ids, 'list');
    const requests = await openRequestsByMember(this.dataSource.manager, clubId, found.ids);
    return {
      items: rows.map((row) => mapMember(row, club, requests.get(row.id))),
      total: found.total,
      page: found.page,
      pageSize,
    };
  }

  async summary(clubId: number) {
    const club = await this.requireClub(clubId);
    const calendar = calendarFromClub(club);
    return memberSummary(this.dataSource.manager, clubId, {
      'tiro-deportivo': membershipPeriod('tiro-deportivo', calendar),
      caza: membershipPeriod('caza', calendar),
    });
  }

  numbers(clubId: number) {
    return memberNumbers(this.dataSource.manager, clubId);
  }

  async findOne(clubId: number, memberId: number) {
    const club = await this.requireClub(clubId);
    const row = await loadMemberById(this.members, clubId, memberId, 'detail');
    if (!row) {
      throw new NotFoundException('No se encontró el socio.');
    }
    const requests = await openRequestsByMember(this.dataSource.manager, clubId, [row.id]);
    return mapMember(row, club, requests.get(row.id));
  }

  async findByUserId(clubId: number, userId: number) {
    const club = await this.requireClub(clubId);
    const row = await loadMemberByUserId(this.members, clubId, userId, 'portal');
    if (!row) {
      throw new NotFoundException('No hay expediente vinculado a este usuario.');
    }
    const requests = await openRequestsByMember(this.dataSource.manager, clubId, [row.id]);
    return mapMember(row, club, requests.get(row.id), { includePetaHistory: false });
  }

  async assertMemberReadable(actor: { user: AppUser; club: { id: number } }, memberId: number) {
    if (actor.user.role === 'admin' || actor.user.role === 'staff') {
      assertStaffModuleAccess(actor.user, 'members', 'view');
      return;
    }
    if (actor.user.role !== 'socio') {
      throw new ForbiddenException();
    }
    const own = await this.members.findOne({ where: { clubId: actor.club.id, userId: actor.user.id } });
    if (!own || own.id !== memberId) {
      throw new ForbiddenException('No puedes ver el expediente de otro socio.');
    }
  }

  async create(clubId: number, actor: AppUser, dto: CreateMemberDto, options?: { quiet?: boolean }) {
    const club = await this.requireClub(clubId);
    const created = await this.dataSource.transaction(async (manager) => {
      const memberNumber = formatMemberNumber(club.memberNumberPrefix, dto.memberNumber);
      if (!memberNumber) {
        throw new BadRequestException('Escribe el número de socio.');
      }
      const firstName = requiredText(dto.firstName, 'El nombre');
      const paternalSurname = requiredText(dto.paternalSurname, 'El apellido');
      const maternalSurname = dto.maternalSurname?.trim() ?? '';
      const userId = await this.openSocioAccount(manager, {
        clubId,
        memberNumber,
        displayName: memberDisplayName({ firstName, paternalSurname, maternalSurname }),
        email: dto.email ?? '',
        phone: dto.phone ?? '',
      });
      const saved = await manager.getRepository(Member).save(
        manager.getRepository(Member).create({
          clubId,
          userId,
          memberNumber,
          firstName,
          paternalSurname,
          maternalSurname,
          email: dto.email?.trim() ?? '',
          phone: dto.phone?.trim() ?? '',
          joinedOn: dto.joinedOn,
          sex: dto.sex,
          membership: dto.membership,
          status: 'vigente',
        }),
      );
      await this.writeDocuments(manager, saved.id, dto.documents ?? [], true);
      await this.writeWeapons(manager, clubId, saved.id, dto.weapons ?? []);
      const calendar = calendarFromClub(club);
      const paidOn = firstPaymentDate(dto.joinedOn, dto.membership, calendar);
      const period = membershipPeriod(dto.membership, calendar);
      const amount = feeForMembership(club, dto.membership);
      const payment = await manager.getRepository(MembershipPayment).save(
        manager.getRepository(MembershipPayment).create({
          clubId,
          memberId: saved.id,
          membership: dto.membership,
          paidOn,
          periodStart: period.start,
          amount: amount.toFixed(2),
          recordedByUserId: actor.id,
        }),
      );
      saved.payments = [payment];
      saved.status = await this.persistStatus(manager, saved, club);
      return { member: saved, paymentId: payment.id, paidOn, amount, period };
    }).catch(rethrowUnique);
    const member = created.member;
    if (!options?.quiet) {
      await this.notifications.record({
        clubId,
        kind: 'member_registered',
        category: 'registration',
        title: 'Socio registrado',
        detail: `Se registró correctamente a ${memberDisplayName(member)}.`,
        entityType: 'member',
        entityId: String(member.id),
        actorUserId: actor.id,
        actorLabel: actorLabel(actor),
      });
      await this.notifications.record({
        clubId,
        kind: 'membership_paid',
        category: 'confirmation',
        title: 'Anualidad registrada',
        detail: `Se registró la anualidad ${periodLabel(created.period)} de ${formatPesos(created.amount)} de ${memberDisplayName(member)}.`,
        entityType: 'membership_payment',
        entityId: String(created.paymentId),
        actorUserId: actor.id,
        actorLabel: actorLabel(actor),
        occurredAt: new Date(`${created.paidOn}T12:00:00.000Z`),
        dedupeKey: `payment:${created.paymentId}`,
      });
    }
    return this.findOne(clubId, member.id);
  }

  async recordImportSummaryNotification(clubId: number, actor: AppUser, count: number): Promise<void> {
    await this.notifications.record({
      clubId,
      kind: 'members_imported',
      category: 'update',
      title: 'Importación de socios',
      detail: `Se importaron ${count} ${count === 1 ? 'socio' : 'socios'} desde Excel.`,
      actorUserId: actor.id,
      actorLabel: actorLabel(actor),
    });
  }

  async recordWeaponsImportSummaryNotification(clubId: number, actor: AppUser, count: number): Promise<void> {
    await this.notifications.record({
      clubId,
      kind: 'weapons_imported',
      category: 'update',
      title: 'Importación de armas',
      detail: `Se importaron ${count} ${count === 1 ? 'arma' : 'armas'} desde Excel.`,
      actorUserId: actor.id,
      actorLabel: actorLabel(actor),
    });
  }

  async appendWeaponsForImport(clubId: number, memberId: number, payloads: WeaponPayloadDto[]): Promise<void> {
    if (payloads.length === 0) {
      return;
    }
    await this.dataSource.transaction(async (manager) => {
      await this.requireMember(manager, clubId, memberId);
      const weapons = manager.getRepository(MemberWeapon);
      const existingCount = await weapons.count({ where: { clubId, memberId } });
      if (existingCount + payloads.length > 10) {
        throw new BadRequestException(
          `El socio ya tiene ${existingCount} arma(s); no caben ${payloads.length} más (máx. 10).`,
        );
      }
      for (const payload of payloads) {
        const fields = weaponFields(payload);
        await weapons.save(
          weapons.create({
            clubId,
            memberId,
            ...fields,
            sheetFileName: null,
            sheetContentType: null,
            sheetSizeBytes: null,
            sheetContent: null,
          }),
        );
      }
    });
  }

  async updateProfile(clubId: number, memberId: number, actor: AppUser, dto: UpdateMemberDto) {
    const club = await this.requireClub(clubId);
    await this.dataSource.transaction(async (manager) => {
      const member = await this.requireMember(manager, clubId, memberId);
      member.firstName = requiredText(dto.firstName, 'El nombre');
      member.paternalSurname = requiredText(dto.paternalSurname, 'El apellido');
      member.maternalSurname = dto.maternalSurname?.trim() ?? '';
      member.email = dto.email?.trim() ?? '';
      member.phone = dto.phone?.trim() ?? '';
      member.sex = dto.sex;
      member.membership = dto.membership;
      await manager.getRepository(Member).save(member);
      await this.syncSocioAccount(manager, member);
      await this.writeDocuments(manager, member.id, dto.documents ?? [], false);
      await this.persistStatus(manager, member, club);
    });
    await this.notifications.record({
      clubId,
      kind: 'member_updated',
      category: 'update',
      title: 'Ficha actualizada',
      detail: `Se actualizó la ficha de ${dto.firstName.trim()} ${dto.paternalSurname.trim()}.`.replace(/\s+/g, ' '),
      entityType: 'member',
      entityId: String(memberId),
      actorUserId: actor.id,
      actorLabel: actorLabel(actor),
    });
    return this.findOne(clubId, memberId);
  }

  async replaceWeapons(clubId: number, memberId: number, actor: AppUser, dto: ReplaceWeaponsDto) {
    await this.dataSource.transaction(async (manager) => {
      const member = await this.requireMember(manager, clubId, memberId);
      await this.writeWeapons(manager, clubId, member.id, dto.weapons);
    });
    const current = await this.findOne(clubId, memberId);
    await this.notifications.record({
      clubId,
      kind: 'weapons_updated',
      category: 'update',
      title: 'Inventario actualizado',
      detail: `Se actualizó el inventario de ${memberDisplayName(current)}.`,
      entityType: 'member',
      entityId: String(memberId),
      actorUserId: actor.id,
      actorLabel: actorLabel(actor),
    });
    return current;
  }

  async replacePetas(clubId: number, memberId: number, actor: AppUser, dto: ReplacePetasDto) {
    await this.dataSource.transaction(async (manager) => {
      await this.requireMember(manager, clubId, memberId);
      await this.writePetas(manager, clubId, memberId, dto.petas);
    });
    const current = await this.findOne(clubId, memberId);
    await this.notifications.record({
      clubId,
      kind: 'petas_updated',
      category: 'update',
      title: 'Inventario actualizado',
      detail: `Se actualizaron los PETAs de ${memberDisplayName(current)}.`,
      entityType: 'member',
      entityId: String(memberId),
      actorUserId: actor.id,
      actorLabel: actorLabel(actor),
    });
    return current;
  }

  async recordPayment(clubId: number, memberId: number, actor: AppUser, dto: RecordPaymentDto) {
    const club = await this.requireClub(clubId);
    const recorded = await this.dataSource.transaction(async (manager) => {
      const member = await this.requireMember(manager, clubId, memberId);
      const pending = pendingPeriods({
        membership: member.membership as MembershipCode,
        joinedOn: asDate(member.joinedOn),
        payments: paymentSlices(member),
        calendar: calendarFromClub(club),
      });
      const period = pending[0];
      if (!period) {
        throw new ConflictException('La anualidad de este periodo ya está pagada.');
      }
      if (dto.periodStart && dto.periodStart !== period.start) {
        throw new ConflictException(
          pending.some((item) => item.start === dto.periodStart)
            ? 'Primero se debe pagar la anualidad pendiente más antigua.'
            : 'Esa anualidad ya está pagada.',
        );
      }
      const amount = feeForMembership(club, member.membership);
      const saved = await manager.getRepository(MembershipPayment).save(
        manager.getRepository(MembershipPayment).create({
          clubId,
          memberId: member.id,
          membership: member.membership,
          paidOn: dto.paidOn,
          periodStart: period.start,
          amount: amount.toFixed(2),
          recordedByUserId: actor.id,
        }),
      );
      member.payments = [...(member.payments ?? []), saved];
      await this.persistStatus(manager, member, club);
      return { paymentId: saved.id, period, amount };
    });
    const paymentId = recorded.paymentId;
    const current = await this.findOne(clubId, memberId);
    await this.notifications.record({
      clubId,
      kind: 'membership_paid',
      category: 'confirmation',
      title: 'Anualidad registrada',
      detail: `Se registró la anualidad ${periodLabel(recorded.period)} de ${formatPesos(recorded.amount)} de ${memberDisplayName(current)}.`,
      entityType: 'membership_payment',
      entityId: String(paymentId),
      actorUserId: actor.id,
      actorLabel: actorLabel(actor),
      occurredAt: new Date(`${dto.paidOn}T12:00:00.000Z`),
      dedupeKey: `payment:${paymentId}`,
    });
    return current;
  }

  async revertPayment(clubId: number, memberId: number, paymentId: number, actor: AppUser) {
    if (actor.role !== 'admin') {
      throw new ForbiddenException('Solo un administrador puede revertir pagos.');
    }
    const club = await this.requireClub(clubId);
    const reverted = await this.dataSource.transaction(async (manager) => {
      const member = await this.requireMember(manager, clubId, memberId);
      const payment = (member.payments ?? []).find((item) => item.id === paymentId);
      if (!payment) {
        throw new NotFoundException('No se encontró el pago.');
      }
      if (payment.revertedAt) {
        throw new ConflictException('Este pago ya fue revertido.');
      }
      const current = membershipPeriod(payment.membership as MembershipCode, calendarFromClub(club));
      if (!withinPeriod(asDate(payment.paidOn), current)) {
        throw new ConflictException('Solo se pueden revertir pagos registrados en el periodo actual.');
      }
      payment.revertedAt = new Date();
      payment.revertedByUserId = actor.id;
      await manager.getRepository(MembershipPayment).update(
        { id: payment.id, clubId },
        { revertedAt: payment.revertedAt, revertedByUserId: actor.id },
      );
      const covered = periodCovered(
        activePayments(member),
        member.membership as 'tiro-deportivo' | 'caza',
        calendarFromClub(club),
      );
      if (!covered && member.status === 'vigente') {
        member.status = 'pendiente';
        await manager.getRepository(Member).update({ id: member.id }, { status: 'pendiente' });
      }
      const period = membershipPeriod(
        payment.membership as MembershipCode,
        calendarFromClub(club),
        dateAt(asDate(payment.periodStart)),
      );
      return { member, amount: Number(payment.amount), period };
    });
    await this.notifications.record({
      clubId,
      kind: 'membership_reverted',
      category: 'reversal',
      title: 'Anualidad revertida',
      detail: `Se revirtió la anualidad ${periodLabel(reverted.period)} de ${formatPesos(reverted.amount)} de ${memberDisplayName(reverted.member)}.`,
      entityType: 'membership_payment',
      entityId: String(paymentId),
      actorUserId: actor.id,
      actorLabel: actorLabel(actor),
      dedupeKey: `payment-reverted:${paymentId}`,
    });
    return this.findOne(clubId, memberId);
  }

  async resetPassword(clubId: number, memberId: number, actor: AppUser, dto: ResetMemberPasswordDto) {
    const password = dto.password ?? '';
    if (password.length < 8 || password.length > 72) {
      throw new BadRequestException('La contraseña debe tener entre 8 y 72 caracteres.');
    }
    const passwordHash = await hashPassword(password, this.saltRounds());
    const member = await this.dataSource.transaction(async (manager) => {
      const current = await this.requireMember(manager, clubId, memberId);
      let userId = current.userId;
      if (!userId) {
        userId = await this.openSocioAccount(manager, {
          clubId,
          memberNumber: current.memberNumber,
          displayName: memberDisplayName(current),
          email: current.email,
          phone: current.phone,
        });
        current.userId = userId;
        await manager.getRepository(Member).save(current);
      }
      await manager.getRepository(AppUser).update({ id: userId, clubId }, { passwordHash });
      return current;
    });
    await this.notifications.record({
      clubId,
      kind: 'password_reset',
      category: 'update',
      title: 'Contraseña restablecida',
      detail: `Se restableció la contraseña de ${memberDisplayName(member)}.`,
      entityType: 'member',
      entityId: String(member.id),
      actorUserId: actor.id,
      actorLabel: actorLabel(actor),
    });
  }

  private saltRounds(): number {
    const rounds = Number(this.config.get('SALT_ROUNDS', { infer: true }) ?? 10);
    return Number.isFinite(rounds) && rounds > 0 ? rounds : 10;
  }

  async readDocument(clubId: number, memberId: number, slot: string) {
    const row = await this.dataSource.getRepository(MemberDocument)
      .createQueryBuilder('document')
      .innerJoin('document.member', 'member')
      .addSelect('document.content')
      .where('member.clubId = :clubId', { clubId })
      .andWhere('member.id = :memberId', { memberId })
      .andWhere('document.slot = :slot', { slot })
      .getOne();
    return resolveStoredFile(this.files, {
      fileName: row?.fileName,
      contentType: row?.contentType,
      storageKey: row?.storageKey,
      content: row?.content,
    });
  }

  async readSheet(clubId: number, memberId: number, weaponId: number) {
    const row = await this.dataSource.getRepository(MemberWeapon)
      .createQueryBuilder('weapon')
      .addSelect('weapon.sheetContent')
      .where('weapon.clubId = :clubId', { clubId })
      .andWhere('weapon.memberId = :memberId', { memberId })
      .andWhere('weapon.id = :weaponId', { weaponId })
      .getOne();
    return resolveStoredFile(this.files, {
      fileName: row?.sheetFileName,
      contentType: row?.sheetContentType,
      storageKey: row?.sheetStorageKey,
      content: row?.sheetContent,
    });
  }

  async readPeta(clubId: number, memberId: number, permitType: string) {
    const row = await this.dataSource.getRepository(MemberPeta)
      .createQueryBuilder('peta')
      .addSelect('peta.content')
      .where('peta.clubId = :clubId', { clubId })
      .andWhere('peta.memberId = :memberId', { memberId })
      .andWhere('peta.permitType = :permitType', { permitType })
      .andWhere('peta.isCurrent = true')
      .getOne();
    return resolveStoredFile(this.files, {
      fileName: row?.fileName,
      contentType: row?.contentType,
      storageKey: row?.storageKey,
      content: row?.content,
    });
  }

  async readPetaById(clubId: number, memberId: number, petaId: number, actor: AppUser) {
    const row = await this.dataSource.getRepository(MemberPeta)
      .createQueryBuilder('peta')
      .addSelect('peta.content')
      .where('peta.clubId = :clubId', { clubId })
      .andWhere('peta.memberId = :memberId', { memberId })
      .andWhere('peta.id = :petaId', { petaId })
      .getOne();
    if (!row) {
      throw new NotFoundException('PETA no encontrado.');
    }
    if (actor.role === 'socio' && !row.isCurrent) {
      throw new ForbiddenException('No puedes descargar un PETA anterior.');
    }
    return resolveStoredFile(this.files, {
      fileName: row.fileName,
      contentType: row.contentType,
      storageKey: row.storageKey,
      content: row.content,
    });
  }

  private async openSocioAccount(
    manager: EntityManager,
    input: { clubId: number; memberNumber: string; displayName: string; email: string; phone: string },
  ): Promise<number> {
    const rows: Array<{ id: number | string }> = await manager.query(
      `INSERT INTO fieldtrack.app_user (
         club_id, username, display_name, email, phone, password_hash, role, status
       )
       VALUES ($1, $2, $3, $4, $5, crypt(gen_random_uuid()::text, gen_salt('bf', 10)), 'socio', 'active')
       RETURNING id`,
      [
        input.clubId,
        input.memberNumber,
        input.displayName,
        blankToNull(input.email),
        blankToNull(input.phone),
      ],
    );
    const userId = Number(rows[0]?.id);
    await manager.getRepository(UserPreferences).insert({ userId, themeScheme: 'light' });
    return userId;
  }

  private async syncSocioAccount(manager: EntityManager, member: Member): Promise<void> {
    if (!member.userId) {
      member.userId = await this.openSocioAccount(manager, {
        clubId: member.clubId,
        memberNumber: member.memberNumber,
        displayName: memberDisplayName(member),
        email: member.email,
        phone: member.phone,
      });
      await manager.getRepository(Member).save(member);
      return;
    }
    await manager.getRepository(AppUser).update(
      { id: member.userId, clubId: member.clubId },
      {
        displayName: memberDisplayName(member),
        email: blankToNull(member.email),
        phone: blankToNull(member.phone),
      },
    );
  }

  private async requireClub(clubId: number): Promise<Club> {
    const club = await this.clubs.findOne({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('No se encontró el club.');
    }
    return club;
  }

  private async requireMember(manager: EntityManager, clubId: number, memberId: number): Promise<Member> {
    const member = await manager.getRepository(Member).findOne({
      where: { id: memberId, clubId },
      relations: { payments: true },
    });
    if (!member) {
      throw new NotFoundException('No se encontró el socio.');
    }
    return member;
  }

  private async persistStatus(manager: EntityManager, member: Member, club: Club): Promise<string> {
    const status = resolveMemberStatus({
      storedStatus: member.status,
      membership: member.membership as 'tiro-deportivo' | 'caza',
      joinedOn: asDate(member.joinedOn),
      payments: activePayments(member),
      calendar: calendarFromClub(club),
    });
    if (status !== member.status) {
      member.status = status;
      await manager.getRepository(Member).update({ id: member.id }, { status });
    }
    return status;
  }

  private async writeDocuments(
    manager: EntityManager,
    memberId: number,
    payloads: DocumentPayloadDto[],
    createOnly: boolean,
  ): Promise<void> {
    const documents = manager.getRepository(MemberDocument);
    const existing = await documents
      .createQueryBuilder('document')
      .addSelect('document.content')
      .where('document.memberId = :memberId', { memberId })
      .getMany();
    const slots = new Set<string>(payloads.map((item) => item.slot));
    if (!createOnly) {
      const removed = existing.filter((item) => !slots.has(item.slot));
      for (const row of removed) {
        await removeStorageKey(this.files, row.storageKey);
      }
      if (removed.length > 0) {
        await documents.remove(removed);
      }
    }
    for (const payload of payloads) {
      const file = decodeFile(payload);
      const current = existing.find((item) => item.slot === payload.slot);
      if (!file && !current) {
        continue;
      }
      if (current && !file) {
        continue;
      }
      if (!file) {
        continue;
      }
      const loadedOn = payload.loadedOn ?? todayIso();
      const name = payload.fileName?.trim() || fileNameOf(payload);
      const uploaded = await uploadToStorage(
        this.files,
        MEMBER_DOCUMENT_STORAGE_FOLDER,
        file,
        name,
      );
      if (current) {
        await removeStorageKey(this.files, current.storageKey);
        current.fileName = name;
        current.contentType = uploaded.contentType;
        current.sizeBytes = uploaded.sizeBytes;
        current.storageKey = uploaded.storageKey;
        current.content = null;
        current.loadedOn = loadedOn;
        await documents.save(current);
      } else {
        await documents.save(
          documents.create({
            memberId,
            slot: payload.slot,
            fileName: name,
            contentType: uploaded.contentType,
            sizeBytes: uploaded.sizeBytes,
            storageKey: uploaded.storageKey,
            content: null,
            loadedOn,
          }),
        );
      }
    }
  }

  private async writeWeapons(
    manager: EntityManager,
    clubId: number,
    memberId: number,
    payloads: WeaponPayloadDto[],
  ): Promise<void> {
    if (payloads.length > 10) {
      throw new BadRequestException('Un socio puede registrar hasta 10 armas.');
    }
    const weapons = manager.getRepository(MemberWeapon);
    const existing = await weapons
      .createQueryBuilder('weapon')
      .addSelect('weapon.sheetContent')
      .where('weapon.memberId = :memberId', { memberId })
      .andWhere('weapon.clubId = :clubId', { clubId })
      .getMany();
    const kept = new Set<number>();
    for (const payload of payloads) {
      const numericId = payload.id && /^\d+$/.test(payload.id) ? Number(payload.id) : null;
      const current = numericId == null ? undefined : existing.find((item) => item.id === numericId);
      const file = payload.sheet ? decodeFile(payload.sheet) : null;
      const fields = weaponFields(payload);
      if (current) {
        kept.add(current.id);
        Object.assign(current, fields);
        await applyWeaponSheet(this.files, current, payload.sheet, file);
        await weapons.save(current);
      } else {
        const created = weapons.create({
          clubId,
          memberId,
          ...fields,
          sheetFileName: null,
          sheetContentType: null,
          sheetSizeBytes: null,
          sheetStorageKey: null,
          sheetContent: null,
        });
        await applyWeaponSheet(this.files, created, payload.sheet, file);
        await weapons.save(created);
      }
    }
    const removed = existing.filter((item) => !kept.has(item.id));
    for (const row of removed) {
      await removeStorageKey(this.files, row.sheetStorageKey);
    }
    if (removed.length > 0) {
      await weapons.remove(removed);
    }
  }

  private async writePetas(
    manager: EntityManager,
    clubId: number,
    memberId: number,
    payloads: PetaPayloadDto[],
  ): Promise<void> {
    const seen = new Set<string>();
    for (const payload of payloads) {
      if (seen.has(payload.permitType)) {
        throw new BadRequestException('Solo se puede cargar un archivo por tipo de PETA.');
      }
      seen.add(payload.permitType);
    }
    const petas = manager.getRepository(MemberPeta);
    const existing = await petas
      .createQueryBuilder('peta')
      .addSelect('peta.content')
      .where('peta.memberId = :memberId', { memberId })
      .andWhere('peta.clubId = :clubId', { clubId })
      .getMany();
    const kept = new Set<string>();
    for (const payload of payloads) {
      kept.add(payload.permitType);
      const current = existing.find(
        (item) => item.permitType === payload.permitType && item.isCurrent !== false,
      );
      const file = decodeFile(payload);
      if (file) {
        if (current) {
          current.isCurrent = false;
          current.supersededOn = payload.loadedOn;
          await petas.save(current);
        }
        const uploaded = await uploadToStorage(
          this.files,
          MEMBER_PETA_STORAGE_FOLDER,
          file,
          payload.fileName.trim(),
        );
        await petas.save(
          petas.create({
            clubId,
            memberId,
            permitType: payload.permitType,
            fileName: payload.fileName.trim(),
            contentType: uploaded.contentType,
            sizeBytes: uploaded.sizeBytes,
            storageKey: uploaded.storageKey,
            content: null,
            loadedOn: payload.loadedOn,
            isCurrent: true,
            supersededOn: null,
          }),
        );
        continue;
      }
      if (current) {
        current.fileName = payload.fileName.trim();
        current.loadedOn = payload.loadedOn;
        await petas.save(current);
      }
    }
    for (const row of existing.filter((item) => item.isCurrent !== false && !kept.has(item.permitType))) {
      row.isCurrent = false;
      row.supersededOn = asDate(new Date());
      await petas.save(row);
    }
  }
}

function weaponFields(payload: WeaponPayloadDto) {
  return {
    brand: requiredText(payload.brand, 'La marca'),
    model: requiredText(payload.model, 'El modelo'),
    caliber: requiredText(payload.caliber, 'El calibre'),
    serialNumber: (payload.serialNumber ?? '').trim().toLocaleUpperCase('es-MX'),
    platform: payload.platform,
    modality: payload.modality,
    hasPeta: payload.hasPeta,
    registeredOn: payload.registeredOn,
  };
}

async function applyWeaponSheet(
  fileService: FileService,
  weapon: MemberWeapon,
  sheet: FilePayloadDto | null | undefined,
  file: DecodedFile | null,
): Promise<void> {
  if (sheet === null) {
    await removeStorageKey(fileService, weapon.sheetStorageKey);
    weapon.sheetFileName = null;
    weapon.sheetContentType = null;
    weapon.sheetSizeBytes = null;
    weapon.sheetStorageKey = null;
    weapon.sheetContent = null;
    return;
  }
  if (!sheet) {
    return;
  }
  weapon.sheetFileName = sheet.fileName.trim();
  if (!file) {
    return;
  }
  await removeStorageKey(fileService, weapon.sheetStorageKey);
  const uploaded = await uploadToStorage(
    fileService,
    MEMBER_WEAPON_SHEET_STORAGE_FOLDER,
    file,
    sheet.fileName.trim(),
  );
  weapon.sheetContentType = uploaded.contentType;
  weapon.sheetSizeBytes = uploaded.sizeBytes;
  weapon.sheetStorageKey = uploaded.storageKey;
  weapon.sheetContent = null;
}

interface DecodedFile {
  content: Buffer;
  contentType: string;
  size: number;
}

function decodeFile(payload?: { fileName?: string; contentType?: string; contentBase64?: string } | null): DecodedFile | null {
  if (!payload?.contentBase64) {
    return null;
  }
  const raw = payload.contentBase64.replace(/^data:[^;]+;base64,/, '');
  const content = Buffer.from(raw, 'base64');
  if (content.length === 0) {
    return null;
  }
  return {
    content,
    contentType: payload.contentType?.trim() || 'application/octet-stream',
    size: content.length,
  };
}

function fileNameOf(payload: DocumentPayloadDto): string {
  return payload.fileName?.trim() || 'archivo';
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

function requiredText(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException(`${label} es obligatorio.`);
  }
  return trimmed;
}

function paymentSlices(member: Member) {
  return (member.payments ?? []).map((payment) => ({
    membership: payment.membership,
    paidOn: asDate(payment.paidOn),
    periodStart: asDate(payment.periodStart),
    reverted: payment.revertedAt != null,
  }));
}

function activePayments(member: Member) {
  return paymentSlices(member).filter((payment) => !payment.reverted);
}

function dateAt(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function actorLabel(user: AppUser): string {
  return user.displayName?.trim() || user.username;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function rethrowUnique(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new ConflictException('Ese número de socio ya existe.');
  }
  throw error;
}
