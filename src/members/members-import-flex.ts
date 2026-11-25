import { type ImportFieldId, isMemberImportField, isWeaponImportFieldId } from './members-import-field-ids';
import { isIgnoredHeaderByKeywords, matchMemberFieldFromHeader } from './members-import-header-match';
import { normalizeKey } from './members-import-keys';

export type MemberImportField =
  | 'memberNumber'
  | 'fullName'
  | 'firstName'
  | 'paternalSurname'
  | 'maternalSurname'
  | 'curp'
  | 'rfc'
  | 'email'
  | 'phone'
  | 'mobile'
  | 'joinedOnRaw'
  | 'sexRaw'
  | 'membershipRaw'
  | 'membershipModalityRaw'
  | 'addressLine'
  | 'fullAddress'
  | 'colony'
  | 'city'
  | 'state'
  | 'zip';

export function isIgnoredImportHeader(header: string): boolean {
  return isIgnoredHeaderByKeywords(header);
}

export function resolveMemberFieldFromHeader(header: string): MemberImportField | null {
  const matched = matchMemberFieldFromHeader(header);
  if (!matched || matched === 'ignore' || isWeaponImportFieldId(matched)) {
    return null;
  }
  return matched as MemberImportField;
}

function resolveMemberFieldForHeader(
  header: string,
  columnMapping?: Readonly<Record<string, ImportFieldId>>,
): MemberImportField | null {
  const explicit = columnMapping?.[header] ?? columnMapping?.[normalizeKey(header)];
  if (explicit === 'ignore' || isWeaponImportFieldId(explicit ?? '')) {
    return null;
  }
  if (explicit && isMemberImportField(explicit)) {
    return explicit;
  }
  return resolveMemberFieldFromHeader(header);
}

const MULTI_COLUMN_JOIN_FIELDS = new Set<MemberImportField>([
  'phone',
  'mobile',
  'fullAddress',
  'addressLine',
]);

function appendMappedFieldValue(current: string | undefined, next: string, field: MemberImportField): string {
  if (!current) {
    return next;
  }
  if (current === next || current.includes(next)) {
    return current;
  }
  if (next.includes(current)) {
    return next;
  }
  const separator = field === 'phone' || field === 'mobile' ? ' / ' : ' ';
  return `${current}${separator}${next}`;
}

export function mapMemberRow(
  raw: Record<string, unknown>,
  columnMapping?: Readonly<Record<string, ImportFieldId>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = resolveMemberFieldForHeader(header, columnMapping);
    if (!field) {
      continue;
    }
    const text = cellText(value);
    if (!text) {
      continue;
    }
    if (MULTI_COLUMN_JOIN_FIELDS.has(field)) {
      out[field] = appendMappedFieldValue(out[field], text, field);
      continue;
    }
    out[field] = text;
  }
  return out;
}

/** ABRAHAM BARRAGAN GUDIÑO o APELLIDOS, NOMBRE */
export function splitSpanishPersonName(raw: string): {
  firstName: string;
  paternalSurname: string;
  maternalSurname: string;
} {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return { firstName: '', paternalSurname: '', maternalSurname: '' };
  }
  if (trimmed.includes(',')) {
    const [left, right] = trimmed.split(',', 2).map((part) => part.trim());
    const surnameParts = left.split(/\s+/).filter(Boolean);
    const paternal = surnameParts[0] ?? '';
    const maternal = surnameParts.slice(1).join(' ');
    return {
      firstName: right ?? '',
      paternalSurname: paternal,
      maternalSurname: maternal,
    };
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0], paternalSurname: '—', maternalSurname: '' };
  }
  if (parts.length === 2) {
    return { firstName: parts[0], paternalSurname: parts[1], maternalSurname: '' };
  }
  const maternal = parts[parts.length - 1];
  const paternal = parts[parts.length - 2];
  const firstName = parts.slice(0, -2).join(' ');
  return { firstName, paternalSurname: paternal, maternalSurname: maternal };
}

/** Ej. «COLIMA CP:28973» → estado + CP. */
export function splitStateAndZipBlob(raw: string): { state?: string; zip?: string; city?: string } {
  const text = raw.trim();
  if (!text) {
    return {};
  }
  const cpTail = /^(.*?)\s+cp[:\s]*(\d{5})\s*$/i.exec(text);
  if (cpTail) {
    return { state: cpTail[1].trim(), zip: cpTail[2] };
  }
  if (/^\d{5}$/.test(text)) {
    return { zip: text };
  }
  return { city: text };
}

export function composeMemberAddress(parts: {
  addressLine?: string;
  colony?: string;
  city?: string;
  state?: string;
  zip?: string;
}): string {
  const segments: string[] = [];
  if (parts.addressLine?.trim()) {
    segments.push(parts.addressLine.trim());
  }
  const colonyCity = [parts.colony?.trim(), parts.city?.trim()].filter(Boolean).join(' ');
  if (colonyCity) {
    segments.push(colonyCity);
  }
  const state = parts.state?.trim();
  let zip = parts.zip?.trim().replace(/^cp[:\s]*/i, '');
  if (zip && !/^\d{5}$/.test(zip)) {
    const fromZip = splitStateAndZipBlob(zip);
    zip = fromZip.zip ?? zip;
  }
  let tail = '';
  if (state && zip) {
    tail = `${state.toUpperCase()} CP:${zip}`;
  } else if (state) {
    tail = state.toUpperCase();
  } else if (zip) {
    tail = `CP:${zip}`;
  }
  if (tail) {
    segments.push(tail);
  }
  return segments.join(', ');
}

export function pickPhone(...values: readonly string[]): string {
  for (const value of values) {
    const picked = value
      .split(/[/|,;]+/)
      .map((part) => part.trim())
      .find(Boolean);
    if (picked) {
      return picked;
    }
  }
  return '';
}

function cellText(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (value instanceof Date) {
    return formatIsoDate(value);
  }
  return String(value).trim();
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}