import * as XLSX from 'xlsx';
import {
  buildAutoColumnMapping,
  IMPORT_FIELD_CATALOG,
  type MembersImportParseOptions,
  suggestImportFieldForColumn,
  suggestImportFieldForHeader,
} from './members-import-catalog';
import { type ImportFieldId } from './members-import-field-ids';
import { findMemberSheetHeaderRowIndex } from './members-import-grouping';
import { parseMembersImportFile } from './members-import.parser';
import { readImportWorkbook } from './members-import-workbook';

export interface MemberImportPreviewColumn {
  header: string;
  suggestedField: string | null;
  samples: string[];
}

export interface MemberImportPreviewSample {
  memberNumber: string;
  name: string;
  curp: string;
  weaponCount: number;
  sheetRow: number;
}

export interface MemberImportPreview {
  sheetNames: string[];
  sheetName: string;
  headerRowIndex: number;
  layout: 'multi-row-blocks';
  columns: MemberImportPreviewColumn[];
  availableFields: typeof IMPORT_FIELD_CATALOG;
  estimatedMembers: number;
  estimatedWeapons: number;
  missingRequiredFields: string[];
  warnings: string[];
  sampleMembers: MemberImportPreviewSample[];
  /** Vínculo inicial sugerido (sin duplicar campos). */
  suggestedMapping: Record<string, string>;
}

function cellPreview(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function resolveSheet(wb: XLSX.WorkBook, options?: MembersImportParseOptions): { sheet: XLSX.WorkSheet; name: string } | null {
  if (options?.sheetName && wb.Sheets[options.sheetName]) {
    return { sheet: wb.Sheets[options.sheetName], name: options.sheetName };
  }
  const scored: Array<{ name: string; sheet: XLSX.WorkSheet; score: number }> = [];
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
      .map((cell) => suggestImportFieldForHeader(String(cell ?? '')))
      .filter(Boolean);
    const score =
      (fields.includes('memberNumber') ? 3 : 0) +
      (fields.includes('curp') ? 2 : 0) +
      (fields.includes('fullName') || fields.includes('firstName') ? 2 : 0) +
      fields.filter((f) => f?.startsWith('weapon')).length * 0.4 +
      fields.length * 0.15;
    scored.push({ name, sheet, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 2) {
    const fallback = wb.SheetNames[0];
    if (fallback && wb.Sheets[fallback]) {
      return { sheet: wb.Sheets[fallback], name: fallback };
    }
    return null;
  }
  return { sheet: best.sheet, name: best.name };
}

export function buildMemberImportPreview(buffer: Buffer, options?: MembersImportParseOptions): MemberImportPreview {
  const availableFields = IMPORT_FIELD_CATALOG;
  const parsedWorkbook = readImportWorkbook(buffer);
  if ('error' in parsedWorkbook) {
    return {
      sheetNames: [],
      sheetName: '',
      headerRowIndex: 0,
      layout: 'multi-row-blocks',
      columns: [],
      availableFields,
      estimatedMembers: 0,
      estimatedWeapons: 0,
      missingRequiredFields: ['memberNumber', 'fullName', 'curp'],
      warnings: [parsedWorkbook.error],
      sampleMembers: [],
      suggestedMapping: {},
    };
  }
  const wb = parsedWorkbook.workbook;
  const resolved = resolveSheet(wb, options);
  if (!resolved) {
    return {
      sheetNames: wb.SheetNames,
      sheetName: '',
      headerRowIndex: 0,
      layout: 'multi-row-blocks',
      columns: [],
      availableFields,
      estimatedMembers: 0,
      estimatedWeapons: 0,
      missingRequiredFields: ['memberNumber', 'fullName', 'curp'],
      warnings: ['No se encontró una hoja con datos de socios.'],
      sampleMembers: [],
      suggestedMapping: {},
    };
  }

  const headerRowIndex = options?.headerRowIndex ?? findMemberSheetHeaderRowIndex(resolved.sheet);
  const matrix = XLSX.utils.sheet_to_json(resolved.sheet, { header: 1, defval: '' }) as unknown[][];
  const headerRow = matrix[headerRowIndex] ?? [];
  const dataRows = matrix.slice(headerRowIndex + 1, headerRowIndex + 25);

  const columns: MemberImportPreviewColumn[] = headerRow.map((cell, index) => {
    const header = String(cell ?? '').trim() || `Columna ${index + 1}`;
    const samples = dataRows
      .map((row) => (Array.isArray(row) ? cellPreview(row[index]) : ''))
      .filter(Boolean)
      .slice(0, 6);
    const suggested = suggestImportFieldForColumn(header, samples);
    return {
      header,
      suggestedField: suggested,
      samples: samples.slice(0, 4),
    };
  });

  const autoMapping = buildAutoColumnMapping(
    columns.map((col) => ({
      header: col.header,
      suggestedField: (col.suggestedField as ImportFieldId | null) ?? null,
    })),
  );
  const assignedFields = new Set<string>(
    Object.values(autoMapping).filter((field) => field && field !== 'ignore'),
  );
  for (const col of columns) {
    const assigned = autoMapping[col.header];
    if (assigned !== undefined) {
      col.suggestedField = assigned;
      continue;
    }
    const loose = col.suggestedField;
    if (loose && loose !== 'ignore' && assignedFields.has(loose)) {
      col.suggestedField = null;
    }
  }

  const suggestedMapping: Record<string, string> = Object.fromEntries(
    Object.entries(autoMapping).map(([header, field]) => [header, field]),
  );

  const effectiveMapping: Record<string, ImportFieldId> = {
    ...autoMapping,
    ...(options?.columnMapping ?? {}),
  };

  const mappedRequired = new Set(
    Object.values(effectiveMapping).filter(
      (field) => field === 'memberNumber' || field === 'curp' || field === 'fullName' || field === 'firstName',
    ),
  );

  const missingRequiredFields: string[] = [];
  if (!mappedRequired.has('memberNumber')) {
    missingRequiredFields.push('memberNumber');
  }
  if (!mappedRequired.has('curp')) {
    missingRequiredFields.push('curp');
  }
  if (!mappedRequired.has('fullName') && !mappedRequired.has('firstName')) {
    missingRequiredFields.push('fullName');
  }

  const { members, parseErrors } = parseMembersImportFile(buffer, {
    ...options,
    sheetName: resolved.name,
    headerRowIndex,
    columnMapping: options?.columnMapping ?? effectiveMapping,
  });

  const estimatedWeapons = members.reduce((total, row) => total + row.inlineWeapons.length, 0);

  const warnings: string[] = [];

  const sampleMembers: MemberImportPreviewSample[] = members.slice(0, 8).map((row) => ({
    memberNumber: row.memberNumber,
    name: [row.firstName, row.paternalSurname, row.maternalSurname].filter(Boolean).join(' ').trim(),
    curp: row.curp,
    weaponCount: row.inlineWeapons.length,
    sheetRow: row.sheetRow,
  }));

  return {
    sheetNames: wb.SheetNames,
    sheetName: resolved.name,
    headerRowIndex,
    layout: 'multi-row-blocks',
    columns,
    availableFields,
    estimatedMembers: members.length,
    estimatedWeapons,
    missingRequiredFields,
    warnings,
    sampleMembers,
    suggestedMapping,
  };
}