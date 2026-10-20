import { EventRecurrence } from './entities/club-event.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

interface Day {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

export interface RecurringDates {
  startsOn: string;
  recurrence: EventRecurrence;
  repeatUntil: string | null;
}

/** Fechas (`YYYY-MM-DD`) en que ocurre el evento dentro de `[from, to]`, en orden. */
export function occurrencesBetween(event: RecurringDates, from: string, to: string): string[] {
  const start = event.startsOn;
  const end = event.repeatUntil && event.repeatUntil < to ? event.repeatUntil : to;
  const lower = start > from ? start : from;
  if (lower > end) {
    return [];
  }
  const inRange = (date: string) => date >= lower && date <= end;
  const first = parseDay(start);
  switch (event.recurrence) {
    case 'none':
      return inRange(start) ? [start] : [];
    case 'weekly': {
      const gap = Math.round((toUtc(parseDay(lower)) - toUtc(first)) / DAY_MS);
      const dates: string[] = [];
      for (let offset = Math.ceil(gap / 7) * 7; ; offset += 7) {
        const date = formatDay(addDays(first, offset));
        if (date > end) {
          return dates;
        }
        dates.push(date);
      }
    }
    case 'monthly_day':
      return eachMonth(lower, end, (year, month) =>
        first.day <= daysInMonth(year, month) ? { year, month, day: first.day } : null,
      ).filter(inRange);
    case 'monthly_weekday': {
      const weekday = weekdayOf(first);
      const nth = Math.ceil(first.day / 7);
      return eachMonth(lower, end, (year, month) => {
        const firstMatch = 1 + ((weekday - weekdayOf({ year, month, day: 1 }) + 7) % 7);
        const day = firstMatch + (nth - 1) * 7;
        return day <= daysInMonth(year, month) ? { year, month, day } : null;
      }).filter(inRange);
    }
    case 'monthly_last_weekday': {
      const weekday = weekdayOf(first);
      return eachMonth(lower, end, (year, month) => {
        const last = daysInMonth(year, month);
        const day = last - ((weekdayOf({ year, month, day: last }) - weekday + 7) % 7);
        return { year, month, day };
      }).filter(inRange);
    }
    case 'yearly': {
      const dates: string[] = [];
      for (let year = parseDay(lower).year; year <= parseDay(end).year; year++) {
        if (first.day <= daysInMonth(year, first.month)) {
          const date = formatDay({ year, month: first.month, day: first.day });
          if (inRange(date)) {
            dates.push(date);
          }
        }
      }
      return dates;
    }
  }
}

/** `monthly_weekday` solo cubre del primero al cuarto; el quinto se pide como «último». */
export function recurrenceFitsDate(recurrence: EventRecurrence, startsOn: string): boolean {
  const day = parseDay(startsOn);
  if (recurrence === 'monthly_weekday') {
    return day.day <= 28;
  }
  if (recurrence === 'monthly_last_weekday') {
    return day.day > daysInMonth(day.year, day.month) - 7;
  }
  return true;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(parseDay(to)) - toUtc(parseDay(from))) / DAY_MS);
}

function eachMonth(from: string, to: string, pick: (year: number, month: number) => Day | null): string[] {
  const start = parseDay(from);
  const end = parseDay(to);
  const dates: string[] = [];
  for (let year = start.year, month = start.month; year < end.year || (year === end.year && month <= end.month); ) {
    const day = pick(year, month);
    if (day) {
      dates.push(formatDay(day));
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return dates;
}

function parseDay(value: string): Day {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return { year, month, day };
}

function formatDay(day: Day): string {
  return `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
}

function toUtc(day: Day): number {
  return Date.UTC(day.year, day.month - 1, day.day);
}

function addDays(day: Day, days: number): Day {
  const date = new Date(toUtc(day) + days * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** 0 = domingo. */
function weekdayOf(day: Day): number {
  return new Date(toUtc(day)).getUTCDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
