import { BadRequestException } from '@nestjs/common';
import { MembershipTypeRow } from './club-membership-types';
import {
  type MembershipModality,
  type MembershipModalityId,
  assertMembershipModalitySlug,
} from './club-member-modalities';

export type { MembershipModality, MembershipModalityId };

export function planByCode(types: readonly MembershipTypeRow[], code: string): MembershipTypeRow | undefined {
  const trimmed = code.trim();
  return types.find((row) => row.code === trimmed);
}

export function feeForPlan(types: readonly MembershipTypeRow[], planCode: string, clubFallback?: () => number): number {
  const plan = planByCode(types, planCode);
  if (plan) {
    return plan.feeMxn;
  }
  return clubFallback?.() ?? 0;
}

export function planAllowsModality(plan: MembershipTypeRow, modality: MembershipModality): boolean {
  return modality === 'caza' ? plan.allowsHunting : plan.allowsSportShooting;
}

export function assertPlanAllowsModality(
  types: readonly MembershipTypeRow[],
  planCode: string,
  modality: string,
): MembershipTypeRow {
  const modalityId = assertMembershipModalitySlug(modality);
  const plan = planByCode(types, planCode);
  if (!plan) {
    throw new BadRequestException('El plan de membresía no existe en este club.');
  }
  if (!planAllowsModality(plan, modalityId)) {
    throw new BadRequestException(
      `«${plan.name}» no está disponible para ${modalityId === 'caza' ? 'cacería' : 'tiro deportivo'}.`,
    );
  }
  return plan;
}

export function soleModalityForPlan(plan: MembershipTypeRow): MembershipModality | null {
  if (plan.allowsSportShooting && !plan.allowsHunting) {
    return 'tiro-deportivo';
  }
  if (plan.allowsHunting && !plan.allowsSportShooting) {
    return 'caza';
  }
  return null;
}

export function parseModalityInput(raw: string): MembershipModality | null {
  const key = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '-');
  if (key === 'tiro-deportivo' || key === 'tiro' || key.includes('deportivo')) {
    return 'tiro-deportivo';
  }
  if (key === 'caza' || key === 'caceria' || key.includes('cacer')) {
    return 'caza';
  }
  return null;
}

const LEGACY_BASIC_PLAN_KEYS = new Set([
  'general',
  'membresia-general',
  'membresia',
  'basico',
  'basica',
  'basic',
  'inicial',
  'standard',
  'socio',
]);

export function resolveImportMembership(
  planRaw: string,
  modalityRaw: string,
  plans: readonly MembershipTypeRow[],
): { planCode: string; modality: MembershipModality } | null {
  const trimmed = planRaw.trim();
  if (!trimmed) {
    return null;
  }
  const key = normalizePlanLookupKey(trimmed);
  let plan =
    plans.find((row) => row.code === key) ??
    plans.find((row) => normalizePlanLookupKey(row.name) === key) ??
    plans.find((row) => row.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (!plan && LEGACY_BASIC_PLAN_KEYS.has(key)) {
    // Plantillas viejas / Excel con «general»: mapear al plan básico real del club (p. ej. Standard).
    plan = defaultImportMembershipPlan(plans) ?? undefined;
  }
  if (!plan) {
    const legacyModality = parseModalityInput(trimmed);
    if (legacyModality) {
      plan =
        plans.find((row) => soleModalityForPlan(row) === legacyModality) ??
        plans.find((row) => planAllowsModality(row, legacyModality));
      if (plan) {
        return { planCode: plan.code, modality: legacyModality };
      }
    }
    return null;
  }
  const parsedModality = modalityRaw.trim() ? parseModalityInput(modalityRaw) : null;
  const auto = soleModalityForPlan(plan);
  const modality = parsedModality ?? auto;
  if (!modality || !planAllowsModality(plan, modality)) {
    return null;
  }
  return { planCode: plan.code, modality };
}

function normalizePlanLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '-');
}

/**
 * Sin columna tipo_membresía en el Excel: si el club tiene un solo plan, todos entran ahí
 * (p. ej. standard). Con varios planes, el primero por sortOrder o uno «básico».
 */
export function defaultImportMembershipPlan(plans: readonly MembershipTypeRow[]): MembershipTypeRow | null {
  if (!plans.length) {
    return null;
  }
  if (plans.length === 1) {
    return plans[0];
  }
  const preferred = plans.find((row) => LEGACY_BASIC_PLAN_KEYS.has(normalizePlanLookupKey(row.code)));
  return preferred ?? plans[0];
}

/** Si el socio tiene un código de plan que ya no existe en el club, usa el plan por defecto. */
export function coerceMembershipPlanCode(
  storedCode: string,
  plans: readonly MembershipTypeRow[],
): string {
  const trimmed = storedCode.trim();
  if (trimmed && plans.some((row) => row.code === trimmed)) {
    return trimmed;
  }
  return defaultImportMembershipPlan(plans)?.code ?? trimmed;
}

/** Si el Excel no trae plan, usa el plan por defecto del club y la modalidad que permita. */
export function resolveImportMembershipWithDefault(
  planRaw: string,
  modalityRaw: string,
  plans: readonly MembershipTypeRow[],
): { planCode: string; modality: MembershipModality } | null {
  if (planRaw.trim()) {
    return resolveImportMembership(planRaw, modalityRaw, plans);
  }
  const plan = defaultImportMembershipPlan(plans);
  if (!plan) {
    return null;
  }
  const parsed = modalityRaw.trim() ? parseModalityInput(modalityRaw) : null;
  const auto = soleModalityForPlan(plan);
  const modality = parsed ?? auto ?? (plan.allowsSportShooting ? 'tiro-deportivo' : 'caza');
  if (!planAllowsModality(plan, modality)) {
    return null;
  }
  return { planCode: plan.code, modality };
}