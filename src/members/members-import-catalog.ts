import { isIgnoredImportHeader, resolveMemberFieldFromHeader } from './members-import-flex';
import { type ImportFieldId } from './members-import-field-ids';
import { normalizeKey } from './members-import-keys';
import { suggestWeaponImportFieldFromHeader } from './members-import-weapons-inline';

export type { ImportFieldId, WeaponImportFieldId } from './members-import-field-ids';

function fieldLabel(text: string, group: 'socio' | 'arma' | 'meta'): string {
  if (group === 'meta') {
    return text;
  }
  const tag = group === 'socio' ? '(socio)' : '(arma)';
  return `${text} ${tag}`;
}

export const IMPORT_FIELD_CATALOG: Array<{
  id: ImportFieldId;
  label: string;
  group: 'socio' | 'arma' | 'meta';
  required?: boolean;
}> = [
  { id: 'memberNumber', label: fieldLabel('Número de socio', 'socio'), group: 'socio', required: true },
  { id: 'fullName', label: fieldLabel('Nombre completo', 'socio'), group: 'socio' },
  { id: 'firstName', label: fieldLabel('Nombre(s)', 'socio'), group: 'socio' },
  { id: 'paternalSurname', label: fieldLabel('Apellido paterno', 'socio'), group: 'socio' },
  { id: 'maternalSurname', label: fieldLabel('Apellido materno', 'socio'), group: 'socio' },
  { id: 'curp', label: fieldLabel('CURP', 'socio'), group: 'socio', required: true },
  { id: 'rfc', label: fieldLabel('RFC', 'socio'), group: 'socio' },
  { id: 'email', label: fieldLabel('Correo', 'socio'), group: 'socio' },
  { id: 'phone', label: fieldLabel('Teléfono', 'socio'), group: 'socio' },
  { id: 'mobile', label: fieldLabel('Celular', 'socio'), group: 'socio' },
  { id: 'joinedOnRaw', label: fieldLabel('Fecha de ingreso', 'socio'), group: 'socio' },
  { id: 'sexRaw', label: fieldLabel('Sexo', 'socio'), group: 'socio' },
  { id: 'membershipRaw', label: fieldLabel('Tipo de membresía / plan', 'socio'), group: 'socio' },
  { id: 'membershipModalityRaw', label: fieldLabel('Modalidad del plan (tiro / caza)', 'socio'), group: 'socio' },
  { id: 'fullAddress', label: fieldLabel('Dirección completa (una columna)', 'socio'), group: 'socio' },
  { id: 'addressLine', label: fieldLabel('Calle / número', 'socio'), group: 'socio' },
  { id: 'colony', label: fieldLabel('Colonia', 'socio'), group: 'socio' },
  { id: 'city', label: fieldLabel('Ciudad / municipio', 'socio'), group: 'socio' },
  { id: 'state', label: fieldLabel('Estado', 'socio'), group: 'socio' },
  { id: 'zip', label: fieldLabel('Código postal', 'socio'), group: 'socio' },
  { id: 'weaponBrand', label: fieldLabel('Marca', 'arma'), group: 'arma' },
  { id: 'weaponModel', label: fieldLabel('Modelo', 'arma'), group: 'arma' },
  { id: 'weaponCaliber', label: fieldLabel('Calibre', 'arma'), group: 'arma' },
  { id: 'weaponSerial', label: fieldLabel('Número de serie', 'arma'), group: 'arma' },
  { id: 'weaponPlatform', label: fieldLabel('Plataforma', 'arma'), group: 'arma' },
  { id: 'weaponModality', label: fieldLabel('Modalidad del arma', 'arma'), group: 'arma' },
  { id: 'weaponHasPeta', label: fieldLabel('Con PETA', 'arma'), group: 'arma' },
  { id: 'weaponRegisteredOn', label: fieldLabel('Fecha registro', 'arma'), group: 'arma' },
  { id: 'ignore', label: 'Ignorar columna', group: 'meta' },
];

export { suggestImportFieldForColumn, buildAutoColumnMapping } from './members-import-suggest';

export function suggestImportFieldForHeader(header: string): ImportFieldId | null {
  if (isIgnoredImportHeader(header)) {
    return 'ignore';
  }
  const member = resolveMemberFieldFromHeader(header);
  if (member) {
    return member;
  }
  const weapon = suggestWeaponImportFieldFromHeader(header);
  if (weapon) {
    return weapon;
  }
  return null;
}

export function parseColumnMappingJson(raw: string | undefined): Record<string, ImportFieldId> | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }
  const allowed = new Set(IMPORT_FIELD_CATALOG.map((row) => row.id));
  const out: Record<string, ImportFieldId> = {};
  for (const [header, field] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof field !== 'string' || !allowed.has(field as ImportFieldId)) {
      continue;
    }
    out[header] = field as ImportFieldId;
    const key = normalizeKey(header);
    if (key && key !== header) {
      out[key] = field as ImportFieldId;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export type MembersImportParseOptions = {
  sheetName?: string;
  headerRowIndex?: number;
  columnMapping?: Record<string, ImportFieldId>;
};