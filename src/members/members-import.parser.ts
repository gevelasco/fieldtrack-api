import * as XLSX from 'xlsx';
import { WeaponPayloadDto } from './dto/member.dto';

export interface ParsedImportMemberRow {
  sheetRow: number;
  memberNumber: string;
  firstName: string;
  paternalSurname: string;
  maternalSurname: string;
  membershipRaw: string;
  email: string;
  phone: string;
  joinedOnRaw: string;
  sexRaw: string;
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

const SOCIOS_SHEET_NAMES = ['socios', 'socio', 'members'];
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
  modalidad: 'membershipRaw',
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
    membershipHints[0] ?? 'tiro-deportivo',
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
    `Obligatorio (${membershipHints.join(', ') || 'código del club'})`,
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

export function parseMembersImportFile(buffer: Buffer): {
  members: ParsedImportMemberRow[];
  parseErrors: string[];
} {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const parseErrors: string[] = [];
  const sheet = findSheet(wb, SOCIOS_SHEET_NAMES) ?? singleSheet(wb);
  const members = parseMemberSheet(sheet, parseErrors);
  return { members, parseErrors };
}

export function parseWeaponsImportFile(buffer: Buffer): {
  weapons: ParsedImportWeaponRow[];
  parseErrors: string[];
} {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const parseErrors: string[] = [];
  const sheet = findSheet(wb, ARMAS_SHEET_NAMES) ?? singleSheet(wb);
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
  const target = new Set(names);
  for (const sheetName of wb.SheetNames) {
    if (target.has(normalizeKey(sheetName))) {
      return wb.Sheets[sheetName];
    }
  }
  return null;
}

function parseMemberSheet(sheet: XLSX.WorkSheet | null, errors: string[]): ParsedImportMemberRow[] {
  if (!sheet) {
    errors.push('No se encontró la hoja "Socios". Usa la plantilla de socios.');
    return [];
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  const members: ParsedImportMemberRow[] = [];
  rows.forEach((raw, index) => {
    const sheetRow = index + 2;
    const mapped = mapRow(raw, MEMBER_ALIASES);
    if (isNotesRow(mapped.memberNumber)) {
      return;
    }
    const memberNumber = cellText(mapped.memberNumber);
    const firstName = cellText(mapped.firstName);
    const membershipRaw = cellText(mapped.membershipRaw);
    if (!memberNumber && !firstName && !membershipRaw) {
      return;
    }
    if (!memberNumber || !firstName || !membershipRaw) {
      errors.push(`Socios fila ${sheetRow}: faltan numero_socio, nombre o tipo_membresia.`);
      return;
    }
    members.push({
      sheetRow,
      memberNumber,
      firstName,
      paternalSurname: cellText(mapped.paternalSurname) || '—',
      maternalSurname: cellText(mapped.maternalSurname),
      membershipRaw,
      email: cellText(mapped.email),
      phone: cellText(mapped.phone),
      joinedOnRaw: cellText(mapped.joinedOnRaw),
      sexRaw: cellText(mapped.sexRaw),
    });
  });
  return members;
}

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

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_');
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
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return formatIsoDate(parsed);
  }
  return fallback;
}

export function parseSexInput(raw: string): 'hombre' | 'mujer' | 'otro' {
  const value = raw.trim().toLowerCase();
  if (value === 'h' || value === 'hombre' || value === 'masc' || value === 'masculino') {
    return 'hombre';
  }
  if (value === 'm' || value === 'mujer' || value === 'f' || value === 'fem' || value === 'femenino') {
    return 'mujer';
  }
  if (value === 'otro' || value === 'x' || value === 'nb') {
    return 'otro';
  }
  return 'otro';
}

const PLATFORMS = new Set(['pistola', 'revolver', 'escopeta', 'rifle', 'otro']);
const WEAPON_MODALITIES = new Set(['proteccion-domicilio', 'proteccion-parcela', 'tiro-deportivo', 'caceria']);

export function parsePlatformInput(raw: string): WeaponPayloadDto['platform'] {
  const value = normalizeKey(raw).replace(/_/g, '-');
  if (PLATFORMS.has(value)) {
    return value as WeaponPayloadDto['platform'];
  }
  if (value === 'revolver' || value.includes('revolv')) {
    return 'revolver';
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
