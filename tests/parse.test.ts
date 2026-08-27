import { describe, expect, it } from 'vitest';
import {
  formatForInput,
  localeDateOrder,
  localeDatePlaceholder,
  parseDateString,
  parseRangeString,
} from '../src/core/parse';
import { plainDate, toISODate } from '../src/core/plain-date';
import type { ParseOptions } from '../src/core/parse';
import type { PlainDate } from '../src/core/types';

/** 2026-09-04 is a Friday. */
const TODAY = plainDate(2026, 9, 4);

const options = (over: Partial<ParseOptions> = {}): ParseOptions => ({
  locale: 'en-US',
  today: TODAY,
  firstDayOfWeek: 0,
  ...over,
});

const parse = (text: string, over: Partial<ParseOptions> = {}): string | null => {
  const result = parseDateString(text, options(over));
  return result ? toISODate(result) : null;
};

const parseRange = (text: string, over: Partial<ParseOptions> = {}): string | null => {
  const result = parseRangeString(text, options(over));
  if (!result) return null;
  return `${result.start ? toISODate(result.start) : ''}..${result.end ? toISODate(result.end) : ''}`;
};

describe('parse: ISO input', () => {
  it('reads a plain ISO date literally', () => {
    expect(parse('2026-09-04')).toBe('2026-09-04');
    expect(parse('  2026-09-04  ')).toBe('2026-09-04');
    expect(parse('1999-12-31')).toBe('1999-12-31');
  });

  it('ignores the time and offset on an ISO datetime rather than shifting the day', () => {
    expect(parse('2026-09-04T23:59:59Z')).toBe('2026-09-04');
    expect(parse('2026-09-04T00:00:00+13:00')).toBe('2026-09-04');
    expect(parse('2026-09-04T00:00:00-11:00')).toBe('2026-09-04');
    expect(parse('2026-09-04 08:30')).toBe('2026-09-04');
  });

  it('reads ISO the same way in every locale', () => {
    for (const locale of ['en-US', 'en-GB', 'de-DE', 'ja-JP', 'ar-EG']) {
      expect(parse('2026-09-04', { locale })).toBe('2026-09-04');
    }
  });

  it('reads a compact 8-digit date as ISO', () => {
    expect(parse('20260904')).toBe('2026-09-04');
    expect(parse('20260904', { locale: 'en-GB' })).toBe('2026-09-04');
  });
});

describe('parse: locale part order', () => {
  it('reads "4/9/2026" as April 9 in en-US and September 4 elsewhere', () => {
    expect(parse('4/9/2026', { locale: 'en-US' })).toBe('2026-04-09');
    expect(parse('4/9/2026', { locale: 'en-GB' })).toBe('2026-09-04');
    expect(parse('4/9/2026', { locale: 'de-DE' })).toBe('2026-09-04');
    expect(parse('4/9/2026', { locale: 'fr-FR' })).toBe('2026-09-04');
  });

  it('reads the mirror-image "9/4/2026" the other way round', () => {
    expect(parse('9/4/2026', { locale: 'en-US' })).toBe('2026-09-04');
    expect(parse('9/4/2026', { locale: 'en-GB' })).toBe('2026-04-09');
  });

  it('accepts the locale separators', () => {
    expect(parse('04.09.2026', { locale: 'de-DE' })).toBe('2026-09-04');
    expect(parse('04-09-2026', { locale: 'en-GB' })).toBe('2026-09-04');
    expect(parse('09-04-2026', { locale: 'en-US' })).toBe('2026-09-04');
  });

  it('repairs an impossible month by swapping the day and month', () => {
    expect(parse('13/09/2026', { locale: 'en-US' })).toBe('2026-09-13');
    expect(parse('25/12/2026', { locale: 'en-US' })).toBe('2026-12-25');
  });

  it('reads a leading four-digit year as ISO regardless of locale', () => {
    expect(parse('2026/9/4', { locale: 'en-GB' })).toBe('2026-09-04');
    expect(parse('2026.9.4', { locale: 'de-DE' })).toBe('2026-09-04');
  });

  it('reports the locale part order and placeholder', () => {
    expect(localeDateOrder('en-US')).toEqual(['month', 'day', 'year']);
    expect(localeDateOrder('en-GB')).toEqual(['day', 'month', 'year']);
    expect(localeDateOrder('de-DE')).toEqual(['day', 'month', 'year']);
    expect(localeDatePlaceholder('en-US')).toBe('MM/DD/YYYY');
    expect(localeDatePlaceholder('en-GB')).toBe('DD/MM/YYYY');
    expect(localeDatePlaceholder('de-DE')).toBe('DD.MM.YYYY');
  });

  it('round-trips formatForInput back through the parser', () => {
    for (const locale of ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'ja-JP']) {
      const text = formatForInput(TODAY, locale);
      expect(parse(text, { locale })).toBe('2026-09-04');
    }
    expect(formatForInput(TODAY, 'en-US')).toBe('09/04/2026');
    expect(formatForInput(TODAY, 'de-DE')).toBe('04.09.2026');
  });
});

describe('parse: two-digit years', () => {
  it('maps 00-68 to the 2000s and 69-99 to the 1900s', () => {
    expect(parse('4/9/68', { locale: 'en-GB' })).toBe('2068-09-04');
    expect(parse('4/9/69', { locale: 'en-GB' })).toBe('1969-09-04');
    expect(parse('4/9/00', { locale: 'en-GB' })).toBe('2000-09-04');
    expect(parse('4/9/99', { locale: 'en-GB' })).toBe('1999-09-04');
    expect(parse('9/4/26', { locale: 'en-US' })).toBe('2026-09-04');
  });

  it('applies the same rule to a month-name form', () => {
    expect(parse('Sep 4 26')).toBe('2026-09-04');
    expect(parse('Sep 4 99')).toBe('1999-09-04');
  });
});

describe('parse: partial numeric input', () => {
  it('fills the year in from today', () => {
    expect(parse('9/4', { locale: 'en-US' })).toBe('2026-09-04');
    expect(parse('4/9', { locale: 'en-GB' })).toBe('2026-09-04');
  });

  it('rolls a long-past month forward into next year when preferring the future', () => {
    expect(parse('2/1', { locale: 'en-US', today: plainDate(2026, 12, 15) })).toBe('2027-02-01');
    expect(
      parse('2/1', { locale: 'en-US', today: plainDate(2026, 12, 15), preferFuture: false }),
    ).toBe('2026-02-01');
  });

  it('reads a bare day number as the next occurrence of that day', () => {
    expect(parse('25')).toBe('2026-09-25');
    expect(parse('1')).toBe('2026-10-01');
    expect(parse('1', { preferFuture: false })).toBe('2026-09-01');
  });

  it('reads a year-and-month pair as the first of that month', () => {
    expect(parse('2026/09', { locale: 'en-US' })).toBe('2026-09-01');
    expect(parse('09/2026', { locale: 'en-US' })).toBe('2026-09-01');
  });
});

describe('parse: month names', () => {
  it('reads the abbreviated and long English forms', () => {
    expect(parse('Sep 4')).toBe('2026-09-04');
    expect(parse('Sept 4')).toBe('2026-09-04');
    expect(parse('September 4, 2026')).toBe('2026-09-04');
    expect(parse('4 September 2026')).toBe('2026-09-04');
    expect(parse('4th September 2026')).toBe('2026-09-04');
    expect(parse('SEPTEMBER 4 2026')).toBe('2026-09-04');
  });

  it('reads the same day in either part order', () => {
    expect(parse('4 September 2026', { locale: 'en-US' })).toBe('2026-09-04');
    expect(parse('September 4 2026', { locale: 'en-GB' })).toBe('2026-09-04');
  });

  it('reads localized month names, diacritics and all', () => {
    expect(parse('4. September 2026', { locale: 'de-DE' })).toBe('2026-09-04');
    expect(parse('4 septembre 2026', { locale: 'fr-FR' })).toBe('2026-09-04');
    expect(parse('29 février 2024', { locale: 'fr-FR' })).toBe('2024-02-29');
    expect(parse('29 fevrier 2024', { locale: 'fr-FR' })).toBe('2024-02-29');
    expect(parse('4 de septiembre de 2026', { locale: 'es-ES' })).toBe('2026-09-04');
  });

  it('still reads English month names inside a non-English locale', () => {
    expect(parse('4 September 2026', { locale: 'de-DE' })).toBe('2026-09-04');
    expect(parse('Sep 4 2026', { locale: 'fr-FR' })).toBe('2026-09-04');
  });

  it('reads a month name with no day as the first of the month', () => {
    expect(parse('September 2026')).toBe('2026-09-01');
  });
});

describe('parse: natural language', () => {
  it('reads the day keywords', () => {
    expect(parse('today')).toBe('2026-09-04');
    expect(parse('Today')).toBe('2026-09-04');
    expect(parse('now')).toBe('2026-09-04');
    expect(parse('tomorrow')).toBe('2026-09-05');
    expect(parse('yesterday')).toBe('2026-09-03');
  });

  it('reads "in N units" and "N units ago"', () => {
    expect(parse('in 3 days')).toBe('2026-09-07');
    expect(parse('in 2 weeks')).toBe('2026-09-18');
    expect(parse('in 1 month')).toBe('2026-10-04');
    expect(parse('in a week')).toBe('2026-09-11');
    expect(parse('3 days ago')).toBe('2026-09-01');
    expect(parse('2 weeks ago')).toBe('2026-08-21');
    expect(parse('1 year ago')).toBe('2025-09-04');
  });

  it('reads compact signed offsets', () => {
    expect(parse('+2w')).toBe('2026-09-18');
    expect(parse('-1m')).toBe('2026-08-04');
    expect(parse('+10d')).toBe('2026-09-14');
    expect(parse('-1y')).toBe('2025-09-04');
    expect(parse('+ 3 d')).toBe('2026-09-07');
  });

  it('reads week-relative weekday phrases', () => {
    expect(parse('next friday')).toBe('2026-09-11');
    expect(parse('this friday')).toBe('2026-09-04');
    expect(parse('last friday')).toBe('2026-08-28');
    expect(parse('next monday')).toBe('2026-09-07');
    expect(parse('last monday')).toBe('2026-08-24');
  });

  it('reads a bare weekday as the nearest one ahead', () => {
    expect(parse('monday')).toBe('2026-09-07');
    expect(parse('friday')).toBe('2026-09-04');
    expect(parse('Tue')).toBe('2026-09-08');
    expect(parse('monday', { preferFuture: false })).toBe('2026-08-31');
  });

  it('reads unit phrases as the start of that unit', () => {
    expect(parse('this week')).toBe('2026-08-30');
    expect(parse('this week', { firstDayOfWeek: 1 })).toBe('2026-08-31');
    expect(parse('next week')).toBe('2026-09-06');
    expect(parse('last week')).toBe('2026-08-23');
    expect(parse('this month')).toBe('2026-09-01');
    expect(parse('next month')).toBe('2026-10-01');
    expect(parse('last month')).toBe('2026-08-01');
    expect(parse('next year')).toBe('2027-01-01');
  });

  it('tolerates trailing punctuation', () => {
    expect(parse('tomorrow.')).toBe('2026-09-05');
    expect(parse('next friday!')).toBe('2026-09-11');
  });
});

describe('parse: rejection', () => {
  it('rejects an impossible calendar date instead of rolling it over', () => {
    expect(parse('2026-02-31')).toBeNull();
    expect(parse('Feb 31 2026')).toBeNull();
    expect(parse('2/31/2026', { locale: 'en-US' })).toBeNull();
    expect(parse('2026-13-01')).toBeNull();
    expect(parse('2026-00-10')).toBeNull();
  });

  it('rejects Feb 29 of a common year but accepts it in a leap year', () => {
    expect(parse('2026-02-29')).toBeNull();
    expect(parse('Feb 29 2026')).toBeNull();
    expect(parse('2024-02-29')).toBe('2024-02-29');
    expect(parse('Feb 29 2024')).toBe('2024-02-29');
  });

  it('walks a bare Feb 29 to the next year that actually has one', () => {
    expect(parse('Feb 29', { today: plainDate(2026, 1, 1) })).toBe('2028-02-29');
  });

  it('rejects empty, whitespace-only and non-string input', () => {
    expect(parse('')).toBeNull();
    expect(parse('   ')).toBeNull();
    expect(parseDateString(null as unknown as string, options())).toBeNull();
    expect(parseDateString(42 as unknown as string, options())).toBeNull();
  });

  it('rejects prose and unknown words', () => {
    expect(parse('not a date')).toBeNull();
    expect(parse('sometime next century')).toBeNull();
    expect(parse('the quick brown fox jumps over the lazy dog')).toBeNull();
    expect(parse('???')).toBeNull();
  });

  it('rejects a numeric string with too many parts', () => {
    expect(parse('1/2/3/4')).toBeNull();
  });

  it('never falls back to the host Date parser', () => {
    // These parse fine under `new Date(...)` but are not a supported format here.
    expect(parse('Fri Sep 04 2026 00:00:00 GMT-0400')).toBeNull();
  });
});

describe('parse: ranges', () => {
  it('splits on every supported separator', () => {
    expect(parseRange('Sep 4 to Sep 25')).toBe('2026-09-04..2026-09-25');
    expect(parseRange('Sep 4 until Sep 25')).toBe('2026-09-04..2026-09-25');
    expect(parseRange('Sep 4 through Sep 25')).toBe('2026-09-04..2026-09-25');
    expect(parseRange('Sep 4 – Sep 25')).toBe('2026-09-04..2026-09-25');
    expect(parseRange('Sep 4 — Sep 25')).toBe('2026-09-04..2026-09-25');
    expect(parseRange('Sep 4 → Sep 25')).toBe('2026-09-04..2026-09-25');
    expect(parseRange('Sep 4 - Sep 25')).toBe('2026-09-04..2026-09-25');
    expect(parseRange('Sep 4 .. Sep 25')).toBe('2026-09-04..2026-09-25');
  });

  it('inherits the month from the first half', () => {
    expect(parseRange('Sep 4 – 25')).toBe('2026-09-04..2026-09-25');
    expect(parseRange('September 4 - 25')).toBe('2026-09-04..2026-09-25');
  });

  it('rolls into the next month when the inherited day would land before the start', () => {
    expect(parseRange('Sep 25 – 4')).toBe('2026-09-25..2026-10-04');
  });

  it('inherits the year and wraps it forward across December', () => {
    expect(parseRange('Dec 28 - Jan 3')).toBe('2026-12-28..2027-01-03');
    expect(parseRange('Sep 4 - Oct 2')).toBe('2026-09-04..2026-10-02');
  });

  it('normalizes a transposed pair inside one month', () => {
    expect(parseRange('Sep 25 – Sep 4')).toBe('2026-09-04..2026-09-25');
  });

  it('parses two fully qualified halves in locale order', () => {
    expect(parseRange('9/4/2026 to 10/2/2026', { locale: 'en-US' })).toBe('2026-09-04..2026-10-02');
    expect(parseRange('4/9/2026 to 2/10/2026', { locale: 'en-GB' })).toBe('2026-09-04..2026-10-02');
    expect(parseRange('04.09.2026 - 25.09.2026', { locale: 'de-DE' })).toBe(
      '2026-09-04..2026-09-25',
    );
  });

  it('measures an offset second half from the first half, not from today', () => {
    expect(parseRange('Sep 20 to +1w')).toBe('2026-09-20..2026-09-27');
    expect(parseRange('Sep 20 to +3d')).toBe('2026-09-20..2026-09-23');
    expect(parseRange('next friday - +3d')).toBe('2026-09-11..2026-09-14');
  });

  it('keeps a bare hyphen inside a numeric date rather than splitting on it', () => {
    expect(parseRange('9-4-2026', { locale: 'en-US' })).toBe('2026-09-04..');
    expect(parseRange('4-9-2026', { locale: 'en-GB' })).toBe('2026-09-04..');
    // The ISO fast path is reached because the datetime suffix defeats the hyphen split.
    expect(parseRange('2026-09-04T10:00:00Z')).toBe('2026-09-04..');
  });

  // Regression guard: a plain "YYYY-MM-DD" must not be split at its second hyphen into
  // "YYYY-MM" (the 1st of that month) and "DD", which would silently turn one typed ISO
  // date into the range Sep 1 – Sep 4.
  it('reads a plain ISO date as one date, never splitting it on its own hyphens', () => {
    expect(parseRange('2026-09-04')).toBe('2026-09-04..');
    expect(parseRange('1999-12-31')).toBe('1999-12-31..');
    expect(parseRange('2026-9-4')).toBe('2026-09-04..');
  });

  it('still splits on a bare hyphen when the whole string is not itself a date', () => {
    expect(parseRange('9/4-9/25', { locale: 'en-US' })).toBe('2026-09-04..2026-09-25');
  });

  it('returns a half-open range for a single date so half-typed input still works', () => {
    expect(parseRange('Sep 4')).toBe('2026-09-04..');
    expect(parseRange('today')).toBe('2026-09-04..');
  });

  it('rejects unparseable input on either side', () => {
    expect(parseRange('nonsense')).toBeNull();
    expect(parseRange('Sep 4 to nonsense')).toBeNull();
    expect(parseRange('nonsense to Sep 4')).toBeNull();
    expect(parseRange('')).toBeNull();
    expect(parseRangeString(null as unknown as string, options())).toBeNull();
  });

  it('treats an absolute second half as absolute, never inheriting', () => {
    expect(parseRange('Sep 4 - Mar 2 2027')).toBe('2026-09-04..2027-03-02');
  });
});

describe('parse: determinism', () => {
  it('derives every answer from options.today', () => {
    const past = { today: plainDate(2019, 2, 14) };
    expect(parse('today', past)).toBe('2019-02-14');
    expect(parse('in 3 days', past)).toBe('2019-02-17');
    expect(parse('next month', past)).toBe('2019-03-01');
    expect(parse('this week', past)).toBe('2019-02-10');
  });

  it('returns the same answer for repeated calls', () => {
    for (let i = 0; i < 3; i += 1) {
      expect(parse('next friday')).toBe('2026-09-11');
      expect(parseRange('Sep 4 – 25')).toBe('2026-09-04..2026-09-25');
    }
  });

  it('never returns a PlainDate with impossible fields', () => {
    const inputs = ['2026-09-04', 'Sep 4', 'today', 'in 3 days', '+2w', '9/4/2026', 'next friday'];
    for (const text of inputs) {
      const date = parseDateString(text, options()) as PlainDate;
      expect(date.month).toBeGreaterThanOrEqual(1);
      expect(date.month).toBeLessThanOrEqual(12);
      expect(date.day).toBeGreaterThanOrEqual(1);
      expect(date.day).toBeLessThanOrEqual(31);
    }
  });
});
