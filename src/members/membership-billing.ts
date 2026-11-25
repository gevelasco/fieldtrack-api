import { type MembershipTypeRow } from '../clubs/club-membership-types';
import {
  type MembershipPeriod,
  type PaymentSlice,
  type PeriodRule,
  dateFromIso,
  dayAfter,
  fiscalPeriodFromRule,
  isoDate,
  periodLabel,
} from './membership-status';

export type MembershipBillingPeriod = 'mensual' | 'semestral' | 'anual';

export function normalizeMembershipBillingPeriod(value: unknown): MembershipBillingPeriod {
  if (value === 'mensual' || value === 'semestral' || value === 'anual') {
    return value;
  }
  return 'anual';
}

export function ruleFromPlan(
  row: Pick<MembershipTypeRow, 'startMonth' | 'startDay' | 'endMonth' | 'endDay'>,
): PeriodRule {
  return {
    startMonth: row.startMonth,
    startDay: row.startDay,
    endMonth: row.endMonth,
    endDay: row.endDay,
  };
}

export function billingChargeLabel(billing: MembershipBillingPeriod): string {
  switch (billing) {
    case 'mensual':
      return 'Mensualidad';
    case 'semestral':
      return 'Semestre';
    default:
      return 'Anualidad';
  }
}

function billingMonths(billing: MembershipBillingPeriod): number | null {
  if (billing === 'mensual') {
    return 1;
  }
  if (billing === 'semestral') {
    return 6;
  }
  return null;
}

function dateToIso(date: Date): string {
  return isoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function dayAfterIso(iso: string): string {
  return dateToIso(dayAfter(iso));
}

function dayBeforeIso(iso: string): string {
  const date = dateFromIso(iso);
  date.setDate(date.getDate() - 1);
  return dateToIso(date);
}

function minIso(a: string, b: string): string {
  return a <= b ? a : b;
}

function addMonthsClamped(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const target = new Date(year, month - 1 + months, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return isoDate(target.getFullYear(), target.getMonth() + 1, safeDay);
}

function sliceEnd(start: string, billing: MembershipBillingPeriod, fiscalEnd: string): string {
  const stride = billingMonths(billing);
  if (stride === null) {
    return fiscalEnd;
  }
  const nextStart = addMonthsClamped(start, stride);
  const end = dayBeforeIso(nextStart);
  return minIso(end, fiscalEnd);
}

/** Tramo de cobro vigente que contiene `today` según el calendario de la modalidad. */
export function billingSliceForDate(
  rule: PeriodRule,
  billing: MembershipBillingPeriod,
  today: Date | string = new Date(),
): MembershipPeriod {
  const anchor = typeof today === 'string' ? dateFromIso(today) : today;
  const fiscal = fiscalPeriodFromRule(rule, anchor);
  if (billing === 'anual') {
    return fiscal;
  }
  let start = fiscal.start;
  for (let guard = 0; guard < 24; guard += 1) {
    const end = sliceEnd(start, billing, fiscal.end);
    const dIso = dateToIso(anchor);
    if (dIso >= start && dIso <= end) {
      return { start, end };
    }
    if (end >= fiscal.end) {
      break;
    }
    start = dayAfterIso(end);
  }
  return fiscal;
}

export function billingSliceForStart(
  rule: PeriodRule,
  billing: MembershipBillingPeriod,
  periodStart: string,
): MembershipPeriod {
  const anchor = dateFromIso(periodStart);
  const fiscal = fiscalPeriodFromRule(rule, anchor);
  if (billing === 'anual') {
    return fiscal;
  }
  let start = fiscal.start;
  for (let guard = 0; guard < 24; guard += 1) {
    const end = sliceEnd(start, billing, fiscal.end);
    if (start === periodStart) {
      return { start, end };
    }
    if (end >= fiscal.end) {
      break;
    }
    start = dayAfterIso(end);
  }
  return billingSliceForDate(rule, billing, periodStart);
}

function nextBillingSlice(
  rule: PeriodRule,
  billing: MembershipBillingPeriod,
  slice: MembershipPeriod,
): MembershipPeriod {
  const after = dayAfterIso(slice.end);
  return billingSliceForDate(rule, billing, after);
}

export function periodCoveredForPlan(
  payments: readonly PaymentSlice[],
  rule: PeriodRule,
  billing: MembershipBillingPeriod,
  today = new Date(),
): boolean {
  const current = billingSliceForDate(rule, billing, today);
  return payments.some((payment) => payment.periodStart === current.start);
}

export function pendingBillingPeriods(input: {
  rule: PeriodRule;
  billingPeriod: MembershipBillingPeriod;
  joinedOn: string;
  payments: readonly (PaymentSlice & { reverted: boolean })[];
  today?: Date;
}): MembershipPeriod[] {
  const today = input.today ?? new Date();
  const current = billingSliceForDate(input.rule, input.billingPeriod, today);
  const paid = new Set(
    input.payments.filter((payment) => !payment.reverted).map((payment) => payment.periodStart),
  );
  const firstPayment = input.payments.map((payment) => payment.periodStart).sort()[0];
  let slice = firstPayment
    ? billingSliceForStart(input.rule, input.billingPeriod, firstPayment)
  : billingSliceForDate(input.rule, input.billingPeriod, input.joinedOn);

  if (!firstPayment) {
    while (input.joinedOn > slice.end) {
      slice = nextBillingSlice(input.rule, input.billingPeriod, slice);
    }
  }

  const pending: MembershipPeriod[] = [];
  for (let guard = 0; slice.start <= current.start && guard < 120; guard += 1) {
    if (!paid.has(slice.start)) {
      pending.push(slice);
    }
    if (slice.start >= current.start) {
      break;
    }
    slice = nextBillingSlice(input.rule, input.billingPeriod, slice);
  }
  return pending;
}

export function resolveMemberStatusForPlan(input: {
  storedStatus: string;
  rule: PeriodRule;
  billingPeriod: MembershipBillingPeriod;
  joinedOn: string;
  payments: readonly PaymentSlice[];
  today?: Date;
}): 'vigente' | 'pendiente' | 'vetado' {
  if (input.storedStatus === 'vetado') {
    return 'vetado';
  }
  const today = input.today ?? new Date();
  if (periodCoveredForPlan(input.payments, input.rule, input.billingPeriod, today)) {
    return 'vigente';
  }
  return 'pendiente';
}

export function firstPaymentDateForPlan(
  joinedOn: string,
  rule: PeriodRule,
  billing: MembershipBillingPeriod,
  today = new Date(),
): string {
  const slice = billingSliceForDate(rule, billing, today);
  if (joinedOn >= slice.start && joinedOn <= slice.end) {
    return joinedOn;
  }
  return dateToIso(today);
}

export function paymentPeriodLabel(
  rule: PeriodRule,
  billing: MembershipBillingPeriod,
  period: MembershipPeriod,
): string {
  return periodLabel(period);
}

export { periodLabel };