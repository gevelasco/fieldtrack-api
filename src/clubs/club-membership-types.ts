import { Repository } from 'typeorm';
import { Club } from './entities/club.entity';
import { ClubMembershipType } from './entities/club-membership-type.entity';

import { normalizeMembershipBillingPeriod, type MembershipBillingPeriod } from '../members/membership-billing';

export interface MembershipTypeRow {
  code: string;
  name: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  feeMxn: number;
  billingPeriod: MembershipBillingPeriod;
  allowsSportShooting: boolean;
  allowsHunting: boolean;
  sortOrder: number;
  createdAt: Date;
}

export type MembershipTypePatchRow = Omit<MembershipTypeRow, 'createdAt'>;

export async function loadMembershipTypes(
  repo: Repository<ClubMembershipType>,
  clubId: number,
): Promise<MembershipTypeRow[]> {
  const rows = await repo.find({
    where: { clubId },
    order: { sortOrder: 'ASC', id: 'ASC' },
  });
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    startMonth: row.startMonth,
    startDay: row.startDay,
    endMonth: row.endMonth,
    endDay: row.endDay,
    feeMxn: Number(row.feeMxn),
    billingPeriod: normalizeMembershipBillingPeriod(row.billingPeriod),
    allowsSportShooting: row.allowsSportShooting,
    allowsHunting: row.allowsHunting,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  }));
}

export function membershipTypesFromClub(club: Club): MembershipTypeRow[] {
  const seededAt = new Date();
  const fee = Number(club.sportShootingFeeMxn) || Number(club.huntingFeeMxn);
  return [
    {
      code: 'general',
      name: 'Membresía general',
      startMonth: club.sportShootingStartMonth,
      startDay: club.sportShootingStartDay,
      endMonth: club.sportShootingEndMonth,
      endDay: club.sportShootingEndDay,
      feeMxn: fee,
      billingPeriod: 'anual',
      allowsSportShooting: true,
      allowsHunting: true,
      sortOrder: 0,
      createdAt: seededAt,
    },
  ];
}

/** Conserva las tarifas del club alineadas al plan «general» u homólogo, si existe. */
export function syncLegacyClubColumns(club: Club, types: readonly MembershipTypePatchRow[]): void {
  const general = types.find((row) => row.code === 'general');
  if (general) {
    club.sportShootingFeeMxn = String(general.feeMxn);
    club.huntingFeeMxn = String(general.feeMxn);
    return;
  }
  const sport = types.find((row) => row.allowsSportShooting && !row.allowsHunting);
  const hunting = types.find((row) => row.allowsHunting && !row.allowsSportShooting);
  if (sport) {
    club.sportShootingFeeMxn = String(sport.feeMxn);
  }
  if (hunting) {
    club.huntingFeeMxn = String(hunting.feeMxn);
  }
}
