import * as XLSX from 'xlsx';
import {
  composeMemberAddress,
  mapMemberRow,
  pickPhone,
  resolveMemberFieldFromHeader,
  splitSpanishPersonName,
  splitStateAndZipBlob,
} from './members-import-flex';
import { matchImportFieldFromHeader } from './members-import-header-match';
import { type ImportFieldId } from './members-import-field-ids';
import { normalizeKey } from './members-import-keys';
import { extractInlineWeaponsFromRow, type InlineWeaponSlot } from './members-import-weapons-inline';

export type GroupedImportMemberRow = {
  sheetRow: number;
  memberNumber: string;
  firstName: string;
  paternalSurname: string;
  maternalSurname: string;
  membershipRaw: string;
  membershipModalityRaw: string;
  email: string;
  phone: string;
  joinedOnRaw: string;
  sexRaw: string;
  curp: string;
  rfc: string;
  address: string;
  inlineWeapons: InlineWeaponSlot[];
  sourceSheetRows: number[];
};

const CURP_CORE = /[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d/;

export function normalizeCurpImport(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/.test(upper)) {
    return upper;
  }
  const compact = upper.replace(/[^A-Z0-9]/g, '');
  const fromCompact = compact.match(CURP_CORE);
  if (fromCompact) {
    return fromCompact[0];
  }
  const fromRaw = upper.match(CURP_CORE);
  if (fromRaw) {
    return fromRaw[0];
  }
  return null;
}

type MappedMemberRow = ReturnType<typeof mapMemberRow>;

type MemberGroup = {
  anchorSheetRow: number;
  memberNumber: string;
  curp: string;
  firstName: string;
  paternalSurname: string;
  maternalSurname: string;
  membershipRaw: string;
  membershipModalityRaw: string;
  email: string;
  phone: string;
  joinedOnRaw: string;
  sexRaw: string;
  rfc: string;
  addressLine: string;
  colony: string;
  city: string;
  state: string;
  zip: string;
  fullAddress: string;
  inlineWeapons: InlineWeaponSlot[];
  sheetRows: number[];
};

export function findMemberSheetHeaderRowIndex(sheet: XLSX.WorkSheet): number {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  let bestIndex = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const headerRow = rows[i];
    if (!Array.isArray(headerRow)) {
      continue;
    }
    const fields = headerRow
      .map((cell) => (typeof cell === 'string' || typeof cell === 'number' ? String(cell) : ''))
      .map((header) => matchImportFieldFromHeader(header))
      .filter((field) => field && field !== 'ignore');
    const hasIdentity = fields.includes('memberNumber') || fields.includes('curp') || fields.includes('fullName');
    if (!hasIdentity) {
      continue;
    }
    const weaponHeaders = headerRow
      .map((cell) => normalizeKey(typeof cell === 'string' || typeof cell === 'number' ? String(cell) : ''))
      .filter((key) => key && /marca|modelo|calibre|serie|arma/.test(key)).length;
    const score = fields.length + weaponHeaders * 0.35;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function cellText(value: unknown): string {
  if (value == null) {
    return '';
  }
  return String(value).trim();
}

function isNotesRow(firstCell: unknown): boolean {
  const text = cellText(firstCell).toLowerCase();
  return text === 'obligatorio' || text.startsWith('opcional') || text.startsWith('debe existir');
}

function rowHasWeaponData(raw: Record<string, unknown>, columnMapping?: Readonly<Record<string, ImportFieldId>>): boolean {
  return extractInlineWeaponsFromRow(raw, columnMapping).length > 0;
}

function mapHasMemberIdentity(mapped: MappedMemberRow): boolean {
  return Boolean(
    (mapped.memberNumber ?? '').trim() ||
      (mapped.curp ?? '').trim() ||
      (mapped.fullName ?? '').trim() ||
      (mapped.firstName ?? '').trim(),
  );
}

function rowIsBlank(mapped: MappedMemberRow, raw: Record<string, unknown>): boolean {
  if (mapHasMemberIdentity(mapped)) {
    return false;
  }
  if (rowHasWeaponData(raw)) {
    return false;
  }
  const addressBits = [mapped.fullAddress, mapped.addressLine, mapped.colony, mapped.city, mapped.state, mapped.zip].some(
    (v) => (v ?? '').trim(),
  );
  return !addressBits;
}

function sameMemberKey(a: MemberGroup, memberNumber: string, curp: string): boolean {
  const aNum = a.memberNumber.trim();
  const aCurp = a.curp.trim();
  if (memberNumber && aNum) {
    return normalizeKey(memberNumber) === normalizeKey(aNum);
  }
  if (curp && aCurp) {
    return normalizeKey(curp) === normalizeKey(aCurp);
  }
  return !memberNumber && !curp;
}

function startsNewMemberGroup(group: MemberGroup | null, memberNumber: string, curp: string): boolean {
  if (!group) {
    return Boolean(memberNumber || curp);
  }
  const num = memberNumber.trim();
  const curpTrim = curp.trim();
  if (!num && !curpTrim) {
    return false;
  }
  if (num && group.memberNumber.trim() && normalizeKey(num) === normalizeKey(group.memberNumber)) {
    return false;
  }
  const curpNorm = curpTrim ? normalizeCurpImport(curpTrim) : null;
  const groupCurpNorm = group.curp.trim() ? normalizeCurpImport(group.curp) : null;
  if (curpNorm && groupCurpNorm && curpNorm === groupCurpNorm) {
    return false;
  }
  if (!num && curpTrim && !curpNorm) {
    return false;
  }
  if (!num && !curpNorm && groupCurpNorm) {
    return false;
  }
  return !sameMemberKey(group, memberNumber, curp);
}

/** Si `incoming` tiene valor, reemplaza `current` (última fila gana). */
function assignIfNonEmpty(current: string, incoming: string | undefined): string {
  const next = (incoming ?? '').trim();
  return next || current;
}

/** Conserva el primer valor no vacío (no pisar con filas posteriores del mismo socio). */
function keepFirstNonEmpty(current: string, incoming: string | undefined): string {
  if (current.trim()) {
    return current;
  }
  return (incoming ?? '').trim();
}

/** Une fragmentos de dirección de varias columnas/filas sin perder partes previas. */
function mergeAddressFragment(current: string, incoming: string | undefined): string {
  const next = (incoming ?? '').trim();
  if (!next) {
    return current;
  }
  if (!current.trim()) {
    return next;
  }
  if (current.includes(next)) {
    return current;
  }
  if (next.includes(current)) {
    return next;
  }
  // «JARDINES … COLIMA» + «COLIMA CP:28030» → evita «COLIMA COLIMA CP:…»
  const currentTrim = current.replace(/\s+/g, ' ').trim();
  const nextTrim = next.replace(/\s+/g, ' ').trim();
  const nextCp = /^(.*\bCOLIMA\b)\s+(CP[:\s.]*\d{5})$/i.exec(nextTrim);
  if (nextCp && new RegExp(`${escapeRegExp(nextCp[1].trim())}\\s*$`, 'i').test(currentTrim)) {
    return `${currentTrim} ${nextCp[2]}`;
  }
  if (/^COLIMA\b/i.test(nextTrim) && /\bCOLIMA\s*$/i.test(currentTrim)) {
    return `${currentTrim.replace(/\bCOLIMA\s*$/i, '').trim()} ${nextTrim}`.replace(/\s+/g, ' ').trim();
  }
  return `${currentTrim} ${nextTrim}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Normaliza direcciones multi-línea del padrón Coliman:
 * calle + colonia + «COLIMA CP:#####» → una sola línea sin CP/estado duplicados.
 */
export function finalizeImportAddress(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }
  const cpMatches = [...text.matchAll(/\bCP[:\s.]*(\d{5})\b/gi)];
  const zip = cpMatches.length ? cpMatches[cpMatches.length - 1][1] : '';
  let body = text.replace(/\bCP[:\s.]*\d{5}\b/gi, ' ').replace(/\s+/g, ' ').trim();
  // Quita «COLIMA COL.» / «COLIMA» repetidos al final (líneas de estado del padrón).
  body = body.replace(/(?:[\s,]+COL\.?)*[\s,]+COLIMA(?:[\s,]+COLIMA)*(?:[\s,]+COL\.?)*$/i, '').trim();
  body = body.replace(/\bCOLIMA(?:[\s,]+COLIMA)*(?:[\s,]+COL\.?)*$/i, '').trim();
  body = body.replace(/[,\s]+$/g, '').trim();
  if (!body) {
    return zip ? `COLIMA CP:${zip}` : '';
  }
  if (zip) {
    return `${body}, COLIMA CP:${zip}`;
  }
  return body;
}

function mergeWeapons(target: InlineWeaponSlot[], incoming: InlineWeaponSlot[]): void {
  const seen = new Set(
    target.map((w) =>
      [
        (w.brand ?? '').toLowerCase(),
        (w.model ?? '').toLowerCase(),
        (w.caliber ?? '').toLowerCase(),
        (w.serialNumber ?? '').toLowerCase(),
      ].join('|'),
    ),
  );
  for (const weapon of incoming) {
    const key = [
      (weapon.brand ?? '').toLowerCase(),
      (weapon.model ?? '').toLowerCase(),
      (weapon.caliber ?? '').toLowerCase(),
      (weapon.serialNumber ?? '').toLowerCase(),
    ].join('|');
    if (!key.replace(/\|/g, '').trim()) {
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    target.push(weapon);
  }
}

function applyMappedToGroup(
  group: MemberGroup,
  mapped: MappedMemberRow,
  raw: Record<string, unknown>,
  sheetRow: number,
  columnMapping?: Readonly<Record<string, ImportFieldId>>,
): void {
  group.sheetRows.push(sheetRow);
  const memberNumber = (mapped.memberNumber ?? '').trim();
  const curp = (mapped.curp ?? '').trim();
  if (memberNumber) {
    group.memberNumber = memberNumber;
  }
  if (curp) {
    const normalizedCurp = normalizeCurpImport(curp);
    if (normalizedCurp) {
      group.curp = normalizedCurp;
    }
  }

  let firstName = (mapped.firstName ?? '').trim();
  let paternalSurname = (mapped.paternalSurname ?? '').trim();
  let maternalSurname = (mapped.maternalSurname ?? '').trim();
  const fullName = (mapped.fullName ?? '').trim();
  if (fullName && (!firstName || !paternalSurname)) {
    const split = splitSpanishPersonName(fullName);
    firstName = split.firstName;
    paternalSurname = split.paternalSurname;
    maternalSurname = split.maternalSurname || maternalSurname;
  }
  if (firstName) {
    group.firstName = firstName;
  }
  if (paternalSurname) {
    group.paternalSurname = paternalSurname;
  }
  if (maternalSurname) {
    group.maternalSurname = maternalSurname;
  }

  group.membershipRaw = assignIfNonEmpty(group.membershipRaw, mapped.membershipRaw);
  group.membershipModalityRaw = assignIfNonEmpty(group.membershipModalityRaw, mapped.membershipModalityRaw);
  group.email = assignIfNonEmpty(group.email, mapped.email);
  const phone = pickPhone(mapped.mobile ?? '', mapped.phone ?? '');
  if (phone) {
    group.phone = phone;
  }
  group.joinedOnRaw = assignIfNonEmpty(group.joinedOnRaw, mapped.joinedOnRaw);
  group.sexRaw = assignIfNonEmpty(group.sexRaw, mapped.sexRaw);
  group.rfc = assignIfNonEmpty(group.rfc, mapped.rfc);
  ingestAddressParts(group, mapped);
  mergeWeapons(group.inlineWeapons, extractInlineWeaponsFromRow(raw, columnMapping));
}

function newGroupFromRow(
  mapped: MappedMemberRow,
  raw: Record<string, unknown>,
  sheetRow: number,
  columnMapping?: Readonly<Record<string, ImportFieldId>>,
): MemberGroup {
  const group: MemberGroup = {
    anchorSheetRow: sheetRow,
    memberNumber: '',
    curp: '',
    firstName: '',
    paternalSurname: '',
    maternalSurname: '',
    membershipRaw: '',
    membershipModalityRaw: '',
    email: '',
    phone: '',
    joinedOnRaw: '',
    sexRaw: '',
    rfc: '',
    addressLine: '',
    colony: '',
    city: '',
    zip: '',
    state: '',
    fullAddress: '',
    inlineWeapons: [],
    sheetRows: [],
  };
  applyMappedToGroup(group, mapped, raw, sheetRow, columnMapping);
  return group;
}

function ingestAddressParts(group: MemberGroup, mapped: MappedMemberRow): void {
  // Filas extra del mismo socio suelen traer solo DIRECCION_3; no deben pisar la dirección ya armada.
  group.fullAddress = mergeAddressFragment(group.fullAddress, mapped.fullAddress);
  group.addressLine = mergeAddressFragment(group.addressLine, mapped.addressLine);
  group.colony = keepFirstNonEmpty(group.colony, mapped.colony);

  const cityRaw = (mapped.city ?? '').trim();
  if (cityRaw) {
    const split = splitStateAndZipBlob(cityRaw);
    if (split.state) {
      group.state = keepFirstNonEmpty(group.state, split.state);
      group.zip = keepFirstNonEmpty(group.zip, split.zip);
    } else if (split.zip && !split.city) {
      group.zip = keepFirstNonEmpty(group.zip, split.zip);
    } else if (split.city) {
      group.city = keepFirstNonEmpty(group.city, split.city);
    }
  }

  const stateRaw = (mapped.state ?? '').trim();
  if (stateRaw) {
    const split = splitStateAndZipBlob(stateRaw);
    if (split.state) {
      group.state = keepFirstNonEmpty(group.state, split.state);
      group.zip = keepFirstNonEmpty(group.zip, split.zip);
    } else {
      group.state = keepFirstNonEmpty(group.state, stateRaw);
    }
  }

  group.zip = keepFirstNonEmpty(group.zip, mapped.zip);
}

function resolveGroupedMemberAddress(group: MemberGroup): string {
  const composed = composeMemberAddress({
    addressLine: group.addressLine,
    colony: group.colony,
    city: group.city,
    state: group.state,
    zip: group.zip,
  });
  const full = group.fullAddress.trim();
  let merged = '';
  if (full && composed) {
    merged = full.includes(composed) ? full : `${full}, ${composed}`;
  } else {
    merged = full || composed;
  }
  return finalizeImportAddress(merged);
}

function finalizeGroup(group: MemberGroup, errors: string[]): GroupedImportMemberRow | null {
  const label = group.sheetRows.length > 1 ? `Socios filas ${group.sheetRows.join(', ')}` : `Socios fila ${group.anchorSheetRow}`;

  if (!group.memberNumber.trim()) {
    errors.push(`${label}: falta numero_socio en el bloque del socio.`);
    return null;
  }
  if (!group.firstName.trim()) {
    errors.push(`${label}: falta nombre (o nombre completo para separar).`);
    return null;
  }
  if (!group.curp.trim()) {
    errors.push(`${label}: falta CURP.`);
    return null;
  }
  const normalizedCurp = normalizeCurpImport(group.curp);
  if (!normalizedCurp) {
    errors.push(`${label}: CURP no válida («${group.curp}»).`);
    return null;
  }

  return {
    sheetRow: group.anchorSheetRow,
    memberNumber: group.memberNumber.trim(),
    firstName: group.firstName.trim(),
    paternalSurname: group.paternalSurname.trim() || '—',
    maternalSurname: group.maternalSurname.trim(),
    membershipRaw: group.membershipRaw.trim(),
    membershipModalityRaw: group.membershipModalityRaw.trim(),
    email: group.email.trim(),
    phone: group.phone.trim(),
    joinedOnRaw: group.joinedOnRaw.trim(),
    sexRaw: group.sexRaw.trim(),
    curp: normalizedCurp,
    rfc: group.rfc.trim(),
    address: resolveGroupedMemberAddress(group),
    inlineWeapons: group.inlineWeapons,
    sourceSheetRows: group.sheetRows,
  };
}

/**
 * Une bloques no consecutivos del mismo socio (p. ej. armas repartidas en el Excel)
 * para no perder armas al omitir «duplicados» en la importación.
 */
function consolidateGroupedMembers(members: GroupedImportMemberRow[]): GroupedImportMemberRow[] {
  const byKey = new Map<string, GroupedImportMemberRow>();
  const order: string[] = [];

  for (const row of members) {
    const numberKey = normalizeKey(row.memberNumber);
    const curpKey = normalizeKey(row.curp);
    const key = numberKey || curpKey;
    if (!key) {
      continue;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...row,
        inlineWeapons: [...row.inlineWeapons],
        sourceSheetRows: [...row.sourceSheetRows],
      });
      order.push(key);
      continue;
    }
    mergeWeapons(existing.inlineWeapons, row.inlineWeapons);
    for (const sheetRow of row.sourceSheetRows) {
      if (!existing.sourceSheetRows.includes(sheetRow)) {
        existing.sourceSheetRows.push(sheetRow);
      }
    }
    if (!existing.address.trim() && row.address.trim()) {
      existing.address = row.address;
    }
    if (!existing.email.trim() && row.email.trim()) {
      existing.email = row.email;
    }
    if (!existing.phone.trim() && row.phone.trim()) {
      existing.phone = row.phone;
    }
    if (!existing.membershipRaw.trim() && row.membershipRaw.trim()) {
      existing.membershipRaw = row.membershipRaw;
    }
    if (!existing.membershipModalityRaw.trim() && row.membershipModalityRaw.trim()) {
      existing.membershipModalityRaw = row.membershipModalityRaw;
    }
  }

  return order.map((key) => byKey.get(key)!);
}

/**
 * Un socio puede ocupar varias filas (celdas fusionadas + una fila por arma u otro dato).
 * Agrupa filas consecutivas hasta el siguiente numero_socio o CURP distinto,
 * y luego consolida bloques del mismo socio aunque no sean contiguos.
 */
export function groupMemberImportRows(
  rawRows: Record<string, unknown>[],
  headerRowIndex: number,
  errors: string[],
  columnMapping?: Readonly<Record<string, ImportFieldId>>,
): GroupedImportMemberRow[] {
  let group: MemberGroup | null = null;
  const members: GroupedImportMemberRow[] = [];

  const flush = (): void => {
    if (!group) {
      return;
    }
    const parsed = finalizeGroup(group, errors);
    if (parsed) {
      members.push(parsed);
    }
    group = null;
  };

  rawRows.forEach((raw, index) => {
    const sheetRow = headerRowIndex + index + 2;
    const mapped = mapMemberRow(raw, columnMapping);
    if (isNotesRow(mapped.memberNumber ?? mapped.fullName)) {
      return;
    }
    if (rowIsBlank(mapped, raw)) {
      return;
    }

    const memberNumber = (mapped.memberNumber ?? '').trim();
    const curp = (mapped.curp ?? '').trim();

    if (!group) {
      if (!mapHasMemberIdentity(mapped) && !rowHasWeaponData(raw, columnMapping)) {
        return;
      }
      if (!mapHasMemberIdentity(mapped)) {
        errors.push(
          `Socios fila ${sheetRow}: hay datos (arma o dirección) sin socio previo; revisa celdas fusionadas o la fila donde inicia el socio.`,
        );
        return;
      }
      group = newGroupFromRow(mapped, raw, sheetRow, columnMapping);
      return;
    }

    if (startsNewMemberGroup(group, memberNumber, curp)) {
      flush();
      group = newGroupFromRow(mapped, raw, sheetRow, columnMapping);
      return;
    }

    applyMappedToGroup(group, mapped, raw, sheetRow, columnMapping);
  });

  flush();
  return consolidateGroupedMembers(members);
}