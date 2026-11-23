import * as XLSX from 'xlsx';
import { formatShortDateMx } from '../clubs/club-billing.util';
import { type ReportesMovementRow } from './reportes.queries';

const PLATFORM_LABEL: Record<string, string> = {
  pistola: 'Pistola',
  revolver: 'Revólver',
  escopeta: 'Escopeta',
  rifle: 'Rifle',
  otro: 'Otro',
};

const MODALITY_LABEL: Record<string, string> = {
  'proteccion-domicilio': 'Protección de domicilio',
  'proteccion-parcela': 'Protección de parcela',
  'tiro-deportivo': 'Tiro deportivo',
  caceria: 'Cacería',
  caza: 'Cacería',
};

const MOVEMENT_LABEL: Record<ReportesMovementRow['movement'], string> = {
  alta: 'Alta',
  baja: 'Baja',
};

const HEADERS = [
  'Fecha',
  'Tipo de arma',
  'Modalidad',
  'Matrícula o serie',
  'Movimiento',
  'Socio',
] as const;

function platformLabel(platform: string): string {
  const label = PLATFORM_LABEL[platform] ?? platform;
  return label || '—';
}

function modalityLabel(modality: string): string {
  const label = MODALITY_LABEL[modality] ?? modality;
  return label || '—';
}

function memberLabel(row: ReportesMovementRow): string {
  const name = row.memberName?.trim();
  if (row.memberNumber && name) {
    return `${row.memberNumber} · ${name}`;
  }
  return row.memberNumber || name || '—';
}

function rowToCells(row: ReportesMovementRow): string[] {
  return [
    formatShortDateMx(row.movementOn),
    platformLabel(row.platform),
    modalityLabel(row.modality),
    row.serialNumber?.trim() || '—',
    MOVEMENT_LABEL[row.movement],
    memberLabel(row),
  ];
}

export function buildSedenaMovementsWorkbook(rows: ReportesMovementRow[]): Buffer {
  const data = [HEADERS.slice(), ...rows.map(rowToCells)];
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, sheet, 'Movimientos SEDENA');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function sedenaExportFilename(fromYm: string, toYm: string): string {
  return `movimientos-sedena-${fromYm}-${toYm}.xlsx`;
}