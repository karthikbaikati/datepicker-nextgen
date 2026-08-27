/**
 * Free-text date parsing for typed input.
 *
 * The parser is deliberately layered — ISO first (unambiguous), then natural
 * language, then locale-ordered numbers, then month names in the target locale
 * *and* in English (people type English month names everywhere). When every
 * layer fails we return `null`. We never fall back to `new Date(text)`: that
 * hands the string to an implementation-defined parser which applies a timezone
 * offset, which is precisely the class of bug this library exists to avoid.
 *
 * Everything here is pure and derives its "now" from `options.today`, so parsing
 * is deterministic and testable.
 */
import { formatDate, resolveLocale } from './intl';
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  daysInMonth,
  fromISODate,
  getWeekday,
  isBefore,
  normalizeRange,
  plainDate,
  startOfMonth,
  startOfWeek,
  startOfYear,
  toDate,
} from './plain-date';
import type { DateRange, PlainDate } from './types';

export interface ParseOptions {
  locale: string;
  today: PlainDate;
  firstDayOfWeek: number;
  /** Resolve ambiguous input (bare weekday, missing year) forwards. Default `true`. */
  preferFuture?: boolean;
}

/** Normalized options, resolved once per public call. */
interface Ctx {
  readonly locale: string;
  readonly today: PlainDate;
  readonly firstDayOfWeek: number;
  readonly preferFuture: boolean;
}

/** A partially specified date. `null` fields are inherited from context. */
interface DateParts {
  readonly year: number | null;
  readonly month: number | null;
  readonly day: number | null;
}

/** One field of a numeric date layout, in the order the locale writes it. */
export type DatePart = 'day' | 'month' | 'year';

type Unit = 'd' | 'w' | 'm' | 'y';

function context(options: ParseOptions): Ctx {
  const raw = Number.isFinite(options.firstDayOfWeek) ? Math.trunc(options.firstDayOfWeek) : 0;
  return {
    locale: resolveLocale(options.locale),
    today: options.today,
    firstDayOfWeek: ((raw % 7) + 7) % 7,
    preferFuture: options.preferFuture !== false,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Text preparation                              */
/* -------------------------------------------------------------------------- */

const BIDI_MARKS = /[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g;
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Zero code points of numbering systems users plausibly type into a date field. */
const DIGIT_ZEROS = [
  0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0e50,
  0x0ed0, 0x0f20, 0x1040, 0x17e0, 0xff10,
];

function normalizeDigits(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x0660) {
      out += ch;
      continue;
    }
    let mapped = ch;
    for (const zero of DIGIT_ZEROS) {
      if (code >= zero && code <= zero + 9) {
        mapped = String(code - zero);
        break;
      }
    }
    out += mapped;
  }
  return out;
}

/**
 * Canonicalize raw input before any pattern runs: ASCII digits, no bidi control
 * characters, CJK date markers turned into separators (`2026年9月4日` →
 * `2026 9 4`, while leaving name characters such as 日曜日 alone), single spaces.
 */
function preprocess(text: string): string {
  return normalizeDigits(text)
    .replace(BIDI_MARKS, '')
    .replace(/\uff0f/g, '/')
    .replace(/(\d)\s*[年月日년월일]/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lowercase and strip diacritics so `Février`, `fevrier` and `FÉVRIER` all match. */
function fold(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

/* -------------------------------------------------------------------------- */
/*                              Date construction                             */
/* -------------------------------------------------------------------------- */

/** Strict constructor: rejects impossible dates instead of rolling them over. */
function makeDate(year: number, month: number, day: number): PlainDate | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
  if (day > daysInMonth(year, month)) return null;
  return plainDate(year, month, day);
}

/**
 * Two-digit years follow the POSIX `%y` convention used by strftime, Excel and
 * every browser: `00`-`68` → 2000-2068, `69`-`99` → 1969-1999.
 */
function expandYear(value: number, digits: number): number {
  if (digits > 2) return value;
  return value <= 68 ? 2000 + value : 1900 + value;
}

function pad(value: number, length: number): string {
  return String(Math.abs(Math.trunc(value))).padStart(length, '0');
}

/* -------------------------------------------------------------------------- */
/*                             Locale part layout                             */
/* -------------------------------------------------------------------------- */

interface FormatPart {
  readonly type: DatePart | 'literal';
  readonly value: string;
}

/** Distinguishable day/month/year values for reading a locale's part order. */
const REFERENCE_DATE = toDate(plainDate(2026, 9, 4));

/** Regions that write month-first; only consulted when `Intl` is unavailable. */
const MONTH_FIRST_REGIONS = new Set(['US', 'PH', 'FM', 'MH', 'PW', 'AS', 'GU', 'MP', 'VI', 'UM']);

const partsCache = new Map<string, FormatPart[]>();

function fallbackOrder(locale: string): DatePart[] {
  const region = /[-_]([A-Za-z]{2})\b/.exec(locale)?.[1]?.toUpperCase();
  const monthFirst = region ? MONTH_FIRST_REGIONS.has(region) : /^en\b/i.test(locale);
  return monthFirst ? ['month', 'day', 'year'] : ['day', 'month', 'year'];
}

function fallbackParts(locale: string): FormatPart[] {
  const out: FormatPart[] = [];
  fallbackOrder(locale).forEach((type, index) => {
    if (index > 0) out.push({ type: 'literal', value: '/' });
    out.push({ type, value: '' });
  });
  return out;
}

/**
 * The locale's real numeric date layout, read from `formatToParts` so the
 * separators are the ones the locale actually uses (`.` in de, `. ` in hu, `/`
 * in en). Forced to the Gregorian calendar and Latin digits so the layout stays
 * usable for locales whose default calendar is not Gregorian.
 */
function localeFormatParts(locale: string): FormatPart[] {
  const cached = partsCache.get(locale);
  if (cached) return cached;
  let parts: FormatPart[] = [];
  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    for (const part of formatter.formatToParts(REFERENCE_DATE)) {
      if (part.type === 'day' || part.type === 'month' || part.type === 'year') {
        parts.push({ type: part.type, value: part.value });
      } else if (part.type === 'literal') {
        parts.push({ type: 'literal', value: part.value.replace(BIDI_MARKS, '') });
      }
    }
  } catch {
    parts = [];
  }
  const seen = new Set(parts.filter((p) => p.type !== 'literal').map((p) => p.type));
  if (seen.size !== 3) parts = fallbackParts(locale);
  partsCache.set(locale, parts);
  return parts;
}

/** Locale-aware date-part order, e.g. `['month', 'day', 'year']` — used by masked inputs. */
export function localeDateOrder(locale: string): DatePart[] {
  const order: DatePart[] = [];
  for (const part of localeFormatParts(resolveLocale(locale))) {
    if (part.type !== 'literal') order.push(part.type);
  }
  return order.length === 3 ? order : fallbackOrder(locale);
}

/**
 * `"MM/DD/YYYY"`-style hint text for the locale. The separators are the locale's
 * own, but the letters stay English `D`/`M`/`Y` — that is the convention users
 * (and every masked-input library) expect.
 */
export function localeDatePlaceholder(locale: string): string {
  return localeFormatParts(resolveLocale(locale))
    .map((part) =>
      part.type === 'literal'
        ? part.value
        : part.type === 'day'
          ? 'DD'
          : part.type === 'month'
            ? 'MM'
            : 'YYYY',
    )
    .join('')
    .trim();
}

/**
 * Render a date as text `parseDateString` reads back identically: the locale's
 * own layout, but always zero-padded ASCII so the round-trip cannot drift.
 */
export function formatForInput(date: PlainDate, locale: string): string {
  return localeFormatParts(resolveLocale(locale))
    .map((part) => {
      switch (part.type) {
        case 'day':
          return pad(date.day, 2);
        case 'month':
          return pad(date.month, 2);
        case 'year':
          return pad(date.year, 4);
        default:
          return part.value;
      }
    })
    .join('')
    .trim();
}

/* -------------------------------------------------------------------------- */
/*                               Localized names                              */
/* -------------------------------------------------------------------------- */

interface NameEntry {
  /** Lowercased, diacritics intact — an exact hit here beats any folded match. */
  readonly raw: string;
  /** Lowercased and diacritic-folded. */
  readonly text: string;
  readonly value: number;
}

/** How strongly a token matched a name; used to break weekday/month ties. */
interface NameHit {
  readonly value: number;
  readonly exact: boolean;
}

/** Marks are kept: stripping them would truncate Tamil `சனி` to `சன`. */
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu;

function trimPunctuation(text: string): string {
  return text.trim().replace(EDGE_PUNCTUATION, '');
}

const monthNameCache = new Map<string, NameEntry[]>();
const weekdayNameCache = new Map<string, NameEntry[]>();
const compactNameCache = new Map<string, Map<string, number>>();
const relativeCache = new Map<string, Map<string, { unit: Unit; offset: number }>>();
const connectorCache = new Map<string, Set<string>>();

/** The target locale plus English, because English names are typed everywhere. */
function localeChain(locale: string): string[] {
  return /^en\b/i.test(locale) ? [locale] : [locale, 'en'];
}

function safeFormat(date: PlainDate, locale: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return formatDate(date, locale, options);
  } catch {
    return '';
  }
}

function pushName(list: NameEntry[], name: string, value: number): void {
  const trimmed = trimPunctuation(name);
  if (!trimmed) return;
  const raw = trimmed.toLowerCase();
  const text = fold(trimmed);
  if (list.some((entry) => entry.raw === raw && entry.value === value)) return;
  list.push({ raw, text, value });
}

/**
 * Names are harvested in the Gregorian calendar even for locales that default
 * to another one — `fa-IR` would otherwise report Persian month names for
 * Gregorian dates, and this library only ever speaks Gregorian.
 */
function monthNames(locale: string): NameEntry[] {
  const cached = monthNameCache.get(locale);
  if (cached) return cached;
  const entries: NameEntry[] = [];
  for (const loc of localeChain(locale)) {
    for (let month = 1; month <= 12; month += 1) {
      const date = plainDate(2021, month, 1);
      pushName(entries, safeFormat(date, loc, { calendar: 'gregory', month: 'long' }), month);
      pushName(entries, safeFormat(date, loc, { calendar: 'gregory', month: 'short' }), month);
    }
  }
  monthNameCache.set(locale, entries);
  return entries;
}

function weekdayNames(locale: string): NameEntry[] {
  const cached = weekdayNameCache.get(locale);
  if (cached) return cached;
  const entries: NameEntry[] = [];
  // 2024-01-07 was a Sunday — the same anchor intl.ts uses for weekday headers.
  const sunday = plainDate(2024, 1, 7);
  for (const loc of localeChain(locale)) {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = addDays(sunday, weekday);
      pushName(entries, safeFormat(date, loc, { calendar: 'gregory', weekday: 'long' }), weekday);
      pushName(entries, safeFormat(date, loc, { calendar: 'gregory', weekday: 'short' }), weekday);
    }
  }
  weekdayNameCache.set(locale, entries);
  return entries;
}

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

/**
 * How well `token` matches `name`, or 0 for no match. The score is the length
 * of the agreement, so the *best*-matching name wins rather than the first
 * plausible one — that is what separates Lithuanian `rugsėjo` (September) from
 * `rugpjūtis` (August), and what makes Czech `července` tie between `červen`
 * and `červenec` and therefore fail safely instead of picking June.
 *
 * Guards: three characters minimum on both sides, so a two-letter abbreviation
 * like German `Mo.` only ever matches exactly — otherwise `morgen` is Monday;
 * single words only, so a whole phrase cannot match a name; and a token may
 * exceed the name by at most three characters, which still admits the inflected
 * forms `Intl` never reports (`сентября` for `сентябрь`).
 */
function looseScore(name: string, token: string): number {
  if (token.length < 3 || name.length < 3) return 0;
  if (token.length > name.length + 3) return 0;
  if (/\s/.test(token)) return 0;
  // Hebrew glues a preposition onto the month: בספטמבר is "in September".
  if (token.endsWith(name)) return name.length;
  const shared = commonPrefixLength(name, token);
  return shared >= 3 ? shared : 0;
}

/**
 * Exact beats folded beats loose, and a loose match only counts when one name
 * fits strictly better than every other. The diacritic-exact pass matters:
 * Slovak `št` (Thursday) folds to `st`, which is Wednesday.
 */
function matchName(entries: readonly NameEntry[], raw: string, folded: string): NameHit | null {
  if (!folded) return null;
  for (const entry of entries) if (entry.raw === raw) return { value: entry.value, exact: true };
  for (const entry of entries)
    if (entry.text === folded) return { value: entry.value, exact: true };
  let best = 0;
  let value: number | null = null;
  let ambiguous = false;
  for (const entry of entries) {
    const score = looseScore(entry.text, folded);
    if (score === 0 || score < best) continue;
    if (score > best) {
      best = score;
      value = entry.value;
      ambiguous = false;
    } else if (value !== entry.value) {
      ambiguous = true;
    }
  }
  return value === null || ambiguous ? null : { value, exact: false };
}

function monthMatch(token: string, locale: string): NameHit | null {
  const trimmed = trimPunctuation(token);
  return matchName(monthNames(locale), trimmed.toLowerCase(), fold(trimmed));
}

function weekdayMatch(token: string, locale: string): NameHit | null {
  const trimmed = trimPunctuation(token);
  return matchName(weekdayNames(locale), trimmed.toLowerCase(), fold(trimmed));
}

function monthFromToken(token: string, locale: string): number | null {
  return monthMatch(token, locale)?.value ?? null;
}

/** Folded, with every separator removed: `"ก.ย."` and `"ก ย"` both become `"กย"`. */
function compact(text: string): string {
  return fold(text).replace(/[^\p{L}\p{N}\p{M}]+/gu, '');
}

/**
 * Month names that are themselves several words — Thai `ก.ย.`, Vietnamese
 * `Tháng 9` — keyed by their separator-free form so a run of tokens can be
 * matched as one name. Single-word names stay out, so this can only ever
 * resolve input that plain tokenization could not.
 */
function multiPartMonthNames(locale: string): Map<string, number> {
  const cached = compactNameCache.get(locale);
  if (cached) return cached;
  const index = new Map<string, number>();
  for (const entry of monthNames(locale)) {
    if (!/[^\p{L}\p{N}\p{M}]/u.test(entry.raw)) continue;
    const key = compact(entry.raw);
    if (key && !index.has(key)) index.set(key, entry.value);
  }
  compactNameCache.set(locale, index);
  return index;
}

/**
 * Localized `today` / `tomorrow` / `next week` phrasings, harvested from
 * `Intl.RelativeTimeFormat`. Numeric fallbacks ("in 1 week") are dropped — the
 * `in N units` rule already covers those.
 */
function relativeKeywords(locale: string): Map<string, { unit: Unit; offset: number }> {
  const cached = relativeCache.get(locale);
  if (cached) return cached;
  const map = new Map<string, { unit: Unit; offset: number }>();
  const units: readonly (readonly [Intl.RelativeTimeFormatUnit, Unit])[] = [
    ['day', 'd'],
    ['week', 'w'],
    ['month', 'm'],
    ['year', 'y'],
  ];
  for (const loc of localeChain(locale)) {
    try {
      const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
      for (const [intlUnit, unit] of units) {
        for (const offset of [-1, 0, 1]) {
          const text = fold(rtf.format(offset, intlUnit)).trim();
          if (text && !/\d/.test(text) && !map.has(text)) map.set(text, { unit, offset });
        }
      }
    } catch {
      /* Intl.RelativeTimeFormat unavailable — the English keywords still work. */
    }
  }
  relativeCache.set(locale, map);
  return map;
}

/** Every format shape whose filler words a user might type or paste back. */
const CONNECTOR_SHAPES: readonly Intl.DateTimeFormatOptions[] = [
  { day: 'numeric', month: 'long', year: 'numeric' },
  { day: 'numeric', month: 'short', year: 'numeric' },
  { dateStyle: 'full' },
  { dateStyle: 'long' },
  { dateStyle: 'medium' },
];

function wordsOf(text: string): Set<string> {
  const words = new Set<string>();
  for (const token of text.split(NAME_SEPARATORS)) {
    if (!token || /\d/.test(token)) continue;
    const word = fold(trimPunctuation(token));
    if (word) words.add(word);
  }
  return words;
}

/**
 * Filler the locale itself puts inside a written date — `de` in Spanish
 * (`4 de septiembre de 2026`), `г.` in Bulgarian, the Thai era `ค.ศ.`, `of` in
 * English — which a parse must skip rather than choke on.
 *
 * Derived by rendering the same day in all twelve months and keeping the words
 * that recur in at least two thirds of them. That frequency test is what makes
 * this safe: a month name appears once and a weekday name at most three times,
 * so neither can ever be mistaken for filler — an unrecognized month name fails
 * the parse instead of silently vanishing and leaving a plausible-looking wrong
 * date behind. The threshold (rather than requiring all twelve) is for locales
 * that elide, like Catalan `de setembre` but `d'agost`.
 *
 * Words that are genuinely part of a name *and* invariant — Vietnamese
 * `tháng 9` — do land here, which is harmless: the number beside them still
 * sits where the locale's own part order expects it.
 */
function connectorWords(locale: string): Set<string> {
  const cached = connectorCache.get(locale);
  if (cached) return cached;
  const words = new Set(['of', 'the']);
  for (const loc of localeChain(locale)) {
    for (const shape of CONNECTOR_SHAPES) {
      const counts = new Map<string, number>();
      for (let month = 1; month <= 12; month += 1) {
        const rendered = wordsOf(
          safeFormat(plainDate(2026, month, 4), loc, { calendar: 'gregory', ...shape }),
        );
        for (const word of rendered) counts.set(word, (counts.get(word) ?? 0) + 1);
      }
      for (const [word, count] of counts) if (count >= 8) words.add(word);
    }
  }
  connectorCache.set(locale, words);
  return words;
}

/** Drops memoized locale data. Only needed by tests that swap locales. */
export function clearParseCaches(): void {
  partsCache.clear();
  monthNameCache.clear();
  weekdayNameCache.clear();
  compactNameCache.clear();
  relativeCache.clear();
  connectorCache.clear();
}

/* -------------------------------------------------------------------------- */
/*                              Natural language                              */
/* -------------------------------------------------------------------------- */

/** `d`/`day`/`days`, `w`/`wk`/`week`, … `mon` is excluded: it is Monday, not month. */
function unitOf(word: string): Unit | null {
  if (/^d(ays?)?$/.test(word)) return 'd';
  if (/^w(ks?|eeks?)?$/.test(word)) return 'w';
  if (/^m(os?|onths?)?$/.test(word)) return 'm';
  if (/^y(rs?|ears?)?$/.test(word)) return 'y';
  return null;
}

function amountOf(word: string | undefined): number {
  if (!word) return 0;
  return word === 'a' || word === 'an' ? 1 : Number(word);
}

function shift(date: PlainDate, unit: Unit, amount: number): PlainDate {
  switch (unit) {
    case 'd':
      return addDays(date, amount);
    case 'w':
      return addWeeks(date, amount);
    case 'm':
      return addMonths(date, amount);
    case 'y':
      return addYears(date, amount);
  }
}

function unitStart(date: PlainDate, unit: Unit, firstDayOfWeek: number): PlainDate {
  switch (unit) {
    case 'w':
      return startOfWeek(date, firstDayOfWeek);
    case 'm':
      return startOfMonth(date);
    case 'y':
      return startOfYear(date);
    default:
      return date;
  }
}

const COMPACT_OFFSET = /^([+-])\s*(\d{1,4})\s*(d|w|m|y)$/;
const IN_N_UNITS = /^in\s+(\d{1,4}|an?)\s+([a-z]+)$/;
const N_UNITS_AGO = /^(\d{1,4}|an?)\s+([a-z]+)\s+ago$/;
const RELATIVE_PHRASE = /^(this|next|last|previous)\s+(.+)$/;

/**
 * Pure offsets — `+3d`, `in 2 weeks`, `3 days ago` — measured from `from`.
 * Split out because the second half of a range measures them from the first
 * half ("Sep 4 to +1w" is eleven days, not a week from today).
 * `text` must already be preprocessed and folded.
 */
function parseOffset(text: string, from: PlainDate): PlainDate | null {
  const compact = COMPACT_OFFSET.exec(text);
  if (compact) {
    const unit = unitOf(compact[3] ?? '');
    if (unit) return shift(from, unit, (compact[1] === '-' ? -1 : 1) * Number(compact[2]));
  }

  const ahead = IN_N_UNITS.exec(text);
  if (ahead) {
    const unit = unitOf(ahead[2] ?? '');
    if (unit) return shift(from, unit, amountOf(ahead[1]));
  }

  const behind = N_UNITS_AGO.exec(text);
  if (behind) {
    const unit = unitOf(behind[2] ?? '');
    if (unit) return shift(from, unit, -amountOf(behind[1]));
  }

  return null;
}

/** The weekday of the current week, then moved by whole weeks. */
function weekdayInWeek(weekday: number, offsetWeeks: number, ctx: Ctx): PlainDate {
  const start = startOfWeek(ctx.today, ctx.firstDayOfWeek);
  return addDays(start, ((weekday - ctx.firstDayOfWeek + 7) % 7) + offsetWeeks * 7);
}

/**
 * `src` must already be preprocessed (but not folded — diacritics are needed to
 * tell Slovak `št` from `st`).
 *
 * Semantics worth knowing, because English is ambiguous here:
 * - `next week|month|year` resolve to the *start* of that unit, matching how
 *   people read "next month" as "the 1st", while `+1w` / `in 1 week` stay pure
 *   offsets from today.
 * - `this|next|last <weekday>` are week-relative (using `firstDayOfWeek`), so
 *   "next friday" is the Friday of the following week — the trio stays coherent.
 * - A bare weekday is the nearest occurrence, forwards when `preferFuture`.
 */
function parseNatural(src: string, ctx: Ctx): PlainDate | null {
  const raw = src
    .toLowerCase()
    .replace(/[.,!?]+$/, '')
    .trim();
  const t = fold(raw);
  if (!t) return null;

  const offset = parseOffset(t, ctx.today);
  if (offset) return offset;

  if (t === 'today' || t === 'now') return ctx.today;
  if (t === 'tomorrow') return addDays(ctx.today, 1);
  if (t === 'yesterday') return addDays(ctx.today, -1);

  const relative = RELATIVE_PHRASE.exec(t);
  if (relative) {
    const weeks = relative[1] === 'next' ? 1 : relative[1] === 'this' ? 0 : -1;
    const rest = relative[2] ?? '';
    const unit = unitOf(rest);
    if (unit) return unitStart(shift(ctx.today, unit, weeks), unit, ctx.firstDayOfWeek);
    // The leading keyword is ASCII, so folding cannot have shifted the split point.
    const weekday = weekdayMatch(raw.slice(raw.indexOf(' ') + 1), ctx.locale);
    if (weekday) return weekdayInWeek(weekday.value, weeks, ctx);
  }

  const weekday = weekdayMatch(raw, ctx.locale);
  if (weekday) {
    // French `mars` is both March and an abbreviation of `mardi`; the stronger
    // of the two matches wins, and a tie goes to the weekday.
    const month = monthMatch(raw, ctx.locale);
    if (!month || Number(weekday.exact) >= Number(month.exact)) {
      const delta = (weekday.value - getWeekday(ctx.today) + 7) % 7;
      return addDays(ctx.today, ctx.preferFuture || delta === 0 ? delta : delta - 7);
    }
  }

  const localized = relativeKeywords(ctx.locale).get(t);
  if (localized) {
    return unitStart(
      shift(ctx.today, localized.unit, localized.offset),
      localized.unit,
      ctx.firstDayOfWeek,
    );
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/*                              Numeric patterns                              */
/* -------------------------------------------------------------------------- */

const NUMERIC_SEPARATORS = /[/.,\-\s]+/;

/** "13/09/2026" in a month-first locale is a day-first date, not month 13. */
function repairDayMonth(parts: { year: number | null; month: number; day: number }): DateParts {
  if (parts.month > 12 && parts.day <= 12)
    return { year: parts.year, month: parts.day, day: parts.month };
  return parts;
}

/**
 * Numbers only, separated by `/`, `-`, `.` or spaces. The locale's part order
 * decides the ambiguous cases; an explicit four-digit year always wins over it,
 * and a *leading* four-digit year is read as ISO Y-M-D regardless of locale,
 * which is what people mean when they lead with the year.
 */
function parseNumericParts(text: string, locale: string): DateParts | null {
  const tokens: string[] = [];
  for (const token of text.split(NUMERIC_SEPARATORS)) {
    if (!token) continue;
    if (/^\d+$/.test(token)) tokens.push(token);
    // Locale filler such as the Bulgarian year marker "г." rides along in
    // formatted output; ignore it rather than failing the whole parse.
    else if (!connectorWords(locale).has(fold(trimPunctuation(token)))) return null;
  }
  if (tokens.length === 0 || tokens.length > 3) return null;

  if (tokens.length === 1) {
    const only = tokens[0] ?? '';
    if (/^\d{8}$/.test(only)) {
      return {
        year: Number(only.slice(0, 4)),
        month: Number(only.slice(4, 6)),
        day: Number(only.slice(6, 8)),
      };
    }
    if (/^\d{1,2}$/.test(only)) return { year: null, month: null, day: Number(only) };
    return null;
  }

  for (const token of tokens) if (!/^\d{1,4}$/.test(token)) return null;
  const values = tokens.map(Number);
  const lengths = tokens.map((token) => token.length);
  const order = localeDateOrder(locale);
  const monthFirst = order.indexOf('month') < order.indexOf('day');

  if (tokens.length === 2) {
    const yearIndex = lengths[0] === 4 ? 0 : lengths[1] === 4 ? 1 : -1;
    if (yearIndex >= 0) {
      const month = values[1 - yearIndex] ?? 0;
      if (month < 1 || month > 12) return null;
      return { year: values[yearIndex] ?? 0, month, day: null };
    }
    const month = (monthFirst ? values[0] : values[1]) ?? 0;
    const day = (monthFirst ? values[1] : values[0]) ?? 0;
    return repairDayMonth({ year: null, month, day });
  }

  let sequence: readonly DatePart[];
  if (lengths[0] === 4) sequence = ['year', 'month', 'day'];
  else if (lengths[2] === 4)
    sequence = monthFirst ? ['month', 'day', 'year'] : ['day', 'month', 'year'];
  else sequence = order;

  let year = 0;
  let month = 0;
  let day = 0;
  for (let i = 0; i < 3; i += 1) {
    const value = values[i] ?? 0;
    if (sequence[i] === 'year') year = expandYear(value, lengths[i] ?? 2);
    else if (sequence[i] === 'month') month = value;
    else day = value;
  }
  return repairDayMonth({ year, month, day });
}

/* -------------------------------------------------------------------------- */
/*                             Month-name patterns                            */
/* -------------------------------------------------------------------------- */

const NAME_SEPARATORS = /[\s,./\-()[\]]+/;
const DAY_TOKEN = /^'?(\d{1,4})(?:st|nd|rd|th)?$/;

/** `text` must already be preprocessed, with diacritics still intact. */
function parseNamedParts(text: string, locale: string): DateParts | null {
  const tokens = text.split(NAME_SEPARATORS).filter((token) => token.length > 0);
  // Enough for the wordiest long form ("ngày 4 tháng 9 năm 2026"), not enough
  // for a sentence.
  if (tokens.length === 0 || tokens.length > 8) return null;

  let month: number | null = null;
  const numbers: { value: number; digits: number }[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';

    // Multi-word names first: Vietnamese "Tháng 9" would otherwise lose its
    // number to the day slot.
    if (month === null) {
      const joined = multiPartMonthNames(locale);
      let matchedSpan = 0;
      for (let span = Math.min(3, tokens.length - i); span >= 2; span -= 1) {
        const found = joined.get(compact(tokens.slice(i, i + span).join('')));
        if (found !== undefined) {
          month = found;
          matchedSpan = span;
          break;
        }
      }
      if (matchedSpan) {
        i += matchedSpan - 1;
        continue;
      }
    }

    const numeric = DAY_TOKEN.exec(token.toLowerCase());
    if (numeric) {
      const digits = numeric[1] ?? '';
      numbers.push({ value: Number(digits), digits: digits.length });
      continue;
    }
    const matched = monthFromToken(token, locale);
    if (matched !== null && month === null) {
      month = matched;
      continue;
    }
    if (matched === null && connectorWords(locale).has(fold(trimPunctuation(token)))) continue;
    return null;
  }
  if (month === null || numbers.length > 2) return null;

  const first = numbers[0];
  if (!first) return { year: null, month, day: null };

  const second = numbers[1];
  if (!second) {
    if (first.digits === 4 || first.value > 31)
      return { year: expandYear(first.value, first.digits), month, day: null };
    return { year: null, month, day: first.value };
  }

  const yearEntry = first.digits === 4 || first.value > 31 ? first : second;
  const dayEntry = yearEntry === first ? second : first;
  if (dayEntry.value > 31 || dayEntry.value < 1) return null;
  return { year: expandYear(yearEntry.value, yearEntry.digits), month, day: dayEntry.value };
}

/* -------------------------------------------------------------------------- */
/*                            Resolving partial dates                         */
/* -------------------------------------------------------------------------- */

/** Fill in missing fields from `today`, biased forwards when `preferFuture`. */
function resolveParts(parts: DateParts, ctx: Ctx): PlainDate | null {
  const { today, preferFuture } = ctx;

  if (parts.year !== null) return makeDate(parts.year, parts.month ?? 1, parts.day ?? 1);

  if (parts.month === null) {
    if (parts.day === null) return null;
    if (!preferFuture) return makeDate(today.year, today.month, parts.day);
    // A bare day number means the next month in which that day still lies ahead.
    for (let i = 0; i < 12; i += 1) {
      const month = addMonths(today, i);
      const candidate = makeDate(month.year, month.month, parts.day);
      if (candidate && !isBefore(candidate, today)) return candidate;
    }
    return null;
  }

  const day = parts.day ?? 1;
  const inThisYear = makeDate(today.year, parts.month, day);
  if (inThisYear) {
    // "9/4" typed in December means next September, not nine months ago.
    if (preferFuture && isBefore(inThisYear, addMonths(today, -6))) {
      return makeDate(today.year + 1, parts.month, day) ?? inThisYear;
    }
    return inThisYear;
  }
  // Feb 29 in a non-leap year: walk to the nearest year that actually has it.
  for (let i = 1; i <= 8; i += 1) {
    const candidate = makeDate(today.year + (preferFuture ? i : -i), parts.month, day);
    if (candidate) return candidate;
  }
  return null;
}

/** Fill in missing fields from the other end of a range ("Sep 4 – 25"). */
function resolvePartsAfter(parts: DateParts, start: PlainDate): PlainDate | null {
  if (parts.year !== null) return makeDate(parts.year, parts.month ?? 1, parts.day ?? 1);

  if (parts.month === null) {
    if (parts.day === null) return null;
    const sameMonth = makeDate(start.year, start.month, parts.day);
    if (sameMonth && !isBefore(sameMonth, start)) return sameMonth;
    const next = addMonths(startOfMonth(start), 1);
    return makeDate(next.year, next.month, parts.day) ?? sameMonth;
  }

  const day = parts.day ?? 1;
  const sameYear = makeDate(start.year, parts.month, day);
  // "Dec 28 – Jan 3" wraps into the next year. A backwards half that stays in the
  // same or a later month ("Sep 25 – Sep 4") reads as transposed ends instead, so
  // it keeps the year and lets normalizeRange swap them.
  if (sameYear && (!isBefore(sameYear, start) || parts.month >= start.month)) return sameYear;
  return makeDate(start.year + 1, parts.month, day) ?? sameYear;
}

/* -------------------------------------------------------------------------- */
/*                                   Public                                   */
/* -------------------------------------------------------------------------- */

const ISO_DATE_ONLY =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?\s*(?:z|[+-]\d{2}:?\d{2})?)?$/i;

function parseResolved(src: string, ctx: Ctx): PlainDate | null {
  const iso = ISO_DATE_ONLY.exec(src);
  if (iso) {
    // fromISODate would roll "2026-02-31" into March; a typo must fail instead.
    if (!makeDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))) return null;
    return fromISODate(src.slice(0, 10));
  }

  const natural = parseNatural(src, ctx);
  if (natural) return natural;

  const numeric = parseNumericParts(src, ctx.locale);
  if (numeric) return resolveParts(numeric, ctx);

  const named = parseNamedParts(src, ctx.locale);
  if (named) return resolveParts(named, ctx);

  return null;
}

/**
 * Parse one free-text date. Tries, in order: ISO `YYYY-MM-DD`, natural language
 * (`today`, `next friday`, `in 3 days`, `+2w`), locale-ordered numbers
 * (`9/4/2026` is September 4 in `en-US` and April 9 in `en-GB`), then month
 * names in the target locale and in English (`Sep 4`, `4 September 2026`).
 * Returns `null` rather than guessing — impossible dates like `2026-02-31` are
 * typos, not March 3.
 */
export function parseDateString(text: string, options: ParseOptions): PlainDate | null {
  if (typeof text !== 'string') return null;
  const src = preprocess(text);
  if (!src) return null;
  return parseResolved(src, context(options));
}

/** Word and symbol separators, tried before the ambiguous bare hyphen. */
const RANGE_SEPARATORS: readonly RegExp[] = [
  /\s+(?:to|until|through|thru|till)\s+/i,
  /\s*(?:[–—→⟶]|=>|\.{2,})\s*/,
  /\s+-\s+/,
];

function parseSecondHalf(text: string, ctx: Ctx, start: PlainDate): PlainDate | null {
  const src = preprocess(text);
  if (!src) return null;
  if (!ISO_DATE_ONLY.test(src)) {
    const offset = parseOffset(fold(src), start);
    if (offset) return offset;
    const parts = parseNumericParts(src, ctx.locale) ?? parseNamedParts(src, ctx.locale);
    // Only an under-specified half inherits; anything with its own year is absolute.
    if (parts && parts.year === null) {
      const resolved = resolvePartsAfter(parts, start);
      if (resolved) return resolved;
    }
  }
  return parseResolved(src, ctx);
}

function buildRange(leftText: string, rightText: string, ctx: Ctx): DateRange | null {
  const left = leftText.trim();
  const right = rightText.trim();
  if (!left || !right) return null;
  // A lone number on the left is a date component, not a range start: "9-4-2026"
  // and "9 - 4" are dates, and no supported format starts a range with a bare day.
  if (/^\d{1,2}$/.test(left)) return null;
  const start = parseResolved(left, ctx);
  if (!start) return null;
  const end = parseSecondHalf(right, ctx, start);
  return end ? normalizeRange({ start, end }) : null;
}

/**
 * Parse `"Sep 4 – 25"`, `"9/4/2026 to 10/2/2026"`, `"next friday - +3d"` into a
 * normalized range. The second half inherits whatever it omits from the first,
 * rolling forward across a month or year boundary when it would otherwise land
 * before the start. Text with no separator that parses as a single date returns
 * `{ start, end: null }`, so half-typed input is still usable.
 */
export function parseRangeString(text: string, options: ParseOptions): DateRange | null {
  if (typeof text !== 'string') return null;
  const src = preprocess(text);
  if (!src) return null;
  const ctx = context(options);

  for (const separator of RANGE_SEPARATORS) {
    const match = separator.exec(src);
    if (!match || match.index <= 0) continue;
    const range = buildRange(
      src.slice(0, match.index),
      src.slice(match.index + match[0].length),
      ctx,
    );
    if (range) return range;
  }

  // A whole string that reads as one date is one date. This has to be tried
  // before any bare-hyphen split, because a hyphen is also a date separator:
  // "2026-09-04" splits into two halves that both parse ("2026-09" as a month
  // and "04" as a day), which would silently turn a single ISO date into the
  // range Sep 1 – Sep 4.
  const whole = parseResolved(src, ctx);
  if (whole) return { start: whole, end: null };

  // Only now try splitting on a bare hyphen, for inputs like "9/4-9/25" where
  // the string as a whole is not a date.
  for (let i = 1; i < src.length - 1; i += 1) {
    if (src[i] !== '-') continue;
    const range = buildRange(src.slice(0, i), src.slice(i + 1), ctx);
    if (range) return range;
  }

  return null;
}
