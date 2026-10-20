import { actorOf, asDate, memberDisplayName } from '../members/member.mapper';
import { HuntingSeason } from './entities/hunting-season.entity';
import { HuntingSpecies } from './entities/hunting-species.entity';
import { HuntingTagSale } from './entities/hunting-tag-sale.entity';

export type SeasonStatus = 'upcoming' | 'active' | 'closed';

export function seasonStatus(season: Pick<HuntingSeason, 'startsOn' | 'endsOn'>, today: string): SeasonStatus {
  if (asDate(season.endsOn) < today) {
    return 'closed';
  }
  return asDate(season.startsOn) > today ? 'upcoming' : 'active';
}

export function activeSales(season: HuntingSeason): HuntingTagSale[] {
  return (season.sales ?? []).filter((sale) => !sale.revertedAt);
}

export function mapSeasonSummary(season: HuntingSeason, species: HuntingSpecies, today: string) {
  const sold = activeSales(season);
  return {
    id: season.id,
    speciesId: species.id,
    species: species.name,
    speciesIcon: species.icon,
    speciesScientificName: species.scientificName,
    label: season.label,
    startsOn: asDate(season.startsOn),
    endsOn: asDate(season.endsOn),
    tagCount: season.tagCount,
    tagPrice: Number(season.tagPrice),
    notes: season.notes,
    firstFolio: season.firstFolio,
    sold: sold.length,
    available: Math.max(0, season.tagCount - sold.length),
    collected: sold.reduce((total, sale) => total + Number(sale.amount), 0),
    status: seasonStatus(season, today),
  };
}

/** Siguiente folio sugerido; el usuario puede escribir otro si los cintillos no vienen en orden. */
export function suggestNextFolio(season: Pick<HuntingSeason, 'firstFolio'>, sales: HuntingTagSale[]): string | null {
  const active = sales.filter((sale) => !sale.revertedAt);
  const folios = active.map((sale) => sale.folio.trim()).filter(Boolean);
  if (folios.length === 0) {
    return season.firstFolio?.trim() || null;
  }
  const numeric = folios.filter((folio) => /^\d+$/.test(folio)).map((folio) => ({ raw: folio, n: Number(folio) }));
  if (numeric.length === 0) {
    return null;
  }
  const max = Math.max(...numeric.map((item) => item.n));
  const pad = Math.max(season.firstFolio?.length ?? 0, ...numeric.map((item) => item.raw.length));
  return String(max + 1).padStart(pad, '0');
}

export function mapSeasonDetail(season: HuntingSeason, species: HuntingSpecies, today: string) {
  const sales = [...(season.sales ?? [])];
  return {
    ...mapSeasonSummary(season, species, today),
    nextFolio: suggestNextFolio(season, sales),
    sales: sales
      .sort((a, b) => asDate(b.paidOn).localeCompare(asDate(a.paidOn)) || b.id - a.id)
      .map(mapSale),
  };
}

export function mapSale(sale: HuntingTagSale) {
  return {
    id: sale.id,
    folio: sale.folio,
    member: sale.member
      ? { id: sale.member.id, memberNumber: sale.member.memberNumber, name: memberDisplayName(sale.member) }
      : null,
    paidOn: asDate(sale.paidOn),
    amount: Number(sale.amount),
    recordedBy: actorOf(sale.recordedByUserId, sale.recordedBy),
    reverted:
      sale.revertedAt && sale.revertedByUserId
        ? { on: asDate(sale.revertedAt), by: actorOf(sale.revertedByUserId, sale.revertedBy) }
        : null,
  };
}

export function mapSpecies(species: HuntingSpecies, today: string) {
  return {
    id: species.id,
    name: species.name,
    scientificName: species.scientificName,
    icon: species.icon,
    seasons: [...(species.seasons ?? [])]
      .sort((a, b) => asDate(b.startsOn).localeCompare(asDate(a.startsOn)))
      .map((season) => mapSeasonSummary(season, species, today)),
  };
}

/** Para comparar nombres de especie sin importar mayúsculas, acentos ni espacios de más. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
