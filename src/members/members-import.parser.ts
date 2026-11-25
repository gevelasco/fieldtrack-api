import * as XLSX from 'xlsx';
import { WeaponPayloadDto } from './dto/member.dto';
import {
  buildAutoColumnMapping,
  suggestImportFieldForHeader,
  type MembersImportParseOptions,
} from './members-import-catalog';
import { resolveMemberFieldFromHeader } from './members-import-flex';
import { normalizeKey } from './members-import-keys';
import { extractInlineWeaponsFromRow, type InlineWeaponSlot } from './members-import-weapons-inline';
import {
  findMemberSheetHeaderRowIndex,
  groupMemberImportRows,
  normalizeCurpImport,
} from './members-import-grouping';
import { readImportWorkbook } from './members-import-workbook';

export interface ParsedImportMemberRow {
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
}

export interface ParsedImportWeaponRow {
  sheetRow: number;
  memberNumber: string;
  brand: string;
  model: string;
  caliber: string;
  serialNumber: string;
  platformRaw: string;
  modalityRaw: string;
  hasPetaRaw: string;
  registeredOnRaw: string;
}

const SOCIOS_SHEET_NAMES = ['socios', 'socio', 'members', 'reporte', 'padron', 'coliman'];
const ARMAS_SHEET_NAMES = ['armas', 'arma', 'weapons'];

const MEMBER_ALIASES: Record<string, keyof ParsedImportMemberRow | 'skip'> = {
  numero_socio: 'memberNumber',
  num_socio: 'memberNumber',
  numero: 'memberNumber',
  member_number: 'memberNumber',
  nombre: 'firstName',
  nombres: 'firstName',
  apellido_paterno: 'paternalSurname',
  apellido: 'paternalSurname',
  paterno: 'paternalSurname',
  apellido_materno: 'maternalSurname',
  materno: 'maternalSurname',
  tipo_membresia: 'membershipRaw',
  membresia: 'membershipRaw',
  membership: 'membershipRaw',
  modalidad_membresia: 'membershipModalityRaw',
  modalidad_socio: 'membershipModalityRaw',
  modalidad_de_socio: 'membershipModalityRaw',
  telefono: 'phone',
  phone: 'phone',
  correo: 'email',
  email: 'email',
  fecha_ingreso: 'joinedOnRaw',
  ingreso: 'joinedOnRaw',
  joined_on: 'joinedOnRaw',
  sexo: 'sexRaw',
  sex: 'sexRaw',
};

const WEAPON_ALIASES: Record<string, keyof ParsedImportWeaponRow | 'skip'> = {
  numero_socio: 'memberNumber',
  num_socio: 'memberNumber',
  numero: 'memberNumber',
  marca: 'brand',
  brand: 'brand',
  modelo: 'model',
  model: 'model',
  calibre: 'caliber',
  caliber: 'caliber',
  numero_serie: 'serialNumber',
  serie: 'serialNumber',
  serial: 'serialNumber',
  plataforma: 'platformRaw',
  platform: 'platformRaw',
  modalidad: 'modalityRaw',
  modality: 'modalityRaw',
  con_peta: 'hasPetaRaw',
  peta: 'hasPetaRaw',
  fecha_registro: 'registeredOnRaw',
  registrada_en: 'registeredOnRaw',
};

export function buildSociosImportTemplateBuffer(membershipHints: string[]): Buffer {
  const wb = XLSX.utils.book_new();
  const sociosHeader = [
    'numero_socio',
    'nombre',
    'apellido_paterno',
    'apellido_materno',
    'tipo_membresia',
    'modalidad_membresia',
    'telefono',
    'correo',
    'fecha_ingreso',
    'sexo',
  ];
  const sociosExample = [
    '001',
    'Juan',
    'Pérez',
    'López',
    membershipHints[0] ?? 'standard',
    'tiro-deportivo',
    '333 123 4567',
    'juan@ejemplo.com',
    '2024-01-15',
    'hombre',
  ];
  const sociosNotes = [
    'Obligatorio',
    'Obligatorio',
    'Opcional (usa — si no aplica)',
    'Opcional',
    `Obligatorio (${membershipHints.join(', ') || 'código del plan'})`,
    'Si el plan aplica a las dos: tiro-deportivo o caza; si no, déjalo vacío',
    'Opcional',
    'Opcional',
    'Opcional (aaaa-mm-dd)',
    'Opcional (hombre/mujer/otro)',
  ];
  const sociosSheet = XLSX.utils.aoa_to_sheet([sociosHeader, sociosNotes, sociosExample]);
  XLSX.utils.book_append_sheet(wb, sociosSheet, 'Socios');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function buildArmasImportTemplateBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const armasHeader = [
    'numero_socio',
    'marca',
    'modelo',
    'calibre',
    'numero_serie',
    'plataforma',
    'modalidad',
    'con_peta',
    'fecha_registro',
  ];
  const armasNotes = [
    'Debe existir como socio en el club',
    'Obligatorio',
    'Obligatorio',
    'Obligatorio',
    'Obligatorio (único en el club)',
    'Opcional (vacío = otro)',
    'Opcional (vacío = tiro-deportivo)',
    'Opcional (vacío = no)',
    'Opcional (vacío = hoy, aaaa-mm-dd)',
  ];
  const armasExample = ['001', 'Glock', '19', '9mm', 'ABC123', 'pistola', 'tiro-deportivo', 'no', '2024-01-15'];
  const armasSheet = XLSX.utils.aoa_to_sheet([armasHeader, armasNotes, armasExample]);
  XLSX.utils.book_append_sheet(wb, armasSheet, 'Armas');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function parseMembersImportFile(
  buffer: Buffer,
  options?: MembersImportParseOptions,
): {
  members: ParsedImportMemberRow[];
  parseErrors: string[];
} {
  const parsed = readImportWorkbook(buffer);
  if ('error' in parsed) {
    return { members: [], parseErrors: [parsed.error] };
  }
  const parseErrors: string[] = [];
  const sheet = resolveMembersImportSheet(parsed.workbook, options);
  const members = parseMemberSheet(sheet, parseErrors, options);
  return { members, parseErrors };
}

function resolveMembersImportSheet(wb: XLSX.WorkBook, options?: MembersImportParseOptions): XLSX.WorkSheet | null {
  if (options?.sheetName && wb.Sheets[options.sheetName]) {
    return wb.Sheets[options.sheetName] ?? null;
  }
  return findSheet(wb, SOCIOS_SHEET_NAMES) ?? detectMemberSheet(wb) ?? singleSheet(wb);
}

export function parseWeaponsImportFile(buffer: Buffer): {
  weapons: ParsedImportWeaponRow[];
  parseErrors: string[];
} {
  const parsed = readImportWorkbook(buffer);
  if ('error' in parsed) {
    return { weapons: [], parseErrors: [parsed.error] };
  }
  const parseErrors: string[] = [];
  const sheet = findSheet(parsed.workbook, ARMAS_SHEET_NAMES) ?? singleSheet(parsed.workbook);
  const weapons = parseWeaponSheet(sheet, parseErrors);
  return { weapons, parseErrors };
}

export function normalizeWeaponSerial(raw: string): string {
  return raw.trim().toLocaleUpperCase('es-MX');
}

function singleSheet(wb: XLSX.WorkBook): XLSX.WorkSheet | null {
  if (wb.SheetNames.length !== 1) {
    return null;
  }
  return wb.Sheets[wb.SheetNames[0]] ?? null;
}

function findSheet(wb: XLSX.WorkBook, names: string[]): XLSX.WorkSheet | null {
  for (const name of names) {
    if (wb.Sheets[name]) {
      return wb.Sheets[name];
    }
  }
  const target = new Set(names.map((name) => normalizeKey(name)));
  for (const sheetName of wb.SheetNames) {
    const key = normalizeKey(sheetName);
    if (target.has(key)) {
      return wb.Sheets[sheetName];
    }
    for (const hint of names) {
      const hintKey = normalizeKey(hint);
      if (hintKey.length >= 4 && key.includes(hintKey)) {
        return wb.Sheets[sheetName];
      }
    }
  }
  return null;
}

function parseMemberSheet(
  sheet: XLSX.WorkSheet | null,
  errors: string[],
  options?: MembersImportParseOptions,
): ParsedImportMemberRow[] {
  if (!sheet) {
    errors.push(
      'No se encontró una hoja de socios. Usa la plantilla o un Excel con columnas como numero_socio, nombre y CURP.',
    );
    return [];
  }
  const headerRowIndex = options?.headerRowIndex ?? findMemberSheetHeaderRowIndex(sheet);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
    range: headerRowIndex,
  });
  const columnMapping = options?.columnMapping ?? autoColumnMappingFromSheet(sheet, headerRowIndex);
  const grouped = groupMemberImportRows(rows, headerRowIndex, errors, columnMapping);
  return grouped.map((row) => ({
    sheetRow: row.sheetRow,
    memberNumber: row.memberNumber,
    firstName: row.firstName,
    paternalSurname: row.paternalSurname,
    maternalSurname: row.maternalSurname,
    membershipRaw: row.membershipRaw,
    membershipModalityRaw: row.membershipModalityRaw,
    email: row.email,
    phone: row.phone,
    joinedOnRaw: row.joinedOnRaw,
    sexRaw: row.sexRaw,
    curp: row.curp,
    rfc: row.rfc,
    address: row.address,
    inlineWeapons: row.inlineWeapons,
  }));
}

function autoColumnMappingFromSheet(
  sheet: XLSX.WorkSheet,
  headerRowIndex: number,
): Record<string, import('./members-import-field-ids').ImportFieldId> {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  const headerRow = matrix[headerRowIndex];
  if (!Array.isArray(headerRow)) {
    return {};
  }
  const columns = headerRow
    .map((cell) => (typeof cell === 'string' || typeof cell === 'number' ? String(cell) : ''))
    .filter((header) => header.trim())
    .map((header) => ({
      header,
      suggestedField: suggestImportFieldForHeader(header),
    }));
  return buildAutoColumnMapping(columns);
}

function detectMemberSheet(wb: XLSX.WorkBook): XLSX.WorkSheet | null {
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) {
      continue;
    }
    const headerRowIndex = findMemberSheetHeaderRowIndex(sheet);
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
    const headerRow = rows[headerRowIndex];
    if (!Array.isArray(headerRow)) {
      continue;
    }
    const fields = headerRow
      .map((cell) => (typeof cell === 'string' || typeof cell === 'number' ? String(cell) : ''))
      .map((header) => resolveMemberFieldFromHeader(header))
      .filter(Boolean);
    const hasNumber = fields.includes('memberNumber');
    const hasPerson = fields.includes('fullName') || fields.includes('firstName') || fields.includes('curp');
    if (hasNumber && hasPerson) {
      return sheet;
    }
  }
  return null;
}

export { normalizeCurpImport };

function parseWeaponSheet(sheet: XLSX.WorkSheet | null, errors: string[]): ParsedImportWeaponRow[] {
  if (!sheet) {
    errors.push('No se encontró la hoja "Armas". Usa la plantilla de armas.');
    return [];
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  const weapons: ParsedImportWeaponRow[] = [];
  rows.forEach((raw, index) => {
    const sheetRow = index + 2;
    const mapped = mapRow(raw, WEAPON_ALIASES);
    if (isNotesRow(mapped.memberNumber) || isNotesRow(mapped.brand)) {
      return;
    }
    const memberNumber = cellText(mapped.memberNumber);
    const brand = cellText(mapped.brand);
    const model = cellText(mapped.model);
    const caliber = cellText(mapped.caliber);
    if (!memberNumber && !brand && !model && !caliber) {
      return;
    }
    if (!memberNumber) {
      errors.push(`Armas fila ${sheetRow}: falta numero_socio.`);
      return;
    }
    if (!brand || !model || !caliber) {
      errors.push(`Armas fila ${sheetRow}: marca, modelo y calibre son obligatorios.`);
      return;
    }
    weapons.push({
      sheetRow,
      memberNumber,
      brand,
      model,
      caliber,
      serialNumber: cellText(mapped.serialNumber),
      platformRaw: cellText(mapped.platformRaw),
      modalityRaw: cellText(mapped.modalityRaw),
      hasPetaRaw: cellText(mapped.hasPetaRaw),
      registeredOnRaw: cellText(mapped.registeredOnRaw),
    });
  });
  return weapons;
}

function mapRow(
  raw: Record<string, unknown>,
  aliases: Record<string, keyof ParsedImportMemberRow | keyof ParsedImportWeaponRow | 'skip'>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [header, value] of Object.entries(raw)) {
    const key = aliases[normalizeKey(header)];
    if (!key || key === 'skip') {
      continue;
    }
    out[key as string] = value;
  }
  return out;
}

function isNotesRow(firstCell: unknown): boolean {
  const text = cellText(firstCell).toLowerCase();
  return text === 'obligatorio' || text.startsWith('opcional') || text.startsWith('debe existir');
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

export function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseIsoDateInput(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const es = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (es) {
    const day = String(Number(es[1])).padStart(2, '0');
    const month = String(Number(es[2])).padStart(2, '0');
    return `${es[3]}-${month}-${day}`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return formatIsoDate(parsed);
  }
  return fallback;
}

export function parseSexInput(raw: string): 'hombre' | 'mujer' | 'otro' {
  const value = raw.trim().toLowerCase();
  if (!value) {
    // Padrón club: si no viene sexo, default hombre (mayoría del padrón).
    return 'hombre';
  }
  if (value === 'h' || value === 'hombre' || value === 'masc' || value === 'masculino') {
    return 'hombre';
  }
  if (value === 'm' || value === 'mujer' || value === 'f' || value === 'fem' || value === 'femenino') {
    return 'mujer';
  }
  if (value === 'otro' || value === 'x' || value === 'nb') {
    return 'otro';
  }
  return 'hombre';
}

const PLATFORMS = new Set(['pistola', 'revolver', 'escopeta', 'rifle', 'otro']);
const WEAPON_MODALITIES = new Set(['proteccion-domicilio', 'proteccion-parcela', 'tiro-deportivo', 'caceria']);

export function parsePlatformInput(raw: string): WeaponPayloadDto['platform'] {
  const text = raw.trim();
  if (!text) {
    return 'otro';
  }
  const folded = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  // Palabra clave aunque venga rodeada (p. ej. «ESCOPETA UN CAÑON…», «RIFLE SEMI AUTOMATICO»).
  if (folded.includes('escopeta')) {
    return 'escopeta';
  }
  if (folded.includes('rifle')) {
    return 'rifle';
  }
  if (folded.includes('revolv')) {
    return 'revolver';
  }
  if (folded.includes('pistola')) {
    return 'pistola';
  }
  const value = normalizeKey(text).replace(/_/g, '-');
  if (PLATFORMS.has(value)) {
    return value as WeaponPayloadDto['platform'];
  }
  return 'otro';
}

export function resolveImportWeaponPlatform(parts: {
  platformRaw?: string;
  brand?: string;
  model?: string;
  caliber?: string;
}): WeaponPayloadDto['platform'] {
  const candidates = [parts.platformRaw, parts.model, parts.brand, parts.caliber];
  for (const raw of candidates) {
    const parsed = parsePlatformInput(raw ?? '');
    if (parsed !== 'otro') {
      return parsed;
    }
  }
  return 'otro';
}

export function parseWeaponModalityInput(raw: string): WeaponPayloadDto['modality'] {
  const value = normalizeKey(raw).replace(/_/g, '-');
  if (WEAPON_MODALITIES.has(value)) {
    return value as WeaponPayloadDto['modality'];
  }
  if (value.includes('cacer') || value.includes('caza')) {
    return 'caceria';
  }
  if (value.includes('tiro')) {
    return 'tiro-deportivo';
  }
  return 'tiro-deportivo';
}

export function parseBoolInput(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  return value === 'si' || value === 'sí' || value === 'true' || value === '1' || value === 'yes';
}

export function resolveMembershipCode(
  raw: string,
  allowed: { code: string; name: string }[],
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const key = normalizeKey(trimmed);
  for (const row of allowed) {
    if (normalizeKey(row.code) === key || normalizeKey(row.name) === key) {
      return row.code;
    }
  }
  if (key === 'tiro-deportivo' || key === 'tiro_deportivo' || key === 'tiro') {
    return 'tiro-deportivo';
  }
  if (key === 'caza' || key === 'caceria' || key === 'cacería') {
    return 'caza';
  }
  return null;
}
