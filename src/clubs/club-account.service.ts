import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppUser } from '../users/entities/app-user.entity';
import {
  buildClubBillingHistory,
  formatLongDateMx,
  subscriptionValidThroughIso,
} from './club-billing.util';
import { RedeemClubCouponDto } from './dto/redeem-club-coupon.dto';
import { UpdateClubAccountDto } from './dto/update-club-account.dto';
import { Club } from './entities/club.entity';
import { normalizeMemberNumberPrefix } from './member-number';

@Injectable()
export class ClubAccountService {
  constructor(@InjectRepository(Club) private readonly clubs: Repository<Club>) {}

  async read(clubId: number, actor: AppUser) {
    requireClubAdmin(actor);
    const club = await this.requireClub(clubId);
    const registeredAt = club.createdAt;
    const bonusMonths = club.subscriptionBonusMonths ?? 0;
    const validThrough = subscriptionValidThroughIso(new Date(), bonusMonths);
    return {
      name: club.name,
      tagline: club.tagline,
      logoDataUrl: club.logoDataUrl,
      memberNumberPrefix: club.memberNumberPrefix ?? '',
      subscriptionStatus: club.subscriptionStatus,
      subscriptionBonusMonths: bonusMonths,
      licenseStatusLabel: licenseStatusLabel(club.subscriptionStatus),
      planName: 'FieldTrack',
      planBadge: 'Beta',
      registeredAt: registeredAt.toISOString(),
      registeredAtLabel: formatLongDateMx(registeredAt),
      validThrough,
      validThroughLabel: formatLongDateMx(validThrough),
      payments: buildClubBillingHistory(registeredAt, new Date(), bonusMonths),
    };
  }

  async redeemCoupon(clubId: number, actor: AppUser, dto: RedeemClubCouponDto) {
    requireClubAdmin(actor);
    const club = await this.requireClub(clubId);
    if (!matchesCouponCode(dto.code)) {
      throw new BadRequestException('El cupón no es válido.');
    }
    club.subscriptionBonusMonths = (club.subscriptionBonusMonths ?? 0) + 1;
    await this.clubs.save(club);
    return this.read(clubId, actor);
  }

  async updateIdentity(clubId: number, actor: AppUser, dto: UpdateClubAccountDto) {
    requireClubAdmin(actor);
    const club = await this.requireClub(clubId);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name.length < 2) {
        throw new BadRequestException('Escribe el nombre del club.');
      }
      club.name = name;
    }

    if (dto.tagline !== undefined) {
      club.tagline = dto.tagline?.trim() || null;
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

    await this.clubs.save(club);
    return this.read(clubId, actor);
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

function requireClubAdmin(actor: AppUser): void {
  if (actor.role !== 'admin') {
    throw new ForbiddenException('Solo el administrador puede acceder a la cuenta del club.');
  }
}

function matchesCouponCode(raw: string): boolean {
  const expected = (process.env.CLUB_SUBSCRIPTION_COUPON ?? 'MES-GRATIS').trim().toLowerCase();
  return raw.trim().toLowerCase() === expected;
}

function licenseStatusLabel(status: string): string {
  if (status === 'active') {
    return 'Activa';
  }
  if (status === 'suspended') {
    return 'Suspendida';
  }
  return 'Activa';
}
