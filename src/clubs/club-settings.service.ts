import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppUser } from '../users/entities/app-user.entity';
import { UpdateClubSettingsDto } from './dto/update-club-settings.dto';
import { documentLabelMap, loadClubDocumentDefs } from './club-documents';
import {
  loadMembershipTypes,
  membershipTypesFromClub,
  syncLegacyClubColumns,
  type MembershipTypePatchRow,
  type MembershipTypeRow,
} from './club-membership-types';
import { ClubMemberDocumentDef } from './entities/club-member-document-def.entity';
import { ClubMembershipType } from './entities/club-membership-type.entity';
import { ClubStaffService } from './club-staff.service';
import { Club } from './entities/club.entity';
import { normalizeMemberNumberPrefix } from './member-number';
import { normalizeStaffModulePermissions, requireStaffModule } from './staff-module-permissions';

@Injectable()
export class ClubSettingsService {
  constructor(
    @InjectRepository(Club) private readonly clubs: Repository<Club>,
    @InjectRepository(ClubMemberDocumentDef) private readonly documentDefs: Repository<ClubMemberDocumentDef>,
    @InjectRepository(ClubMembershipType) private readonly membershipTypes: Repository<ClubMembershipType>,
    private readonly dataSource: DataSource,
    private readonly staff: ClubStaffService,
  ) {}

  async read(clubId: number) {
    const club = await this.requireClub(clubId);
    const defs = await loadClubDocumentDefs(this.documentDefs, clubId);
    let types = await loadMembershipTypes(this.membershipTypes, clubId);
    if (types.length === 0) {
      types = membershipTypesFromClub(club);
    }
    return {
      ...mapSettings(club, defs, types),
      staffUsers: await this.staff.list(clubId),
    };
  }

  async update(clubId: number, actor: AppUser, dto: UpdateClubSettingsDto) {
    requireConfigWrite(actor);
    await this.dataSource.transaction(async (manager) => {
      const clubs = manager.getRepository(Club);
      const club = await clubs.findOne({ where: { id: clubId } });
      if (!club) {
        throw new NotFoundException('No se encontró el club.');
      }

      if (dto.name !== undefined) {
        const name = dto.name.trim();
        if (name.length < 2) {
          throw new BadRequestException('Escribe el nombre del club.');
        }
        club.name = name;
      }

      if (dto.tagline !== undefined) {
        club.tagline = dto.tagline.trim() || null;
      }

      if (dto.memberNumberPrefix !== undefined) {
        club.memberNumberPrefix = normalizeMemberNumberPrefix(dto.memberNumberPrefix ?? '');
      }

      if (dto.logoDataUrl !== undefined) {
        const logo = dto.logoDataUrl?.trim() ?? '';
        if (logo && !logo.startsWith('data:image/')) {
          throw new BadRequestException('La foto del club no es válida.');
        }
        club.logoDataUrl = logo || null;
      }

      if (dto.membershipTypes) {
        const rows = normalizeMembershipTypes(dto.membershipTypes);
        syncLegacyClubColumns(club, rows);
        if (dto.sportShootingFeeMxn !== undefined) {
          club.sportShootingFeeMxn = String(dto.sportShootingFeeMxn);
        }
        if (dto.huntingFeeMxn !== undefined) {
          club.huntingFeeMxn = String(dto.huntingFeeMxn);
        }
        if (dto.sportShooting) {
          applyWindow(club, 'sportShooting', dto.sportShooting);
        }
        if (dto.hunting) {
          applyWindow(club, 'hunting', dto.hunting);
        }
        const repo = manager.getRepository(ClubMembershipType);
        const existing = await repo.find({ where: { clubId } });
        const byCode = new Map(existing.map((row) => [row.code, row]));
        const keepCodes = new Set<string>();
        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index];
          keepCodes.add(row.code);
          const prev = byCode.get(row.code);
          if (prev) {
            prev.name = row.name;
            prev.startMonth = row.startMonth;
            prev.startDay = row.startDay;
            prev.endMonth = row.endMonth;
            prev.endDay = row.endDay;
            prev.feeMxn = String(row.feeMxn);
            prev.sortOrder = index;
            await repo.save(prev);
          } else {
            await repo.save(
              repo.create({
                clubId,
                code: row.code,
                name: row.name,
                startMonth: row.startMonth,
                startDay: row.startDay,
                endMonth: row.endMonth,
                endDay: row.endDay,
                feeMxn: String(row.feeMxn),
                sortOrder: index,
              }),
            );
          }
        }
        for (const row of existing) {
          if (!keepCodes.has(row.code)) {
            await repo.delete({ id: row.id });
          }
        }
      } else {
        if (dto.sportShootingFeeMxn !== undefined) {
          club.sportShootingFeeMxn = String(dto.sportShootingFeeMxn);
        }
        if (dto.huntingFeeMxn !== undefined) {
          club.huntingFeeMxn = String(dto.huntingFeeMxn);
        }
        if (dto.sportShooting) {
          applyWindow(club, 'sportShooting', dto.sportShooting);
        }
        if (dto.hunting) {
          applyWindow(club, 'hunting', dto.hunting);
        }
      }

      await clubs.save(club);

      if (dto.requiredDocuments) {
        const seen = new Set<string>();
        for (const row of dto.requiredDocuments) {
          const slot = row.slot.trim();
          if (seen.has(slot)) {
            throw new BadRequestException(`El identificador «${slot}» está repetido.`);
          }
          seen.add(slot);
        }
        const defs = manager.getRepository(ClubMemberDocumentDef);
        const existing = await defs.find({ where: { clubId } });
        const bySlot = new Map(existing.map((row) => [row.slot, row]));
        const keepSlots = new Set<string>();
        for (let index = 0; index < dto.requiredDocuments.length; index += 1) {
          const row = dto.requiredDocuments[index];
          const slot = row.slot.trim();
          const label = row.label.trim();
          keepSlots.add(slot);
          const prev = bySlot.get(slot);
          if (prev) {
            prev.label = label;
            prev.sortOrder = index;
            await defs.save(prev);
          } else {
            await defs.save(
              defs.create({
                clubId,
                slot,
                label,
                sortOrder: index,
                effectiveFromYear: null,
              }),
            );
          }
        }
        for (const row of existing) {
          if (!keepSlots.has(row.slot)) {
            await defs.delete({ id: row.id });
          }
        }
      }
    });
    return this.read(clubId);
  }

  async labelMap(clubId: number): Promise<Record<string, string>> {
    const defs = await loadClubDocumentDefs(this.documentDefs, clubId);
    return documentLabelMap(defs);
  }

  async requiredSlots(clubId: number): Promise<string[]> {
    const defs = await loadClubDocumentDefs(this.documentDefs, clubId);
    return defs.map((row) => row.slot);
  }

  private requireClub(clubId: number) {
    return this.clubs.findOne({ where: { id: clubId } }).then((club) => {
      if (!club) {
        throw new NotFoundException('No se encontró el club.');
      }
      return club;
    });
  }
}

export function mapSettings(
  club: Club,
  defs: Awaited<ReturnType<typeof loadClubDocumentDefs>>,
  types: MembershipTypeRow[],
) {
  const sport = types.find((row) => row.code === 'tiro-deportivo');
  const hunting = types.find((row) => row.code === 'caza');
  return {
    id: club.id,
    name: club.name,
    tagline: club.tagline,
    legalName: club.legalName,
    logoDataUrl: club.logoDataUrl,
    memberNumberPrefix: club.memberNumberPrefix ?? '',
    membershipTypes: types.map((row) => ({
      code: row.code,
      name: row.name,
      startMonth: row.startMonth,
      startDay: row.startDay,
      endMonth: row.endMonth,
      endDay: row.endDay,
      feeMxn: row.feeMxn,
      createdAt: row.createdAt.toISOString(),
    })),
    sportShootingFeeMxn: sport?.feeMxn ?? Number(club.sportShootingFeeMxn),
    huntingFeeMxn: hunting?.feeMxn ?? Number(club.huntingFeeMxn),
    sportShooting: {
      startMonth: sport?.startMonth ?? club.sportShootingStartMonth,
      startDay: sport?.startDay ?? club.sportShootingStartDay,
      endMonth: sport?.endMonth ?? club.sportShootingEndMonth,
      endDay: sport?.endDay ?? club.sportShootingEndDay,
    },
    hunting: {
      startMonth: hunting?.startMonth ?? club.huntingStartMonth,
      startDay: hunting?.startDay ?? club.huntingStartDay,
      endMonth: hunting?.endMonth ?? club.huntingEndMonth,
      endDay: hunting?.endDay ?? club.huntingEndDay,
    },
    requiredDocuments: defs.map((row) => ({
      slot: row.slot,
      label: row.label,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

function normalizeMembershipTypes(
  rows: readonly {
    code?: string;
    name: string;
    startMonth: number;
    startDay: number;
    endMonth: number;
    endDay: number;
    feeMxn: number;
  }[],
): MembershipTypePatchRow[] {
  const usedCodes = new Set<string>();
  return rows.map((row, index) => {
    const name = row.name.trim();
    if (name.length < 2) {
      throw new BadRequestException('Escribe el nombre de la modalidad.');
    }
    assertDay(row.startMonth, row.startDay);
    assertDay(row.endMonth, row.endDay);
    let code = row.code?.trim() || slugify(name);
    if (!code) {
      code = `membresia-${index + 1}`;
    }
    let unique = code;
    let suffix = 2;
    while (usedCodes.has(unique)) {
      unique = `${code}-${suffix}`;
      suffix += 1;
    }
    usedCodes.add(unique);
    return {
      code: unique,
      name,
      startMonth: row.startMonth,
      startDay: row.startDay,
      endMonth: row.endMonth,
      endDay: row.endDay,
      feeMxn: row.feeMxn,
      sortOrder: index,
    };
  });
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function applyWindow(
  club: Club,
  kind: 'sportShooting' | 'hunting',
  window: { startMonth: number; startDay: number; endMonth: number; endDay: number },
) {
  assertDay(window.startMonth, window.startDay);
  assertDay(window.endMonth, window.endDay);
  if (kind === 'sportShooting') {
    club.sportShootingStartMonth = window.startMonth;
    club.sportShootingStartDay = window.startDay;
    club.sportShootingEndMonth = window.endMonth;
    club.sportShootingEndDay = window.endDay;
  } else {
    club.huntingStartMonth = window.startMonth;
    club.huntingStartDay = window.startDay;
    club.huntingEndMonth = window.endMonth;
    club.huntingEndDay = window.endDay;
  }
}

function assertDay(month: number, day: number) {
  const max = daysInMonth(month);
  if (day > max) {
    throw new BadRequestException(`El día ${day} no es válido para el mes ${month}.`);
  }
}

function daysInMonth(month: number): number {
  if (month === 2) {
    return 29;
  }
  if ([4, 6, 9, 11].includes(month)) {
    return 30;
  }
  return 31;
}

function requireConfigWrite(actor: AppUser) {
  requireStaffModule(
    actor.role,
    normalizeStaffModulePermissions(actor.modulePermissions),
    'configuracion',
    'write',
  );
}
