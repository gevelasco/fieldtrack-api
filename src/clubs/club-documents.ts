import { Repository } from 'typeorm';
import { ClubMemberDocumentDef } from './entities/club-member-document-def.entity';

export interface ClubDocumentDefRow {
  slot: string;
  label: string;
  sortOrder: number;
  effectiveFromYear: number | null;
  createdAt: Date;
}

export async function loadClubDocumentDefs(
  repo: Repository<ClubMemberDocumentDef>,
  clubId: number,
): Promise<ClubDocumentDefRow[]> {
  const rows = await repo.find({
    where: { clubId },
    order: { sortOrder: 'ASC', id: 'ASC' },
  });
  return rows.map((row) => ({
    slot: row.slot,
    label: row.label,
    sortOrder: row.sortOrder,
    effectiveFromYear: row.effectiveFromYear,
    createdAt: row.createdAt,
  }));
}

export function activeDocumentSlots(defs: readonly { slot: string }[]): string[] {
  return defs.map((row) => row.slot);
}

export function documentLabelMap(defs: readonly ClubDocumentDefRow[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of defs) {
    map[row.slot] = row.label;
  }
  return map;
}

export function labelForSlot(map: Record<string, string>, slot: string): string {
  return map[slot] ?? slot;
}
