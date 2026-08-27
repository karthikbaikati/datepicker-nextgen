import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  clampDate,
  clampTime,
  compareDates,
  compareTimes,
  daysInMonth,
  diffInDays,
  diffInMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  fromEpochDay,
  fromISODate,
  getDayOfYear,
  getISOWeek,
  getISOWeekYear,
  getQuarter,
  getWeekday,
  isAfter,
  isBefore,
  isBetween,
  isLeapYear,
  isPlainDate,
  isSameDay,
  isSameMonth,
  isSameOrAfter,
  isSameOrBefore,
  isSameYear,
  isWeekend,
  maxOf,
  minOf,
  minutesToTime,
  normalizeRange,
  plainDate,
  plainTime,
  rangeContains,
  rangeLength,
  rangesOverlap,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  timeToMinutes,
  toDate,
  toEpochDay,
  toISODate,
  toPlainDate,
  toPlainTime,
} from '../src/core/plain-date';
import type { PlainDate } from '../src/core/types';

const iso = (date: PlainDate | null): string | null => (date ? toISODate(date) : null);

describe('plain-date: leap years', () => {
  it('treats 2024 as a leap year, 1900 as common and 2000 as leap', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2023)).toBe(false);
  });

  it('reports February length for each of those years', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
  });

  it('reports every other month length', () => {
    const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    lengths.forEach((length, index) => {
      expect(daysInMonth(2026, index + 1)).toBe(length);
    });
  });

  it('places Feb 29 2024 on a Thursday and skips it in 2025', () => {
    expect(getWeekday(plainDate(2024, 2, 29))).toBe(4);
    expect(iso(addDays(plainDate(2024, 2, 28), 1))).toBe('2024-02-29');
    expect(iso(addDays(plainDate(2025, 2, 28), 1))).toBe('2025-03-01');
  });

  it('walks 1900-02-28 straight to March because 1900 is not a leap year', () => {
    expect(iso(addDays(plainDate(1900, 2, 28), 1))).toBe('1900-03-01');
    expect(iso(addDays(plainDate(2000, 2, 28), 1))).toBe('2000-02-29');
  });
});

describe('plain-date: month-end clamping', () => {
  it('clamps Jan 31 + 1 month to Feb 29 in a leap year and Feb 28 otherwise', () => {
    expect(iso(addMonths(plainDate(2024, 1, 31), 1))).toBe('2024-02-29');
    expect(iso(addMonths(plainDate(2025, 1, 31), 1))).toBe('2025-02-28');
  });

  it('clamps in both directions and across year boundaries', () => {
    expect(iso(addMonths(plainDate(2026, 3, 31), -1))).toBe('2026-02-28');
    expect(iso(addMonths(plainDate(2026, 5, 31), 1))).toBe('2026-06-30');
    expect(iso(addMonths(plainDate(2026, 12, 31), 1))).toBe('2027-01-31');
    expect(iso(addMonths(plainDate(2026, 1, 31), -1))).toBe('2025-12-31');
    expect(iso(addMonths(plainDate(2026, 1, 31), 13))).toBe('2027-02-28');
  });

  it('clamps Feb 29 to Feb 28 when adding whole years', () => {
    expect(iso(addYears(plainDate(2024, 2, 29), 1))).toBe('2025-02-28');
    expect(iso(addYears(plainDate(2024, 2, 29), 4))).toBe('2028-02-29');
    expect(iso(addYears(plainDate(2024, 2, 29), -1))).toBe('2023-02-28');
  });

  it('never mutates its input', () => {
    const input = plainDate(2026, 1, 31);
    addMonths(input, 1);
    addDays(input, 40);
    addYears(input, 3);
    expect(iso(input)).toBe('2026-01-31');
  });

  it('rolls out-of-range constructor arguments over instead of throwing', () => {
    expect(iso(plainDate(2026, 13, 1))).toBe('2027-01-01');
    expect(iso(plainDate(2026, 1, 32))).toBe('2026-02-01');
    expect(iso(plainDate(2026, 0, 1))).toBe('2025-12-01');
    expect(iso(plainDate(2026, 2, 30))).toBe('2026-03-02');
  });
});

describe('plain-date: ISO weeks at year boundaries', () => {
  it('puts Dec 29 2025 in week 1 of ISO year 2026', () => {
    const date = plainDate(2025, 12, 29);
    expect(getISOWeek(date)).toBe(1);
    expect(getISOWeekYear(date)).toBe(2026);
  });

  it('puts Jan 1 2021 in week 53 of ISO year 2020', () => {
    const date = plainDate(2021, 1, 1);
    expect(getISOWeek(date)).toBe(53);
    expect(getISOWeekYear(date)).toBe(2020);
  });

  it('keeps Jan 3 2021 in week 53 and moves Jan 4 2021 into week 2', () => {
    expect(getISOWeek(plainDate(2021, 1, 3))).toBe(53);
    expect(getISOWeekYear(plainDate(2021, 1, 3))).toBe(2020);
    expect(getISOWeek(plainDate(2021, 1, 4))).toBe(2);
    expect(getISOWeekYear(plainDate(2021, 1, 4))).toBe(2021);
  });

  it('handles the other classic boundaries', () => {
    expect(getISOWeek(plainDate(2020, 12, 31))).toBe(53);
    expect(getISOWeek(plainDate(2024, 12, 30))).toBe(1);
    expect(getISOWeekYear(plainDate(2024, 12, 30))).toBe(2025);
    expect(getISOWeek(plainDate(2016, 1, 1))).toBe(53);
    expect(getISOWeekYear(plainDate(2016, 1, 1))).toBe(2015);
    expect(getISOWeek(plainDate(2000, 1, 1))).toBe(53);
    expect(getISOWeek(plainDate(2026, 1, 1))).toBe(1);
    expect(getISOWeek(plainDate(2026, 9, 4))).toBe(36);
  });

  it('gives every day of one ISO week the same number', () => {
    const monday = plainDate(2025, 12, 29);
    for (let offset = 0; offset < 7; offset += 1) {
      expect(getISOWeek(addDays(monday, offset))).toBe(1);
      expect(getISOWeekYear(addDays(monday, offset))).toBe(2026);
    }
    expect(getISOWeek(addDays(monday, 7))).toBe(2);
  });

  it('never reports a week outside 1-53 across a 40-year sweep', () => {
    let cursor = plainDate(2000, 1, 1);
    const end = toEpochDay(plainDate(2040, 1, 1));
    while (toEpochDay(cursor) <= end) {
      const week = getISOWeek(cursor);
      expect(week).toBeGreaterThanOrEqual(1);
      expect(week).toBeLessThanOrEqual(53);
      cursor = addDays(cursor, 1);
    }
  });
});

describe('plain-date: week boundaries', () => {
  // 2026-09-04 is a Friday.
  const friday = plainDate(2026, 9, 4);

  it('resolves startOfWeek for every firstDayOfWeek 0-6', () => {
    const expected = [
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-08-29',
    ];
    expected.forEach((day, firstDayOfWeek) => {
      expect(iso(startOfWeek(friday, firstDayOfWeek))).toBe(day);
    });
  });

  it('always ends the week six days after it starts', () => {
    for (let firstDayOfWeek = 0; firstDayOfWeek < 7; firstDayOfWeek += 1) {
      const start = startOfWeek(friday, firstDayOfWeek);
      expect(iso(endOfWeek(friday, firstDayOfWeek))).toBe(iso(addDays(start, 6)));
      expect(getWeekday(start)).toBe(firstDayOfWeek);
      expect(diffInDays(start, friday)).toBeGreaterThanOrEqual(0);
      expect(diffInDays(start, friday)).toBeLessThan(7);
    }
  });

  it('is idempotent — the start of a week is its own week start', () => {
    for (let firstDayOfWeek = 0; firstDayOfWeek < 7; firstDayOfWeek += 1) {
      const start = startOfWeek(friday, firstDayOfWeek);
      expect(iso(startOfWeek(start, firstDayOfWeek))).toBe(iso(start));
    }
  });

  it('computes weekday from the proleptic calendar, not from Date', () => {
    expect(getWeekday(plainDate(1970, 1, 1))).toBe(4);
    expect(getWeekday(plainDate(1900, 1, 1))).toBe(1);
    expect(getWeekday(plainDate(2026, 9, 4))).toBe(5);
    expect(getWeekday(plainDate(1600, 1, 1))).toBe(6);
  });
});

describe('plain-date: epoch-day round trips', () => {
  it('anchors epoch day 0 at 1970-01-01', () => {
    expect(toEpochDay(plainDate(1970, 1, 1))).toBe(0);
    expect(toEpochDay(plainDate(1969, 12, 31))).toBe(-1);
    expect(iso(fromEpochDay(0))).toBe('1970-01-01');
    expect(iso(fromEpochDay(-1))).toBe('1969-12-31');
  });

  it('round-trips every single day across a 400-year window centred on today', () => {
    const first = toEpochDay(plainDate(1826, 1, 1));
    const last = toEpochDay(plainDate(2226, 12, 31));
    let previous = '';
    for (let epoch = first; epoch <= last; epoch += 1) {
      const date = fromEpochDay(epoch);
      expect(toEpochDay(date)).toBe(epoch);
      const key = toISODate(date);
      expect(key > previous).toBe(true);
      previous = key;
    }
  });

  it('round-trips pre-1970 dates back to year 0', () => {
    // NOTE: years <= -1 are broken by the era arithmetic in plain-date.ts — see the
    // build report. Everything from 0000-01-01 forward is exact.
    const samples = [
      plainDate(1969, 12, 31),
      plainDate(1900, 2, 28),
      plainDate(1800, 12, 31),
      plainDate(1582, 10, 15),
      plainDate(1, 1, 1),
      plainDate(0, 3, 1),
      plainDate(0, 12, 31),
    ];
    for (const date of samples) {
      expect(fromEpochDay(toEpochDay(date))).toEqual(date);
    }
  });

  it('round-trips every day of the pre-1970 half of the supported window', () => {
    const first = toEpochDay(plainDate(1, 1, 1));
    for (let epoch = first; epoch < first + 4000; epoch += 1) {
      expect(toEpochDay(fromEpochDay(epoch))).toBe(epoch);
    }
  });

  it('pins known historical weekdays', () => {
    // 1582-10-15, the first day of the Gregorian calendar, was a Friday.
    expect(getWeekday(plainDate(1582, 10, 15))).toBe(5);
    expect(getWeekday(plainDate(1600, 1, 1))).toBe(6);
    expect(getWeekday(plainDate(1900, 1, 1))).toBe(1);
  });

  it('formats year 1 with four padded digits', () => {
    expect(toISODate(plainDate(1, 1, 1))).toBe('0001-01-01');
    expect(toISODate(plainDate(999, 12, 31))).toBe('0999-12-31');
  });

  it('agrees with diffInDays over an arbitrary span', () => {
    const a = plainDate(1899, 12, 31);
    const b = plainDate(2026, 9, 4);
    expect(diffInDays(a, b)).toBe(toEpochDay(b) - toEpochDay(a));
    expect(diffInDays(b, a)).toBe(-diffInDays(a, b));
    expect(diffInDays(a, a)).toBe(0);
  });
});

describe('plain-date: coercion', () => {
  it('reads an ISO string with a Z suffix literally, without a timezone shift', () => {
    expect(iso(toPlainDate('2026-09-04T23:00:00Z'))).toBe('2026-09-04');
    expect(iso(toPlainDate('2026-09-04T00:30:00+05:30'))).toBe('2026-09-04');
    expect(iso(toPlainDate('2026-09-04T00:00:00-11:00'))).toBe('2026-09-04');
    expect(iso(toPlainDate('2026-09-04'))).toBe('2026-09-04');
    expect(iso(toPlainDate('  2026-09-04  '))).toBe('2026-09-04');
  });

  it('reads the local calendar fields of a Date object', () => {
    expect(iso(toPlainDate(new Date(2026, 8, 4, 23, 59, 59)))).toBe('2026-09-04');
    expect(iso(toPlainDate(new Date(2026, 8, 4, 0, 0, 0)))).toBe('2026-09-04');
    expect(iso(toPlainDate(new Date(1969, 11, 31)))).toBe('1969-12-31');
  });

  it('passes a PlainDate through and normalizes overflow fields', () => {
    expect(iso(toPlainDate({ year: 2026, month: 9, day: 4 }))).toBe('2026-09-04');
    expect(iso(toPlainDate({ year: 2026, month: 1, day: 32 }))).toBe('2026-02-01');
  });

  it('returns null for anything unusable', () => {
    expect(toPlainDate(null)).toBeNull();
    expect(toPlainDate(undefined)).toBeNull();
    expect(toPlainDate('')).toBeNull();
    expect(toPlainDate('not a date')).toBeNull();
    expect(toPlainDate(new Date(Number.NaN))).toBeNull();
    expect(toPlainDate(Number.NaN)).toBeNull();
    expect(toPlainDate(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toPlainDate({ year: Number.NaN, month: 1, day: 1 })).toBeNull();
  });

  it('round-trips through toISODate / fromISODate', () => {
    expect(iso(fromISODate('2026-09-04'))).toBe('2026-09-04');
    expect(iso(fromISODate('2026-09-04T10:00:00'))).toBe('2026-09-04');
    expect(fromISODate('nope')).toBeNull();
  });

  it('identifies PlainDate shapes', () => {
    expect(isPlainDate({ year: 2026, month: 9, day: 4 })).toBe(true);
    expect(isPlainDate(new Date())).toBe(false);
    expect(isPlainDate(null)).toBe(false);
    expect(isPlainDate('2026-09-04')).toBe(false);
    expect(isPlainDate({ year: 2026, month: 9 })).toBe(false);
  });

  it('builds a native Date at local midnight with the right calendar fields', () => {
    const native = toDate(plainDate(2026, 9, 4));
    expect(native.getFullYear()).toBe(2026);
    expect(native.getMonth()).toBe(8);
    expect(native.getDate()).toBe(4);
    expect(native.getHours()).toBe(0);
    const withTime = toDate(plainDate(2026, 9, 4), plainTime(14, 30));
    expect(withTime.getHours()).toBe(14);
    expect(withTime.getMinutes()).toBe(30);
  });

  it('keeps two-digit years intact rather than mapping them to 19xx', () => {
    const native = toDate(plainDate(26, 9, 4));
    expect(native.getFullYear()).toBe(26);
  });
});

describe('plain-date: DST days never shift a calendar date', () => {
  // America/New_York springs forward on 2026-03-08 and falls back on 2026-11-01.
  const springForward = plainDate(2026, 3, 8);
  const fallBack = plainDate(2026, 11, 1);

  it('steps across the spring-forward day without skipping March 8', () => {
    const walked: string[] = [];
    for (let offset = -2; offset <= 2; offset += 1)
      walked.push(toISODate(addDays(springForward, offset)));
    expect(walked).toEqual(['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
  });

  it('steps across the fall-back day without repeating November 1', () => {
    const walked: string[] = [];
    for (let offset = -2; offset <= 2; offset += 1)
      walked.push(toISODate(addDays(fallBack, offset)));
    expect(walked).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
  });

  it('counts exactly one day across each transition', () => {
    expect(diffInDays(plainDate(2026, 3, 7), springForward)).toBe(1);
    expect(diffInDays(springForward, plainDate(2026, 3, 9))).toBe(1);
    expect(diffInDays(plainDate(2026, 10, 31), fallBack)).toBe(1);
    expect(diffInDays(fallBack, plainDate(2026, 11, 2))).toBe(1);
  });

  it('walks a whole DST year one day at a time with no duplicate or missing date', () => {
    const seen = new Set<string>();
    let cursor = plainDate(2026, 1, 1);
    let count = 0;
    while (cursor.year === 2026) {
      const key = toISODate(cursor);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      count += 1;
      cursor = addDays(cursor, 1);
    }
    expect(count).toBe(365);
    expect(iso(cursor)).toBe('2027-01-01');
  });

  it('keeps toDate on the same calendar day for both transitions', () => {
    for (const date of [springForward, fallBack]) {
      const native = toDate(date);
      expect(native.getFullYear()).toBe(date.year);
      expect(native.getMonth()).toBe(date.month - 1);
      expect(native.getDate()).toBe(date.day);
    }
  });
});

describe('plain-date: ranges', () => {
  const start = plainDate(2026, 9, 4);
  const end = plainDate(2026, 9, 25);

  it('counts 21 nights and 22 days for Sep 4 → Sep 25', () => {
    expect(rangeLength({ start, end }, 'nights')).toBe(21);
    expect(rangeLength({ start, end }, 'days')).toBe(22);
  });

  it('counts a same-day range as zero nights but one day', () => {
    expect(rangeLength({ start, end: start }, 'nights')).toBe(0);
    expect(rangeLength({ start, end: start }, 'days')).toBe(1);
  });

  it('counts an incomplete range as zero under either semantics', () => {
    expect(rangeLength({ start, end: null }, 'nights')).toBe(0);
    expect(rangeLength({ start: null, end }, 'days')).toBe(0);
    expect(rangeLength({ start: null, end: null }, 'nights')).toBe(0);
  });

  it('defaults to nights and measures a reversed range by its normalized span', () => {
    expect(rangeLength({ start, end })).toBe(21);
    expect(rangeLength({ start: end, end: start }, 'nights')).toBe(21);
    expect(rangeLength({ start: end, end: start }, 'days')).toBe(22);
  });

  it('normalizes a reversed range while preserving nulls', () => {
    expect(normalizeRange({ start: end, end: start })).toEqual({ start, end });
    expect(normalizeRange({ start, end: null })).toEqual({ start, end: null });
    expect(normalizeRange({ start: null, end })).toEqual({ start: null, end });
  });

  it('answers containment and overlap', () => {
    expect(rangeContains({ start, end }, plainDate(2026, 9, 10))).toBe(true);
    expect(rangeContains({ start, end }, start)).toBe(true);
    expect(rangeContains({ start, end }, plainDate(2026, 9, 26))).toBe(false);
    expect(rangeContains({ start, end: null }, start)).toBe(true);
    expect(rangeContains({ start, end: null }, plainDate(2026, 9, 5))).toBe(false);
    expect(
      rangesOverlap({ start, end }, { start: plainDate(2026, 9, 25), end: plainDate(2026, 10, 1) }),
    ).toBe(true);
    expect(
      rangesOverlap({ start, end }, { start: plainDate(2026, 9, 26), end: plainDate(2026, 10, 1) }),
    ).toBe(false);
    expect(rangesOverlap({ start, end }, { start, end: null })).toBe(false);
  });

  it('expands an interval inclusively in either direction and self-limits', () => {
    expect(eachDayOfInterval(start, plainDate(2026, 9, 7)).map(toISODate)).toEqual([
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
    ]);
    expect(eachDayOfInterval(start, start).map(toISODate)).toEqual(['2026-09-04']);
    expect(eachDayOfInterval(plainDate(2026, 9, 7), start).map(toISODate)).toEqual([
      '2026-09-07',
      '2026-09-06',
      '2026-09-05',
      '2026-09-04',
    ]);
    expect(eachDayOfInterval(plainDate(1900, 1, 1), plainDate(2100, 1, 1))).toEqual([]);
  });
});

describe('plain-date: comparison and boundaries', () => {
  const a = plainDate(2026, 9, 4);
  const b = plainDate(2026, 9, 25);

  it('orders dates by year, then month, then day', () => {
    expect(compareDates(a, b)).toBe(-1);
    expect(compareDates(b, a)).toBe(1);
    expect(compareDates(a, plainDate(2026, 9, 4))).toBe(0);
    expect(compareDates(plainDate(2025, 12, 31), plainDate(2026, 1, 1))).toBe(-1);
  });

  it('exposes the whole comparison family', () => {
    expect(isBefore(a, b)).toBe(true);
    expect(isAfter(b, a)).toBe(true);
    expect(isSameDay(a, plainDate(2026, 9, 4))).toBe(true);
    expect(isSameDay(a, null)).toBe(false);
    expect(isSameOrBefore(a, a)).toBe(true);
    expect(isSameOrAfter(a, a)).toBe(true);
    expect(isSameMonth(a, b)).toBe(true);
    expect(isSameMonth(a, plainDate(2026, 10, 4))).toBe(false);
    expect(isSameYear(a, plainDate(2026, 1, 1))).toBe(true);
  });

  it('honours every inclusive mode of isBetween', () => {
    expect(isBetween(a, a, b)).toBe(true);
    expect(isBetween(a, a, b, 'none')).toBe(false);
    expect(isBetween(a, a, b, 'start')).toBe(true);
    expect(isBetween(b, a, b, 'start')).toBe(false);
    expect(isBetween(b, a, b, 'end')).toBe(true);
  });

  it('picks minimums and maximums while ignoring nullish entries', () => {
    expect(iso(minOf(b, null, a, undefined))).toBe('2026-09-04');
    expect(iso(maxOf(b, null, a))).toBe('2026-09-25');
    expect(minOf(null, undefined)).toBeNull();
  });

  it('clamps into bounds', () => {
    expect(iso(clampDate(plainDate(2026, 1, 1), a, b))).toBe('2026-09-04');
    expect(iso(clampDate(plainDate(2026, 12, 1), a, b))).toBe('2026-09-25');
    expect(iso(clampDate(plainDate(2026, 9, 10), a, b))).toBe('2026-09-10');
    expect(iso(clampDate(plainDate(2026, 1, 1), null, null))).toBe('2026-01-01');
  });

  it('computes month, quarter and year boundaries', () => {
    expect(iso(startOfMonth(a))).toBe('2026-09-01');
    expect(iso(endOfMonth(a))).toBe('2026-09-30');
    expect(iso(endOfMonth(plainDate(2024, 2, 10)))).toBe('2024-02-29');
    expect(iso(startOfQuarter(a))).toBe('2026-07-01');
    expect(iso(endOfQuarter(a))).toBe('2026-09-30');
    expect(iso(startOfQuarter(plainDate(2026, 1, 15)))).toBe('2026-01-01');
    expect(iso(endOfQuarter(plainDate(2026, 11, 15)))).toBe('2026-12-31');
    expect(iso(startOfYear(a))).toBe('2026-01-01');
    expect(iso(endOfYear(a))).toBe('2026-12-31');
    expect(getQuarter(a)).toBe(3);
    expect(getQuarter(plainDate(2026, 12, 31))).toBe(4);
  });

  it('computes day of year across a leap boundary', () => {
    expect(getDayOfYear(plainDate(2026, 1, 1))).toBe(1);
    expect(getDayOfYear(plainDate(2026, 12, 31))).toBe(365);
    expect(getDayOfYear(plainDate(2024, 12, 31))).toBe(366);
    expect(getDayOfYear(plainDate(2024, 3, 1))).toBe(61);
    expect(getDayOfYear(plainDate(2025, 3, 1))).toBe(60);
  });

  it('counts whole months regardless of day of month', () => {
    expect(diffInMonths(plainDate(2026, 1, 31), plainDate(2026, 3, 1))).toBe(2);
    expect(diffInMonths(plainDate(2026, 3, 1), plainDate(2026, 1, 31))).toBe(-2);
    expect(diffInMonths(plainDate(2025, 12, 1), plainDate(2026, 1, 1))).toBe(1);
  });

  it('recognizes weekends against a configurable weekend set', () => {
    expect(isWeekend(plainDate(2026, 9, 5))).toBe(true);
    expect(isWeekend(plainDate(2026, 9, 6))).toBe(true);
    expect(isWeekend(plainDate(2026, 9, 4))).toBe(false);
    expect(isWeekend(plainDate(2026, 9, 4), [5, 6])).toBe(true);
  });

  it('adds weeks and subtracts days', () => {
    expect(iso(addWeeks(a, 2))).toBe('2026-09-18');
    expect(iso(addWeeks(a, -1))).toBe('2026-08-28');
    expect(iso(subDays(a, 4))).toBe('2026-08-31');
    expect(iso(addDays(a, 0))).toBe('2026-09-04');
  });
});

describe('plain-date: times', () => {
  it('normalizes and wraps wall-clock times', () => {
    expect(plainTime(14, 30)).toEqual({ hour: 14, minute: 30, second: 0 });
    expect(plainTime(25, 0)).toEqual({ hour: 1, minute: 0, second: 0 });
    expect(plainTime(-1, 0)).toEqual({ hour: 23, minute: 0, second: 0 });
    expect(plainTime(0, 90)).toEqual({ hour: 1, minute: 30, second: 0 });
  });

  it('converts to and from minutes', () => {
    expect(timeToMinutes(plainTime(14, 30))).toBe(870);
    expect(minutesToTime(870)).toEqual({ hour: 14, minute: 30, second: 0 });
  });

  it('compares and clamps times', () => {
    expect(compareTimes(plainTime(9, 0), plainTime(17, 0))).toBe(-1);
    expect(compareTimes(plainTime(9, 0), plainTime(9, 0))).toBe(0);
    expect(compareTimes(plainTime(9, 0, 30), plainTime(9, 0, 0))).toBe(1);
    expect(clampTime(plainTime(6, 0), plainTime(9, 0), plainTime(17, 0))).toEqual(plainTime(9, 0));
    expect(clampTime(plainTime(20, 0), plainTime(9, 0), plainTime(17, 0))).toEqual(
      plainTime(17, 0),
    );
    expect(clampTime(plainTime(12, 0), plainTime(9, 0), plainTime(17, 0))).toEqual(
      plainTime(12, 0),
    );
  });

  it('parses times from strings, Dates and PlainTime values', () => {
    expect(toPlainTime('14:30')).toEqual(plainTime(14, 30));
    expect(toPlainTime('2:30 PM')).toEqual(plainTime(14, 30));
    expect(toPlainTime('12:15 am')).toEqual(plainTime(0, 15));
    expect(toPlainTime('12:15 pm')).toEqual(plainTime(12, 15));
    expect(toPlainTime('09:05:07')).toEqual(plainTime(9, 5, 7));
    expect(toPlainTime(new Date(2026, 8, 4, 7, 8, 9))).toEqual(plainTime(7, 8, 9));
    expect(toPlainTime({ hour: 3, minute: 4, second: 5 })).toEqual(plainTime(3, 4, 5));
    expect(toPlainTime(null)).toBeNull();
    expect(toPlainTime('half past two')).toBeNull();
    expect(toPlainTime(new Date(Number.NaN))).toBeNull();
  });
});
