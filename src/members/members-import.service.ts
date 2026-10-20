import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { formatMemberNumber } from '../clubs/member-number';
import { loadMembershipTypes, membershipTypesFromClub } from '../clubs/club-membership-types';
import { ClubMembershipType } from '../clubs/entities/club-membership-type.entity';
import { Club } from '../clubs/entities/club.entity';
import { AppUser } from '../users/entities/app-user.entity';
import { CreateMemberDto, WeaponPayloadDto } from './dto/member.dto';
import { MemberWeapon } from './entities/member-weapon.entity';
import { Member } from './entities/member.entity';
import {
  buildArmasImportTemplateBuffer,
  buildSociosImportTemplateBuffer,
  normalizeWeaponSerial,
  parseBoolInput,
  parseIsoDateInput,
  parseMembersImportFile,
  parsePlatformInput,
  parseSexInput,
  parseWeaponModalityInput,
  parseWeaponsImportFile,
  resolveMembershipCode,
} from './members-import.parser';
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
    return this.membershipCodes(clubId).then((allowed) =>
      buildSociosImportTemplateBuffer(allowed.map((row) => row.code)),
    );
  }

  buildWeaponsTemplate(): Buffer {
    return buildArmasImportTemplateBuffer();
  }

  async importMembersFile(clubId: number, actor: AppUser, buffer: Buffer): Promise<MemberImportResult> {
    if (!buffer?.length) {
      throw new BadRequestException('Sube un archivo Excel (.xlsx).');
    }
    const club = await this.requireClub(clubId);
    const allowed = await this.membershipCodes(clubId);
    const { members, parseErrors } = parseMembersImportFile(buffer);
    if (members.length === 0 && parseErrors.length === 0) {
      throw new BadRequestException('No hay filas de socios para importar.');
    }

    const existingNumbers = new Set(await this.members.numbers(clubId));
    const seenInFile = new Set<string>();
    const errors = [...parseErrors];
    let created = 0;
    let skipped = 0;
    let failed = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const row of members) {
      const formattedNumber = formatMemberNumber(club.memberNumberPrefix, row.memberNumber);
      if (!formattedNumber) {
        failed += 1;
        errors.push(`Socios fila ${row.sheetRow}: número de socio no válido.`);
        continue;
      }
      if (existingNumbers.has(formattedNumber)) {
        skipped += 1;
        errors.push(`Socios fila ${row.sheetRow}: ${formattedNumber} ya existe; se omitió.`);
        continue;
      }
      if (seenInFile.has(formattedNumber)) {
        skipped += 1;
        errors.push(`Socios fila ${row.sheetRow}: ${formattedNumber} duplicado en el archivo; se omitió.`);
        continue;
      }
      seenInFile.add(formattedNumber);

      const membership = resolveMembershipCode(row.membershipRaw, allowed);
      if (!membership) {
        failed += 1;
        errors.push(
          `Socios fila ${row.sheetRow}: tipo_membresia "${row.membershipRaw}" no coincide con los del club.`,
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
        joinedOn,
        sex: parseSexInput(row.sexRaw),
        membership: membership as CreateMemberDto['membership'],
      };
      try {
        await this.members.create(clubId, actor, dto, { quiet: true });
        created += 1;
        existingNumbers.add(formattedNumber);
      } catch (error) {
        failed += 1;
        errors.push(`Socios fila ${row.sheetRow}: ${importErrorMessage(error)}`);
      }
    }

    if (created > 0) {
      await this.members.recordImportSummaryNotification(clubId, actor, created);
    }

    return { created, skipped, failed, errors: errors.slice(0, 50) };
  }

  async importWeaponsFile(clubId: number, actor: AppUser, buffer: Buffer): Promise<WeaponImportResult> {
    if (!buffer?.length) {
      throw new BadRequestException('Sube un archivo Excel (.xlsx).');
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
        platform: parsePlatformInput(row.platformRaw),
        modality: parseWeaponModalityInput(row.modalityRaw),
        hasPeta: parseBoolInput(row.hasPetaRaw),
        registeredOn: parseIsoDateInput(row.registeredOnRaw, today),
      };

      try {
        await this.members.appendWeaponsForImport(clubId, memberId, [payload]);
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

  private async membershipCodes(clubId: number) {
    const club = await this.requireClub(clubId);
    let types = await loadMembershipTypes(this.membershipTypes, clubId);
    if (types.length === 0) {
      types = membershipTypesFromClub(club);
    }
    return types.map((row) => ({ code: row.code, name: row.name }));
  }

  private async loadMemberIds(clubId: number): Promise<Map<string, number>> {
    const rows = await this.memberRows.find({
      where: { clubId },
      select: ['id', 'memberNumber'],
    });
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(normalizeMemberKey(row.memberNumber), row.id);
    }
    return map;
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
