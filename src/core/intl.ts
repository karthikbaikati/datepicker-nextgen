/**
 * Locale services. Everything is derived from the platform `Intl` APIs, so the
 * library speaks every locale the runtime does without shipping a single byte
 * of locale data. All formatters are memoized — building an `Intl.DateTimeFormat`
 * is expensive and calendars format hundreds of cells per render.
 */
import { getISOWeek, plainDate, toDate } from './plain-date';
import type {
  Formatters,
  Labels,
  PlainDate,
  PlainTime,
  RangeSemantics,
  SelectionValue,
  WeekdayInfo,
} from './types';

/* ------------------------------- primitives ------------------------------- */

let cachedRuntimeLocale: string | undefined;

/** The runtime's locale, resolved once. */
export function runtimeLocale(): string {
  if (cachedRuntimeLocale) return cachedRuntimeLocale;
  try {
    cachedRuntimeLocale = new Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    cachedRuntimeLocale = 'en-US';
  }
  return cachedRuntimeLocale;
}

export function resolveLocale(locale: 'auto' | (string & {}) | undefined): string {
  return !locale || locale === 'auto' ? runtimeLocale() : locale;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let cached = formatterCache.get(key);
  if (!cached) {
    try {
      cached = new Intl.DateTimeFormat(locale, options);
    } catch {
      cached = new Intl.DateTimeFormat('en-US', options);
    }
    formatterCache.set(key, cached);
  }
  return cached;
}

/** Format a {@link PlainDate} without any timezone round-trip. */
export function formatDate(
  date: PlainDate,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return formatter(locale, options).format(toDate(date));
}

/* ------------------------------ week metadata ----------------------------- */

const FALLBACK_FIRST_DAY: Record<string, number> = {
  US: 0,
  CA: 0,
  JP: 0,
  IL: 0,
  KR: 0,
  TW: 0,
  MX: 0,
  BR: 0,
  PH: 0,
  ZA: 0,
  CO: 0,
  PE: 0,
  VE: 0,
  AE: 6,
  EG: 6,
  SA: 6,
  QA: 6,
  KW: 6,
  BH: 6,
  JO: 6,
  IQ: 6,
  LY: 6,
  DZ: 6,
  SD: 6,
};

const weekInfoCache = new Map<string, { firstDay: number; weekend: number[] }>();

function weekInfo(locale: string): { firstDay: number; weekend: number[] } {
  const cached = weekInfoCache.get(locale);
  if (cached) return cached;
  let firstDay = 1;
  let weekend = [0, 6];
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      weekInfo?: { firstDay: number; weekend: number[] };
      getWeekInfo?: () => { firstDay: number; weekend: number[] };
    };
    const info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo;
    if (info) {
      // Intl reports 1 = Monday … 7 = Sunday; we use 0 = Sunday … 6 = Saturday.
      firstDay = info.firstDay % 7;
      weekend = (info.weekend ?? [6, 7]).map((d) => d % 7);
    } else {
      const region = loc.region ?? locale.split('-')[1]?.toUpperCase();
      firstDay = (region ? FALLBACK_FIRST_DAY[region] : undefined) ?? 1;
      weekend = firstDay === 6 ? [5, 6] : [0, 6];
    }
  } catch {
    /* keep defaults */
  }
  const value = { firstDay, weekend };
  weekInfoCache.set(locale, value);
  return value;
}

/** 0 = Sunday … 6 = Saturday, per the locale's regional convention. */
export function localeFirstDayOfWeek(locale: string): number {
  return weekInfo(locale).firstDay;
}

/** The locale's weekend days as 0-6 values. */
export function localeWeekendDays(locale: string): number[] {
  return weekInfo(locale).weekend;
}

export function isRTL(locale: string): boolean {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      textInfo?: { direction: string };
      getTextInfo?: () => { direction: string };
    };
    const info = typeof loc.getTextInfo === 'function' ? loc.getTextInfo() : loc.textInfo;
    if (info) return info.direction === 'rtl';
    return /^(ar|he|fa|ur|ps|sd|ug|yi|dv|ckb)\b/i.test(loc.language ?? locale);
  } catch {
    return /^(ar|he|fa|ur|ps|sd|ug|yi|dv|ckb)\b/i.test(locale);
  }
}

/** Does the locale prefer a 12-hour clock? */
export function localeUses12Hour(locale: string): boolean {
  try {
    const resolved = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions();
    const cycle = (resolved as Intl.ResolvedDateTimeFormatOptions & { hourCycle?: string })
      .hourCycle;
    if (cycle) return cycle === 'h11' || cycle === 'h12';
    return resolved.hour12 ?? true;
  } catch {
    return true;
  }
}

/** A reference week starting on `firstDayOfWeek`, used to build weekday headers. */
export function weekdayInfos(
  locale: string,
  firstDayOfWeek: number,
  weekendDays: readonly number[],
): WeekdayInfo[] {
  // 2024-01-07 was a Sunday — a stable anchor for generating weekday names.
  const anchor = plainDate(2024, 1, 7);
  const out: WeekdayInfo[] = [];
  for (let i = 0; i < 7; i += 1) {
    const weekday = (firstDayOfWeek + i) % 7;
    const date = { ...anchor, day: anchor.day + weekday };
    out.push({
      weekday,
      short: formatDate(date, locale, { weekday: 'narrow' }),
      abbreviated: formatDate(date, locale, { weekday: 'short' }),
      long: formatDate(date, locale, { weekday: 'long' }),
      isWeekend: weekendDays.includes(weekday),
    });
  }
  return out;
}

/* ------------------------------- formatters ------------------------------- */

/** The default {@link Formatters}. Override any single member via `formatters`. */
export const defaultFormatters: Formatters = {
  monthYear: (date, locale) => formatDate(date, locale, { month: 'long', year: 'numeric' }),
  month: (date, locale) => formatDate(date, locale, { month: 'long' }),
  year: (date, locale) => formatDate(date, locale, { year: 'numeric' }),
  day: (date, locale) => formatter(locale, { day: 'numeric' }).format(toDate(date)),
  fieldDate: (date, locale) => formatDate(date, locale, { month: 'short', day: 'numeric' }),
  ariaDay: (date, locale) =>
    formatDate(date, locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  duration: (count, semantics, locale) => {
    const unit = semantics === 'nights' ? 'night' : 'day';
    try {
      const plural = new Intl.PluralRules(locale).select(count);
      const label = plural === 'one' ? unit : `${unit}s`;
      return `${new Intl.NumberFormat(locale).format(count)} ${label}`;
    } catch {
      return `${count} ${unit}${count === 1 ? '' : 's'}`;
    }
  },
  summary: (value, locale, semantics) => {
    const { range, dates } = value;
    if (range.start && range.end) {
      const sameYear = range.start.year === range.end.year;
      const start = formatDate(range.start, locale, {
        month: 'short',
        day: 'numeric',
        ...(sameYear ? {} : { year: 'numeric' }),
      });
      const end = formatDate(range.end, locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const length = defaultFormatters.duration(
        Math.max(0, dayDiff(range.start, range.end, semantics)),
        semantics,
        locale,
      );
      return `${start} – ${end} · ${length}`;
    }
    if (range.start)
      return formatDate(range.start, locale, { month: 'short', day: 'numeric', year: 'numeric' });
    if (dates.length === 1 && dates[0]) {
      return formatDate(dates[0], locale, { month: 'short', day: 'numeric', year: 'numeric' });
    }
    if (dates.length > 1) {
      const parts = dates.map((d) => formatDate(d, locale, { month: 'short', day: 'numeric' }));
      try {
        return new Intl.ListFormat(locale, { style: 'short', type: 'conjunction' }).format(parts);
      } catch {
        return parts.join(', ');
      }
    }
    return '';
  },
  weekday: (weekday, locale, width) => {
    const anchor = plainDate(2024, 1, 7 + weekday);
    const option: Intl.DateTimeFormatOptions['weekday'] =
      width === 'short' ? 'narrow' : width === 'abbreviated' ? 'short' : 'long';
    return formatDate(anchor, locale, { weekday: option });
  },
  weekNumber: (isoWeek) => String(isoWeek),
  time: (time, locale, use12Hours) =>
    formatter(locale, { hour: 'numeric', minute: '2-digit', hour12: use12Hours }).format(
      toDate(plainDate(2024, 1, 1), time),
    ),
};

function dayDiff(start: PlainDate, end: PlainDate, semantics: RangeSemantics): number {
  const ms = toDate(end).getTime() - toDate(start).getTime();
  const days = Math.round(ms / 86_400_000);
  return semantics === 'nights' ? days : days + 1;
}

export function resolveFormatters(overrides?: Partial<Formatters>): Formatters {
  return overrides ? { ...defaultFormatters, ...overrides } : defaultFormatters;
}

/* --------------------------------- labels --------------------------------- */

/** Default English strings. Pass `labels` to translate or reword any of them. */
export const defaultLabels: Labels = {
  title: 'Select dates',
  startLabel: 'Check-in',
  endLabel: 'Check-out',
  singleLabel: 'Date',
  multipleLabel: 'Dates',
  clear: 'Clear',
  apply: 'Apply',
  cancel: 'Cancel',
  today: 'Today',
  nextMonth: 'Next month',
  previousMonth: 'Previous month',
  nextYear: 'Next year',
  previousYear: 'Previous year',
  chooseStart: 'Add date',
  chooseEnd: 'Add date',
  selectDate: 'Select date',
  weekNumberHeader: 'Wk',
  monthSelectLabel: 'Month',
  yearSelectLabel: 'Year',
  presetsLabel: 'Quick options',
  emptyValue: 'Add date',
  announceSelected: (summary) => `Selected ${summary}`,
  announceCleared: 'Selection cleared',
  announceMonth: (label) => `Showing ${label}`,
  minNightsError: (n) => `Minimum stay is ${n} night${n === 1 ? '' : 's'}`,
  maxNightsError: (n) => `Maximum stay is ${n} night${n === 1 ? '' : 's'}`,
  unavailableDate: 'Not available',
};

export function resolveLabels(overrides?: Partial<Labels>): Labels {
  return overrides ? { ...defaultLabels, ...overrides } : defaultLabels;
}

/** Convenience re-export so consumers can build week labels without importing plain-date. */
export const isoWeekOf = getISOWeek;

/** Used by tests and by consumers that swap locales at runtime. */
export function clearIntlCaches(): void {
  formatterCache.clear();
  weekInfoCache.clear();
  cachedRuntimeLocale = undefined;
}

export type { PlainTime, SelectionValue };
