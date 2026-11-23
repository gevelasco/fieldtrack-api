import { type ImportFieldId } from './members-import-field-ids';
import {
  headerAffinityScore,
  isIgnoredHeaderByKeywords,
  matchImportFieldFromHeader,
} from './members-import-header-match';

const CURP_PATTERN = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/i;
const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sampleStrength(samples: string[], predicate: (value: string) => boolean): number {
  const values = samples.map((s) => s.trim()).filter(Boolean);
  if (!values.length) {
    return 0;
  }
  const hits = values.filter(predicate).length;
  return hits / values.length;
}

/** Calibres reales; números sueltos (p. ej. 200 del club) no cuentan. */
const CALIBER_SAMPLE =
  /(\d+(\.\d+)?\s*(mm|milimetros|calibre|cal\b|ga\b|gauge|plg|pulg|shot))|(\d+\s*[x×]\s*\d+)|(^\.\d{1,3}(\s*(mm|cal))?)|(^\d{1,2}\s*(ga|gauge)\b)/i;
const WEAPON_SERIAL_SAMPLE = /^[A-Z0-9][A-Z0-9\-./]{3,}$/i;

function inferFieldFromSamples(samples: string[]): ImportFieldId | null {
  const values = samples.map((s) => s.trim()).filter(Boolean);
  if (values.some((v) => CURP_PATTERN.test(v.toUpperCase()))) {
    return 'curp';
  }
  if (sampleStrength(samples, (v) => CURP_PATTERN.test(v.toUpperCase())) >= 0.35) {
    return 'curp';
  }
  if (sampleStrength(samples, (v) => RFC_PATTERN.test(v.toUpperCase())) >= 0.5) {
    return 'rfc';
  }
  if (
    sampleStrength(samples, (v) => {
      const t = v.trim();
      return /^\d{1,6}$/.test(t) && !CURP_PATTERN.test(t.toUpperCase());
    }) >= 0.55
  ) {
    const distinct = new Set(values.map((v) => v.trim()));
    if (distinct.size > 1 || values.length <= 2) {
      return 'memberNumber';
    }
  }
  if (sampleStrength(samples, (v) => CALIBER_SAMPLE.test(v.trim())) >= 0.4) {
    return 'weaponCaliber';
  }
  if (
    sampleStrength(samples, (v) => {
      const t = v.trim();
      return WEAPON_SERIAL_SAMPLE.test(t) && !CURP_PATTERN.test(t.toUpperCase()) && !RFC_PATTERN.test(t.toUpperCase());
    }) >= 0.45
  ) {
    return 'weaponSerial';
  }
  if (sampleStrength(samples, (v) => EMAIL_PATTERN.test(v)) >= 0.5) {
    return 'email';
  }
  const phoneHits = sampleStrength(samples, (v) => /^\+?\d[\d\s().-]{6,}$/.test(v));
  if (phoneHits >= 0.5) {
    return 'phone';
  }
  const address = inferAddressFieldFromSamples(samples);
  if (address) {
    return address;
  }
  if (sampleStrength(samples, (v) => /escopeta/i.test(v)) >= 0.5) {
    return 'weaponPlatform';
  }
  if (sampleStrength(samples, (v) => /rifle/i.test(v)) >= 0.5) {
    return 'weaponPlatform';
  }
  if (sampleStrength(samples, (v) => /pistola/i.test(v)) >= 0.5) {
    return 'weaponPlatform';
  }
  if (sampleStrength(samples, (v) => /revolv/i.test(v)) >= 0.5) {
    return 'weaponPlatform';
  }
  return null;
}

function inferAddressFieldFromSamples(samples: string[]): ImportFieldId | null {
  if (sampleStrength(samples, (v) => /^\d{5}$/.test(v.trim())) >= 0.6) {
    return 'zip';
  }
  if (sampleStrength(samples, (v) => /^.+cp[:\s]*\d{5}$/i.test(v.trim())) >= 0.5) {
    return 'city';
  }
  if (
    sampleStrength(samples, (v) => {
      const t = v.trim();
      return /\d/.test(t) && /^(and\.?|av\.?|ave\.?|calle|orq|#|no\.?\s*\d)/i.test(t);
    }) >= 0.5
  ) {
    return 'addressLine';
  }
  if (
    sampleStrength(samples, (v) => {
      const t = v.trim();
      return !/\d/.test(t) && t.split(/\s+/).filter(Boolean).length >= 2 && t.length >= 10;
    }) >= 0.5
  ) {
    return 'city';
  }
  if (
    sampleStrength(samples, (v) => {
      const t = v.trim().toUpperCase();
      return /^[A-ZÁÉÍÓÚÑ]{4,20}$/.test(t) && !t.includes(' ');
    }) >= 0.6
  ) {
    return 'state';
  }
  if (
    sampleStrength(samples, (v) => {
      const t = v.trim();
      return !/\d/.test(t) && t.length >= 4;
    }) >= 0.5
  ) {
    return 'colony';
  }
  return null;
}

function suggestFromHeaderLoose(header: string): ImportFieldId | null {
  return matchImportFieldFromHeader(header);
}

/** Encabezado primero; muestras solo si el título no dice nada claro. */
export function suggestImportFieldForColumn(header: string, samples: string[]): ImportFieldId | null {
  if (isIgnoredHeaderByKeywords(header)) {
    return 'ignore';
  }
  const fromHeader = suggestFromHeaderLoose(header);
  if (fromHeader === 'ignore') {
    return 'ignore';
  }
  if (fromHeader) {
    return fromHeader;
  }
  return inferFieldFromSamples(samples);
}

function pickColumnForField(
  columns: ReadonlyArray<{ header: string; suggestedField: ImportFieldId | null }>,
  fieldId: ImportFieldId,
  assigned: Readonly<Record<string, ImportFieldId>>,
): { header: string; suggestedField: ImportFieldId | null } | undefined {
  const candidates = columns.filter((row) => row.suggestedField === fieldId && assigned[row.header] === undefined);
  if (!candidates.length) {
    return undefined;
  }
  return [...candidates].sort((a, b) => {
    const scoreDiff = headerAffinityScore(b.header, fieldId) - headerAffinityScore(a.header, fieldId);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return a.header.localeCompare(b.header, 'es');
  })[0];
}

const AUTO_ASSIGN_PRIORITY: readonly ImportFieldId[] = [
  'memberNumber',
  'curp',
  'rfc',
  'fullName',
  'firstName',
  'paternalSurname',
  'maternalSurname',
  'fullAddress',
  'addressLine',
  'colony',
  'city',
  'state',
  'zip',
  'email',
  'phone',
  'mobile',
  'joinedOnRaw',
  'sexRaw',
  'membershipRaw',
  'membershipModalityRaw',
  'weaponSerial',
  'weaponBrand',
  'weaponModel',
  'weaponCaliber',
  'weaponPlatform',
  'weaponModality',
  'weaponHasPeta',
  'weaponRegisteredOn',
];

export function buildAutoColumnMapping(
  columns: ReadonlyArray<{ header: string; suggestedField: ImportFieldId | null }>,
): Record<string, ImportFieldId> {
  const out: Record<string, ImportFieldId> = {};
  const used = new Set<ImportFieldId>();

  for (const fieldId of AUTO_ASSIGN_PRIORITY) {
    if (used.has(fieldId)) {
      continue;
    }
    const col = pickColumnForField(columns, fieldId, out);
    if (!col) {
      continue;
    }
    out[col.header] = fieldId;
    used.add(fieldId);
  }

  for (const col of columns) {
    if (out[col.header]) {
      continue;
    }
    const field = col.suggestedField;
    if (field === 'ignore') {
      out[col.header] = 'ignore';
      continue;
    }
    if (field && !used.has(field)) {
      out[col.header] = field;
      used.add(field);
    }
  }

  return out;
}