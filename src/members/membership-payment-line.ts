import { type MembershipTypeRow } from '../clubs/club-membership-types';
import { type MembershipPeriod, periodLabel } from './membership-status';
import { billingChargeLabel, type MembershipBillingPeriod } from './membership-billing';
import { formatPesos } from './member.mapper';

const MODALITY_LABEL: Record<string, string> = {
  caza: 'Cacería',
  'tiro-deportivo': 'Tiro deportivo',
};

export function membershipModalityLabel(modality: string): string {
  return MODALITY_LABEL[modality] ?? modality;
}

export function planDisplayName(plans: readonly MembershipTypeRow[], code: string): string {
  const row = plans.find((plan) => plan.code === code);
  return row?.name?.trim() || code;
}

export function etiquetaMembresiaEnLineaPago(planNombre: string): string {
  const nombre = planNombre.trim();
  if (!nombre) {
    return 'Membresía';
  }
  if (/^membres[ií]a(\s|$)/iu.test(nombre)) {
    return nombre;
  }
  return `Membresía ${nombre}`;
}

/** Membresía Standard · Cacería · Anualidad 2026–2027 */
export function membershipPaymentLineTitle(
  planName: string,
  modality: string,
  period: MembershipPeriod | string,
  billingPeriod: MembershipBillingPeriod = 'anual',
): string {
  const slice = typeof period === 'string' ? period : periodLabel(period);
  const periodo = `${billingChargeLabel(billingPeriod)} ${slice}`;
  const parts = [
    etiquetaMembresiaEnLineaPago(planName),
    membershipModalityLabel(modality),
    periodo,
  ].filter(Boolean);
  return parts.join(' · ');
}

export function membershipPaymentRegisteredTitle(billingPeriod: MembershipBillingPeriod): string {
  return `${billingChargeLabel(billingPeriod)} registrada`;
}

export function membershipPaymentRevertedTitle(billingPeriod: MembershipBillingPeriod): string {
  return `${billingChargeLabel(billingPeriod)} revertida`;
}

export function membershipAlreadyPaidMessage(billingPeriod: MembershipBillingPeriod): string {
  const label = billingChargeLabel(billingPeriod).toLowerCase();
  return `La ${label} de este periodo ya está pagada.`;
}

export function membershipPayOldestPendingMessage(billingPeriod: MembershipBillingPeriod): string {
  const label = billingChargeLabel(billingPeriod).toLowerCase();
  return `Primero se debe pagar la ${label} pendiente más antigua.`;
}

export function membershipSlicePaidMessage(billingPeriod: MembershipBillingPeriod): string {
  const label = billingChargeLabel(billingPeriod).toLowerCase();
  return `Esa ${label} ya está pagada.`;
}

export function membershipPaymentRegisteredDetail(
  lineTitle: string,
  amount: number,
  memberName: string,
): string {
  return `Se registró ${lineTitle} de ${formatPesos(amount)} de ${memberName}.`;
}

export function membershipPaymentRevertedDetail(
  lineTitle: string,
  amount: number,
  memberName: string,
): string {
  return `Se revirtió ${lineTitle} de ${formatPesos(amount)} de ${memberName}.`;
}