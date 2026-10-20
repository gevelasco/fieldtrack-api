export type MembershipCode = 'tiro-deportivo' | 'caza';
export type MemberStatusCode = 'vigente' | 'pendiente' | 'vetado';

export interface PeriodRule {
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
}

export interface MembershipCalendar {
  sportShooting: PeriodRule;
  hunting: PeriodRule;
}

export interface PaymentSlice {
  membership: string;
  paidOn: string;
  periodStart: string;
}

export interface MembershipPeriod {
  start: string;
  end: string;
}

export function membershipPeriod(
  membership: MembershipCode,
  calendar: MembershipCalendar,
  today = new Date(),
): MembershipPeriod {
  const rule = membership === 'caza' ? calendar.hunting : calendar.sportShooting;
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const crossesYear = rule.endMonth < rule.startMonth;
  const beforeStart =
    month < rule.startMonth || (month === rule.startMonth && day < rule.startDay);
  const startYear = crossesYear && beforeStart ? year - 1 : year;
  const endYear = crossesYear ? startYear + 1 : startYear;
  return {
    start: isoDate(startYear, rule.startMonth, rule.startDay),
    end: isoDate(endYear, rule.endMonth, rule.endDay),
  };
}

export function periodCovered(
  payments: readonly PaymentSlice[],
  membership: MembershipCode,
  calendar: MembershipCalendar,
  today = new Date(),
): boolean {
  const period = membershipPeriod(membership, calendar, today);
  return payments.some(
    (payment) => payment.membership === membership && payment.periodStart === period.start,
  );
}

/**
 * Anualidades sin pago activo, de la más antigua a la actual.
 * Se cuentan desde el primer periodo cobrado (el alta), aunque ese pago se haya revertido.
 */
export function pendingPeriods(input: {
  membership: MembershipCode;
  joinedOn: string;
  payments: readonly (PaymentSlice & { reverted: boolean })[];
  calendar: MembershipCalendar;
  today?: Date;
}): MembershipPeriod[] {
  const today = input.today ?? new Date();
  const current = membershipPeriod(input.membership, input.calendar, today);
  const own = input.payments.filter((payment) => payment.membership === input.membership);
  const paid = new Set(own.filter((payment) => !payment.reverted).map((payment) => payment.periodStart));
  const firstPayment = own.map((payment) => payment.periodStart).sort()[0];
  const pending: MembershipPeriod[] = [];
  let period = firstPayment
    ? membershipPeriod(input.membership, input.calendar, dateFromIso(firstPayment))
    : membershipPeriod(input.membership, input.calendar, dateFromIso(input.joinedOn));
  if (!firstPayment) {
    while (input.joinedOn > period.end) {
      period = membershipPeriod(input.membership, input.calendar, dayAfter(period.end));
    }
  }
  for (let guard = 0; period.start <= current.start && guard < 100; guard += 1) {
    if (!paid.has(period.start)) {
      pending.push(period);
    }
    period = membershipPeriod(input.membership, input.calendar, dayAfter(period.end));
  }
  return pending;
}

export function periodLabel(period: MembershipPeriod): string {
  const startYear = period.start.slice(0, 4);
  const endYear = period.end.slice(0, 4);
  return startYear === endYear ? startYear : `${startYear}–${endYear}`;
}

export function withinPeriod(date: string, period: MembershipPeriod): boolean {
  return date >= period.start && date <= period.end;
}

/** Periodo de membresía que comienza en `periodStart` (valor guardado en el pago). */
export function periodForStart(
  membership: MembershipCode,
  calendar: MembershipCalendar,
  periodStart: string,
): MembershipPeriod {
  return membershipPeriod(membership, calendar, dateFromIso(periodStart));
}

export function resolveMemberStatus(input: {
  storedStatus: string;
  membership: MembershipCode;
  joinedOn: string;
  payments: readonly PaymentSlice[];
  calendar: MembershipCalendar;
  today?: Date;
}): MemberStatusCode {
  if (input.storedStatus === 'vetado') {
    return 'vetado';
  }
  const today = input.today ?? new Date();
  if (periodCovered(input.payments, input.membership, input.calendar, today)) {
    return 'vigente';
  }
  return 'pendiente';
}

/** El alta cobra la anualidad del periodo actual. Si el ingreso cae en ese periodo, el pago lleva esa fecha. */
export function firstPaymentDate(
  joinedOn: string,
  membership: MembershipCode,
  calendar: MembershipCalendar,
  today = new Date(),
): string {
  const period = membershipPeriod(membership, calendar, today);
  if (joinedOn >= period.start && joinedOn <= period.end) {
    return joinedOn;
  }
  return isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
}

function dateFromIso(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function dayAfter(iso: string): Date {
  const date = dateFromIso(iso);
  date.setDate(date.getDate() + 1);
  return date;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
