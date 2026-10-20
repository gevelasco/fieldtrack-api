const MX = 'America/Mexico_City';

export interface ClubBillingPaymentRow {
  periodKey: string;
  periodLabel: string;
  paidOn: string;
  concept: string;
  amountMxn: number;
  status: 'paid';
}

export function buildClubBillingHistory(
  registeredAt: Date,
  now = new Date(),
  bonusMonths = 0,
): ClubBillingPaymentRow[] {
  const start = monthParts(registeredAt);
  const end = extendMonthParts(monthParts(now), bonusMonths);
  const rows: ClubBillingPaymentRow[] = [];
  let year = start.year;
  let month = start.month;

  while (year < end.year || (year === end.year && month <= end.month)) {
    const isFirst = rows.length === 0;
    const paidOn = isFirst ? formatIso(registeredAt) : formatIso(new Date(Date.UTC(year, month - 1, 1, 12)));
    const periodDate = new Date(Date.UTC(year, month - 1, 1, 12));
    const isBonus = isAfterMonth({ year, month }, monthParts(now));
    rows.push({
      periodKey: `${year}-${String(month).padStart(2, '0')}`,
      periodLabel: formatPeriodLabel(periodDate),
      paidOn,
      concept: isBonus ? 'FieldTrack · Beta · Cupón' : 'FieldTrack · Beta',
      amountMxn: 0,
      status: 'paid',
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return rows.reverse();
}

export function subscriptionValidThroughIso(now = new Date(), bonusMonths = 0): string {
  const end = extendMonthParts(monthParts(now), bonusMonths);
  const lastDay = daysInMonth(end.year, end.month);
  return `${end.year}-${String(end.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** @deprecated use subscriptionValidThroughIso */
export function endOfCurrentMonthIso(now = new Date()): string {
  return subscriptionValidThroughIso(now, 0);
}

function extendMonthParts(base: { year: number; month: number }, bonusMonths: number) {
  let year = base.year;
  let month = base.month + Math.max(0, bonusMonths);
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return { year, month };
}

function isAfterMonth(
  candidate: { year: number; month: number },
  current: { year: number; month: number },
): boolean {
  return candidate.year > current.year || (candidate.year === current.year && candidate.month > current.month);
}

export function formatLongDateMx(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === 'string' ? parseIso(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: MX,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatShortDateMx(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: MX,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseIso(iso));
}

function formatPeriodLabel(date: Date): string {
  const label = new Intl.DateTimeFormat('es-MX', {
    timeZone: MX,
    month: 'short',
    year: 'numeric',
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthParts(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MX,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')?.value ?? '1970');
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? '1');
  return { year, month };
}

function formatIso(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MX,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
