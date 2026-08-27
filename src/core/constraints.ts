/**
 * The constraint engine — the correctness heart of the library.
 *
 * Every convenience option a consumer can pass (`disablePast`, `disableWeekends`,
 * arrays of dates, arrays of ranges, predicates, …) is normalized **once** by
 * {@link resolveConstraints} into a small set of fast predicates. Everything after
 * that runs in the render hot path: {@link evaluateDate} is called for every visible
 * cell on every render, so it allocates nothing for the common answers — the
 * `DayEvaluation` objects it returns are shared frozen constants.
 *
 * Nothing here constructs a `Date`; all arithmetic goes through `plain-date`.
 */
import {
  addDays,
  clampDate,
  diffInDays,
  fromEpochDay,
  getWeekday,
  isAfter,
  isBefore,
  isSameOrBefore,
  maxOf,
  minOf,
  normalizeRange,
  subDays,
  toEpochDay,
  toISODate,
  toPlainDate,
} from './plain-date';
import type {
  CompleteDateRange,
  ConstraintContext,
  DateConstraints,
  DateInput,
  DateRange,
  DateRangeInput,
  DayEvaluation,
  DisabledReason,
  PlainDate,
  RangeSemantics,
  SelectionMode,
  SelectionValue,
} from './types';

/* -------------------------------------------------------------------------- */
/*                                Public shape                                */
/* -------------------------------------------------------------------------- */

export interface ResolvedConstraints {
  minDate: PlainDate | null;
  maxDate: PlainDate | null;
  /** Blocklist ∪ disabled weekdays ∪ past/future window. Bounds are *not* included. */
  isDisabled: (date: PlainDate) => boolean;
  /** Allowlist membership — always `true` when no allowlist is configured. */
  isAllowed: (date: PlainDate) => boolean;
  blockedRanges: readonly CompleteDateRange[];
  disabledDaysOfWeek: readonly number[];
  minNights: number | null;
  maxNights: number | null;
  minSelections: number | null;
  maxSelections: number | null;
  rollingSelection: boolean;
  preventCrossingBlocked: boolean;
  /**
   * The user's `isDateUnavailable` escape hatch, evaluated last.
   * Returning `true` marks the day unavailable; returning a {@link DayEvaluation}
   * is honoured literally (its `selectable` flag decides, its `reason`/`message` win).
   */
  custom?: (date: PlainDate, ctx: ConstraintContext) => boolean | DayEvaluation;
  rangeSemantics: RangeSemantics;
}

/** Max days {@link findSelectable} / {@link nextBlockedAfter} will walk before giving up. */
const DEFAULT_WALK = 366;

/* -------------------------------------------------------------------------- */
/*                            Shared evaluations                              */
/* -------------------------------------------------------------------------- */

function evaluation(reason: DisabledReason, message: string): DayEvaluation {
  return Object.freeze({ selectable: false, reason, message });
}

const SELECTABLE: DayEvaluation = Object.freeze({ selectable: true });
const EVAL_BEFORE_MIN = evaluation('before-min', 'Before the earliest available date');
const EVAL_AFTER_MAX = evaluation('after-max', 'After the latest available date');
const EVAL_NOT_ALLOWED = evaluation('not-in-allowlist', 'Not available');
const EVAL_DISABLED_WEEKDAY = evaluation('disabled-weekday', 'Not available on this day');
const EVAL_BLOCKED_RANGE = evaluation('blocked-range', 'Not available');
const EVAL_DISABLED_DATE = evaluation('disabled-date', 'Not available');
const EVAL_CROSSES_BLOCKED = evaluation('crosses-blocked', 'Includes unavailable dates');
const EVAL_CUSTOM = evaluation('custom', 'Not available');

const EMPTY_NUMBERS: readonly number[] = Object.freeze([]);
const EMPTY_RANGES: readonly CompleteDateRange[] = Object.freeze([]);
const EMPTY_SPANS: readonly number[] = Object.freeze([]);

const NEVER = (): boolean => false;
const ALWAYS = (): boolean => true;

function stayMessage(
  kind: 'Minimum' | 'Maximum',
  count: number,
  semantics: RangeSemantics,
): string {
  const unit = semantics === 'nights' ? 'night' : 'day';
  return `${kind} stay is ${count} ${unit}${count === 1 ? '' : 's'}`;
}

/* -------------------------------------------------------------------------- */
/*                              ISO key memoing                               */
/* -------------------------------------------------------------------------- */

let keyYear = Number.NaN;
let keyMonth = Number.NaN;
let keyDay = Number.NaN;
let keyValue = '';

/**
 * `toISODate` allocates a string; a day is frequently probed twice in a row
 * (blocklist then allowlist), so remember the last one.
 */
function isoKey(date: PlainDate): string {
  if (date.year === keyYear && date.month === keyMonth && date.day === keyDay) return keyValue;
  keyValue = toISODate(date);
  keyYear = date.year;
  keyMonth = date.month;
  keyDay = date.day;
  return keyValue;
}

/* -------------------------------------------------------------------------- */
/*                          Span (interval) matching                          */
/* -------------------------------------------------------------------------- */

/**
 * Ranges are stored as a flat, sorted, merged `[lo, hi, lo, hi, …]` array of
 * inclusive epoch days so membership is a branch-free binary search with no
 * per-lookup allocation — a blocklist of a thousand booked spans stays O(log n).
 */
function mergeSpans(pairs: [number, number][]): readonly number[] {
  const first = pairs[0];
  if (!first) return EMPTY_SPANS;
  pairs.sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  let lo = first[0];
  let hi = first[1];
  for (let index = 1; index < pairs.length; index += 1) {
    const pair = pairs[index];
    if (!pair) continue;
    // `<= hi + 1` also merges spans that merely touch, which keeps the list minimal.
    if (pair[0] <= hi + 1) {
      if (pair[1] > hi) hi = pair[1];
    } else {
      out.push(lo, hi);
      lo = pair[0];
      hi = pair[1];
    }
  }
  out.push(lo, hi);
  return out;
}

function spansContain(spans: readonly number[], day: number): boolean {
  let low = 0;
  let high = spans.length / 2 - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const lo = spans[mid * 2];
    const hi = spans[mid * 2 + 1];
    if (lo === undefined || hi === undefined) return false;
    if (day < lo) high = mid - 1;
    else if (day > hi) low = mid + 1;
    else return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/*                              Option parsing                                */
/* -------------------------------------------------------------------------- */

/** Range objects are detected structurally — by the presence of a `start`/`end` key. */
function isRangeInput(value: unknown): value is DateRangeInput {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Date) &&
    ('start' in value || 'end' in value)
  );
}

/**
 * A one-sided range (`{ start: X }`) is treated as the single day `X` rather than an
 * open-ended span — silently blocking every day to the horizon is never what a
 * half-filled object meant.
 */
function toSpan(input: DateRangeInput): [number, number] | null {
  const start = toPlainDate(input.start);
  const end = toPlainDate(input.end);
  if (!start && !end) return null;
  const a = toEpochDay(start ?? (end as PlainDate));
  const b = toEpochDay(end ?? (start as PlainDate));
  return a <= b ? [a, b] : [b, a];
}

function toCompleteRange(input: DateRangeInput): CompleteDateRange | null {
  const span = toSpan(input);
  if (!span) return null;
  return { start: fromEpochDay(span[0]), end: fromEpochDay(span[1]) };
}

interface CompiledList {
  /** `false` when the option was absent — an *empty* array is a configured, empty list. */
  readonly configured: boolean;
  /** `true` when the compiled list can never match, so callers can skip it entirely. */
  readonly never: boolean;
  readonly test: (date: PlainDate) => boolean;
}

const NOT_CONFIGURED: CompiledList = { configured: false, never: true, test: NEVER };

/**
 * Normalizes a date list into a single predicate: individual dates become a `Set`
 * of ISO keys, `{start,end}` objects become merged epoch-day spans, and a mixed
 * array yields both. A predicate is passed straight through.
 */
function compileList(
  input: DateInput[] | DateRangeInput[] | ((date: PlainDate) => boolean) | undefined,
): CompiledList {
  if (input == null) return NOT_CONFIGURED;
  if (typeof input === 'function') return { configured: true, never: false, test: input };
  if (!Array.isArray(input)) return NOT_CONFIGURED;

  const keys = new Set<string>();
  const pairs: [number, number][] = [];
  for (const entry of input as readonly unknown[]) {
    if (isRangeInput(entry)) {
      const span = toSpan(entry);
      if (span) pairs.push(span);
    } else {
      const date = toPlainDate(entry as DateInput);
      if (date) keys.add(toISODate(date));
    }
  }
  const spans = mergeSpans(pairs);

  if (keys.size === 0 && spans.length === 0) return { configured: true, never: true, test: NEVER };
  if (spans.length === 0)
    return { configured: true, never: false, test: (date) => keys.has(isoKey(date)) };
  if (keys.size === 0) {
    return {
      configured: true,
      never: false,
      test: (date) => spansContain(spans, toEpochDay(date)),
    };
  }
  return {
    configured: true,
    never: false,
    test: (date) => keys.has(isoKey(date)) || spansContain(spans, toEpochDay(date)),
  };
}

function weekdayMask(days: readonly number[] | undefined, includeWeekends: boolean): number {
  let mask = includeWeekends ? (1 << 0) | (1 << 6) : 0;
  if (days) {
    for (const day of days) {
      if (!Number.isFinite(day)) continue;
      const normalized = ((Math.trunc(day) % 7) + 7) % 7;
      mask |= 1 << normalized;
    }
  }
  return mask;
}

function maskToDays(mask: number): readonly number[] {
  if (mask === 0) return EMPTY_NUMBERS;
  const out: number[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    if ((mask & (1 << weekday)) !== 0) out.push(weekday);
  }
  return out;
}

/** `undefined`/invalid → `null`; anything else is coerced to a non-negative integer. */
function positiveInt(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.trunc(value));
}

/* -------------------------------------------------------------------------- */
/*                          Internals (fast lookups)                          */
/* -------------------------------------------------------------------------- */

interface Internals {
  readonly dowMask: number;
  readonly isBlockedRange: (date: PlainDate) => boolean;
  /** Blocklist ∪ past/future window — everything `isDisabled` covers except weekdays/blocked ranges. */
  readonly isBlocklisted: (date: PlainDate) => boolean;
  /** `false` when nothing except `minDate`/`maxDate` can reject a day — lets the walkers skip entirely. */
  readonly hasDayRules: boolean;
  /**
   * Pre-built so the hot path never formats a message. Unread when the matching
   * bound is `null`, since `evaluateSpan` checks the bound before reaching for it.
   */
  readonly minNightsEval: DayEvaluation;
  readonly maxNightsEval: DayEvaluation;
}

const INTERNALS = new WeakMap<ResolvedConstraints, Internals>();

/**
 * Rebuilds the fast lookups for a `ResolvedConstraints` this module did not create
 * (hand-written objects, structured clones). Conservative: it cannot tell whether the
 * supplied predicates are trivial, so it assumes they can reject.
 */
function deriveInternals(c: ResolvedConstraints): Internals {
  const pairs: [number, number][] = [];
  for (const range of c.blockedRanges) {
    const span = toSpan(range);
    if (span) pairs.push(span);
  }
  const spans = mergeSpans(pairs);
  return {
    dowMask: weekdayMask(c.disabledDaysOfWeek, false),
    isBlockedRange: spans.length === 0 ? NEVER : (date) => spansContain(spans, toEpochDay(date)),
    // A superset (it also covers weekdays and blocked ranges), which is harmless:
    // evaluateBase checks those first, so the reported reason stays correct.
    isBlocklisted: c.isDisabled,
    hasDayRules: true,
    minNightsEval:
      c.minNights === null
        ? EVAL_CUSTOM
        : evaluation('min-nights', stayMessage('Minimum', c.minNights, c.rangeSemantics)),
    maxNightsEval:
      c.maxNights === null
        ? EVAL_CUSTOM
        : evaluation('max-nights', stayMessage('Maximum', c.maxNights, c.rangeSemantics)),
  };
}

function internalsFor(c: ResolvedConstraints): Internals {
  let internals = INTERNALS.get(c);
  if (!internals) {
    internals = deriveInternals(c);
    INTERNALS.set(c, internals);
  }
  return internals;
}

/* -------------------------------------------------------------------------- */
/*                             resolveConstraints                             */
/* -------------------------------------------------------------------------- */

/**
 * Compiles user-facing options into render-hot-path predicates. Call it once per
 * options change, never per cell.
 *
 * `disablePast`/`disableFuture` are resolved against the supplied `today` (never
 * `new Date()`, so tests and server rendering stay deterministic) and are inclusive:
 * today itself remains selectable. Both fold into `minDate`/`maxDate` so every walker
 * can early-exit on a numeric bound instead of probing predicates.
 */
export function resolveConstraints(
  options: DateConstraints & { rangeSemantics?: RangeSemantics },
  today: PlainDate,
): ResolvedConstraints {
  const rangeSemantics: RangeSemantics = options.rangeSemantics === 'days' ? 'days' : 'nights';

  let minDate = toPlainDate(options.minDate);
  let maxDate = toPlainDate(options.maxDate);
  const pastCutoff = options.disablePast ? today : null;
  const futureCutoff = options.disableFuture ? today : null;
  if (pastCutoff) minDate = maxOf(minDate, pastCutoff);
  if (futureCutoff) maxDate = minOf(maxDate, futureCutoff);

  const dowMask = weekdayMask(options.disabledDaysOfWeek, options.disableWeekends === true);

  const blockedPairs: [number, number][] = [];
  const blockedRanges: CompleteDateRange[] = [];
  if (options.blockedRanges) {
    for (const input of options.blockedRanges) {
      const range = toCompleteRange(input);
      if (!range) continue;
      blockedRanges.push(range);
      blockedPairs.push([toEpochDay(range.start), toEpochDay(range.end)]);
    }
    blockedRanges.sort((a, b) => toEpochDay(a.start) - toEpochDay(b.start));
  }
  const blockedSpans = mergeSpans(blockedPairs);
  const isBlockedRange =
    blockedSpans.length === 0
      ? NEVER
      : (date: PlainDate) => spansContain(blockedSpans, toEpochDay(date));

  const blocklist = compileList(options.disabledDates);
  const allowlist = compileList(options.enabledDates);

  const isBlocklisted: (date: PlainDate) => boolean =
    pastCutoff || futureCutoff
      ? (date) =>
          (pastCutoff !== null && isBefore(date, pastCutoff)) ||
          (futureCutoff !== null && isAfter(date, futureCutoff)) ||
          blocklist.test(date)
      : blocklist.test;

  const isDisabled = (date: PlainDate): boolean => {
    if (dowMask !== 0 && (dowMask & (1 << getWeekday(date))) !== 0) return true;
    if (isBlockedRange(date)) return true;
    return isBlocklisted(date);
  };

  const isAllowed: (date: PlainDate) => boolean = allowlist.configured ? allowlist.test : ALWAYS;

  const minNights = positiveInt(options.minNights);
  const maxNights = positiveInt(options.maxNights);

  const resolved: ResolvedConstraints = {
    minDate,
    maxDate,
    isDisabled,
    isAllowed,
    blockedRanges: blockedRanges.length === 0 ? EMPTY_RANGES : blockedRanges,
    disabledDaysOfWeek: maskToDays(dowMask),
    minNights,
    maxNights,
    minSelections: positiveInt(options.minSelections),
    maxSelections: positiveInt(options.maxSelections),
    rollingSelection: options.rollingSelection === true,
    preventCrossingBlocked: options.preventCrossingBlocked !== false,
    custom: options.isDateUnavailable,
    rangeSemantics,
  };

  INTERNALS.set(resolved, {
    dowMask,
    isBlockedRange,
    isBlocklisted,
    // An empty `disabledDates: []` (a list that has not loaded yet) must not force the
    // walkers onto their slow path; an empty *allowlist* still rejects every day.
    hasDayRules:
      dowMask !== 0 ||
      blockedSpans.length > 0 ||
      (blocklist.configured && !blocklist.never) ||
      allowlist.configured,
    minNightsEval:
      minNights === null
        ? EVAL_CUSTOM
        : evaluation('min-nights', stayMessage('Minimum', minNights, rangeSemantics)),
    maxNightsEval:
      maxNights === null
        ? EVAL_CUSTOM
        : evaluation('max-nights', stayMessage('Maximum', maxNights, rangeSemantics)),
  });

  return resolved;
}

/** Permissive default used before any options are resolved. Selects everything. */
export const alwaysSelectable: ResolvedConstraints = Object.freeze({
  minDate: null,
  maxDate: null,
  isDisabled: NEVER,
  isAllowed: ALWAYS,
  blockedRanges: EMPTY_RANGES,
  disabledDaysOfWeek: EMPTY_NUMBERS,
  minNights: null,
  maxNights: null,
  minSelections: null,
  maxSelections: null,
  rollingSelection: false,
  preventCrossingBlocked: true,
  rangeSemantics: 'nights',
});

INTERNALS.set(alwaysSelectable, {
  dowMask: 0,
  isBlockedRange: NEVER,
  isBlocklisted: NEVER,
  hasDayRules: false,
  minNightsEval: EVAL_CUSTOM,
  maxNightsEval: EVAL_CUSTOM,
});

/* -------------------------------------------------------------------------- */
/*                                Evaluation                                  */
/* -------------------------------------------------------------------------- */

const RANGE_MODES: readonly SelectionMode[] = ['range', 'week', 'month', 'quarter', 'year'];

function isRangeLikeMode(mode: SelectionMode): boolean {
  return RANGE_MODES.indexOf(mode) !== -1;
}

function spanOf(start: PlainDate, end: PlainDate, semantics: RangeSemantics): number {
  const nights = diffInDays(start, end);
  return semantics === 'days' ? nights + 1 : nights;
}

/** Day rules only — bounds, allowlist, weekday, blocked ranges, blocklist. `null` = passes. */
function evaluateBase(date: PlainDate, c: ResolvedConstraints, i: Internals): DayEvaluation | null {
  const { minDate, maxDate } = c;
  if (minDate && isBefore(date, minDate)) return EVAL_BEFORE_MIN;
  if (maxDate && isAfter(date, maxDate)) return EVAL_AFTER_MAX;
  if (!c.isAllowed(date)) return EVAL_NOT_ALLOWED;
  if (i.dowMask !== 0 && (i.dowMask & (1 << getWeekday(date))) !== 0) return EVAL_DISABLED_WEEKDAY;
  if (i.isBlockedRange(date)) return EVAL_BLOCKED_RANGE;
  if (i.isBlocklisted(date)) return EVAL_DISABLED_DATE;
  return null;
}

/** Same as {@link evaluateBase} minus the bounds — the walkers handle those numerically. */
function isDayRuleBlocked(date: PlainDate, c: ResolvedConstraints, i: Internals): boolean {
  if (!c.isAllowed(date)) return true;
  if (i.dowMask !== 0 && (i.dowMask & (1 << getWeekday(date))) !== 0) return true;
  return i.isBlockedRange(date) || i.isBlocklisted(date);
}

function evaluateCustom(
  date: PlainDate,
  c: ResolvedConstraints,
  ctx: ConstraintContext,
): DayEvaluation | null {
  const custom = c.custom;
  if (!custom) return null;
  const result = custom(date, ctx);
  if (result === true) return EVAL_CUSTOM;
  if (result === false || result == null || typeof result !== 'object') return null;
  if (result.selectable) return null;
  if (result.reason && result.message) return result;
  return {
    selectable: false,
    reason: result.reason ?? 'custom',
    message: result.message ?? EVAL_CUSTOM.message,
  };
}

/**
 * The rules that only exist relative to a pending anchor: minimum/maximum stay and
 * "don't book across someone else's booking".
 *
 * The span is measured in whichever direction it actually runs, so a reverse pick
 * (`allowReverseRange`) is judged on the range it will become, not on a negative length.
 */
function evaluateSpan(
  anchor: PlainDate,
  candidate: PlainDate,
  c: ResolvedConstraints,
  i: Internals,
): DayEvaluation | null {
  const forward = !isBefore(candidate, anchor);
  const lo = forward ? anchor : candidate;
  const hi = forward ? candidate : anchor;
  const nights = diffInDays(lo, hi);

  if (c.minNights !== null || c.maxNights !== null) {
    const span = c.rangeSemantics === 'days' ? nights + 1 : nights;
    if (c.minNights !== null && span < c.minNights) return i.minNightsEval;
    if (c.maxNights !== null && span > c.maxNights) return i.maxNightsEval;
  }

  // Only the days *strictly* between the two ends can be "crossed"; a blocked
  // endpoint is already reported by the base rules with its own reason.
  if (c.preventCrossingBlocked && i.hasDayRules && nights > 1) {
    if (nextBlockedAfter(lo, c, nights - 1)) return EVAL_CROSSES_BLOCKED;
  }
  return null;
}

/**
 * Full evaluation of one day, including the range-relative rules. Called for every
 * rendered cell — the returned objects are shared constants, so a full month costs
 * zero allocations.
 *
 * Check order (first failure wins): `before-min`, `after-max`, `not-in-allowlist`,
 * `disabled-weekday`, `blocked-range`, `disabled-date`, `min-nights`, `max-nights`,
 * `crosses-blocked`, `custom`.
 */
export function evaluateDate(
  date: PlainDate,
  c: ResolvedConstraints,
  ctx: ConstraintContext,
): DayEvaluation {
  const internals = internalsFor(c);
  const base = evaluateBase(date, c, internals);
  if (base) return base;

  const anchor = ctx.anchor;
  if (anchor && ctx.activeField === 'end' && isRangeLikeMode(ctx.mode)) {
    const span = evaluateSpan(anchor, date, c, internals);
    if (span) return span;
  }

  return evaluateCustom(date, c, ctx) ?? SELECTABLE;
}

/** Cheap boolean form of {@link evaluateDate}. */
export function isSelectable(
  date: PlainDate,
  c: ResolvedConstraints,
  ctx: ConstraintContext,
): boolean {
  return evaluateDate(date, c, ctx).selectable === true;
}

/**
 * Validates a whole range: both ends must be selectable days, the length must satisfy
 * the stay bounds and — when `preventCrossingBlocked` is on — nothing unavailable may
 * sit inside it. An incomplete range has nothing to validate yet and passes.
 */
export function evaluateRange(
  range: DateRange,
  c: ResolvedConstraints,
  ctx: ConstraintContext,
): DayEvaluation {
  const { start, end } = normalizeRange(range);
  if (!start || !end) return SELECTABLE;

  const internals = internalsFor(c);
  const startEval = evaluateBase(start, c, internals) ?? evaluateCustom(start, c, ctx);
  if (startEval) return startEval;
  const endEval = evaluateBase(end, c, internals) ?? evaluateCustom(end, c, ctx);
  if (endEval) return endEval;

  return evaluateSpan(start, end, c, internals) ?? SELECTABLE;
}

/**
 * Nearest selectable date walking `direction`. When `from` sits outside the bounds the
 * walk starts at the bound itself, so a focus landing far outside the allowed window
 * still finds the first real candidate instead of exhausting the step budget.
 */
export function findSelectable(
  from: PlainDate,
  c: ResolvedConstraints,
  ctx: ConstraintContext,
  direction: 1 | -1,
): PlainDate | null {
  const step = direction < 0 ? -1 : 1;
  let cursor = from;
  if (step === 1 && c.minDate && isBefore(cursor, c.minDate)) cursor = c.minDate;
  if (step === -1 && c.maxDate && isAfter(cursor, c.maxDate)) cursor = c.maxDate;

  for (let taken = 0; taken <= DEFAULT_WALK; taken += 1) {
    if (step === 1 && c.maxDate && isAfter(cursor, c.maxDate)) return null;
    if (step === -1 && c.minDate && isBefore(cursor, c.minDate)) return null;
    if (isSelectable(cursor, c, ctx)) return cursor;
    cursor = addDays(cursor, step);
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*                              Blocked walkers                               */
/* -------------------------------------------------------------------------- */

/**
 * First unavailable date strictly after `from`, within `limit` days — this is what caps
 * a hover preview so the highlighted range never runs through an unavailable night.
 *
 * Only the base day rules are considered (never `minNights`/`maxNights`, which are
 * properties of the span rather than of a day, and never `custom`, which needs a
 * `ConstraintContext` describing a *pick* — put predicate blocklists in `disabledDates`
 * so preview capping can see them).
 */
export function nextBlockedAfter(
  from: PlainDate,
  c: ResolvedConstraints,
  limit: number = DEFAULT_WALK,
): PlainDate | null {
  const steps = Math.trunc(limit);
  if (!Number.isFinite(steps) || steps < 1) return null;

  const internals = internalsFor(c);
  const start = toEpochDay(from);
  const minDay = c.minDate ? toEpochDay(c.minDate) : null;
  const maxDay = c.maxDate ? toEpochDay(c.maxDate) : null;

  // The bounds are the one rule answerable arithmetically: the first out-of-bounds day
  // after `from` is either the very next day (still before `minDate`) or `maxDate + 1`.
  let boundHit: number | null = null;
  if (minDay !== null && start + 1 < minDay) boundHit = start + 1;
  else if (maxDay !== null) boundHit = maxDay >= start ? maxDay + 1 : start + 1;

  if (!internals.hasDayRules) {
    return boundHit !== null && boundHit - start <= steps ? fromEpochDay(boundHit) : null;
  }

  const cap = start + steps;
  const last = boundHit !== null ? Math.min(cap, boundHit) : cap;
  for (let day = start + 1; day <= last; day += 1) {
    const date = fromEpochDay(day);
    if (day === boundHit || isDayRuleBlocked(date, c, internals)) return date;
  }
  return null;
}

/** Mirror of {@link nextBlockedAfter}, walking backwards. */
export function previousBlockedBefore(
  from: PlainDate,
  c: ResolvedConstraints,
  limit: number = DEFAULT_WALK,
): PlainDate | null {
  const steps = Math.trunc(limit);
  if (!Number.isFinite(steps) || steps < 1) return null;

  const internals = internalsFor(c);
  const start = toEpochDay(from);
  const minDay = c.minDate ? toEpochDay(c.minDate) : null;
  const maxDay = c.maxDate ? toEpochDay(c.maxDate) : null;

  let boundHit: number | null = null;
  if (maxDay !== null && start - 1 > maxDay) boundHit = start - 1;
  else if (minDay !== null) boundHit = minDay <= start ? minDay - 1 : start - 1;

  if (!internals.hasDayRules) {
    return boundHit !== null && start - boundHit <= steps ? fromEpochDay(boundHit) : null;
  }

  const cap = start - steps;
  const last = boundHit !== null ? Math.max(cap, boundHit) : cap;
  for (let day = start - 1; day >= last; day -= 1) {
    const date = fromEpochDay(day);
    if (day === boundHit || isDayRuleBlocked(date, c, internals)) return date;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*                              clampSelection                                */
/* -------------------------------------------------------------------------- */

function clampDates(
  dates: readonly PlainDate[],
  c: ResolvedConstraints,
  ctx: ConstraintContext,
  i: Internals,
): readonly PlainDate[] {
  const kept: PlainDate[] = [];
  for (const date of dates) {
    if (evaluateBase(date, c, i)) continue;
    if (evaluateCustom(date, c, ctx)) continue;
    kept.push(date);
  }
  const max = c.maxSelections;
  if (max !== null && kept.length > max) {
    // Rolling selections evict the oldest picks; otherwise the earliest ones stand.
    return c.rollingSelection ? kept.slice(kept.length - max) : kept.slice(0, max);
  }
  return kept;
}

/** Pulls `end` back to the last day that keeps the range valid. `null` = unsalvageable. */
function shrinkEnd(
  start: PlainDate,
  end: PlainDate,
  c: ResolvedConstraints,
  i: Internals,
): PlainDate | null {
  if (!i.hasDayRules) return end;
  const span = diffInDays(start, end);
  if (span <= 0) return end;

  if (c.preventCrossingBlocked) {
    const blocked = nextBlockedAfter(start, c, span);
    return blocked && isSameOrBefore(blocked, end) ? subDays(blocked, 1) : end;
  }

  // Crossing is explicitly allowed, but the end itself still has to be selectable.
  let cursor = end;
  while (isAfter(cursor, start) && isDayRuleBlocked(cursor, c, i)) cursor = subDays(cursor, 1);
  return cursor;
}

function clampRange(
  range: DateRange,
  c: ResolvedConstraints,
  ctx: ConstraintContext,
  i: Internals,
): DateRange | null {
  const normalized = normalizeRange(range);
  const rawStart = normalized.start;
  const rawEnd = normalized.end;
  if (!rawStart && !rawEnd) return null;

  const { minDate: min, maxDate: max } = c;
  if (rawStart && rawEnd) {
    // A span lying wholly outside the window would collapse onto the bound — that is a
    // different selection than the one asked for, so report "impossible" instead.
    if (min && isBefore(rawEnd, min)) return null;
    if (max && isAfter(rawStart, max)) return null;
  }

  const start = rawStart ? clampDate(rawStart, min, max) : null;
  let end = rawEnd ? clampDate(rawEnd, min, max) : null;

  if (start && end) {
    if (c.maxNights !== null) {
      const maxSpanDays = c.rangeSemantics === 'days' ? c.maxNights - 1 : c.maxNights;
      if (maxSpanDays >= 0 && diffInDays(start, end) > maxSpanDays)
        end = addDays(start, maxSpanDays);
    }
    const shrunk = shrinkEnd(start, end, c, i);
    if (!shrunk) return null;
    end = shrunk;
  }

  const anchor = start ?? end;
  if (anchor && (evaluateBase(anchor, c, i) || evaluateCustom(anchor, c, ctx))) return null;

  if (start && end) {
    if (evaluateBase(end, c, i) || evaluateCustom(end, c, ctx)) return null;
    if (c.minNights !== null && spanOf(start, end, c.rangeSemantics) < c.minNights) return null;
  }
  if (start && end && isAfter(start, end)) return null;

  return { start, end };
}

function sameDates(a: readonly PlainDate[], b: readonly PlainDate[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function buildValue(
  dates: readonly PlainDate[],
  range: DateRange,
  times: SelectionValue['times'],
): SelectionValue {
  return times ? { dates, range, times } : { dates, range };
}

/**
 * Forces a candidate value inside the constraints — used by presets, which produce
 * "ideal" values ("last 30 days", "1 week") that may not fit the configured window.
 *
 * Range ends are clamped into `[minDate, maxDate]`, a range that would cross an
 * unavailable date is shortened to end the day before it, individual dates that fail
 * the day rules are dropped, and `null` comes back when nothing valid survives.
 * The input is never mutated; an untouched value is returned by reference.
 */
export function clampSelection(
  value: SelectionValue,
  c: ResolvedConstraints,
  ctx: ConstraintContext,
): SelectionValue | null {
  const internals = internalsFor(c);
  const dates = clampDates(value.dates, c, ctx, internals);

  if (isRangeLikeMode(ctx.mode)) {
    const range = clampRange(value.range, c, ctx, internals);
    if (!range || (!range.start && !range.end)) return null;
    if (
      range.start === value.range.start &&
      range.end === value.range.end &&
      sameDates(dates, value.dates)
    ) {
      return value;
    }
    return buildValue(dates, range, value.times);
  }

  if (dates.length === 0) return null;
  if (sameDates(dates, value.dates)) return value;
  return buildValue(dates, value.range, value.times);
}
