import { type ImportFieldId, type WeaponImportFieldId, isWeaponImportFieldId } from './members-import-field-ids';
import { isIgnoredImportHeader } from './members-import-flex';
import { matchWeaponFieldFromHeader } from './members-import-header-match';
import { normalizeKey } from './members-import-keys';

export type InlineWeaponSlot = {
  index: number;
  brand?: string;
  model?: string;
  caliber?: string;
  serialNumber?: string;
  platformRaw?: string;
  modalityRaw?: string;
  hasPetaRaw?: string;
  registeredOnRaw?: string;
};

const WEAPON_FIELD: Record<string, keyof Omit<InlineWeaponSlot, 'index'>> = {
  marca: 'brand',
  modelo: 'model',
  calibre: 'caliber',
  numero_serie: 'serialNumber',
  serie: 'serialNumber',
  serial: 'serialNumber',
  plataforma: 'platformRaw',
  modalidad_arma: 'modalityRaw',
  modalidad_registro: 'modalityRaw',
  con_peta: 'hasPetaRaw',
  peta: 'hasPetaRaw',
  fecha_registro: 'registeredOnRaw',
  registrada_en: 'registeredOnRaw',
};

const SLOT_TO_WEAPON_IMPORT: Record<keyof Omit<InlineWeaponSlot, 'index'>, WeaponImportFieldId> = {
  brand: 'weaponBrand',
  model: 'weaponModel',
  caliber: 'weaponCaliber',
  serialNumber: 'weaponSerial',
  platformRaw: 'weaponPlatform',
  modalityRaw: 'weaponModality',
  hasPetaRaw: 'weaponHasPeta',
  registeredOnRaw: 'weaponRegisteredOn',
};

const WEAPON_IMPORT_TO_SLOT: Record<WeaponImportFieldId, keyof Omit<InlineWeaponSlot, 'index'>> = {
  weaponBrand: 'brand',
  weaponModel: 'model',
  weaponCaliber: 'caliber',
  weaponSerial: 'serialNumber',
  weaponPlatform: 'platformRaw',
  weaponModality: 'modalityRaw',
  weaponHasPeta: 'hasPetaRaw',
  weaponRegisteredOn: 'registeredOnRaw',
};

export function suggestWeaponImportFieldFromHeader(header: string): WeaponImportFieldId | null {
  const key = normalizeKey(header);
  const indexed = weaponIndexFromHeader(key);
  if (indexed) {
    return SLOT_TO_WEAPON_IMPORT[indexed.field] ?? null;
  }
  const byKeywords = matchWeaponFieldFromHeader(header);
  if (byKeywords && isWeaponImportFieldId(byKeywords)) {
    return byKeywords;
  }
  return null;
}

function resolveMappedWeaponField(
  header: string,
  columnMapping?: Readonly<Record<string, ImportFieldId>>,
): { index: number; field: keyof Omit<InlineWeaponSlot, 'index'> } | null {
  if (!columnMapping) {
    return null;
  }
  const explicit = columnMapping[header] ?? columnMapping[normalizeKey(header)];
  if (!explicit || explicit === 'ignore' || !isWeaponImportFieldId(explicit)) {
    return null;
  }
  const slotField = WEAPON_IMPORT_TO_SLOT[explicit];
  const key = normalizeKey(header);
  const indexed = weaponIndexFromHeader(key);
  const index = indexed?.index ?? 1;
  return { index, field: slotField };
}

function weaponIndexFromHeader(key: string): { index: number; field: keyof Omit<InlineWeaponSlot, 'index'> } | null {
  const armaPrefixed = key.match(/^arma[_-]?(\d+)?[_-]?(marca|modelo|calibre|serie|numero_serie|plataforma|modalidad|peta|fecha_registro)$/);
  if (armaPrefixed) {
    const index = armaPrefixed[1] ? Number(armaPrefixed[1]) : 1;
    const part = armaPrefixed[2] === 'serie' ? 'serialNumber' : WEAPON_FIELD[armaPrefixed[2]];
    if (part) {
      return { index, field: part };
    }
  }
  for (const [alias, field] of Object.entries(WEAPON_FIELD)) {
    const numbered = key.match(new RegExp(`^${alias}[_-]?(\\d+)$`));
    if (numbered) {
      return { index: Number(numbered[1]), field };
    }
    if (key === alias) {
      return { index: 1, field };
    }
  }
  if (key === 'tipo' || key === 'clase' || key === 'descripcion' || key === 'sistema') {
    return { index: 1, field: 'platformRaw' };
  }
  if (key === 'marca' || key === 'modelo' || key === 'calibre') {
    const suffix = key;
    return { index: 1, field: WEAPON_FIELD[suffix] };
  }
  if (/marca/.test(key) && !key.includes('membresia')) {
    return { index: 1, field: 'brand' };
  }
  if (/modelo/.test(key)) {
    return { index: 1, field: 'model' };
  }
  if (/calibre|(^|_)cal($|_)/.test(key)) {
    return { index: 1, field: 'caliber' };
  }
  if (/numero[_-]?serie|num[_-]?serie|(^|_)serie($|_)/.test(key) || /matricula/.test(key)) {
    return { index: 1, field: 'serialNumber' };
  }
  if (/clase/.test(key) && /arma/.test(key)) {
    return { index: 1, field: 'platformRaw' };
  }
  return null;
}

function cellText(value: unknown): string {
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

const PLATFORM_TOKEN = 'pistola|revolver|rev[oó]lver|escopeta|rifle|carabina';
/** «PISTOLA - BROWNING - 446755» → plataforma, marca, serie. */
const PACKED_PLATFORM_BRAND_SERIAL = new RegExp(
  `^(${PLATFORM_TOKEN})\\s*[-–—/|]\\s*(.+?)\\s*[-–—/|]\\s*([A-Za-z0-9][A-Za-z0-9._/-]*)$`,
  'i',
);

function splitDashParts(raw: string): string[] {
  return raw
    .split(/\s*[-–—|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Completa huecos típicos de padrones club/PRD:
 * - celdas «TIPO - MARCA - SERIE»
 * - calibre «9 MM - 122 - 30/03/2026» → solo el calibre
 * - marca+calibre sin modelo → «S/M»
 */
export function enrichInlineWeaponSlot(slot: InlineWeaponSlot): InlineWeaponSlot {
  const out: InlineWeaponSlot = { ...slot };

  for (const key of ['platformRaw', 'brand', 'model'] as const) {
    const raw = (out[key] ?? '').trim();
    if (!raw) {
      continue;
    }
    const packed = PACKED_PLATFORM_BRAND_SERIAL.exec(raw);
    if (!packed) {
      continue;
    }
    out.platformRaw = (out.platformRaw ?? '').trim() || packed[1].trim();
    const extractedBrand = packed[2].trim();
    const extractedSerial = packed[3].trim();
    if (!(out.brand ?? '').trim() || PACKED_PLATFORM_BRAND_SERIAL.test((out.brand ?? '').trim())) {
      out.brand = extractedBrand;
    }
    if (!(out.serialNumber ?? '').trim()) {
      out.serialNumber = extractedSerial;
    }
    if (key === 'model' && PACKED_PLATFORM_BRAND_SERIAL.test(raw)) {
      out.model = undefined;
    }
    break;
  }

  const caliberRaw = (out.caliber ?? '').trim();
  if (caliberRaw && /[-–—]/.test(caliberRaw)) {
    const parts = splitDashParts(caliberRaw);
    if (parts.length >= 2 && /\d/.test(parts[0])) {
      out.caliber = parts[0];
    }
  }

  const brand = (out.brand ?? '').trim();
  const model = (out.model ?? '').trim();
  const caliber = (out.caliber ?? '').trim();
  if (brand && caliber && !model) {
    out.model = 'S/M';
  }

  return out;
}

/** Armas en las mismas filas del padrón (columnas en orden con alias conocidos o mapeo manual). */
export function extractInlineWeaponsFromRow(
  raw: Record<string, unknown>,
  columnMapping?: Readonly<Record<string, ImportFieldId>>,
): InlineWeaponSlot[] {
  const slots = new Map<number, InlineWeaponSlot>();
  for (const [header, value] of Object.entries(raw)) {
    if (columnMapping?.[header] === 'ignore' || columnMapping?.[normalizeKey(header)] === 'ignore') {
      continue;
    }
    if (isIgnoredImportHeader(header)) {
      continue;
    }
    const mapped = resolveMappedWeaponField(header, columnMapping);
    const key = normalizeKey(header);
    const fromHeader = matchWeaponFieldFromHeader(header);
    const fromHeaderSlot =
      fromHeader && isWeaponImportFieldId(fromHeader)
        ? { index: weaponIndexFromHeader(key)?.index ?? 1, field: WEAPON_IMPORT_TO_SLOT[fromHeader] }
        : null;
    const match = mapped ?? weaponIndexFromHeader(key) ?? fromHeaderSlot;
    if (!match) {
      continue;
    }
    const text = cellText(value);
    if (!text) {
      continue;
    }
    const slot = slots.get(match.index) ?? { index: match.index };
    Object.assign(slot, { [match.field]: text });
    slots.set(match.index, slot);
  }
  return [...slots.values()]
    .map((slot) => enrichInlineWeaponSlot(slot))
    .filter((slot) => slot.brand || slot.model || slot.caliber || slot.serialNumber)
    .sort((a, b) => a.index - b.index);
}