/**
 * Timezone-free calendar arithmetic.
 *
 * Every function here is pure and operates on {@link PlainDate} values. Nothing
 * in this file constructs a `Date` for arithmetic — all math runs through
 * "epoch day" integers, so DST transitions, negative timezone offsets and
 * month-length edge cases can never shift a calendar date.
 */
import type { DateInput, DateRange, PlainDate, PlainTime, RangeSemantics } from './types';

/* ------------------------------- construction ------------------------------ */

/** Create a normalized {@link PlainDate}. Out-of-range days roll over (day 32 of Jan → Feb 1). */
export function plainDate(year: number, month: number, day: number): PlainDate {
  return fromEpochDay(toEpochDayRaw(year, month, day));
}

export function isPlainDate(value: unknown): value is PlainDate {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PlainDate).year === 'number' &&
    typeof (value as PlainDate).month === 'number' &&
    typeof (value as PlainDate).day === 'number'
  );
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return MONTH_LENGTHS[month - 1] ?? 30;
}

/* --------------------------------- epoch ---------------------------------- */

/**
 * Days since 1970-01-01 using the proleptic Gregorian calendar.
 *
 * Reimplemented from Howard Hinnant's `days_from_civil`, which the author places
 * in the public domain — exact for all years.
 * @see https://howardhinnant.github.io/date_algorithms.html
 */
function toEpochDayRaw(year: number, month: number, day: number): number {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function toEpochDay(date: PlainDate): number {
  return toEpochDayRaw(date.year, date.month, date.day);
}

/** Inverse of {@link toEpochDay} — Hinnant's `civil_from_days`, likewise public domain. */
export function fromEpochDay(epochDay: number): PlainDate {
  const z = epochDay + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: y + (month <= 2 ? 1 : 0), month, day };
}

/* -------------------------------- coercion -------------------------------- */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/;

/** Coerce anything reasonable into a {@link PlainDate}. Returns `null` when impossible. */
export function toPlainDate(input: DateInput): PlainDate | null {
  if (input == null || input === '') return null;
  if (isPlainDate(input)) {
    if (
      !Number.isFinite(input.year) ||
      !Number.isFinite(input.month) ||
      !Number.isFinite(input.day)
    )
      return null;
    return plainDate(input.year, input.month, input.day);
  }
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return { year: input.getFullYear(), month: input.getMonth() + 1, day: input.getDate() };
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return null;
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    const iso = ISO_DATE.exec(trimmed);
    if (iso) {
      // Read the calendar fields literally so "2026-09-04" is never shifted by a timezone.
      return plainDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return { year: parsed.getFullYear(), month: parsed.getMonth() + 1, day: parsed.getDate() };
    }
    return null;
  }
  return null;
}

/** Convert to a native `Date` at local midnight (or at `time`, when supplied). */
export function toDate(date: PlainDate, time?: PlainTime | null): Date {
  const d = new Date(2000, 0, 1, time?.hour ?? 0, time?.minute ?? 0, time?.second ?? 0, 0);
  d.setFullYear(date.year, date.month - 1, date.day);
  return d;
}

/** `YYYY-MM-DD`. Never timezone-shifted. */
export function toISODate(date: PlainDate): string {
  const y = date.year < 0 ? `-${pad(Math.abs(date.year), 6)}` : pad(date.year, 4);
  return `${y}-${pad(date.month, 2)}-${pad(date.day, 2)}`;
}

export function fromISODate(value: string): PlainDate | null {
  const m = ISO_DATE.exec(value.trim());
  return m ? plainDate(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

function pad(value: number, length: number): string {
  return String(Math.abs(value)).padStart(length, '0');
}

/* ------------------------------- comparison ------------------------------- */

export function compareDates(a: PlainDate, b: PlainDate): -1 | 0 | 1 {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

export const isSameDay = (a: PlainDate | null, b: PlainDate | null): boolean =>
  !!a && !!b && compareDates(a, b) === 0;
export const isBefore = (a: PlainDate, b: PlainDate): boolean => compareDates(a, b) < 0;
export const isAfter = (a: PlainDate, b: PlainDate): boolean => compareDates(a, b) > 0;
export const isSameOrBefore = (a: PlainDate, b: PlainDate): boolean => compareDates(a, b) <= 0;
export const isSameOrAfter = (a: PlainDate, b: PlainDate): boolean => compareDates(a, b) >= 0;
export const isSameMonth = (a: PlainDate | null, b: PlainDate | null): boolean =>
  !!a && !!b && a.year === b.year && a.month === b.month;
export const isSameYear = (a: PlainDate | null, b: PlainDate | null): boolean =>
  !!a && !!b && a.year === b.year;

/** Inclusive on both ends by default. */
export function isBetween(
  date: PlainDate,
  start: PlainDate,
  end: PlainDate,
  inclusive: 'both' | 'start' | 'end' | 'none' = 'both',
): boolean {
  const afterStart =
    inclusive === 'both' || inclusive === 'start'
      ? isSameOrAfter(date, start)
      : isAfter(date, start);
  const beforeEnd =
    inclusive === 'both' || inclusive === 'end' ? isSameOrBefore(date, end) : isBefore(date, end);
  return afterStart && beforeEnd;
}

export function minOf(...dates: (PlainDate | null | undefined)[]): PlainDate | null {
  return dates.reduce<PlainDate | null>(
    (acc, d) => (d && (!acc || isBefore(d, acc)) ? d : acc),
    null,
  );
}

export function maxOf(...dates: (PlainDate | null | undefined)[]): PlainDate | null {
  return dates.reduce<PlainDate | null>(
    (acc, d) => (d && (!acc || isAfter(d, acc)) ? d : acc),
    null,
  );
}

export function clampDate(
  date: PlainDate,
  min?: PlainDate | null,
  max?: PlainDate | null,
): PlainDate {
  if (min && isBefore(date, min)) return min;
  if (max && isAfter(date, max)) return max;
  return date;
}

/* ------------------------------- arithmetic ------------------------------- */

export function addDays(date: PlainDate, amount: number): PlainDate {
  return amount === 0 ? date : fromEpochDay(toEpochDay(date) + Math.trunc(amount));
}

export const subDays = (date: PlainDate, amount: number): PlainDate => addDays(date, -amount);
export const addWeeks = (date: PlainDate, amount: number): PlainDate => addDays(date, amount * 7);

/** Clamps the day to the target month's length (Jan 31 + 1 month → Feb 28/29). */
export function addMonths(date: PlainDate, amount: number): PlainDate {
  const total = date.year * 12 + (date.month - 1) + Math.trunc(amount);
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

export const addYears = (date: PlainDate, amount: number): PlainDate =>
  addMonths(date, amount * 12);

/** Signed whole-day difference: `b - a`. */
export function diffInDays(a: PlainDate, b: PlainDate): number {
  return toEpochDay(b) - toEpochDay(a);
}

export function diffInMonths(a: PlainDate, b: PlainDate): number {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/* -------------------------------- boundaries ------------------------------ */

/** 0 = Sunday … 6 = Saturday. */
export function getWeekday(date: PlainDate): number {
  const wd = (toEpochDay(date) + 4) % 7; // 1970-01-01 was a Thursday
  return wd < 0 ? wd + 7 : wd;
}

export function startOfWeek(date: PlainDate, firstDayOfWeek = 0): PlainDate {
  const diff = (getWeekday(date) - firstDayOfWeek + 7) % 7;
  return addDays(date, -diff);
}

export function endOfWeek(date: PlainDate, firstDayOfWeek = 0): PlainDate {
  return addDays(startOfWeek(date, firstDayOfWeek), 6);
}

export const startOfMonth = (date: PlainDate): PlainDate => ({
  year: date.year,
  month: date.month,
  day: 1,
});
export const endOfMonth = (date: PlainDate): PlainDate => ({
  year: date.year,
  month: date.month,
  day: daysInMonth(date.year, date.month),
});

export function startOfQuarter(date: PlainDate): PlainDate {
  return { year: date.year, month: Math.floor((date.month - 1) / 3) * 3 + 1, day: 1 };
}

export function endOfQuarter(date: PlainDate): PlainDate {
  return endOfMonth({ ...startOfQuarter(date), month: Math.floor((date.month - 1) / 3) * 3 + 3 });
}

export const startOfYear = (date: PlainDate): PlainDate => ({ year: date.year, month: 1, day: 1 });
export const endOfYear = (date: PlainDate): PlainDate => ({ year: date.year, month: 12, day: 31 });

export function getQuarter(date: PlainDate): number {
  return Math.floor((date.month - 1) / 3) + 1;
}

export function getDayOfYear(date: PlainDate): number {
  return diffInDays(startOfYear(date), date) + 1;
}

/** ISO-8601 week number (weeks start Monday; week 1 contains the first Thursday). */
export function getISOWeek(date: PlainDate): number {
  const thursday = addDays(startOfWeek(date, 1), 3);
  const firstThursday = addDays(startOfWeek(startOfYear(thursday), 1), 3);
  return Math.round(diffInDays(firstThursday, thursday) / 7) + 1;
}

/** The year the ISO week belongs to (may differ from `date.year` in late Dec / early Jan). */
export function getISOWeekYear(date: PlainDate): number {
  return addDays(startOfWeek(date, 1), 3).year;
}

export function isWeekend(date: PlainDate, weekendDays: readonly number[] = [0, 6]): boolean {
  return weekendDays.includes(getWeekday(date));
}

/* --------------------------------- ranges --------------------------------- */

/** Returns the range with `start <= end`, preserving nulls. */
export function normalizeRange(range: DateRange): DateRange {
  const { start, end } = range;
  if (start && end && isAfter(start, end)) return { start: end, end: start };
  return { start, end };
}

/** Nights = exclusive end; days = inclusive end. Incomplete ranges are `0`. */
export function rangeLength(range: DateRange, semantics: RangeSemantics = 'nights'): number {
  const { start, end } = normalizeRange(range);
  if (!start || !end) return 0;
  const nights = diffInDays(start, end);
  return semantics === 'nights' ? nights : nights + 1;
}

export function rangeContains(range: DateRange, date: PlainDate): boolean {
  const { start, end } = normalizeRange(range);
  if (!start || !end) return !!start && isSameDay(start, date);
  return isBetween(date, start, end);
}

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  const na = normalizeRange(a);
  const nb = normalizeRange(b);
  if (!na.start || !na.end || !nb.start || !nb.end) return false;
  return isSameOrBefore(na.start, nb.end) && isSameOrBefore(nb.start, na.end);
}

/** Inclusive on both ends. Guarded to 10 000 days so a bad range cannot hang the UI. */
export function eachDayOfInterval(start: PlainDate, end: PlainDate, step = 1): PlainDate[] {
  const out: PlainDate[] = [];
  const total = Math.abs(diffInDays(start, end));
  if (total > 10_000) return out;
  const direction = isAfter(start, end) ? -1 : 1;
  for (let i = 0; i <= total; i += step) out.push(addDays(start, i * direction));
  return out;
}

/* ---------------------------------- today --------------------------------- */

const TZ_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

/** Today's calendar date in `timeZone` (defaults to the runtime zone). */
export function today(timeZone?: string): PlainDate {
  const now = new Date();
  if (!timeZone) return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  try {
    let formatter = TZ_FORMATTER_CACHE.get(timeZone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      TZ_FORMATTER_CACHE.set(timeZone, formatter);
    }
    return (
      fromISODate(formatter.format(now)) ?? {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
      }
    );
  } catch {
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }
}

/* ---------------------------------- time ---------------------------------- */

export function plainTime(hour: number, minute = 0, second = 0): PlainTime {
  const total = (((hour * 3600 + minute * 60 + second) % 86400) + 86400) % 86400;
  return {
    hour: Math.floor(total / 3600),
    minute: Math.floor((total % 3600) / 60),
    second: total % 60,
  };
}

export const timeToMinutes = (time: PlainTime): number => time.hour * 60 + time.minute;
export const minutesToTime = (minutes: number): PlainTime => plainTime(0, minutes);

export function compareTimes(a: PlainTime, b: PlainTime): -1 | 0 | 1 {
  const av = a.hour * 3600 + a.minute * 60 + a.second;
  const bv = b.hour * 3600 + b.minute * 60 + b.second;
  return av === bv ? 0 : av < bv ? -1 : 1;
}

export function clampTime(
  time: PlainTime,
  min?: PlainTime | null,
  max?: PlainTime | null,
): PlainTime {
  if (min && compareTimes(time, min) < 0) return min;
  if (max && compareTimes(time, max) > 0) return max;
  return time;
}

export function toPlainTime(input: Date | string | PlainTime | null | undefined): PlainTime | null {
  if (input == null) return null;
  if (input instanceof Date)
    return Number.isNaN(input.getTime())
      ? null
      : plainTime(input.getHours(), input.getMinutes(), input.getSeconds());
  if (typeof input === 'string') {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/i.exec(input.trim());
    if (!m) return null;
    let hour = Number(m[1]);
    const meridiem = m[4]?.toLowerCase().replace(/\./g, '');
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return plainTime(hour, Number(m[2]), m[3] ? Number(m[3]) : 0);
  }
  return plainTime(input.hour, input.minute, input.second ?? 0);
}
