/**
 * The selection state machine.
 *
 * Every click, Enter press and preset application funnels through
 * {@link applySelection}, a pure reducer: given the current value plus one date,
 * it returns the next value. It deliberately knows nothing about constraints —
 * the engine validates a date *before* calling in here, so this file stays a
 * small, exhaustively testable set of transitions.
 */
import {
  compareDates,
  compareTimes,
  diffInDays,
  eachDayOfInterval,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  isAfter,
  isBefore,
  isPlainDate,
  isSameDay,
  normalizeRange,
  rangeLength,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  toPlainDate,
} from './plain-date';
import type {
  ActiveField,
  ChangeReason,
  DateInput,
  DateRange,
  PlainDate,
  PlainTime,
  RangeSemantics,
  SelectionMode,
  SelectionValue,
  ValueInput,
} from './types';

/* -------------------------------------------------------------------------- */
/*                                   basics                                   */
/* -------------------------------------------------------------------------- */

/** A fresh empty selection. Always a new object — snapshots are compared by value, never by identity. */
export function emptySelection(): SelectionValue {
  return { dates: [], range: { start: null, end: null } };
}

/** Modes whose value lives in `range` rather than in `dates`. */
function isRangeMode(mode: SelectionMode): boolean {
  return mode === 'range' || isUnitMode(mode);
}

/** Modes where one click selects a whole calendar unit. */
function isUnitMode(mode: SelectionMode): mode is 'week' | 'month' | 'quarter' | 'year' {
  return mode === 'week' || mode === 'month' || mode === 'quarter' || mode === 'year';
}

export function isSelectionEmpty(value: SelectionValue): boolean {
  return value.dates.length === 0 && !value.range.start && !value.range.end;
}

/** "Complete" means the mode has everything it needs — both ends of a range, at least one date otherwise. */
export function isSelectionComplete(value: SelectionValue, mode: SelectionMode): boolean {
  if (isRangeMode(mode)) return !!value.range.start && !!value.range.end;
  return value.dates.length > 0;
}

/**
 * Value equality. `times` participate only when *both* sides carry them, so a
 * value that has not yet been through the time plugin still matches one that has.
 */
export function selectionEquals(a: SelectionValue, b: SelectionValue): boolean {
  if (a === b) return true;
  if (a.dates.length !== b.dates.length) return false;
  for (let i = 0; i < a.dates.length; i += 1) {
    const left = a.dates[i];
    const right = b.dates[i];
    if (!left || !right || compareDates(left, right) !== 0) return false;
  }
  if (!sameDate(a.range.start, b.range.start) || !sameDate(a.range.end, b.range.end)) return false;
  if (a.times && b.times) {
    return sameTime(a.times.start, b.times.start) && sameTime(a.times.end, b.times.end);
  }
  return true;
}

function sameDate(a: PlainDate | null, b: PlainDate | null): boolean {
  if (a === b) return true;
  return !!a && !!b && compareDates(a, b) === 0;
}

function sameTime(a: PlainTime | null, b: PlainTime | null): boolean {
  if (a === b) return true;
  return !!a && !!b && compareTimes(a, b) === 0;
}

/** Nights/days for range modes, number of picked dates otherwise. Drives the duration badge. */
export function selectionDuration(
  value: SelectionValue,
  mode: SelectionMode,
  semantics: RangeSemantics,
): number {
  if (isRangeMode(mode)) return rangeLength(value.range, semantics);
  return value.dates.length;
}

/**
 * The discrete dates a selection refers to. Range modes return their *endpoints*
 * (one entry for a same-day range), not every day in between — expand with
 * `eachDayOfInterval` when you need the full span.
 */
export function selectionDates(value: SelectionValue, mode: SelectionMode): PlainDate[] {
  if (isRangeMode(mode)) {
    const { start, end } = value.range;
    if (start && end) return isSameDay(start, end) ? [start] : [start, end];
    if (start) return [start];
    if (end) return [end];
    return [];
  }
  return [...value.dates];
}

/** Attach (or drop, when `times` is nullish) wall-clock times without touching the dates. */
export function withTimes(value: SelectionValue, times: SelectionValue['times']): SelectionValue {
  if (!times) return { dates: value.dates, range: { ...value.range } };
  return {
    dates: value.dates,
    range: { ...value.range },
    times: { start: times.start ?? null, end: times.end ?? null },
  };
}

/* -------------------------------------------------------------------------- */
/*                              value normalization                           */
/* -------------------------------------------------------------------------- */

interface RawInput {
  dates: PlainDate[];
  range: DateRange;
  times?: SelectionValue['times'];
}

/**
 * Accepts every shape a host app might hand us — a date, a list, `{start,end}`,
 * a full {@link SelectionValue} or `null` — and produces the canonical value for
 * `mode`. Reversed ranges are righted and date lists are sorted and de-duplicated,
 * so downstream code never has to re-check either.
 */
export function normalizeValueInput(input: ValueInput, mode: SelectionMode): SelectionValue {
  const raw = readValueInput(input);
  const dates = sortUnique(raw.dates);

  if (isRangeMode(mode)) {
    let range = normalizeRange(raw.range);
    if (!range.start && !range.end && dates.length > 0) {
      const first = dates[0] ?? null;
      const last = dates.length > 1 ? (dates[dates.length - 1] ?? null) : null;
      range = { start: first, end: last };
    }
    return attachTimes({ dates: [], range }, raw.times);
  }

  if (mode === 'single') {
    const date = dates[0] ?? raw.range.start ?? raw.range.end ?? null;
    return attachTimes({ dates: date ? [date] : [], range: { start: null, end: null } }, raw.times);
  }

  let list = dates;
  if (list.length === 0) {
    // A range handed to `multiple` mode means "every day inside it"; the helper
    // caps absurd spans at 10 000 days so a bad input cannot lock the UI.
    const { start, end } = normalizeRange(raw.range);
    if (start && end) list = eachDayOfInterval(start, end);
    else if (start) list = [start];
    else if (end) list = [end];
  }
  return attachTimes({ dates: list, range: { start: null, end: null } }, raw.times);
}

function attachTimes(value: SelectionValue, times: SelectionValue['times']): SelectionValue {
  if (!times) return value;
  return { ...value, times: { start: times.start ?? null, end: times.end ?? null } };
}

function readValueInput(input: ValueInput): RawInput {
  if (input == null || input === '') return { dates: [], range: { start: null, end: null } };

  if (Array.isArray(input)) {
    return { dates: coerceAll(input), range: { start: null, end: null } };
  }

  if (typeof input === 'object' && !(input instanceof Date)) {
    if (isPlainDate(input)) {
      const date = toPlainDate(input);
      return { dates: date ? [date] : [], range: { start: null, end: null } };
    }
    const candidate = input as {
      dates?: readonly unknown[];
      range?: { start?: unknown; end?: unknown };
      times?: SelectionValue['times'];
      start?: unknown;
      end?: unknown;
    };
    if (
      Array.isArray(candidate.dates) ||
      (candidate.range && typeof candidate.range === 'object')
    ) {
      return {
        dates: coerceAll(candidate.dates ?? []),
        range: {
          start: toPlainDate((candidate.range?.start ?? null) as DateInput),
          end: toPlainDate((candidate.range?.end ?? null) as DateInput),
        },
        times: candidate.times,
      };
    }
    if ('start' in candidate || 'end' in candidate) {
      return {
        dates: [],
        range: {
          start: toPlainDate((candidate.start ?? null) as DateInput),
          end: toPlainDate((candidate.end ?? null) as DateInput),
        },
      };
    }
    return { dates: [], range: { start: null, end: null } };
  }

  const single = toPlainDate(input);
  return { dates: single ? [single] : [], range: { start: null, end: null } };
}

function coerceAll(list: readonly unknown[]): PlainDate[] {
  const out: PlainDate[] = [];
  for (const item of list) {
    const date = toPlainDate(item as DateInput);
    if (date) out.push(date);
  }
  return out;
}

function sortUnique(dates: readonly PlainDate[]): PlainDate[] {
  const sorted = [...dates].sort(compareDates);
  const out: PlainDate[] = [];
  for (const date of sorted) {
    const previous = out[out.length - 1];
    if (!previous || compareDates(previous, date) !== 0) out.push(date);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                                  reducer                                   */
/* -------------------------------------------------------------------------- */

export interface SelectionRequest {
  mode: SelectionMode;
  value: SelectionValue;
  date: PlainDate;
  activeField: ActiveField;
  anchor: PlainDate | null;
  firstDayOfWeek: number;
  options: {
    allowReverseRange: boolean;
    toggleOnReselect: boolean;
    resetOnComplete: boolean;
    autoAdvance: boolean;
    maxSelections: number | null;
    rollingSelection: boolean;
    rangeSemantics: RangeSemantics;
  };
}

export interface SelectionResult {
  value: SelectionValue;
  reason: ChangeReason;
  isComplete: boolean;
  activeField: ActiveField;
  anchor: PlainDate | null;
  changed: boolean;
}

/**
 * Pure state transition for one click/Enter on `date`. Constraint checks happen
 * in the engine BEFORE this: a request that reaches here is always legal.
 */
export function applySelection(request: SelectionRequest): SelectionResult {
  switch (request.mode) {
    case 'single':
      return applySingle(request);
    case 'multiple':
      return applyMultiple(request);
    case 'range':
      return applyRange(request);
    default:
      return applyUnit(request);
  }
}

/** Builds the result and derives `changed` from value equality, so no branch can lie about it. */
function finish(
  request: SelectionRequest,
  next: SelectionValue,
  reason: ChangeReason,
  activeField: ActiveField,
  anchor: PlainDate | null,
): SelectionResult {
  return {
    value: next,
    reason,
    isComplete: isSelectionComplete(next, request.mode),
    activeField,
    anchor,
    changed: !selectionEquals(request.value, next),
  };
}

/** Times survive every transition — re-picking a date should never silently reset the user's hours. */
function carryTimes(next: SelectionValue, from: SelectionValue): SelectionValue {
  return from.times ? { ...next, times: from.times } : next;
}

function applySingle(request: SelectionRequest): SelectionResult {
  const { value, date, options } = request;
  const current = value.dates[0];

  if (current && isSameDay(current, date)) {
    if (options.toggleOnReselect) {
      return finish(request, carryTimes(emptySelection(), value), 'deselect', 'start', null);
    }
    // Re-select: the value is untouched, so `changed` resolves to false.
    return finish(request, value, 'select', 'start', null);
  }

  const next = carryTimes({ dates: [date], range: { start: null, end: null } }, value);
  return finish(request, next, 'select', 'start', null);
}

function applyMultiple(request: SelectionRequest): SelectionResult {
  const { value, date, options } = request;
  const index = value.dates.findIndex((d) => isSameDay(d, date));

  if (index >= 0) {
    // `toggleOnReselect` is documented as covering single *and* multiple; turning
    // it off makes picks additive-only.
    if (!options.toggleOnReselect) return finish(request, value, 'select', 'start', null);
    const remaining = value.dates.filter((_, i) => i !== index);
    const next = carryTimes({ dates: remaining, range: { start: null, end: null } }, value);
    return finish(request, next, 'deselect', 'start', null);
  }

  const max = options.maxSelections;
  if (max !== null && max <= 0) return finish(request, value, 'select', 'start', null);

  let kept: PlainDate[] = [...value.dates];
  if (max !== null && kept.length >= max) {
    if (!options.rollingSelection) return finish(request, value, 'select', 'start', null);
    while (kept.length >= max) kept = dropFurthest(kept, date);
  }

  const next = carryTimes(
    { dates: sortUnique([...kept, date]), range: { start: null, end: null } },
    value,
  );
  return finish(request, next, 'select', 'start', null);
}

/**
 * Rolling eviction without extra state.
 *
 * True insertion order would need a side channel the reducer does not own, so we
 * evict the entry furthest (in days) from the new pick instead. For the
 * calendar-local picking people actually do, that is the same entry an
 * insertion-order queue would have dropped, and it keeps `applySelection` pure.
 * `dates` is kept sorted ascending, so equal distances resolve to the earlier date.
 */
function dropFurthest(dates: readonly PlainDate[], from: PlainDate): PlainDate[] {
  let index = -1;
  let furthest = -1;
  for (let i = 0; i < dates.length; i += 1) {
    const date = dates[i];
    if (!date) continue;
    const distance = Math.abs(diffInDays(from, date));
    if (distance > furthest) {
      furthest = distance;
      index = i;
    }
  }
  return index < 0 ? [...dates] : dates.filter((_, i) => i !== index);
}

function applyRange(request: SelectionRequest): SelectionResult {
  const { value, date, activeField, anchor, options } = request;
  const { start, end } = value.range;

  if (start && end) {
    // A same-day range is a legitimate day-trip, so only an explicit re-click on
    // a *collapsed* range clears it.
    if (options.toggleOnReselect && isSameDay(start, date) && isSameDay(end, date)) {
      return finish(request, carryTimes(emptySelection(), value), 'deselect', 'start', null);
    }
    if (options.resetOnComplete) return startRange(request, date);
    return moveNearestEdge(request, start, end, date);
  }

  // The anchor is the authority on where a half-drawn range began; fall back to
  // whatever start survived in the value. With `autoAdvance` off the host drives
  // `activeField` manually, but a pending anchor still means this click closes
  // the range — otherwise clicking alone could never complete one.
  const openStart = anchor ?? start;
  const isEndPick = openStart !== null && (activeField === 'end' || !options.autoAdvance);
  if (!isEndPick) return startRange(request, date);

  if (isBefore(date, openStart)) {
    if (!options.allowReverseRange) return startRange(request, date);
    const reversed = carryTimes({ dates: [], range: { start: date, end: openStart } }, value);
    return finish(request, reversed, 'range-end', 'start', null);
  }

  const next = carryTimes({ dates: [], range: { start: openStart, end: date } }, value);
  return finish(request, next, 'range-end', 'start', null);
}

function startRange(request: SelectionRequest, date: PlainDate): SelectionResult {
  const next = carryTimes({ dates: [], range: { start: date, end: null } }, request.value);
  return finish(request, next, 'range-start', request.options.autoAdvance ? 'end' : 'start', date);
}

/**
 * `resetOnComplete: false` behaviour — a click on a finished range nudges the
 * closer edge instead of throwing the range away. Outside the range only one
 * edge can sensibly move; inside it, proximity decides (ties go to the start).
 */
function moveNearestEdge(
  request: SelectionRequest,
  start: PlainDate,
  end: PlainDate,
  date: PlainDate,
): SelectionResult {
  const moveStart = isBefore(date, start)
    ? true
    : isAfter(date, end)
      ? false
      : Math.abs(diffInDays(start, date)) <= Math.abs(diffInDays(end, date));

  const moved = moveStart ? { start: date, end } : { start, end: date };
  const next = carryTimes({ dates: [], range: normalizeRange(moved) }, request.value);
  return finish(
    request,
    next,
    moveStart ? 'range-start' : 'range-end',
    moveStart ? 'start' : 'end',
    null,
  );
}

function applyUnit(request: SelectionRequest): SelectionResult {
  const { mode, value, date, firstDayOfWeek, options } = request;
  const unit = unitRangeFor(date, mode, firstDayOfWeek);
  const current = value.range;
  const sameUnit = isSameDay(current.start, unit.start) && isSameDay(current.end, unit.end);

  if (sameUnit && options.toggleOnReselect) {
    return finish(request, carryTimes(emptySelection(), value), 'deselect', 'start', null);
  }

  const next = carryTimes({ dates: [], range: unit }, value);
  return finish(request, next, 'select', 'start', null);
}

/* -------------------------------------------------------------------------- */
/*                                  preview                                   */
/* -------------------------------------------------------------------------- */

/** The whole calendar unit a click on `date` selects. Non-unit modes collapse to the day itself. */
export function unitRangeFor(
  date: PlainDate,
  mode: SelectionMode,
  firstDayOfWeek: number,
): DateRange {
  switch (mode) {
    case 'week':
      return { start: startOfWeek(date, firstDayOfWeek), end: endOfWeek(date, firstDayOfWeek) };
    case 'month':
      return { start: startOfMonth(date), end: endOfMonth(date) };
    case 'quarter':
      return { start: startOfQuarter(date), end: endOfQuarter(date) };
    case 'year':
      return { start: startOfYear(date), end: endOfYear(date) };
    default:
      return { start: date, end: date };
  }
}

/**
 * The band to highlight under the cursor. Unit modes light up the whole week /
 * month / quarter / year, which is what makes them feel deliberate; range mode
 * only previews while an end pick is pending, and stays dark on a backwards
 * hover that would restart the range rather than reverse it.
 */
export function computePreviewRange(
  anchor: PlainDate | null,
  hovered: PlainDate | null,
  opts: {
    mode: SelectionMode;
    activeField: ActiveField;
    allowReverseRange: boolean;
    firstDayOfWeek: number;
  },
): DateRange | null {
  if (!hovered) return null;
  if (isUnitMode(opts.mode)) return unitRangeFor(hovered, opts.mode, opts.firstDayOfWeek);
  if (opts.mode !== 'range') return null;
  if (!anchor || opts.activeField !== 'end') return null;

  if (isBefore(hovered, anchor)) {
    return opts.allowReverseRange ? { start: hovered, end: anchor } : null;
  }
  return { start: anchor, end: hovered };
}
