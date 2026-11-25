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

export type MemberSessionProfile = {
  memberNumber: string;
  firstName: string;
  paternalSurname: string;
  curp: string;
  rfc: string;
  address: string;
};

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
    memberProfile: MemberSessionProfile | null;
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
    const [club, theme, memberProfile] = await Promise.all([
      this.clubs.findOne({ where: { id: user.clubId } }),
      this.themeOf(user.id),
      this.memberProfileOf(user),
    ]);
    if (!club) {
      throw new NotFoundException('No hay un club para esta sesión.');
    }
    return {
      user,
      club,
      theme,
      memberNumber: memberProfile?.memberNumber
        ? displayMemberNumber(memberProfile.memberNumber, club.memberNumberPrefix) || null
        : null,
      memberProfile,
    };
  }

  private async memberProfileOf(user: AppUser): Promise<MemberSessionProfile | null> {
    if (user.role !== 'socio') {
      return null;
    }
    const member = await this.members.findOne({
      where: { clubId: user.clubId, userId: user.id },
      select: ['id', 'memberNumber', 'firstName', 'paternalSurname', 'curp', 'rfc', 'address'],
    });
    if (!member) {
      return null;
    }
    return {
      memberNumber: member.memberNumber,
      firstName: member.firstName ?? '',
      paternalSurname: member.paternalSurname ?? '',
      curp: member.curp ?? '',
      rfc: member.rfc ?? '',
      address: member.address ?? '',
    };
  }

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
  ): Promise<{ user: AppUser; memberProfile: MemberSessionProfile | null }> {
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

    let memberProfile = await this.memberProfileOf(user);
    if (user.role === 'socio' && (dto.curp !== undefined || dto.rfc !== undefined || dto.address !== undefined)) {
      const member = await this.members.findOne({
        where: { clubId: user.clubId, userId: user.id },
      });
      if (!member) {
        throw new NotFoundException('No hay un expediente de socio vinculado a esta cuenta.');
      }
      if (dto.curp !== undefined) {
        member.curp = normalizeMemberCurp(dto.curp);
      }
      if (dto.rfc !== undefined) {
        member.rfc = normalizeMemberRfc(dto.rfc);
      }
      if (dto.address !== undefined) {
        member.address = dto.address.trim();
      }
      await this.members.save(member);
      memberProfile = {
        memberNumber: member.memberNumber,
        firstName: member.firstName ?? '',
        paternalSurname: member.paternalSurname ?? '',
        curp: member.curp ?? '',
        rfc: member.rfc ?? '',
        address: member.address ?? '',
      };
    }

    return { user, memberProfile };
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
  requiredDocuments: readonly {
    slot: string;
    label: string;
    validityCode?: string;
    createdAt?: string;
  }[] = [],
  membershipTypes: readonly {
    code: string;
    name: string;
    feeMxn: number;
    billingPeriod?: string;
    allowsSportShooting?: boolean;
    allowsHunting?: boolean;
    createdAt?: string;
  }[] = [],
  memberNumber: string | null = null,
  officialFormFees: readonly {
    formId: string;
    importeMxn: number;
    cantidadPagarMxn: number;
    totalPagarMxn: number;
  }[] = [],
  memberProfile: MemberSessionProfile | null = null,
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
      firstName: memberProfile?.firstName ?? null,
      paternalSurname: memberProfile?.paternalSurname ?? null,
      curp: memberProfile?.curp ?? null,
      rfc: memberProfile?.rfc ?? null,
      address: memberProfile?.address ?? null,
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
        name: club.sportShootingModalityLabel,
        startMonth: club.sportShootingStartMonth,
        startDay: club.sportShootingStartDay,
        endMonth: club.sportShootingEndMonth,
        endDay: club.sportShootingEndDay,
      },
      hunting: {
        name: club.huntingModalityLabel,
        startMonth: club.huntingStartMonth,
        startDay: club.huntingStartDay,
        endMonth: club.huntingEndMonth,
        endDay: club.huntingEndDay,
      },
      requiredDocuments: requiredDocuments.map((row) => ({
        slot: row.slot,
        label: row.label,
        validityCode: row.validityCode ?? 'na',
        ...(row.createdAt ? { createdAt: row.createdAt } : {}),
      })),
      membershipTypes: membershipTypes.map((row) => ({
        code: row.code,
        name: row.name,
        feeMxn: row.feeMxn,
        billingPeriod: row.billingPeriod ?? 'anual',
        allowsSportShooting: row.allowsSportShooting ?? true,
        allowsHunting: row.allowsHunting ?? true,
      })),
      officialFormFees: officialFormFees.map((row) => ({
        formId: row.formId,
        importeMxn: row.importeMxn,
        cantidadPagarMxn: row.cantidadPagarMxn,
        totalPagarMxn: row.totalPagarMxn,
      })),
    },
  };
}

function normalizeMemberCurp(value: string): string {
  const curp = value.trim().toUpperCase();
  if (!curp) {
    return '';
  }
  if (!/^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/.test(curp)) {
    throw new BadRequestException('Escribe una CURP válida (18 caracteres).');
  }
  return curp;
}

function normalizeMemberRfc(value: string): string {
  const rfc = value.trim().toUpperCase();
  if (!rfc) {
    return '';
  }
  if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) {
    throw new BadRequestException('Escribe un RFC válido.');
  }
  return rfc;
}
