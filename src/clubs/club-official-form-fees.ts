/** Formatos PDF con malla de pago en ventanilla (alineado con fieldtrack-app). */
export const PAGO_VENTANILLA_FORM_IDS = [
  'autorizacion-compra-arma-h6',
  'baja-extravio-robo-h6',
  'cambio-datos-h5',
  'baja-arma-diferentes-motivos-h3',
  'arma-adicional',
] as const;

export type PagoVentanillaFormId = (typeof PAGO_VENTANILLA_FORM_IDS)[number];

const VENTANILLA_SET = new Set<string>(PAGO_VENTANILLA_FORM_IDS);

export function isPagoVentanillaFormId(value: string): value is PagoVentanillaFormId {
  return VENTANILLA_SET.has(value);
}

const DEFAULT_MONTOS: Record<
  PagoVentanillaFormId,
  { importeMxn: number; cantidadPagarMxn: number; totalPagarMxn: number }
> = {
  'autorizacion-compra-arma-h6': { importeMxn: 490, cantidadPagarMxn: 490, totalPagarMxn: 490 },
  'baja-extravio-robo-h6': { importeMxn: 201, cantidadPagarMxn: 201, totalPagarMxn: 201 },
  'cambio-datos-h5': { importeMxn: 201, cantidadPagarMxn: 201, totalPagarMxn: 201 },
  'baja-arma-diferentes-motivos-h3': { importeMxn: 201, cantidadPagarMxn: 201, totalPagarMxn: 201 },
  'arma-adicional': { importeMxn: 604, cantidadPagarMxn: 604, totalPagarMxn: 604 },
};

export interface OfficialFormFeeRow {
  formId: PagoVentanillaFormId;
  importeMxn: number;
  cantidadPagarMxn: number;
  totalPagarMxn: number;
}

function defaultRow(formId: PagoVentanillaFormId): OfficialFormFeeRow {
  const m = DEFAULT_MONTOS[formId];
  return { formId, ...m };
}

export function officialFormFeesDefaults(): OfficialFormFeeRow[] {
  return PAGO_VENTANILLA_FORM_IDS.map((id) => defaultRow(id));
}

function normalizeMonto(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return fallback;
  }
  return Math.round(n);
}

export function normalizeOfficialFormFees(raw: unknown): OfficialFormFeeRow[] {
  const defaults = officialFormFeesDefaults();
  if (!Array.isArray(raw)) {
    return defaults;
  }
  const byId = new Map<PagoVentanillaFormId, OfficialFormFeeRow>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const formId = (row as { formId?: string }).formId;
    if (!formId || !isPagoVentanillaFormId(formId)) {
      continue;
    }
    const base = defaultRow(formId);
    const entry = row as Partial<OfficialFormFeeRow>;
    byId.set(formId, {
      formId,
      importeMxn: normalizeMonto(entry.importeMxn, base.importeMxn),
      cantidadPagarMxn: normalizeMonto(entry.cantidadPagarMxn, base.cantidadPagarMxn),
      totalPagarMxn: normalizeMonto(entry.totalPagarMxn, base.totalPagarMxn),
    });
  }
  return defaults.map((def) => byId.get(def.formId) ?? def);
}