import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hashPassword } from '../common/hash-password';
import EnvConfig from '../types/env-config.type';
import { AppUser } from '../users/entities/app-user.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { CreateClubStaffDto, UpdateClubStaffDto } from './dto/create-club-staff.dto';
import {
  assertStaffModulePermissions,
  normalizeStaffModulePermissions,
  requireStaffModule,
  type StaffModulePermissions,
} from './staff-module-permissions';

export interface ClubStaffRow {
  id: number;
  displayName: string;
  username: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  modulePermissions: StaffModulePermissions;
}

@Injectable()
export class ClubStaffService {
  constructor(
    @InjectRepository(AppUser) private readonly users: Repository<AppUser>,
    @InjectRepository(UserPreferences) private readonly preferences: Repository<UserPreferences>,
    private readonly config: ConfigService<EnvConfig>,
  ) {}

  async list(clubId: number): Promise<ClubStaffRow[]> {
    const rows = await this.users.find({
      where: { clubId, role: 'staff', status: 'active' },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return rows.map(mapStaffRow);
  }

  async create(clubId: number, actor: AppUser, dto: CreateClubStaffDto): Promise<ClubStaffRow> {
    requireConfigWrite(actor);
    const displayName = dto.displayName.trim();
    const email = dto.email.trim().toLowerCase();
    const phone = normalizeStaffPhone(dto.phone);
    const modulePermissions = assertStaffModulePermissions(dto.modulePermissions);
    const taken = await this.users
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email })
      .getOne();
    if (taken) {
      throw new ConflictException('Ese correo ya tiene una cuenta.');
    }
    const rounds = Number(this.config.get('SALT_ROUNDS', { infer: true }) ?? 10);
    const passwordHash = await hashPassword(dto.password, Number.isFinite(rounds) && rounds > 0 ? rounds : 10);
    const username = await uniqueUsername(this.users, clubId, email);
    const created = await this.users.manager.transaction(async (manager) => {
      const users = manager.getRepository(AppUser);
      const user = await users.save(
        users.create({
          clubId,
          username,
          displayName,
          email,
          phone,
          passwordHash,
          role: 'staff',
          status: 'active',
          modulePermissions: permissionsToJson(modulePermissions),
        }),
      );
      await manager.getRepository(UserPreferences).save({ userId: user.id, themeScheme: 'light' });
      return user;
    });
    return mapStaffRow(created);
  }

  async update(clubId: number, actor: AppUser, userId: number, dto: UpdateClubStaffDto): Promise<ClubStaffRow> {
    requireConfigWrite(actor);
    const user = await this.requireStaff(clubId, userId);
    if (dto.displayName !== undefined) {
      const displayName = dto.displayName.trim();
      if (displayName.length < 2) {
        throw new BadRequestException('Escribe el nombre.');
      }
      user.displayName = displayName;
    }
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      const taken = await this.users
        .createQueryBuilder('other')
        .where('LOWER(other.email) = :email', { email })
        .andWhere('other.id <> :id', { id: userId })
        .getOne();
      if (taken) {
        throw new ConflictException('Ese correo ya tiene una cuenta.');
      }
      user.email = email;
    }
    if (dto.phone !== undefined) {
      const trimmed = dto.phone.trim();
      user.phone = trimmed ? normalizeStaffPhone(trimmed) : null;
    }
    if (dto.password !== undefined) {
      const rounds = Number(this.config.get('SALT_ROUNDS', { infer: true }) ?? 10);
      user.passwordHash = await hashPassword(
        dto.password,
        Number.isFinite(rounds) && rounds > 0 ? rounds : 10,
      );
    }
    if (dto.modulePermissions !== undefined) {
      user.modulePermissions = permissionsToJson(assertStaffModulePermissions(dto.modulePermissions));
    }
    const saved = await this.users.save(user);
    return mapStaffRow(saved);
  }

  async deactivate(clubId: number, actor: AppUser, userId: number): Promise<void> {
    requireConfigWrite(actor);
    if (actor.id === userId) {
      throw new BadRequestException('No puedes darte de baja a ti mismo.');
    }
    const user = await this.requireStaff(clubId, userId);
    user.status = 'inactive';
    await this.users.save(user);
  }

  private requireStaff(clubId: number, userId: number) {
    return this.users.findOne({ where: { id: userId, clubId, role: 'staff', status: 'active' } }).then((user) => {
      if (!user) {
        throw new NotFoundException('No se encontró el usuario staff.');
      }
      return user;
    });
  }
}

function mapStaffRow(user: AppUser): ClubStaffRow {
  return {
    id: user.id,
    displayName: user.displayName ?? user.username,
    username: user.username,
    email: user.email,
    phone: user.phone,
    createdAt: user.createdAt.toISOString(),
    modulePermissions: normalizeStaffModulePermissions(user.modulePermissions),
  };
}

function permissionsToJson(permissions: StaffModulePermissions): Record<string, string> {
  const json: Record<string, string> = {};
  for (const [key, value] of Object.entries(permissions)) {
    if (value === 'view' || value === 'write') {
      json[key] = value;
    }
  }
  return json;
}

function requireConfigWrite(actor: AppUser) {
  requireStaffModule(
    actor.role,
    normalizeStaffModulePermissions(actor.modulePermissions),
    'configuracion',
    'write',
  );
}

function normalizeStaffPhone(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('52') && digits.length === 12) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10) {
    throw new BadRequestException('Escribe un teléfono de 10 dígitos.');
  }
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

async function uniqueUsername(users: Repository<AppUser>, clubId: number, email: string): Promise<string> {
  const base =
    email
      .split('@')[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 40) || 'staff';
  let candidate = base;
  let n = 1;
  while (await users.findOne({ where: { clubId, username: candidate } })) {
    n += 1;
    candidate = `${base.slice(0, 36)}${n}`;
  }
  return candidate;
}
