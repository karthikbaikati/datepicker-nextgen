import { describe, expect, it, vi } from 'vitest';
import {
  alwaysSelectable,
  clampSelection,
  evaluateDate,
  evaluateRange,
  findSelectable,
  isSelectable,
  nextBlockedAfter,
  previousBlockedBefore,
  resolveConstraints,
} from '../src/core/constraints';
import { emptySelection } from '../src/core/selection';
import { plainDate, toISODate } from '../src/core/plain-date';
import type { ResolvedConstraints } from '../src/core/constraints';
import type {
  ConstraintContext,
  DateConstraints,
  DateInput,
  DateRangeInput,
  DisabledReason,
  PlainDate,
  RangeSemantics,
  SelectionValue,
} from '../src/core/types';

/** 2026-09-04 is a Friday. */
const TODAY = plainDate(2026, 9, 4);

const sep = (day: number): PlainDate => plainDate(2026, 9, day);
const iso = (date: PlainDate | null | undefined): string | null => (date ? toISODate(date) : null);

const ctx = (over: Partial<ConstraintContext> = {}): ConstraintContext => ({
  mode: 'range',
  today: TODAY,
  value: emptySelection(),
  activeField: 'start',
  anchor: null,
  ...over,
});

const resolve = (
  options: DateConstraints & { rangeSemantics?: RangeSemantics } = {},
): ResolvedConstraints => resolveConstraints(options, TODAY);

const reasonFor = (
  date: PlainDate,
  constraints: ResolvedConstraints,
  context = ctx(),
): DisabledReason | 'selectable' => {
  const evaluation = evaluateDate(date, constraints, context);
  return evaluation.selectable ? 'selectable' : (evaluation.reason ?? 'custom');
};

const rangeValue = (start: PlainDate | null, end: PlainDate | null): SelectionValue => ({
  dates: [],
  range: { start, end },
});

describe('constraints: reason codes', () => {
  const constraints = resolve({
    minDate: sep(5),
    maxDate: sep(25),
    blockedRanges: [{ start: sep(10), end: sep(12) }],
    disabledDates: [sep(20)],
    disabledDaysOfWeek: [3],
  });

  it('reports before-min for a date under minDate', () => {
    expect(reasonFor(sep(4), constraints)).toBe('before-min');
    expect(evaluateDate(sep(4), constraints, ctx()).message).toBe(
      'Before the earliest available date',
    );
  });

  it('reports after-max for a date over maxDate', () => {
    expect(reasonFor(sep(26), constraints)).toBe('after-max');
    expect(evaluateDate(sep(26), constraints, ctx()).message).toBe(
      'After the latest available date',
    );
  });

  it('reports disabled-weekday for a blocked day of the week', () => {
    // 2026-09-09 is a Wednesday.
    expect(reasonFor(sep(9), constraints)).toBe('disabled-weekday');
    expect(reasonFor(sep(16), constraints)).toBe('disabled-weekday');
  });

  it('reports blocked-range for a day inside a blocked span', () => {
    expect(reasonFor(sep(10), constraints)).toBe('blocked-range');
    expect(reasonFor(sep(11), constraints)).toBe('blocked-range');
    expect(reasonFor(sep(12), constraints)).toBe('blocked-range');
    expect(reasonFor(sep(13), constraints)).toBe('selectable');
  });

  it('reports disabled-date for a blocklisted individual day', () => {
    expect(reasonFor(sep(20), constraints)).toBe('disabled-date');
  });

  it('reports not-in-allowlist when an allowlist is configured', () => {
    const allowlisted = resolve({ enabledDates: [sep(4), sep(5)] });
    expect(reasonFor(sep(4), allowlisted)).toBe('selectable');
    expect(reasonFor(sep(6), allowlisted)).toBe('not-in-allowlist');
  });

  it('reports custom last, from the isDateUnavailable escape hatch', () => {
    const custom = resolve({ isDateUnavailable: (date) => date.day === 7 });
    expect(reasonFor(sep(7), custom)).toBe('custom');
    expect(reasonFor(sep(8), custom)).toBe('selectable');
  });

  it('applies the documented check order when several rules would fire', () => {
    const overlapping = resolve({
      minDate: sep(10),
      maxDate: sep(20),
      enabledDates: [sep(15)],
      disabledDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      blockedRanges: [{ start: sep(1), end: sep(30) }],
      disabledDates: [sep(15)],
      isDateUnavailable: () => true,
    });
    // Bounds win over everything.
    expect(reasonFor(sep(9), overlapping)).toBe('before-min');
    expect(reasonFor(sep(21), overlapping)).toBe('after-max');
    // Inside the bounds the allowlist is consulted before the weekday mask.
    expect(reasonFor(sep(14), overlapping)).toBe('not-in-allowlist');
    // An allowlisted day still trips the weekday mask before the blocked range.
    expect(reasonFor(sep(15), overlapping)).toBe('disabled-weekday');
  });

  it('prefers blocked-range over disabled-date for the same day', () => {
    const both = resolve({
      blockedRanges: [{ start: sep(10), end: sep(10) }],
      disabledDates: [sep(10)],
    });
    expect(reasonFor(sep(10), both)).toBe('blocked-range');
  });

  it('honours a DayEvaluation returned by isDateUnavailable verbatim', () => {
    const custom = resolve({
      isDateUnavailable: (date) =>
        date.day === 7 ? { selectable: false, reason: 'max-span', message: 'Too long' } : false,
    });
    expect(evaluateDate(sep(7), custom, ctx())).toEqual({
      selectable: false,
      reason: 'max-span',
      message: 'Too long',
    });
    expect(evaluateDate(sep(8), custom, ctx()).selectable).toBe(true);
  });

  it('lets isDateUnavailable explicitly re-enable a day it is asked about', () => {
    const custom = resolve({ isDateUnavailable: () => ({ selectable: true }) });
    expect(evaluateDate(sep(7), custom, ctx()).selectable).toBe(true);
  });

  it('passes the constraint context through to isDateUnavailable', () => {
    const spy = vi.fn(() => false);
    const custom = resolve({ isDateUnavailable: spy });
    const context = ctx({ mode: 'single', activeField: 'end', anchor: sep(2) });
    evaluateDate(sep(7), custom, context);
    expect(spy).toHaveBeenCalledWith(sep(7), context);
  });

  it('exposes a cheap boolean form that agrees with evaluateDate', () => {
    expect(isSelectable(sep(13), constraints, ctx())).toBe(true);
    expect(isSelectable(sep(10), constraints, ctx())).toBe(false);
  });
});

describe('constraints: convenience options', () => {
  it('folds disablePast into minDate, leaving today selectable', () => {
    const constraints = resolve({ disablePast: true });
    expect(reasonFor(TODAY, constraints)).toBe('selectable');
    expect(reasonFor(plainDate(2026, 9, 3), constraints)).toBe('before-min');
    expect(iso(constraints.minDate)).toBe('2026-09-04');
  });

  it('folds disableFuture into maxDate, leaving today selectable', () => {
    const constraints = resolve({ disableFuture: true });
    expect(reasonFor(TODAY, constraints)).toBe('selectable');
    expect(reasonFor(plainDate(2026, 9, 5), constraints)).toBe('after-max');
    expect(iso(constraints.maxDate)).toBe('2026-09-04');
  });

  it('keeps the tighter of disablePast and an explicit minDate', () => {
    expect(iso(resolve({ disablePast: true, minDate: sep(1) }).minDate)).toBe('2026-09-04');
    expect(iso(resolve({ disablePast: true, minDate: sep(10) }).minDate)).toBe('2026-09-10');
  });

  it('turns disableWeekends into Saturday and Sunday', () => {
    const constraints = resolve({ disableWeekends: true });
    expect([...constraints.disabledDaysOfWeek]).toEqual([0, 6]);
    expect(reasonFor(sep(5), constraints)).toBe('disabled-weekday');
    expect(reasonFor(sep(6), constraints)).toBe('disabled-weekday');
    expect(reasonFor(sep(7), constraints)).toBe('selectable');
  });

  it('merges disableWeekends with explicit disabledDaysOfWeek and normalizes them', () => {
    const constraints = resolve({ disableWeekends: true, disabledDaysOfWeek: [3, 10, -1] });
    expect([...constraints.disabledDaysOfWeek]).toEqual([0, 3, 6]);
  });

  it('accepts date strings and Date objects for the bounds', () => {
    const constraints = resolveConstraints(
      { minDate: '2026-09-05', maxDate: new Date(2026, 8, 25) },
      TODAY,
    );
    expect(iso(constraints.minDate)).toBe('2026-09-05');
    expect(iso(constraints.maxDate)).toBe('2026-09-25');
  });

  it('coerces the numeric limits and drops the invalid ones', () => {
    const constraints = resolve({
      minNights: 2.9,
      maxNights: -4,
      minSelections: 1,
      maxSelections: 3,
      rollingSelection: true,
    });
    expect(constraints.minNights).toBe(2);
    expect(constraints.maxNights).toBe(0);
    expect(constraints.minSelections).toBe(1);
    expect(constraints.maxSelections).toBe(3);
    expect(constraints.rollingSelection).toBe(true);
    expect(resolve({}).minNights).toBeNull();
    expect(resolve({}).rollingSelection).toBe(false);
  });

  it('defaults preventCrossingBlocked to true and only false disables it', () => {
    expect(resolve({}).preventCrossingBlocked).toBe(true);
    expect(resolve({ preventCrossingBlocked: false }).preventCrossingBlocked).toBe(false);
  });
});

describe('constraints: blocklists and allowlists', () => {
  it('accepts an array of ranges as a blocklist', () => {
    const constraints = resolve({
      disabledDates: [
        { start: sep(10), end: sep(12) },
        { start: sep(20), end: sep(21) },
      ],
    });
    expect(reasonFor(sep(9), constraints)).toBe('selectable');
    for (const day of [10, 11, 12, 20, 21]) {
      expect(reasonFor(sep(day), constraints)).toBe('disabled-date');
    }
    expect(reasonFor(sep(13), constraints)).toBe('selectable');
    expect(reasonFor(sep(22), constraints)).toBe('selectable');
  });

  it('accepts a mixed array of single dates and ranges', () => {
    const constraints = resolve({
      disabledDates: [sep(2), { start: sep(10), end: sep(11) }, '2026-09-15'] as DateInput[],
    });
    expect(reasonFor(sep(2), constraints)).toBe('disabled-date');
    expect(reasonFor(sep(11), constraints)).toBe('disabled-date');
    expect(reasonFor(sep(15), constraints)).toBe('disabled-date');
    expect(reasonFor(sep(16), constraints)).toBe('selectable');
  });

  it('merges overlapping and touching blocked spans without gaps', () => {
    const constraints = resolve({
      blockedRanges: [
        { start: sep(10), end: sep(12) },
        { start: sep(11), end: sep(14) },
        { start: sep(15), end: sep(15) },
      ],
    });
    for (let day = 10; day <= 15; day += 1) {
      expect(reasonFor(sep(day), constraints)).toBe('blocked-range');
    }
    expect(reasonFor(sep(9), constraints)).toBe('selectable');
    expect(reasonFor(sep(16), constraints)).toBe('selectable');
  });

  it('normalizes a reversed blocked range and exposes it sorted', () => {
    const constraints = resolve({
      blockedRanges: [
        { start: sep(20), end: sep(18) },
        { start: sep(3), end: sep(4) },
      ],
    });
    expect(
      constraints.blockedRanges.map((r) => `${toISODate(r.start)}..${toISODate(r.end)}`),
    ).toEqual(['2026-09-03..2026-09-04', '2026-09-18..2026-09-20']);
    expect(reasonFor(sep(19), constraints)).toBe('blocked-range');
  });

  it('treats a one-sided range object as a single day, never an open span', () => {
    const constraints = resolve({ blockedRanges: [{ start: sep(10), end: null }] });
    expect(reasonFor(sep(10), constraints)).toBe('blocked-range');
    expect(reasonFor(sep(11), constraints)).toBe('selectable');
    expect(reasonFor(sep(300), constraints)).toBe('selectable');
  });

  it('accepts a predicate blocklist', () => {
    const constraints = resolve({ disabledDates: (date) => date.day % 2 === 0 });
    expect(reasonFor(sep(4), constraints)).toBe('disabled-date');
    expect(reasonFor(sep(5), constraints)).toBe('selectable');
  });

  it('runs in allowlist mode when enabledDates is present', () => {
    const constraints = resolve({
      enabledDates: [{ start: sep(10), end: sep(12) }, sep(20)] as DateRangeInput[],
    });
    for (const day of [10, 11, 12, 20]) {
      expect(reasonFor(sep(day), constraints)).toBe('selectable');
    }
    for (const day of [9, 13, 19, 21]) {
      expect(reasonFor(sep(day), constraints)).toBe('not-in-allowlist');
    }
  });

  it('rejects everything for an empty allowlist but nothing for an empty blocklist', () => {
    expect(reasonFor(TODAY, resolve({ enabledDates: [] }))).toBe('not-in-allowlist');
    expect(reasonFor(TODAY, resolve({ disabledDates: [] }))).toBe('selectable');
  });

  it('applies the blocklist on top of the allowlist', () => {
    const constraints = resolve({
      enabledDates: [{ start: sep(10), end: sep(20) }],
      disabledDates: [sep(15)],
    });
    expect(reasonFor(sep(14), constraints)).toBe('selectable');
    expect(reasonFor(sep(15), constraints)).toBe('disabled-date');
  });

  it('reports isDisabled / isAllowed independently of the bounds', () => {
    const constraints = resolve({ minDate: sep(10), disabledDates: [sep(2)] });
    expect(constraints.isDisabled(sep(2))).toBe(true);
    expect(constraints.isDisabled(sep(1))).toBe(false);
    expect(constraints.isAllowed(sep(1))).toBe(true);
  });
});

describe('constraints: nights only restrict the end pick', () => {
  const constraints = resolve({ minNights: 2, maxNights: 5 });
  const anchored = ctx({ activeField: 'end', anchor: sep(5) });

  it('leaves every day selectable while the start pick is pending', () => {
    for (const day of [4, 5, 6, 20]) {
      expect(reasonFor(sep(day), constraints)).toBe('selectable');
    }
  });

  it('rejects an end pick shorter than minNights', () => {
    expect(reasonFor(sep(5), constraints, anchored)).toBe('min-nights');
    expect(reasonFor(sep(6), constraints, anchored)).toBe('min-nights');
    expect(evaluateDate(sep(6), constraints, anchored).message).toBe('Minimum stay is 2 nights');
  });

  it('accepts an end pick inside the window and rejects one past maxNights', () => {
    expect(reasonFor(sep(7), constraints, anchored)).toBe('selectable');
    expect(reasonFor(sep(10), constraints, anchored)).toBe('selectable');
    expect(reasonFor(sep(11), constraints, anchored)).toBe('max-nights');
    expect(evaluateDate(sep(11), constraints, anchored).message).toBe('Maximum stay is 5 nights');
  });

  it('measures a backwards end pick on the span it would become', () => {
    expect(reasonFor(sep(4), constraints, anchored)).toBe('min-nights');
    expect(reasonFor(sep(3), constraints, anchored)).toBe('selectable');
    expect(reasonFor(plainDate(2026, 8, 31), constraints, anchored)).toBe('selectable');
    expect(reasonFor(plainDate(2026, 8, 30), constraints, anchored)).toBe('max-nights');
  });

  it('counts inclusively under days semantics', () => {
    const dayCounted = resolve({ minNights: 2, maxNights: 5, rangeSemantics: 'days' });
    expect(reasonFor(sep(5), dayCounted, anchored)).toBe('min-nights');
    expect(reasonFor(sep(6), dayCounted, anchored)).toBe('selectable');
    expect(reasonFor(sep(9), dayCounted, anchored)).toBe('selectable');
    expect(reasonFor(sep(10), dayCounted, anchored)).toBe('max-nights');
    expect(evaluateDate(sep(5), dayCounted, anchored).message).toBe('Minimum stay is 2 days');
  });

  it('ignores the span rules when the active field is still start', () => {
    const startField = ctx({ activeField: 'start', anchor: sep(5) });
    expect(reasonFor(sep(6), constraints, startField)).toBe('selectable');
  });

  it('ignores the span rules outside a range-like mode', () => {
    const single = ctx({ mode: 'single', activeField: 'end', anchor: sep(5) });
    expect(reasonFor(sep(6), constraints, single)).toBe('selectable');
    const multiple = ctx({ mode: 'multiple', activeField: 'end', anchor: sep(5) });
    expect(reasonFor(sep(6), constraints, multiple)).toBe('selectable');
  });

  it('applies the span rules in every unit mode', () => {
    for (const mode of ['range', 'week', 'month', 'quarter', 'year'] as const) {
      expect(
        reasonFor(sep(6), constraints, ctx({ mode, activeField: 'end', anchor: sep(5) })),
      ).toBe('min-nights');
    }
  });
});

describe('constraints: preventCrossingBlocked', () => {
  const constraints = resolve({ blockedRanges: [{ start: sep(10), end: sep(10) }] });
  const anchored = ctx({ activeField: 'end', anchor: sep(8) });

  it('leaves the ends nearer than the blocked night selectable', () => {
    expect(reasonFor(sep(9), constraints, anchored)).toBe('selectable');
    expect(reasonFor(sep(8), constraints, anchored)).toBe('selectable');
  });

  it('still reports the blocked night with its own reason', () => {
    expect(reasonFor(sep(10), constraints, anchored)).toBe('blocked-range');
  });

  it('rejects any end that would span across the blocked night', () => {
    expect(reasonFor(sep(11), constraints, anchored)).toBe('crosses-blocked');
    expect(reasonFor(sep(12), constraints, anchored)).toBe('crosses-blocked');
    expect(evaluateDate(sep(11), constraints, anchored).message).toBe('Includes unavailable dates');
  });

  it('rejects a backwards span across a blocked night too', () => {
    const backwards = ctx({ activeField: 'end', anchor: sep(12) });
    expect(reasonFor(sep(11), constraints, backwards)).toBe('selectable');
    expect(reasonFor(sep(9), constraints, backwards)).toBe('crosses-blocked');
  });

  it('allows the crossing when preventCrossingBlocked is off', () => {
    const permissive = resolve({
      blockedRanges: [{ start: sep(10), end: sep(10) }],
      preventCrossingBlocked: false,
    });
    expect(reasonFor(sep(12), permissive, anchored)).toBe('selectable');
    expect(reasonFor(sep(10), permissive, anchored)).toBe('blocked-range');
  });

  it('treats a disabled weekday inside the span as a crossing', () => {
    // 2026-09-09 is a Wednesday.
    const weekdays = resolve({ disabledDaysOfWeek: [3] });
    expect(reasonFor(sep(10), weekdays, anchored)).toBe('crosses-blocked');
    expect(reasonFor(sep(9), weekdays, anchored)).toBe('disabled-weekday');
  });

  it('never reports a crossing for adjacent days — there is nothing in between', () => {
    const adjacent = resolve({ blockedRanges: [{ start: sep(9), end: sep(9) }] });
    expect(reasonFor(sep(9), adjacent, anchored)).toBe('blocked-range');
    expect(reasonFor(sep(10), adjacent, anchored)).toBe('crosses-blocked');
  });
});

describe('constraints: evaluateRange', () => {
  const constraints = resolve({
    minNights: 3,
    maxNights: 7,
    blockedRanges: [{ start: sep(20), end: sep(20) }],
    minDate: sep(2),
  });

  it('accepts a valid complete range', () => {
    expect(evaluateRange({ start: sep(4), end: sep(9) }, constraints, ctx())).toEqual({
      selectable: true,
    });
  });

  it('rejects a range that is too short or too long', () => {
    expect(evaluateRange({ start: sep(4), end: sep(5) }, constraints, ctx()).reason).toBe(
      'min-nights',
    );
    expect(evaluateRange({ start: sep(4), end: sep(14) }, constraints, ctx()).reason).toBe(
      'max-nights',
    );
  });

  it('rejects a range whose endpoint is itself unavailable', () => {
    expect(evaluateRange({ start: sep(1), end: sep(6) }, constraints, ctx()).reason).toBe(
      'before-min',
    );
    expect(evaluateRange({ start: sep(17), end: sep(20) }, constraints, ctx()).reason).toBe(
      'blocked-range',
    );
  });

  it('rejects a range that contains a blocked day', () => {
    expect(evaluateRange({ start: sep(18), end: sep(22) }, constraints, ctx()).reason).toBe(
      'crosses-blocked',
    );
  });

  it('passes an incomplete range, which has nothing to validate yet', () => {
    expect(evaluateRange({ start: sep(4), end: null }, constraints, ctx()).selectable).toBe(true);
    expect(evaluateRange({ start: null, end: null }, constraints, ctx()).selectable).toBe(true);
  });

  it('normalizes a reversed range before validating it', () => {
    expect(evaluateRange({ start: sep(9), end: sep(4) }, constraints, ctx()).selectable).toBe(true);
    expect(evaluateRange({ start: sep(5), end: sep(4) }, constraints, ctx()).reason).toBe(
      'min-nights',
    );
  });
});

describe('constraints: findSelectable', () => {
  const constraints = resolve({ blockedRanges: [{ start: sep(10), end: sep(12) }] });

  it('returns the date itself when it is already selectable', () => {
    expect(iso(findSelectable(sep(5), constraints, ctx(), 1))).toBe('2026-09-05');
  });

  it('walks forward and backward out of a blocked span', () => {
    expect(iso(findSelectable(sep(11), constraints, ctx(), 1))).toBe('2026-09-13');
    expect(iso(findSelectable(sep(11), constraints, ctx(), -1))).toBe('2026-09-09');
  });

  it('starts the walk at the bound when the origin sits outside it', () => {
    const bounded = resolve({ minDate: sep(10), maxDate: sep(20) });
    expect(iso(findSelectable(plainDate(2020, 1, 1), bounded, ctx(), 1))).toBe('2026-09-10');
    expect(iso(findSelectable(plainDate(2030, 1, 1), bounded, ctx(), -1))).toBe('2026-09-20');
  });

  it('returns null when the walk leaves the bounds', () => {
    const bounded = resolve({
      minDate: sep(10),
      maxDate: sep(12),
      disabledDates: [sep(10), sep(11), sep(12)],
    });
    expect(findSelectable(sep(10), bounded, ctx(), 1)).toBeNull();
  });

  it('returns null when nothing is selectable within the step budget', () => {
    const nothing = resolve({ enabledDates: [] });
    expect(findSelectable(sep(10), nothing, ctx(), 1)).toBeNull();
    expect(findSelectable(sep(10), nothing, ctx(), -1)).toBeNull();
  });
});

describe('constraints: blocked walkers', () => {
  const constraints = resolve({
    blockedRanges: [{ start: sep(10), end: sep(12) }],
    disabledDates: [sep(20)],
  });

  it('finds the first unavailable day strictly after the origin', () => {
    expect(iso(nextBlockedAfter(sep(5), constraints, 30))).toBe('2026-09-10');
    expect(iso(nextBlockedAfter(sep(10), constraints, 30))).toBe('2026-09-11');
    expect(iso(nextBlockedAfter(sep(12), constraints, 30))).toBe('2026-09-20');
  });

  it('honours the limit and returns null when nothing is blocked inside it', () => {
    expect(nextBlockedAfter(sep(5), constraints, 4)).toBeNull();
    expect(iso(nextBlockedAfter(sep(5), constraints, 5))).toBe('2026-09-10');
    expect(nextBlockedAfter(sep(5), constraints, 0)).toBeNull();
    expect(nextBlockedAfter(sep(5), constraints, -3)).toBeNull();
    expect(nextBlockedAfter(sep(5), constraints, Number.NaN)).toBeNull();
  });

  it('defaults the limit to a year of walking', () => {
    expect(iso(nextBlockedAfter(sep(5), constraints))).toBe('2026-09-10');
    expect(nextBlockedAfter(sep(5), resolve({}))).toBeNull();
  });

  it('treats the day after maxDate as blocked', () => {
    const bounded = resolve({ maxDate: sep(10) });
    expect(iso(nextBlockedAfter(sep(5), bounded, 30))).toBe('2026-09-11');
    expect(nextBlockedAfter(sep(5), bounded, 4)).toBeNull();
  });

  it('mirrors the walk backwards', () => {
    expect(iso(previousBlockedBefore(sep(15), constraints, 30))).toBe('2026-09-12');
    expect(iso(previousBlockedBefore(sep(12), constraints, 30))).toBe('2026-09-11');
    expect(previousBlockedBefore(sep(15), constraints, 2)).toBeNull();
    expect(previousBlockedBefore(sep(15), constraints, 0)).toBeNull();
  });

  it('treats the day before minDate as blocked when walking backwards', () => {
    const bounded = resolve({ minDate: sep(10) });
    expect(iso(previousBlockedBefore(sep(15), bounded, 30))).toBe('2026-09-09');
    expect(previousBlockedBefore(sep(15), bounded, 4)).toBeNull();
  });
});

describe('constraints: clampSelection', () => {
  const context = ctx();

  it('pulls a range inside the configured bounds', () => {
    const constraints = resolve({ minDate: sep(5), maxDate: sep(25) });
    const clamped = clampSelection(rangeValue(sep(1), sep(30)), constraints, context);
    expect(iso(clamped?.range.start ?? null)).toBe('2026-09-05');
    expect(iso(clamped?.range.end ?? null)).toBe('2026-09-25');
  });

  it('shrinks a range that would cross a blocked night', () => {
    const constraints = resolve({ blockedRanges: [{ start: sep(12), end: sep(13) }] });
    const clamped = clampSelection(rangeValue(sep(8), sep(20)), constraints, context);
    expect(iso(clamped?.range.start ?? null)).toBe('2026-09-08');
    expect(iso(clamped?.range.end ?? null)).toBe('2026-09-11');
  });

  it('shrinks a range that exceeds maxNights', () => {
    const constraints = resolve({ maxNights: 4 });
    const clamped = clampSelection(rangeValue(sep(8), sep(20)), constraints, context);
    expect(iso(clamped?.range.end ?? null)).toBe('2026-09-12');
  });

  it('counts maxNights inclusively under days semantics when shrinking', () => {
    const constraints = resolve({ maxNights: 4, rangeSemantics: 'days' });
    const clamped = clampSelection(rangeValue(sep(8), sep(20)), constraints, context);
    expect(iso(clamped?.range.end ?? null)).toBe('2026-09-11');
  });

  it('rejects a range that lies wholly outside the bounds', () => {
    const constraints = resolve({ minDate: sep(5), maxDate: sep(25) });
    expect(
      clampSelection(
        rangeValue(plainDate(2026, 7, 1), plainDate(2026, 7, 30)),
        constraints,
        context,
      ),
    ).toBeNull();
    expect(
      clampSelection(
        rangeValue(plainDate(2026, 11, 1), plainDate(2026, 11, 30)),
        constraints,
        context,
      ),
    ).toBeNull();
  });

  it('rejects a range that cannot satisfy minNights after shrinking', () => {
    const constraints = resolve({
      minNights: 5,
      blockedRanges: [{ start: sep(10), end: sep(10) }],
    });
    expect(clampSelection(rangeValue(sep(8), sep(20)), constraints, context)).toBeNull();
  });

  it('rejects a range whose start is itself unavailable', () => {
    const constraints = resolve({ disabledDates: [sep(8)] });
    expect(clampSelection(rangeValue(sep(8), sep(12)), constraints, context)).toBeNull();
  });

  it('clamps a half-open range and keeps it half-open', () => {
    const constraints = resolve({ minDate: sep(5) });
    const clamped = clampSelection(rangeValue(sep(1), null), constraints, context);
    expect(iso(clamped?.range.start ?? null)).toBe('2026-09-05');
    expect(clamped?.range.end ?? null).toBeNull();
  });

  it('returns the identical object when nothing needed clamping', () => {
    const value = rangeValue(sep(8), sep(12));
    expect(clampSelection(value, alwaysSelectable, context)).toBe(value);
  });

  it('drops individual dates that fail the day rules in list modes', () => {
    const constraints = resolve({ minDate: sep(5), maxDate: sep(25) });
    const clamped = clampSelection(
      { dates: [sep(1), sep(10), sep(30)], range: { start: null, end: null } },
      constraints,
      ctx({ mode: 'multiple' }),
    );
    expect(clamped?.dates.map(toISODate)).toEqual(['2026-09-10']);
  });

  it('returns null when every individual date is dropped', () => {
    const constraints = resolve({ enabledDates: [] });
    expect(
      clampSelection(
        { dates: [sep(1), sep(10)], range: { start: null, end: null } },
        constraints,
        ctx({ mode: 'multiple' }),
      ),
    ).toBeNull();
  });

  it('truncates a date list to maxSelections, from the front or the back', () => {
    const keepFirst = resolve({ maxSelections: 2 });
    expect(
      clampSelection(
        { dates: [sep(1), sep(2), sep(3)], range: { start: null, end: null } },
        keepFirst,
        ctx({ mode: 'multiple' }),
      )?.dates.map(toISODate),
    ).toEqual(['2026-09-01', '2026-09-02']);

    const rolling = resolve({ maxSelections: 2, rollingSelection: true });
    expect(
      clampSelection(
        { dates: [sep(1), sep(2), sep(3)], range: { start: null, end: null } },
        rolling,
        ctx({ mode: 'multiple' }),
      )?.dates.map(toISODate),
    ).toEqual(['2026-09-02', '2026-09-03']);
  });

  it('never mutates the value it is given', () => {
    const constraints = resolve({ minDate: sep(5), maxDate: sep(25) });
    const value = rangeValue(sep(1), sep(30));
    const snapshot = JSON.stringify(value);
    clampSelection(value, constraints, context);
    expect(JSON.stringify(value)).toBe(snapshot);
  });

  it('preserves attached times through a clamp', () => {
    const constraints = resolve({ minDate: sep(5) });
    const value: SelectionValue = {
      dates: [],
      range: { start: sep(1), end: sep(12) },
      times: { start: { hour: 15, minute: 0, second: 0 }, end: null },
    };
    const clamped = clampSelection(value, constraints, context);
    expect(clamped?.times?.start?.hour).toBe(15);
  });
});

describe('constraints: alwaysSelectable', () => {
  it('accepts every date', () => {
    for (const day of [1, 15, 30]) {
      expect(isSelectable(sep(day), alwaysSelectable, ctx())).toBe(true);
    }
    expect(isSelectable(plainDate(1900, 1, 1), alwaysSelectable, ctx())).toBe(true);
  });

  it('carries permissive defaults', () => {
    expect(alwaysSelectable.minDate).toBeNull();
    expect(alwaysSelectable.maxDate).toBeNull();
    expect(alwaysSelectable.minNights).toBeNull();
    expect(alwaysSelectable.preventCrossingBlocked).toBe(true);
    expect(alwaysSelectable.rangeSemantics).toBe('nights');
  });

  it('never finds a blocked day', () => {
    expect(nextBlockedAfter(sep(1), alwaysSelectable, 365)).toBeNull();
    expect(previousBlockedBefore(sep(1), alwaysSelectable, 365)).toBeNull();
    expect(iso(findSelectable(sep(1), alwaysSelectable, ctx(), 1))).toBe('2026-09-01');
  });
});
