/**
 * Presets — the chips under the calendar ("Weekend", "3 nights", "1 week") and
 * the sidebar of an analytics range picker ("Last 30 days", "Year to date").
 *
 * Two invariants make every preset here safe to run anywhere:
 *
 * 1. Dates are derived **only** from the {@link PresetContext} (`today`,
 *    `anchor`, `focusedDate`, `firstDayOfWeek`) — never from `new Date()`.
 *    Presets are therefore deterministic, snapshot-testable and SSR-stable:
 *    server and client compute the identical chip for the identical context.
 * 2. Every produced value is pushed through `ctx.clamp`, so a preset can never
 *    hand the engine a value that violates the picker's constraints. When
 *    clamping is impossible the chip resolves to `disabled`.
 */
import { formatDate, runtimeLocale } from './intl';
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  compareDates,
  eachDayOfInterval,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  getWeekday,
  isPlainDate,
  isSameDay,
  normalizeRange,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  toEpochDay,
  toPlainDate,
} from './plain-date';
import type {
  DatePreset,
  DateRange,
  PlainDate,
  PresetContext,
  ResolvedPreset,
  SelectionMode,
  SelectionValue,
} from './types';

/** Every shape a `getValue` implementation is allowed to return. */
export type PresetResult = SelectionValue | Partial<SelectionValue> | DateRange | PlainDate | null;

/** Options shared by the duration factories ({@link nightsPreset}, {@link daysPreset}). */
export interface DurationPresetOptions {
  id?: string;
  label?: string;
  hint?: string;
  /**
   * Where the span starts. `'anchor'` (default) means the half-picked check-in,
   * falling back to the current range start, then today — so tapping "1 week"
   * after choosing a check-in extends *from that check-in*.
   */
  from?: 'today' | 'anchor' | 'focused';
}

/** Options shared by the rolling-window factories. */
export interface WindowPresetOptions {
  id?: string;
  label?: string;
  hint?: string;
  /** Default `true` — "Last 7 days" ends today, not yesterday. */
  includeToday?: boolean;
}

/** Options shared by the calendar-unit factories ({@link monthPreset} and friends). */
export interface UnitPresetOptions {
  id?: string;
  label?: string;
  hint?: string;
}

/* -------------------------------------------------------------------------- */
/*                                 Normalizer                                 */
/* -------------------------------------------------------------------------- */

/**
 * Coerce any `getValue` return shape into a full {@link SelectionValue} for the
 * given mode. Consumers write presets that return a bare `PlainDate` or a
 * `DateRange`; the engine only ever deals with `SelectionValue`, so every entry
 * point (built-ins, `resolvePresets`, `engine.applyPreset`) funnels through here.
 */
export function normalizePresetResult(
  result: SelectionValue | Partial<SelectionValue> | DateRange | PlainDate | null | undefined,
  mode: SelectionMode,
): SelectionValue | null {
  if (result == null) return null;
  if (isPlainDate(result)) return coerce([result], emptyRange(), mode, undefined);

  const candidate = result as Partial<SelectionValue> & Partial<DateRange>;
  const looksLikeSelection = 'dates' in candidate || 'range' in candidate;
  const looksLikeRange = 'start' in candidate || 'end' in candidate;
  if (!looksLikeSelection && !looksLikeRange) return null;

  const dates = Array.isArray(candidate.dates) ? candidate.dates : [];
  const range: DateRange = looksLikeSelection
    ? { start: candidate.range?.start ?? null, end: candidate.range?.end ?? null }
    : { start: candidate.start ?? null, end: candidate.end ?? null };

  return coerce(dates, range, mode, candidate.times);
}

function coerce(
  inputDates: readonly (PlainDate | null | undefined)[],
  inputRange: DateRange,
  mode: SelectionMode,
  times: SelectionValue['times'] | undefined,
): SelectionValue {
  let dates = sortedUnique(inputDates);
  let range = normalizeRange({ start: toPlain(inputRange.start), end: toPlain(inputRange.end) });

  if (mode === 'single' || mode === 'multiple') {
    if (dates.length === 0 && range.start) {
      // A range handed to a date-list picker: `multiple` takes every day in the
      // span, `single` takes the start. `eachDayOfInterval` self-limits, so a
      // pathological span cannot lock the UI.
      dates =
        mode === 'multiple' && range.end && !isSameDay(range.start, range.end)
          ? eachDayOfInterval(range.start, range.end)
          : [range.start];
    }
    if (mode === 'single' && dates.length > 1) dates = dates.slice(0, 1);
    range = emptyRange();
  } else {
    if (!range.start && !range.end && dates.length > 0) {
      range = {
        start: dates[0] ?? null,
        end: dates.length > 1 ? (dates[dates.length - 1] ?? null) : null,
      };
    }
    dates = [];
  }

  return times ? { dates, range, times } : { dates, range };
}

function emptyRange(): DateRange {
  return { start: null, end: null };
}

function toPlain(date: PlainDate | null | undefined): PlainDate | null {
  return date ? toPlainDate(date) : null;
}

function sortedUnique(input: readonly (PlainDate | null | undefined)[]): PlainDate[] {
  const normalized: PlainDate[] = [];
  for (const entry of input) {
    const date = toPlain(entry);
    if (date) normalized.push(date);
  }
  normalized.sort(compareDates);
  const seen = new Set<number>();
  return normalized.filter((date) => {
    const key = toEpochDay(date);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Normalize, then clamp. The single exit used by every built-in `getValue`. */
function produce(ctx: PresetContext, result: PresetResult): SelectionValue | null {
  const value = normalizePresetResult(result, ctx.mode);
  if (!value) return null;
  return typeof ctx.clamp === 'function' ? ctx.clamp(value) : value;
}

/* -------------------------------------------------------------------------- */
/*                              Context helpers                               */
/* -------------------------------------------------------------------------- */

function normalizeFirstDayOfWeek(firstDayOfWeek: number): number {
  const value = Math.trunc(firstDayOfWeek);
  return Number.isFinite(value) ? ((value % 7) + 7) % 7 : 0;
}

function durationAnchor(ctx: PresetContext, from: DurationPresetOptions['from']): PlainDate {
  if (from === 'today') return ctx.today;
  if (from === 'focused') return ctx.focusedDate;
  return ctx.anchor ?? ctx.value.range.start ?? ctx.today;
}

/**
 * How a single day should be expressed in the current mode. A same-day range is
 * exactly one day under `days` semantics but *zero nights* under `nights`
 * semantics — there, seeding the check-in is the useful behaviour.
 */
function dayValue(ctx: PresetContext, date: PlainDate): PresetResult {
  if (ctx.mode === 'single' || ctx.mode === 'multiple') return date;
  return ctx.rangeSemantics === 'days' ? { start: date, end: date } : { start: date, end: null };
}

/**
 * The Friday of the weekend being offered: this one while it is still Fri/Sat,
 * otherwise the next. Deliberately Fri→Sun regardless of locale — the chip means
 * "a weekend break", not "the locale's non-working days".
 */
function upcomingFriday(today: PlainDate): PlainDate {
  const weekday = getWeekday(today);
  if (weekday === 5) return today;
  if (weekday === 6) return subDays(today, 1);
  return addDays(today, (5 - weekday + 7) % 7);
}

/* -------------------------------------------------------------------------- */
/*                                  Factories                                 */
/* -------------------------------------------------------------------------- */

/** Validate and freeze a preset definition. Use it for every custom preset. */
export function createPreset(def: DatePreset): DatePreset {
  if (!def || typeof def.id !== 'string' || def.id.trim() === '') {
    throw new TypeError('createPreset: `id` must be a non-empty string');
  }
  if (typeof def.getValue !== 'function') {
    throw new TypeError(`createPreset: preset "${def.id}" must define a getValue function`);
  }
  return Object.freeze({
    ...def,
    id: def.id,
    label: typeof def.label === 'string' ? def.label : def.id,
  });
}

/** Terse constructor for one-off presets: `toDatePreset('nye', 'New Year', ctx => …)`. */
export function toDatePreset(
  id: string,
  label: string,
  getValue: DatePreset['getValue'],
): DatePreset {
  return createPreset({ id, label, getValue });
}

/**
 * A stay of `nights` nights measured from the anchor — end lands `nights` days
 * later, which is the same physical span under either {@link RangeSemantics}.
 */
export function nightsPreset(nights: number, options: DurationPresetOptions = {}): DatePreset {
  const count = Math.max(1, Math.trunc(nights) || 1);
  const plural = count === 1 ? '' : 's';
  return createPreset({
    id: options.id ?? `${count}-night${plural}`,
    label: options.label ?? `${count} night${plural}`,
    hint: options.hint,
    getValue: (ctx) => {
      const start = durationAnchor(ctx, options.from);
      return produce(ctx, { start, end: addDays(start, count) });
    },
  });
}

/** A span from the anchor that *measures* `days` under the picker's semantics. */
export function daysPreset(days: number, options: DurationPresetOptions = {}): DatePreset {
  const count = Math.max(1, Math.trunc(days) || 1);
  const plural = count === 1 ? '' : 's';
  return createPreset({
    id: options.id ?? `${count}-day${plural}`,
    label: options.label ?? `${count} day${plural}`,
    hint: options.hint,
    getValue: (ctx) => {
      const start = durationAnchor(ctx, options.from);
      const span = ctx.rangeSemantics === 'nights' ? count : count - 1;
      return produce(ctx, { start, end: addDays(start, span) });
    },
  });
}

/** Analytics framing: the `days`-day window ending today, inclusive of both ends. */
export function lastNDaysPreset(days: number, options: WindowPresetOptions = {}): DatePreset {
  const count = Math.max(1, Math.trunc(days) || 1);
  const includeToday = options.includeToday !== false;
  return createPreset({
    id: options.id ?? `last-${count}-days`,
    label: options.label ?? `Last ${count} day${count === 1 ? '' : 's'}`,
    hint: options.hint,
    getValue: (ctx) => {
      const end = includeToday ? ctx.today : subDays(ctx.today, 1);
      return produce(ctx, { start: subDays(end, count - 1), end });
    },
  });
}

/** The `days`-day window starting today (or tomorrow), inclusive of both ends. */
export function nextNDaysPreset(days: number, options: WindowPresetOptions = {}): DatePreset {
  const count = Math.max(1, Math.trunc(days) || 1);
  const includeToday = options.includeToday !== false;
  return createPreset({
    id: options.id ?? `next-${count}-days`,
    label: options.label ?? `Next ${count} day${count === 1 ? '' : 's'}`,
    hint: options.hint,
    getValue: (ctx) => {
      const start = includeToday ? ctx.today : addDays(ctx.today, 1);
      return produce(ctx, { start, end: addDays(start, count - 1) });
    },
  });
}

/** Fri → Sun. `offset` 0 = the upcoming weekend, 1 = the one after it. */
export function weekendPreset(options: UnitPresetOptions & { offset?: number } = {}): DatePreset {
  const offset = Math.trunc(options.offset ?? 0);
  return createPreset({
    id:
      options.id ??
      (offset === 0 ? 'this-weekend' : offset === 1 ? 'next-weekend' : `weekend-plus-${offset}`),
    label:
      options.label ??
      (offset === 0 ? 'Weekend' : offset === 1 ? 'Next weekend' : `Weekend +${offset}`),
    hint: options.hint ?? 'Fri – Sun',
    getValue: (ctx) => {
      const friday = addWeeks(upcomingFriday(ctx.today), offset);
      return produce(ctx, { start: friday, end: addDays(friday, 2) });
    },
  });
}

type CalendarUnit = 'week' | 'month' | 'quarter' | 'year';

function unitId(unit: CalendarUnit, offset: number): string {
  if (offset === 0) return `this-${unit}`;
  if (offset === -1) return `last-${unit}`;
  if (offset === 1) return `next-${unit}`;
  return offset < 0 ? `${unit}-minus-${Math.abs(offset)}` : `${unit}-plus-${offset}`;
}

function unitLabel(unit: CalendarUnit, offset: number): string {
  if (offset === 0) return `This ${unit}`;
  if (offset === -1) return `Last ${unit}`;
  if (offset === 1) return `Next ${unit}`;
  return offset < 0 ? `${Math.abs(offset)} ${unit}s ago` : `In ${offset} ${unit}s`;
}

/** The whole calendar week containing `today + offset weeks`, honouring `firstDayOfWeek`. */
function weekPreset(offset: number, options: UnitPresetOptions = {}): DatePreset {
  return createPreset({
    id: options.id ?? unitId('week', offset),
    label: options.label ?? unitLabel('week', offset),
    hint: options.hint,
    getValue: (ctx) => {
      const firstDay = normalizeFirstDayOfWeek(ctx.firstDayOfWeek);
      const base = addWeeks(ctx.today, offset);
      return produce(ctx, { start: startOfWeek(base, firstDay), end: endOfWeek(base, firstDay) });
    },
  });
}

/** A whole calendar month. `offset` 0 = this month, -1 = last month. */
export function monthPreset(offset: number, options: UnitPresetOptions = {}): DatePreset {
  const step = Math.trunc(offset);
  return createPreset({
    id: options.id ?? unitId('month', step),
    label: options.label ?? unitLabel('month', step),
    hint: options.hint,
    getValue: (ctx) => {
      const base = addMonths(ctx.today, step);
      return produce(ctx, { start: startOfMonth(base), end: endOfMonth(base) });
    },
  });
}

/** A whole calendar quarter. `offset` 0 = this quarter, -1 = last quarter. */
export function quarterPreset(offset: number, options: UnitPresetOptions = {}): DatePreset {
  const step = Math.trunc(offset);
  return createPreset({
    id: options.id ?? unitId('quarter', step),
    label: options.label ?? unitLabel('quarter', step),
    hint: options.hint,
    getValue: (ctx) => {
      const base = addMonths(ctx.today, step * 3);
      return produce(ctx, { start: startOfQuarter(base), end: endOfQuarter(base) });
    },
  });
}

/** A whole calendar year. `offset` 0 = this year, -1 = last year. */
export function yearPreset(offset: number, options: UnitPresetOptions = {}): DatePreset {
  const step = Math.trunc(offset);
  return createPreset({
    id: options.id ?? unitId('year', step),
    label: options.label ?? unitLabel('year', step),
    hint: options.hint,
    getValue: (ctx) => {
      const base = addYears(ctx.today, step);
      return produce(ctx, { start: startOfYear(base), end: endOfYear(base) });
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                                 Built-ins                                  */
/* -------------------------------------------------------------------------- */

const todayPreset = toDatePreset('today', 'Today', (ctx) => produce(ctx, dayValue(ctx, ctx.today)));
const tomorrowPreset = toDatePreset('tomorrow', 'Tomorrow', (ctx) =>
  produce(ctx, dayValue(ctx, addDays(ctx.today, 1))),
);
const yesterdayPreset = toDatePreset('yesterday', 'Yesterday', (ctx) =>
  produce(ctx, dayValue(ctx, subDays(ctx.today, 1))),
);

const nextMondayPreset = toDatePreset('next-monday', 'Next Monday', (ctx) => {
  // Strictly after today: on a Monday the chip means "a week from now".
  const delta = (1 - getWeekday(ctx.today) + 7) % 7 || 7;
  return produce(ctx, dayValue(ctx, addDays(ctx.today, delta)));
});

const inTwoWeeksPreset = toDatePreset('in-2-weeks', 'In 2 weeks', (ctx) =>
  produce(ctx, dayValue(ctx, addWeeks(ctx.today, 2))),
);

const oneMonthPreset = toDatePreset('1-month', '1 month', (ctx) => {
  const start = durationAnchor(ctx, 'anchor');
  return produce(ctx, { start, end: addMonths(start, 1) });
});

const yearToDatePreset = toDatePreset('year-to-date', 'Year to date', (ctx) =>
  produce(ctx, { start: startOfYear(ctx.today), end: ctx.today }),
);

const thisWeekendPreset = weekendPreset({ offset: 0 });
const nextWeekendPreset = weekendPreset({ offset: 1 });
const threeNightsPreset = nightsPreset(3);
const oneWeekPreset = nightsPreset(7, { id: '1-week', label: '1 week' });
const twoWeeksPreset = nightsPreset(14, { id: '2-weeks', label: '2 weeks' });
const last7DaysPreset = lastNDaysPreset(7);
const last30DaysPreset = lastNDaysPreset(30);
const last90DaysPreset = lastNDaysPreset(90);
const thisWeekPreset = weekPreset(0);
const nextWeekPreset = weekPreset(1);
const thisMonthPreset = monthPreset(0);
const lastMonthPreset = monthPreset(-1);
const nextMonthPreset = monthPreset(1);
const thisQuarterPreset = quarterPreset(0);
const lastQuarterPreset = quarterPreset(-1);
const thisYearPreset = yearPreset(0);

/** Every preset the library ships, keyed by id. Look them up with {@link getPreset}. */
export const builtInPresets: Record<string, DatePreset> = {
  today: todayPreset,
  tomorrow: tomorrowPreset,
  yesterday: yesterdayPreset,
  'this-weekend': thisWeekendPreset,
  'next-weekend': nextWeekendPreset,
  '3-nights': threeNightsPreset,
  '1-week': oneWeekPreset,
  '2-weeks': twoWeeksPreset,
  '1-month': oneMonthPreset,
  'last-7-days': last7DaysPreset,
  'last-30-days': last30DaysPreset,
  'last-90-days': last90DaysPreset,
  'this-week': thisWeekPreset,
  'next-week': nextWeekPreset,
  'this-month': thisMonthPreset,
  'last-month': lastMonthPreset,
  'next-month': nextMonthPreset,
  'this-quarter': thisQuarterPreset,
  'last-quarter': lastQuarterPreset,
  'this-year': thisYearPreset,
  'year-to-date': yearToDatePreset,
  'next-monday': nextMondayPreset,
  'in-2-weeks': inTwoWeeksPreset,
};

Object.freeze(builtInPresets);

/** Look up a shipped preset by id. */
export function getPreset(id: string): DatePreset | undefined {
  return typeof id === 'string' ? builtInPresets[id] : undefined;
}

function isPresetLike(value: unknown): value is DatePreset {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as DatePreset).id === 'string' &&
    typeof (value as DatePreset).getValue === 'function'
  );
}

/**
 * Accept presets, built-in ids, or a mix — the web component and framework
 * bindings receive `presets="today,last-7-days"` from an attribute. Unknown ids,
 * malformed entries and duplicate ids are dropped.
 */
export function normalizePresets(
  input: readonly (DatePreset | string)[] | undefined,
): DatePreset[] {
  if (!input) return [];
  const out: DatePreset[] = [];
  const seen = new Set<string>();
  for (const entry of input) {
    const preset =
      typeof entry === 'string' ? getPreset(entry.trim()) : isPresetLike(entry) ? entry : undefined;
    if (!preset || seen.has(preset.id)) continue;
    seen.add(preset.id);
    out.push(preset);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                                  Bundles                                   */
/* -------------------------------------------------------------------------- */

/** The flagship booking card's chip row. */
export const bookingPresets: DatePreset[] = [
  thisWeekendPreset,
  threeNightsPreset,
  oneWeekPreset,
  twoWeeksPreset,
];

/** A dashboard date-range sidebar. Pair with `rangeSemantics: 'days'`. */
export const analyticsPresets: DatePreset[] = [
  todayPreset,
  yesterdayPreset,
  last7DaysPreset,
  last30DaysPreset,
  last90DaysPreset,
  thisMonthPreset,
  lastMonthPreset,
  thisQuarterPreset,
  yearToDatePreset,
];

/** Shortcuts for "when shall we meet?" pickers. */
export const schedulingPresets: DatePreset[] = [
  todayPreset,
  tomorrowPreset,
  nextWeekPreset,
  nextMondayPreset,
  inTwoWeeksPreset,
  nextMonthPreset,
];

/** Sensible chips for a mode when the consumer passes none. Returns a fresh array. */
export function defaultPresetsFor(mode: SelectionMode): DatePreset[] {
  switch (mode) {
    case 'range':
      return [...bookingPresets];
    case 'single':
      return [todayPreset, tomorrowPreset, nextMondayPreset];
    default:
      // `multiple` and the unit modes (week/month/quarter/year) have no
      // meaningful default: a click already selects the whole unit.
      return [];
  }
}

/* -------------------------------------------------------------------------- */
/*                                 Resolution                                 */
/* -------------------------------------------------------------------------- */

/**
 * Run every preset once and decorate it with `disabled`, a localized
 * `resolvedHint` and a bound `isActive`. Called on every snapshot, so it does
 * exactly one `getValue` per preset and no date formatting for disabled chips.
 *
 * `locale` is not part of {@link PresetContext}; pass the picker's resolved
 * locale so hints match the calendar, or omit it to use the runtime default.
 */
export function resolvePresets(
  presets: readonly DatePreset[],
  ctx: PresetContext,
  value: SelectionValue,
  locale: string = runtimeLocale(),
): ResolvedPreset[] {
  const current = normalizePresetResult(value, ctx.mode);
  const resolved: ResolvedPreset[] = [];

  for (const preset of presets) {
    if (!isPresetLike(preset)) continue;
    const produced = normalizePresetResult(safeGetValue(preset, ctx), ctx.mode);
    const disabled = produced === null;
    if (disabled && preset.hideWhenInvalid) continue;

    resolved.push({
      ...preset,
      disabled,
      resolvedHint:
        (produced ? formatSelectionHint(produced, ctx, locale) : undefined) ?? preset.hint,
      isActive: preset.isActive ?? bindDefaultIsActive(preset, produced, ctx, current),
    });
  }

  return resolved;
}

/** A thrown custom preset must disable its own chip, never break the calendar. */
function safeGetValue(preset: DatePreset, ctx: PresetContext): PresetResult {
  try {
    return preset.getValue(ctx);
  } catch {
    return null;
  }
}

/**
 * Default active test: the preset is active when the value it would produce
 * equals the current selection. The value produced during this resolve pass is
 * reused for the context it was computed with; a foreign context recomputes.
 */
function bindDefaultIsActive(
  preset: DatePreset,
  produced: SelectionValue | null,
  resolveCtx: PresetContext,
  resolveValue: SelectionValue | null,
): ResolvedPreset['isActive'] {
  return (value, ctx) => {
    const target =
      ctx === resolveCtx ? produced : normalizePresetResult(safeGetValue(preset, ctx), ctx.mode);
    if (!target) return false;
    const against =
      value === resolveValue || !value ? resolveValue : normalizePresetResult(value, ctx.mode);
    return against !== null && selectionsEqual(target, against);
  };
}

/** Deep value equality over dates and range only — times never gate a chip. */
function selectionsEqual(a: SelectionValue, b: SelectionValue): boolean {
  if (!sameDayOrNull(a.range.start, b.range.start)) return false;
  if (!sameDayOrNull(a.range.end, b.range.end)) return false;
  if (a.dates.length !== b.dates.length) return false;
  for (let i = 0; i < a.dates.length; i += 1) {
    if (!sameDayOrNull(a.dates[i], b.dates[i])) return false;
  }
  return true;
}

function sameDayOrNull(a: PlainDate | null | undefined, b: PlainDate | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return isSameDay(a, b);
}

/* -------------------------------------------------------------------------- */
/*                                    Hints                                   */
/* -------------------------------------------------------------------------- */

/**
 * A compact preview of what the chip will do: `"Sep 4 – Sep 6"`, `"Sep 4"`, or
 * `"Sep 4, Sep 5 +3"`. Years appear only when the span leaves the current year,
 * which keeps the chip row narrow in the overwhelmingly common case.
 */
function formatSelectionHint(
  value: SelectionValue,
  ctx: PresetContext,
  locale: string,
): string | undefined {
  const { range, dates } = value;
  const currentYear = ctx.today.year;

  if (range.start && range.end) {
    if (isSameDay(range.start, range.end))
      return formatDay(range.start, locale, range.start.year !== currentYear);
    const crossesYear = range.start.year !== range.end.year;
    const start = formatDay(range.start, locale, crossesYear);
    const end = formatDay(range.end, locale, crossesYear || range.end.year !== currentYear);
    return `${start} – ${end}`;
  }
  if (range.start) return formatDay(range.start, locale, range.start.year !== currentYear);

  const first = dates[0];
  if (!first) return undefined;
  if (dates.length === 1) return formatDay(first, locale, first.year !== currentYear);

  const second = dates[1];
  if (dates.length === 2 && second) {
    return `${formatDay(first, locale, first.year !== currentYear)}, ${formatDay(second, locale, second.year !== currentYear)}`;
  }
  const head = second
    ? `${formatDay(first, locale, false)}, ${formatDay(second, locale, false)}`
    : formatDay(first, locale, false);
  return `${head} +${formatCount(dates.length - 2, locale)}`;
}

function formatDay(date: PlainDate, locale: string, withYear: boolean): string {
  return formatDate(
    date,
    locale,
    withYear
      ? { month: 'short', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric' },
  );
}

function formatCount(count: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(count);
  } catch {
    return String(count);
  }
}
