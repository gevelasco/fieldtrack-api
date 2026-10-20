import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Scope,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { displayMemberNumber } from '../clubs/member-number';
import { Club } from '../clubs/entities/club.entity';
import { Member } from '../members/entities/member.entity';
import { AppUser } from '../users/entities/app-user.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { normalizeStaffModulePermissions } from '../clubs/staff-module-permissions';
import { UpdateProfileDto } from './dto/update-profile.dto';

export type ThemeScheme = 'light' | 'dark';

@Injectable({ scope: Scope.REQUEST })
export class SessionService {
  constructor(
    @Inject(REQUEST) private readonly request: Request,
    @InjectRepository(AppUser) private readonly users: Repository<AppUser>,
    @InjectRepository(Club) private readonly clubs: Repository<Club>,
    @InjectRepository(UserPreferences) private readonly preferences: Repository<UserPreferences>,
    @InjectRepository(Member) private readonly members: Repository<Member>,
  ) {}

  async current(): Promise<{
    user: AppUser;
    club: Club;
    theme: ThemeScheme;
    memberNumber: string | null;
  }> {
    const payload = this.request.user;
    if (!payload?.sub) {
      throw new UnauthorizedException('Inicia sesión.');
    }
    const user = await this.users.findOne({
      where: { id: payload.sub, status: 'active' },
    });
    if (!user) {
      throw new UnauthorizedException('Inicia sesión.');
    }
    const club = await this.clubs.findOne({ where: { id: user.clubId } });
    if (!club) {
      throw new NotFoundException('No hay un club para esta sesión.');
    }
    return {
      user,
      club,
      theme: await this.themeOf(user.id),
      memberNumber: await this.memberNumberOf(user, club),
    };
  }

  private async memberNumberOf(user: AppUser, club: Club): Promise<string | null> {
    if (user.role !== 'socio') {
      return null;
    }
    const member = await this.members.findOne({
      where: { clubId: user.clubId, userId: user.id },
      select: ['id', 'memberNumber'],
    });
    const formatted = displayMemberNumber(member?.memberNumber, club.memberNumberPrefix);
    return formatted || null;
  }

  async updateProfile(userId: number, dto: UpdateProfileDto): Promise<AppUser> {
    const user = await this.users.findOne({ where: { id: userId, status: 'active' } });
    if (!user) {
      throw new UnauthorizedException('Inicia sesión.');
    }

    if (dto.displayName !== undefined) {
      const name = dto.displayName.trim();
      if (name.length < 2) {
        throw new BadRequestException('Escribe tu nombre.');
      }
      user.displayName = name;
    }

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (!email) {
        user.email = null;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new BadRequestException('Escribe un correo válido.');
      } else {
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
    }

    if (dto.phone !== undefined) {
      const phone = dto.phone.trim();
      user.phone = phone || null;
    }

    if (dto.photoDataUrl !== undefined) {
      const photo = dto.photoDataUrl.trim();
      if (photo && !photo.startsWith('data:image/')) {
        throw new BadRequestException('La foto no es válida.');
      }
      user.photoDataUrl = photo || null;
    }

    await this.users.save(user);

    if (dto.theme) {
      await this.preferences.save({ userId, themeScheme: dto.theme });
    }

    return user;
  }

  async themeOf(userId: number): Promise<ThemeScheme> {
    const prefs = await this.preferences.findOne({ where: { userId } });
    return prefs?.themeScheme === 'dark' ? 'dark' : 'light';
  }
}

export function mapSession(
  user: AppUser,
  club: Club,
  theme: ThemeScheme,
  requiredDocuments: readonly { slot: string; label: string; createdAt?: string }[] = [],
  membershipTypes: readonly {
    code: string;
    name: string;
    startMonth: number;
    startDay: number;
    endMonth: number;
    endDay: number;
    feeMxn: number;
  }[] = [],
  memberNumber: string | null = null,
) {
  return {
    user: {
      id: user.id,
      clubId: user.clubId,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      photoDataUrl: user.photoDataUrl,
      theme,
      memberNumber,
      modulePermissions:
        user.role === 'staff' ? normalizeStaffModulePermissions(user.modulePermissions) : null,
    },
    club: {
      id: club.id,
      name: club.name,
      tagline: club.tagline,
      legalName: club.legalName,
      logoDataUrl: club.logoDataUrl,
      memberNumberPrefix: club.memberNumberPrefix ?? '',
      sportShootingFeeMxn: Number(club.sportShootingFeeMxn),
      huntingFeeMxn: Number(club.huntingFeeMxn),
      sportShooting: {
        startMonth: club.sportShootingStartMonth,
        startDay: club.sportShootingStartDay,
        endMonth: club.sportShootingEndMonth,
        endDay: club.sportShootingEndDay,
      },
      hunting: {
        startMonth: club.huntingStartMonth,
        startDay: club.huntingStartDay,
        endMonth: club.huntingEndMonth,
        endDay: club.huntingEndDay,
      },
      requiredDocuments: requiredDocuments.map((row) => ({
        slot: row.slot,
        label: row.label,
        ...(row.createdAt ? { createdAt: row.createdAt } : {}),
      })),
      membershipTypes: membershipTypes.map((row) => ({
        code: row.code,
        name: row.name,
        startMonth: row.startMonth,
        startDay: row.startDay,
        endMonth: row.endMonth,
        endDay: row.endDay,
        feeMxn: row.feeMxn,
      })),
    },
  };
}
