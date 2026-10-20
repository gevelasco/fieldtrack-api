import { Repository } from 'typeorm';
import { Club } from './entities/club.entity';
import { ClubMembershipType } from './entities/club-membership-type.entity';

export interface MembershipTypeRow {
  code: string;
  name: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  feeMxn: number;
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
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  }));
}

export function membershipTypesFromClub(club: Club): MembershipTypeRow[] {
  const seededAt = new Date();
  return [
    {
      code: 'tiro-deportivo',
      name: 'Tiro deportivo',
      startMonth: club.sportShootingStartMonth,
      startDay: club.sportShootingStartDay,
      endMonth: club.sportShootingEndMonth,
      endDay: club.sportShootingEndDay,
      feeMxn: Number(club.sportShootingFeeMxn),
      sortOrder: 0,
      createdAt: seededAt,
    },
    {
      code: 'caza',
      name: 'Cacería',
      startMonth: club.huntingStartMonth,
      startDay: club.huntingStartDay,
      endMonth: club.huntingEndMonth,
      endDay: club.huntingEndDay,
      feeMxn: Number(club.huntingFeeMxn),
      sortOrder: 1,
      createdAt: seededAt,
    },
  ];
}

export function syncLegacyClubColumns(club: Club, types: readonly MembershipTypePatchRow[]): void {
  for (const row of types) {
    if (row.code === 'tiro-deportivo') {
      club.sportShootingFeeMxn = String(row.feeMxn);
      club.sportShootingStartMonth = row.startMonth;
      club.sportShootingStartDay = row.startDay;
      club.sportShootingEndMonth = row.endMonth;
      club.sportShootingEndDay = row.endDay;
    }
    if (row.code === 'caza') {
      club.huntingFeeMxn = String(row.feeMxn);
      club.huntingStartMonth = row.startMonth;
      club.huntingStartDay = row.startDay;
      club.huntingEndMonth = row.endMonth;
      club.huntingEndDay = row.endDay;
    }
  }
}
