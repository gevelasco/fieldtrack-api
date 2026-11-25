import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { formatMemberNumber } from '../clubs/member-number';
import { loadMembershipTypes, membershipTypesFromClub } from '../clubs/club-membership-types';
import { resolveImportMembershipWithDefault } from '../clubs/membership-plans';
import { ClubMembershipType } from '../clubs/entities/club-membership-type.entity';
import { Club } from '../clubs/entities/club.entity';
import { AppUser } from '../users/entities/app-user.entity';
import { CreateMemberDto, WeaponPayloadDto } from './dto/member.dto';
import { MemberWeapon } from './entities/member-weapon.entity';
import { Member } from './entities/member.entity';
import {
  type MembersImportParseOptions,
  parseColumnMappingJson,
} from './members-import-catalog';
import {
  buildArmasImportTemplateBuffer,
  buildSociosImportTemplateBuffer,
  normalizeWeaponSerial,
  parseBoolInput,
  parseIsoDateInput,
  parseMembersImportFile,
  resolveImportWeaponPlatform,
  parseSexInput,
  parseWeaponModalityInput,
  parseWeaponsImportFile,
  resolveMembershipCode,
} from './members-import.parser';
import { buildMemberImportPreview, type MemberImportPreview } from './members-import-preview';
import { enrichInlineWeaponSlot } from './members-import-weapons-inline';
import { MembersService } from './members.service';

export interface MemberImportResult {
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface WeaponImportResult {
  created: number;
  failed: number;
  errors: string[];
}

@Injectable()
export class MembersImportService {
  constructor(
    @InjectRepository(Club) private readonly clubs: Repository<Club>,
    @InjectRepository(ClubMembershipType) private readonly membershipTypes: Repository<ClubMembershipType>,
    @InjectRepository(Member) private readonly memberRows: Repository<Member>,
    @InjectRepository(MemberWeapon) private readonly weaponRows: Repository<MemberWeapon>,
    private readonly members: MembersService,
  ) {}

  buildMembersTemplate(clubId: number): Promise<Buffer> {
    return this.membershipPlans(clubId).then((allowed) =>
      buildSociosImportTemplateBuffer(allowed.map((row) => row.code)),
    );
  }

  buildWeaponsTemplate(): Buffer {
    return buildArmasImportTemplateBuffer();
  }

  previewMembersFile(buffer: Buffer, options?: MembersImportParseOptions): MemberImportPreview {
    if (!buffer?.length) {
      throw new BadRequestException('Sube un archivo Excel (.xlsx o .xls).');
    }
    return buildMemberImportPreview(buffer, options);
  }

  async importMembersFile(
    clubId: number,
    actor: AppUser,
    buffer: Buffer,
    options?: MembersImportParseOptions,
  ): Promise<MemberImportResult> {
    if (!buffer?.length) {
      throw new BadRequestException('Sube un archivo Excel (.xlsx o .xls).');
    }
    const club = await this.requireClub(clubId);
    const allowed = await this.membershipPlans(clubId);
    const createContext = { club, plans: allowed };
    const { members, parseErrors } = parseMembersImportFile(buffer, options);
    if (members.length === 0 && parseErrors.length === 0) {
      throw new BadRequestException('No hay filas de socios para importar.');
    }

    const existingNumbers = await this.loadMemberNumberLookupKeys(clubId, club.memberNumberPrefix);
    const memberByNumber = await this.loadMemberIds(clubId);
    const existingSerials = await this.loadClubSerials(clubId);
    const weaponCountByMember = await this.loadWeaponCounts(clubId);
    const seenInFile = new Map<string, number>();
    const errors = [...parseErrors];
    let created = 0;
    let skipped = 0;
    let failed = 0;
    let weaponsAppended = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const row of members) {
      const formattedNumber = formatMemberNumber(club.memberNumberPrefix, row.memberNumber);
      if (!formattedNumber) {
        failed += 1;
        errors.push(`Socios fila ${row.sheetRow}: número de socio no válido.`);
        continue;
      }
      const importKeys = memberNumberLookupKeys(club.memberNumberPrefix, row.memberNumber);
      const weapons = mapInlineWeaponsToPayloads(row.inlineWeapons, today, row.sheetRow, errors);

      const existingMemberId =
        findMemberIdInMap(memberByNumber, club.memberNumberPrefix, row.memberNumber) ??
        (importKeys.some((key) => existingNumbers.has(key))
          ? memberByNumber.get(normalizeMemberKey(formattedNumber))
          : undefined);

      if (existingMemberId != null) {
        const appended = await this.appendMissingWeaponsForMember(
          clubId,
          existingMemberId,
          formattedNumber,
          row.sheetRow,
          weapons,
          actor.id,
          existingSerials,
          weaponCountByMember,
          errors,
        );
        if (appended > 0) {
          weaponsAppended += appended;
        } else {
          skipped += 1;
          errors.push(`Socios fila ${row.sheetRow}: ${formattedNumber} ya existe en el club; se omitió.`);
        }
        for (const key of importKeys) {
          existingNumbers.add(key);
        }
        continue;
      }

      const seenMemberId = seenInFile.get(formattedNumber);
      if (seenMemberId != null) {
        const appended = await this.appendMissingWeaponsForMember(
          clubId,
          seenMemberId,
          formattedNumber,
          row.sheetRow,
          weapons,
          actor.id,
          existingSerials,
          weaponCountByMember,
          errors,
        );
        if (appended > 0) {
          weaponsAppended += appended;
        } else {
          skipped += 1;
          errors.push(`Socios fila ${row.sheetRow}: ${formattedNumber} duplicado en el archivo; se omitió.`);
        }
        continue;
      }

      const resolved = resolveImportMembershipWithDefault(row.membershipRaw, row.membershipModalityRaw, allowed);
      if (!resolved) {
        failed += 1;
        errors.push(
          `Socios fila ${row.sheetRow}: tipo_membresia/modalidad no válidos («${row.membershipRaw}» / «${row.membershipModalityRaw || 'vacío'}»).`,
        );
        continue;
      }
      const joinedOn = parseIsoDateInput(row.joinedOnRaw, today);
      const dto: CreateMemberDto = {
        memberNumber: row.memberNumber,
        firstName: row.firstName,
        paternalSurname: row.paternalSurname,
        maternalSurname: row.maternalSurname || undefined,
        email: row.email || undefined,
        phone: row.phone || undefined,
        curp: row.curp,
        rfc: normalizeRfcImport(row.rfc),
        address: row.address || undefined,
        joinedOn,
        sex: parseSexInput(row.sexRaw),
        modality: resolved.modality,
        membership: resolved.planCode,
        weapons: weapons.length > 0 ? weapons : undefined,
      };
      try {
        const createdMember = await this.members.create(clubId, actor, dto, { quiet: true, ...createContext });
        created += 1;
        const memberId = Number((createdMember as { id?: number }).id);
        if (Number.isFinite(memberId) && memberId > 0) {
          seenInFile.set(formattedNumber, memberId);
          memberByNumber.set(normalizeMemberKey(formattedNumber), memberId);
          weaponCountByMember.set(memberId, weapons.length);
          for (const weapon of weapons) {
            const serial = normalizeWeaponSerial(weapon.serialNumber ?? '');
            if (serial) {
              existingSerials.add(serial);
            }
          }
        }
        for (const key of importKeys) {
          existingNumbers.add(key);
        }
      } catch (error) {
        const message = importErrorMessage(error);
        if (isDuplicateMemberImportError(message)) {
          skipped += 1;
          errors.push(`Socios fila ${row.sheetRow}: ${formattedNumber} ya existe en el club; se omitió.`);
          for (const key of importKeys) {
            existingNumbers.add(key);
          }
          continue;
        }
        failed += 1;
        errors.push(`Socios fila ${row.sheetRow}: ${message}`);
      }
    }

    if (created > 0) {
      await this.members.recordImportSummaryNotification(clubId, actor, created);
    }
    if (weaponsAppended > 0) {
      await this.members.recordWeaponsImportSummaryNotification(clubId, actor, weaponsAppended);
    }

    return { created, skipped, failed, errors: errors.slice(0, 50) };
  }

  async importWeaponsFile(clubId: number, actor: AppUser, buffer: Buffer): Promise<WeaponImportResult> {
    if (!buffer?.length) {
      throw new BadRequestException('Sube un archivo Excel (.xlsx o .xls).');
    }
    const club = await this.requireClub(clubId);
    const { weapons, parseErrors } = parseWeaponsImportFile(buffer);
    if (weapons.length === 0 && parseErrors.length === 0) {
      throw new BadRequestException('No hay filas de armas para importar.');
    }

    const memberByNumber = await this.loadMemberIds(clubId);
    const existingSerials = await this.loadClubSerials(clubId);
    const serialsInFile = new Set<string>();
    const weaponCountByMember = await this.loadWeaponCounts(clubId);

    const errors = [...parseErrors];
    let created = 0;
    let failed = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const row of weapons) {
      const formattedNumber = formatMemberNumber(club.memberNumberPrefix, row.memberNumber);
      const memberId = formattedNumber ? memberByNumber.get(normalizeMemberKey(formattedNumber)) : undefined;
      if (!memberId) {
        failed += 1;
        errors.push(
          `Armas fila ${row.sheetRow}: no hay socio con número ${formattedNumber || row.memberNumber}.`,
        );
        continue;
      }

      const serial = normalizeWeaponSerial(row.serialNumber);
      if (!serial) {
        failed += 1;
        errors.push(`Armas fila ${row.sheetRow}: falta numero_serie.`);
        continue;
      }
      if (serialsInFile.has(serial)) {
        failed += 1;
        errors.push(`Armas fila ${row.sheetRow}: numero_serie ${serial} duplicado en el archivo.`);
        continue;
      }
      if (existingSerials.has(serial)) {
        failed += 1;
        errors.push(`Armas fila ${row.sheetRow}: numero_serie ${serial} ya está registrado en el club.`);
        continue;
      }

      const currentCount = weaponCountByMember.get(memberId) ?? 0;
      if (currentCount >= 10) {
        failed += 1;
        errors.push(`Armas fila ${row.sheetRow}: el socio ${formattedNumber} ya tiene 10 armas.`);
        continue;
      }

      const payload: WeaponPayloadDto = {
        brand: row.brand,
        model: row.model,
        caliber: row.caliber,
        serialNumber: serial,
        platform: resolveImportWeaponPlatform({
          platformRaw: row.platformRaw,
          brand: row.brand,
          model: row.model,
          caliber: row.caliber,
        }),
        modality: parseWeaponModalityInput(row.modalityRaw),
        hasPeta: parseBoolInput(row.hasPetaRaw),
        registeredOn: parseIsoDateInput(row.registeredOnRaw, today),
      };

      try {
        await this.members.appendWeaponsForImport(clubId, memberId, [payload], actor.id);
        created += 1;
        serialsInFile.add(serial);
        existingSerials.add(serial);
        weaponCountByMember.set(memberId, currentCount + 1);
      } catch (error) {
        failed += 1;
        errors.push(`Armas fila ${row.sheetRow}: ${importErrorMessage(error)}`);
      }
    }

    if (created > 0) {
      await this.members.recordWeaponsImportSummaryNotification(clubId, actor, created);
    }

    return { created, failed, errors: errors.slice(0, 50) };
  }

  /** @deprecated Usa buildMembersTemplate */
  async buildTemplate(clubId: number): Promise<Buffer> {
    return this.buildMembersTemplate(clubId);
  }

  /** @deprecated Usa importMembersFile */
  importWorkbook(clubId: number, actor: AppUser, buffer: Buffer): Promise<MemberImportResult> {
    return this.importMembersFile(clubId, actor, buffer);
  }

  private async requireClub(clubId: number): Promise<Club> {
    const club = await this.clubs.findOne({ where: { id: clubId } });
    if (!club) {
      throw new BadRequestException('No se encontró el club.');
    }
    return club;
  }

  private async membershipPlans(clubId: number) {
    const club = await this.requireClub(clubId);
    let types = await loadMembershipTypes(this.membershipTypes, clubId);
    if (types.length === 0) {
      types = membershipTypesFromClub(club);
    }
    return types;
  }

  private async loadMemberIds(clubId: number): Promise<Map<string, number>> {
    const rows = await this.memberRows.find({
      where: { clubId },
      select: ['id', 'memberNumber'],
    });
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(normalizeMemberKey(row.memberNumber), row.id);
      const digits = row.memberNumber.replace(/\D/g, '');
      if (digits) {
        map.set(normalizeMemberKey(digits), row.id);
        map.set(normalizeMemberKey(digits.replace(/^0+/, '') || digits), row.id);
      }
    }
    return map;
  }

  private async appendMissingWeaponsForMember(
    clubId: number,
    memberId: number,
    formattedNumber: string,
    sheetRow: number,
    weapons: WeaponPayloadDto[],
    actorUserId: number,
    existingSerials: Set<string>,
    weaponCountByMember: Map<number, number>,
    errors: string[],
  ): Promise<number> {
    if (weapons.length === 0) {
      return 0;
    }
    let appended = 0;
    for (const payload of weapons) {
      const serial = normalizeWeaponSerial(payload.serialNumber ?? '');
      if (serial && existingSerials.has(serial)) {
        continue;
      }
      const currentCount = weaponCountByMember.get(memberId) ?? 0;
      if (currentCount >= 10) {
        errors.push(`Socios fila ${sheetRow}: el socio ${formattedNumber} ya tiene 10 armas; no se agregaron más.`);
        break;
      }
      try {
        await this.members.appendWeaponsForImport(clubId, memberId, [payload], actorUserId);
        appended += 1;
        if (serial) {
          existingSerials.add(serial);
        }
        weaponCountByMember.set(memberId, currentCount + 1);
      } catch (error) {
        errors.push(`Socios fila ${sheetRow} arma (${payload.brand}): ${importErrorMessage(error)}`);
      }
    }
    if (appended > 0) {
      errors.push(
        `Socios fila ${sheetRow}: ${formattedNumber} ya existía; se agregaron ${appended} arma(s) faltante(s).`,
      );
    }
    return appended;
  }

  private async loadClubSerials(clubId: number): Promise<Set<string>> {
    const rows = await this.weaponRows
      .createQueryBuilder('weapon')
      .select('weapon.serialNumber', 'serial')
      .where('weapon.clubId = :clubId', { clubId })
      .andWhere("weapon.serialNumber <> ''")
      .getRawMany<{ serial: string }>();
    return new Set(rows.map((row) => normalizeWeaponSerial(row.serial)).filter(Boolean));
  }

  private async loadMemberNumberLookupKeys(
    clubId: number,
    prefix: string | null | undefined,
  ): Promise<Set<string>> {
    const keys = new Set<string>();
    for (const stored of await this.members.numbers(clubId)) {
      for (const key of memberNumberLookupKeys(prefix, stored)) {
        keys.add(key);
      }
    }
    return keys;
  }

  private async loadWeaponCounts(clubId: number): Promise<Map<number, number>> {
    const rows = await this.weaponRows
      .createQueryBuilder('weapon')
      .select('weapon.memberId', 'memberId')
      .addSelect('COUNT(*)', 'total')
      .where('weapon.clubId = :clubId', { clubId })
      .groupBy('weapon.memberId')
      .getRawMany<{ memberId: string; total: string }>();
    const map = new Map<number, number>();
    for (const row of rows) {
      map.set(Number(row.memberId), Number(row.total));
    }
    return map;
  }
}

function normalizeMemberKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeRfcImport(raw: string): string {
  const rfc = raw.trim().toUpperCase();
  if (/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) {
    return rfc;
  }
  return 'XAXX010101000';
}

function mapInlineWeaponsToPayloads(
  slots: ReadonlyArray<import('./members-import-weapons-inline').InlineWeaponSlot>,
  today: string,
  sheetRow: number,
  errors: string[],
): WeaponPayloadDto[] {
  const weapons: WeaponPayloadDto[] = [];
  slots.forEach((slot, index) => {
    const label = `Socios fila ${sheetRow} arma ${index + 1}`;
    const payload = inlineWeaponToPayload(slot, today, label, errors);
    if (payload) {
      weapons.push(payload);
    }
  });
  return weapons;
}

function inlineWeaponToPayload(
  slot: import('./members-import-weapons-inline').InlineWeaponSlot,
  today: string,
  label: string,
  errors?: string[],
): WeaponPayloadDto | null {
  const enriched = enrichInlineWeaponSlot(slot);
  const brand = (enriched.brand ?? '').trim();
  const model = (enriched.model ?? '').trim();
  const caliber = (enriched.caliber ?? '').trim();
  if (!brand || !model || !caliber) {
    errors?.push(
      `${label}: marca, modelo y calibre son obligatorios (recibido marca=«${brand || '—'}», modelo=«${model || '—'}», calibre=«${caliber || '—'}»).`,
    );
    return null;
  }
  const serial = normalizeWeaponSerial(enriched.serialNumber ?? '');
  return {
    brand,
    model,
    caliber,
    serialNumber: serial,
    platform: resolveImportWeaponPlatform({
      platformRaw: enriched.platformRaw,
      brand: enriched.brand,
      model: enriched.model,
      caliber: enriched.caliber,
    }),
    modality: parseWeaponModalityInput(enriched.modalityRaw ?? ''),
    hasPeta: parseBoolInput(enriched.hasPetaRaw ?? ''),
    registeredOn: parseIsoDateInput(enriched.registeredOnRaw ?? '', today),
  };
}

function findMemberIdInMap(
  memberByNumber: Map<string, number>,
  prefix: string | null | undefined,
  raw: string,
): number | undefined {
  for (const key of memberNumberLookupKeys(prefix, raw)) {
    const id = memberByNumber.get(normalizeMemberKey(key));
    if (id != null) {
      return id;
    }
  }
  return undefined;
}

function memberNumberLookupKeys(prefix: string | null | undefined, raw: string): string[] {
  const trimmed = raw.trim();
  const formatted = formatMemberNumber(prefix, trimmed);
  const digits = trimmed.replace(/\D/g, '');
  const keys = new Set<string>();
  if (formatted) {
    keys.add(formatted);
    keys.add(formatted.toLowerCase());
  }
  if (digits) {
    keys.add(digits);
    keys.add(digits.replace(/^0+/, '') || digits);
    const padded = formatMemberNumber(prefix, digits);
    if (padded) {
      keys.add(padded);
    }
  }
  if (trimmed) {
    keys.add(trimmed);
    keys.add(trimmed.toLowerCase());
  }
  return [...keys];
}

function isDuplicateMemberImportError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('número de socio ya existe') || normalized.includes('numero de socio ya existe');
}

function importErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message) && message.length) {
      return String(message[0]);
    }
  }
  return 'No se pudo completar la fila.';
}
