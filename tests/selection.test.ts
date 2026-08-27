import { describe, expect, it } from 'vitest';
import {
  applySelection,
  computePreviewRange,
  emptySelection,
  isSelectionComplete,
  isSelectionEmpty,
  normalizeValueInput,
  selectionDates,
  selectionDuration,
  selectionEquals,
  unitRangeFor,
  withTimes,
} from '../src/core/selection';
import { plainDate, plainTime, toISODate } from '../src/core/plain-date';
import type { SelectionRequest, SelectionResult } from '../src/core/selection';
import type { ActiveField, PlainDate, SelectionMode, SelectionValue } from '../src/core/types';

const sep = (day: number): PlainDate => plainDate(2026, 9, day);

const DEFAULT_OPTIONS: SelectionRequest['options'] = {
  allowReverseRange: true,
  toggleOnReselect: true,
  resetOnComplete: true,
  autoAdvance: true,
  maxSelections: null,
  rollingSelection: false,
  rangeSemantics: 'nights',
};

interface Click {
  mode: SelectionMode;
  date: PlainDate;
  value?: SelectionValue;
  activeField?: ActiveField;
  anchor?: PlainDate | null;
  firstDayOfWeek?: number;
  options?: Partial<SelectionRequest['options']>;
}

const click = (input: Click): SelectionResult =>
  applySelection({
    mode: input.mode,
    value: input.value ?? emptySelection(),
    date: input.date,
    activeField: input.activeField ?? 'start',
    anchor: input.anchor ?? null,
    firstDayOfWeek: input.firstDayOfWeek ?? 0,
    options: { ...DEFAULT_OPTIONS, ...input.options },
  });

const range = (start: PlainDate | null, end: PlainDate | null): SelectionValue => ({
  dates: [],
  range: { start, end },
});

const list = (...dates: PlainDate[]): SelectionValue => ({
  dates,
  range: { start: null, end: null },
});

const asRange = (value: SelectionValue): string =>
  `${value.range.start ? toISODate(value.range.start) : ''}..${value.range.end ? toISODate(value.range.end) : ''}`;

const asDates = (value: SelectionValue): string[] => value.dates.map(toISODate);

describe('selection: basics', () => {
  it('builds a fresh empty selection every time', () => {
    const a = emptySelection();
    const b = emptySelection();
    expect(a).not.toBe(b);
    expect(isSelectionEmpty(a)).toBe(true);
    expect(a).toEqual({ dates: [], range: { start: null, end: null } });
  });

  it('reports emptiness across both storage shapes', () => {
    expect(isSelectionEmpty(list(sep(4)))).toBe(false);
    expect(isSelectionEmpty(range(sep(4), null))).toBe(false);
    expect(isSelectionEmpty(range(null, sep(4)))).toBe(false);
  });

  it('reports completeness per mode', () => {
    expect(isSelectionComplete(range(sep(4), null), 'range')).toBe(false);
    expect(isSelectionComplete(range(sep(4), sep(6)), 'range')).toBe(true);
    expect(isSelectionComplete(list(sep(4)), 'single')).toBe(true);
    expect(isSelectionComplete(emptySelection(), 'single')).toBe(false);
    expect(isSelectionComplete(list(sep(4)), 'multiple')).toBe(true);
    for (const mode of ['week', 'month', 'quarter', 'year'] as const) {
      expect(isSelectionComplete(range(sep(1), sep(30)), mode)).toBe(true);
      expect(isSelectionComplete(range(sep(1), null), mode)).toBe(false);
    }
  });

  it('compares selections by value, not identity', () => {
    expect(selectionEquals(range(sep(4), sep(6)), range(sep(4), sep(6)))).toBe(true);
    expect(selectionEquals(range(sep(4), sep(6)), range(sep(4), sep(7)))).toBe(false);
    expect(selectionEquals(list(sep(4), sep(5)), list(sep(4), sep(5)))).toBe(true);
    expect(selectionEquals(list(sep(4)), list(sep(4), sep(5)))).toBe(false);
    const same = emptySelection();
    expect(selectionEquals(same, same)).toBe(true);
  });

  it('only compares times when both sides carry them', () => {
    const nine = withTimes(range(sep(4), sep(6)), { start: plainTime(9, 0), end: null });
    const ten = withTimes(range(sep(4), sep(6)), { start: plainTime(10, 0), end: null });
    expect(selectionEquals(nine, ten)).toBe(false);
    expect(selectionEquals(nine, range(sep(4), sep(6)))).toBe(true);
  });

  it('measures duration per mode and semantics', () => {
    expect(selectionDuration(range(sep(4), sep(25)), 'range', 'nights')).toBe(21);
    expect(selectionDuration(range(sep(4), sep(25)), 'range', 'days')).toBe(22);
    expect(selectionDuration(list(sep(4), sep(5), sep(6)), 'multiple', 'nights')).toBe(3);
    expect(selectionDuration(list(sep(4)), 'single', 'nights')).toBe(1);
    expect(selectionDuration(range(sep(4), null), 'range', 'nights')).toBe(0);
  });

  it('lists the discrete dates a selection refers to', () => {
    expect(selectionDates(range(sep(4), sep(6)), 'range').map(toISODate)).toEqual([
      '2026-09-04',
      '2026-09-06',
    ]);
    expect(selectionDates(range(sep(4), sep(4)), 'range').map(toISODate)).toEqual(['2026-09-04']);
    expect(selectionDates(range(sep(4), null), 'range').map(toISODate)).toEqual(['2026-09-04']);
    expect(selectionDates(range(null, sep(4)), 'range').map(toISODate)).toEqual(['2026-09-04']);
    expect(selectionDates(emptySelection(), 'range')).toEqual([]);
    expect(selectionDates(list(sep(4), sep(9)), 'multiple').map(toISODate)).toEqual([
      '2026-09-04',
      '2026-09-09',
    ]);
  });

  it('returns a copy of the date list, never the internal array', () => {
    const value = list(sep(4));
    expect(selectionDates(value, 'multiple')).not.toBe(value.dates);
  });

  it('attaches and drops times without touching the dates', () => {
    const value = range(sep(4), sep(6));
    const timed = withTimes(value, { start: plainTime(15, 0), end: plainTime(11, 0) });
    expect(timed.times).toEqual({ start: plainTime(15, 0), end: plainTime(11, 0) });
    expect(asRange(timed)).toBe('2026-09-04..2026-09-06');
    expect(value.times).toBeUndefined();
    expect(withTimes(timed, undefined).times).toBeUndefined();
    expect(withTimes(value, { start: null, end: null }).times).toEqual({ start: null, end: null });
  });
});

describe('selection: normalizeValueInput', () => {
  it('reads a single date from every accepted shape', () => {
    expect(asDates(normalizeValueInput(sep(4), 'single'))).toEqual(['2026-09-04']);
    expect(asDates(normalizeValueInput('2026-09-04', 'single'))).toEqual(['2026-09-04']);
    expect(asDates(normalizeValueInput(new Date(2026, 8, 4), 'single'))).toEqual(['2026-09-04']);
    expect(asDates(normalizeValueInput([sep(4)], 'single'))).toEqual(['2026-09-04']);
  });

  it('reads a range from a {start,end} pair and rights a reversed one', () => {
    expect(asRange(normalizeValueInput({ start: sep(4), end: sep(9) }, 'range'))).toBe(
      '2026-09-04..2026-09-09',
    );
    expect(asRange(normalizeValueInput({ start: sep(9), end: sep(4) }, 'range'))).toBe(
      '2026-09-04..2026-09-09',
    );
  });

  it('sorts and de-duplicates a date list', () => {
    expect(asDates(normalizeValueInput([sep(9), sep(4), sep(9)], 'multiple'))).toEqual([
      '2026-09-04',
      '2026-09-09',
    ]);
  });

  it('expands a range into every day for multiple mode', () => {
    expect(asDates(normalizeValueInput({ start: sep(4), end: sep(6) }, 'multiple'))).toEqual([
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
  });

  it('takes only the earliest date for single mode', () => {
    expect(asDates(normalizeValueInput([sep(9), sep(4)], 'single'))).toEqual(['2026-09-04']);
    expect(asDates(normalizeValueInput({ start: sep(4), end: sep(9) }, 'single'))).toEqual([
      '2026-09-04',
    ]);
  });

  it('turns a date list into a range for range modes', () => {
    expect(asRange(normalizeValueInput([sep(4), sep(6), sep(9)], 'range'))).toBe(
      '2026-09-04..2026-09-09',
    );
    expect(asRange(normalizeValueInput([sep(4)], 'range'))).toBe('2026-09-04..');
  });

  it('accepts a full SelectionValue and preserves its times', () => {
    const source = withTimes(range(sep(4), sep(6)), { start: plainTime(15, 0), end: null });
    const normalized = normalizeValueInput(source, 'range');
    expect(asRange(normalized)).toBe('2026-09-04..2026-09-06');
    expect(normalized.times).toEqual({ start: plainTime(15, 0), end: null });
  });

  it('returns an empty selection for null, undefined and empty strings', () => {
    for (const mode of ['single', 'range', 'multiple'] as const) {
      expect(isSelectionEmpty(normalizeValueInput(null, mode))).toBe(true);
      expect(isSelectionEmpty(normalizeValueInput(undefined, mode))).toBe(true);
      expect(isSelectionEmpty(normalizeValueInput('', mode))).toBe(true);
    }
  });

  it('drops unparseable entries instead of throwing', () => {
    expect(asDates(normalizeValueInput(['nope', sep(4), null], 'multiple'))).toEqual([
      '2026-09-04',
    ]);
    expect(isSelectionEmpty(normalizeValueInput('not a date', 'single'))).toBe(true);
  });

  it('never mutates the array it is given', () => {
    const input = [sep(9), sep(4)];
    normalizeValueInput(input, 'multiple');
    expect(input.map(toISODate)).toEqual(['2026-09-09', '2026-09-04']);
  });
});

describe('selection: single mode', () => {
  it('selects a date', () => {
    const result = click({ mode: 'single', date: sep(4) });
    expect(asDates(result.value)).toEqual(['2026-09-04']);
    expect(result.reason).toBe('select');
    expect(result.isComplete).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.activeField).toBe('start');
    expect(result.anchor).toBeNull();
  });

  it('replaces the previous date', () => {
    const result = click({ mode: 'single', date: sep(9), value: list(sep(4)) });
    expect(asDates(result.value)).toEqual(['2026-09-09']);
    expect(result.reason).toBe('select');
  });

  it('toggles the selected date off when toggleOnReselect is on', () => {
    const result = click({ mode: 'single', date: sep(4), value: list(sep(4)) });
    expect(isSelectionEmpty(result.value)).toBe(true);
    expect(result.reason).toBe('deselect');
    expect(result.changed).toBe(true);
  });

  it('keeps the date and reports no change when toggleOnReselect is off', () => {
    const value = list(sep(4));
    const result = click({
      mode: 'single',
      date: sep(4),
      value,
      options: { toggleOnReselect: false },
    });
    expect(result.value).toBe(value);
    expect(result.reason).toBe('select');
    expect(result.changed).toBe(false);
  });

  it('carries times through both a re-pick and a toggle-off', () => {
    const value = withTimes(list(sep(4)), { start: plainTime(9, 0), end: null });
    expect(click({ mode: 'single', date: sep(9), value }).value.times?.start).toEqual(
      plainTime(9, 0),
    );
    expect(click({ mode: 'single', date: sep(4), value }).value.times?.start).toEqual(
      plainTime(9, 0),
    );
  });
});

describe('selection: multiple mode', () => {
  it('adds dates and keeps them sorted', () => {
    const first = click({ mode: 'multiple', date: sep(9) });
    const second = click({ mode: 'multiple', date: sep(4), value: first.value });
    expect(asDates(second.value)).toEqual(['2026-09-04', '2026-09-09']);
    expect(second.reason).toBe('select');
  });

  it('toggles an already-picked date off', () => {
    const result = click({ mode: 'multiple', date: sep(5), value: list(sep(4), sep(5), sep(6)) });
    expect(asDates(result.value)).toEqual(['2026-09-04', '2026-09-06']);
    expect(result.reason).toBe('deselect');
  });

  it('is additive-only when toggleOnReselect is off', () => {
    const value = list(sep(4), sep(5));
    const result = click({
      mode: 'multiple',
      date: sep(5),
      value,
      options: { toggleOnReselect: false },
    });
    expect(result.value).toBe(value);
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('select');
  });

  it('rejects a pick past maxSelections when rolling is off', () => {
    const value = list(sep(1), sep(2), sep(3));
    const result = click({ mode: 'multiple', date: sep(20), value, options: { maxSelections: 3 } });
    expect(result.value).toBe(value);
    expect(result.changed).toBe(false);
  });

  it('still allows deselecting when maxSelections is already reached', () => {
    const value = list(sep(1), sep(2), sep(3));
    const result = click({ mode: 'multiple', date: sep(2), value, options: { maxSelections: 3 } });
    expect(asDates(result.value)).toEqual(['2026-09-01', '2026-09-03']);
    expect(result.reason).toBe('deselect');
  });

  it('evicts the furthest pick when rollingSelection is on', () => {
    const value = list(sep(1), sep(2), sep(3));
    const result = click({
      mode: 'multiple',
      date: sep(20),
      value,
      options: { maxSelections: 3, rollingSelection: true },
    });
    expect(asDates(result.value)).toEqual(['2026-09-02', '2026-09-03', '2026-09-20']);
    expect(result.value.dates).toHaveLength(3);
  });

  it('evicts repeatedly when the list is already over the cap', () => {
    const value = list(sep(1), sep(2), sep(3), sep(4));
    const result = click({
      mode: 'multiple',
      date: sep(20),
      value,
      options: { maxSelections: 2, rollingSelection: true },
    });
    expect(asDates(result.value)).toEqual(['2026-09-04', '2026-09-20']);
  });

  it('accepts nothing at all when maxSelections is zero', () => {
    const result = click({ mode: 'multiple', date: sep(4), options: { maxSelections: 0 } });
    expect(isSelectionEmpty(result.value)).toBe(true);
    expect(result.changed).toBe(false);
  });

  it('adds freely when maxSelections is null', () => {
    const value = list(sep(1), sep(2), sep(3));
    const result = click({ mode: 'multiple', date: sep(20), value });
    expect(result.value.dates).toHaveLength(4);
  });
});

describe('selection: range mode', () => {
  it('opens a range and advances the active field to end', () => {
    const result = click({ mode: 'range', date: sep(10) });
    expect(asRange(result.value)).toBe('2026-09-10..');
    expect(result.reason).toBe('range-start');
    expect(result.activeField).toBe('end');
    expect(result.anchor && toISODate(result.anchor)).toBe('2026-09-10');
    expect(result.isComplete).toBe(false);
  });

  it('keeps the active field on start when autoAdvance is off', () => {
    const result = click({ mode: 'range', date: sep(10), options: { autoAdvance: false } });
    expect(result.activeField).toBe('start');
    expect(result.anchor && toISODate(result.anchor)).toBe('2026-09-10');
  });

  it('closes a range on the second pick', () => {
    const result = click({
      mode: 'range',
      date: sep(14),
      value: range(sep(10), null),
      activeField: 'end',
      anchor: sep(10),
    });
    expect(asRange(result.value)).toBe('2026-09-10..2026-09-14');
    expect(result.reason).toBe('range-end');
    expect(result.activeField).toBe('start');
    expect(result.anchor).toBeNull();
    expect(result.isComplete).toBe(true);
  });

  it('reverses a backwards second pick when allowReverseRange is on', () => {
    const result = click({
      mode: 'range',
      date: sep(5),
      value: range(sep(10), null),
      activeField: 'end',
      anchor: sep(10),
    });
    expect(asRange(result.value)).toBe('2026-09-05..2026-09-10');
    expect(result.reason).toBe('range-end');
    expect(result.isComplete).toBe(true);
  });

  it('restarts on a backwards second pick when allowReverseRange is off', () => {
    const result = click({
      mode: 'range',
      date: sep(5),
      value: range(sep(10), null),
      activeField: 'end',
      anchor: sep(10),
      options: { allowReverseRange: false },
    });
    expect(asRange(result.value)).toBe('2026-09-05..');
    expect(result.reason).toBe('range-start');
    expect(result.anchor && toISODate(result.anchor)).toBe('2026-09-05');
  });

  it('accepts a same-day range as a legitimate day trip', () => {
    const result = click({
      mode: 'range',
      date: sep(10),
      value: range(sep(10), null),
      activeField: 'end',
      anchor: sep(10),
    });
    expect(asRange(result.value)).toBe('2026-09-10..2026-09-10');
    expect(result.reason).toBe('range-end');
    expect(result.isComplete).toBe(true);
  });

  it('closes the range from a pending anchor even when autoAdvance is off', () => {
    const result = click({
      mode: 'range',
      date: sep(14),
      value: range(sep(10), null),
      activeField: 'start',
      anchor: sep(10),
      options: { autoAdvance: false },
    });
    expect(asRange(result.value)).toBe('2026-09-10..2026-09-14');
    expect(result.reason).toBe('range-end');
  });

  it('falls back to the surviving range start when there is no anchor', () => {
    const result = click({
      mode: 'range',
      date: sep(14),
      value: range(sep(10), null),
      activeField: 'end',
      anchor: null,
    });
    expect(asRange(result.value)).toBe('2026-09-10..2026-09-14');
  });

  it('starts a new range when the active field is start and nothing is pending', () => {
    const result = click({ mode: 'range', date: sep(14), activeField: 'end', anchor: null });
    expect(asRange(result.value)).toBe('2026-09-14..');
    expect(result.reason).toBe('range-start');
  });

  it('starts a fresh range on a complete one when resetOnComplete is true', () => {
    const result = click({ mode: 'range', date: sep(20), value: range(sep(10), sep(14)) });
    expect(asRange(result.value)).toBe('2026-09-20..');
    expect(result.reason).toBe('range-start');
    expect(result.activeField).toBe('end');
  });

  it('moves the nearer edge on a complete range when resetOnComplete is false', () => {
    const complete = range(sep(10), sep(14));
    const options = { resetOnComplete: false };

    const after = click({ mode: 'range', date: sep(20), value: complete, options });
    expect(asRange(after.value)).toBe('2026-09-10..2026-09-20');
    expect(after.reason).toBe('range-end');
    expect(after.activeField).toBe('end');

    const before = click({ mode: 'range', date: sep(2), value: complete, options });
    expect(asRange(before.value)).toBe('2026-09-02..2026-09-14');
    expect(before.reason).toBe('range-start');
    expect(before.activeField).toBe('start');

    const nearStart = click({ mode: 'range', date: sep(11), value: complete, options });
    expect(asRange(nearStart.value)).toBe('2026-09-11..2026-09-14');
    expect(nearStart.reason).toBe('range-start');

    const nearEnd = click({ mode: 'range', date: sep(13), value: complete, options });
    expect(asRange(nearEnd.value)).toBe('2026-09-10..2026-09-13');
    expect(nearEnd.reason).toBe('range-end');
  });

  it('breaks an interior tie in favour of the start edge', () => {
    const complete = range(sep(10), sep(14));
    const middle = click({
      mode: 'range',
      date: sep(12),
      value: complete,
      options: { resetOnComplete: false },
    });
    expect(asRange(middle.value)).toBe('2026-09-12..2026-09-14');
    expect(middle.reason).toBe('range-start');
  });

  it('clears a collapsed range on a re-click, but not a real one', () => {
    const collapsed = range(sep(10), sep(10));
    const cleared = click({ mode: 'range', date: sep(10), value: collapsed });
    expect(isSelectionEmpty(cleared.value)).toBe(true);
    expect(cleared.reason).toBe('deselect');

    const real = click({ mode: 'range', date: sep(10), value: range(sep(10), sep(14)) });
    expect(asRange(real.value)).toBe('2026-09-10..');
    expect(real.reason).toBe('range-start');
  });

  it('does not clear a collapsed range when toggleOnReselect is off', () => {
    const result = click({
      mode: 'range',
      date: sep(10),
      value: range(sep(10), sep(10)),
      options: { toggleOnReselect: false },
    });
    expect(asRange(result.value)).toBe('2026-09-10..');
    expect(result.reason).toBe('range-start');
  });

  it('carries times through every range transition', () => {
    const timed = withTimes(range(sep(10), null), { start: plainTime(15, 0), end: null });
    const closed = click({
      mode: 'range',
      date: sep(14),
      value: timed,
      activeField: 'end',
      anchor: sep(10),
    });
    expect(closed.value.times?.start).toEqual(plainTime(15, 0));
  });
});

describe('selection: unit modes', () => {
  it('selects the whole unit a click lands in', () => {
    // 2026-09-16 is a Wednesday.
    expect(asRange(click({ mode: 'week', date: sep(16) }).value)).toBe('2026-09-13..2026-09-19');
    expect(asRange(click({ mode: 'month', date: sep(16) }).value)).toBe('2026-09-01..2026-09-30');
    expect(asRange(click({ mode: 'quarter', date: sep(16) }).value)).toBe('2026-07-01..2026-09-30');
    expect(asRange(click({ mode: 'year', date: sep(16) }).value)).toBe('2026-01-01..2026-12-31');
  });

  it('honours firstDayOfWeek in week mode', () => {
    expect(asRange(click({ mode: 'week', date: sep(16), firstDayOfWeek: 1 }).value)).toBe(
      '2026-09-14..2026-09-20',
    );
    expect(asRange(click({ mode: 'week', date: sep(16), firstDayOfWeek: 6 }).value)).toBe(
      '2026-09-12..2026-09-18',
    );
  });

  it('reports select, complete, no anchor and the start field', () => {
    const result = click({ mode: 'month', date: sep(16) });
    expect(result.reason).toBe('select');
    expect(result.isComplete).toBe(true);
    expect(result.anchor).toBeNull();
    expect(result.activeField).toBe('start');
  });

  it('toggles the same unit off on a re-click anywhere inside it', () => {
    const selected = click({ mode: 'month', date: sep(16) }).value;
    const toggled = click({ mode: 'month', date: sep(2), value: selected });
    expect(isSelectionEmpty(toggled.value)).toBe(true);
    expect(toggled.reason).toBe('deselect');
  });

  it('moves to a different unit rather than toggling', () => {
    const selected = click({ mode: 'week', date: sep(16) }).value;
    const moved = click({ mode: 'week', date: sep(23), value: selected });
    expect(asRange(moved.value)).toBe('2026-09-20..2026-09-26');
    expect(moved.reason).toBe('select');
  });

  it('keeps the unit selected on a re-click when toggleOnReselect is off', () => {
    const selected = click({ mode: 'month', date: sep(16) }).value;
    const again = click({
      mode: 'month',
      date: sep(2),
      value: selected,
      options: { toggleOnReselect: false },
    });
    expect(asRange(again.value)).toBe('2026-09-01..2026-09-30');
    expect(again.changed).toBe(false);
  });
});

describe('selection: unitRangeFor', () => {
  it('returns the enclosing unit for every unit mode', () => {
    expect(asRange({ dates: [], range: unitRangeFor(sep(16), 'week', 0) })).toBe(
      '2026-09-13..2026-09-19',
    );
    expect(asRange({ dates: [], range: unitRangeFor(sep(16), 'month', 0) })).toBe(
      '2026-09-01..2026-09-30',
    );
    expect(asRange({ dates: [], range: unitRangeFor(sep(16), 'quarter', 0) })).toBe(
      '2026-07-01..2026-09-30',
    );
    expect(asRange({ dates: [], range: unitRangeFor(sep(16), 'year', 0) })).toBe(
      '2026-01-01..2026-12-31',
    );
  });

  it('collapses to the day itself in non-unit modes', () => {
    for (const mode of ['single', 'multiple', 'range'] as const) {
      expect(asRange({ dates: [], range: unitRangeFor(sep(16), mode, 0) })).toBe(
        '2026-09-16..2026-09-16',
      );
    }
  });

  it('clamps February correctly in month mode', () => {
    expect(asRange({ dates: [], range: unitRangeFor(plainDate(2024, 2, 10), 'month', 0) })).toBe(
      '2024-02-01..2024-02-29',
    );
    expect(asRange({ dates: [], range: unitRangeFor(plainDate(2025, 2, 10), 'month', 0) })).toBe(
      '2025-02-01..2025-02-28',
    );
  });
});

describe('selection: computePreviewRange', () => {
  const opts = {
    mode: 'range' as SelectionMode,
    activeField: 'end' as ActiveField,
    allowReverseRange: true,
    firstDayOfWeek: 0,
  };

  it('previews forward from the anchor to the hovered day', () => {
    const preview = computePreviewRange(sep(10), sep(14), opts);
    expect(preview && toISODate(preview.start ?? sep(1))).toBe('2026-09-10');
    expect(preview && toISODate(preview.end ?? sep(1))).toBe('2026-09-14');
  });

  it('previews backwards when reversing is allowed', () => {
    const preview = computePreviewRange(sep(10), sep(5), opts);
    expect(preview && toISODate(preview.start ?? sep(1))).toBe('2026-09-05');
    expect(preview && toISODate(preview.end ?? sep(1))).toBe('2026-09-10');
  });

  it('stays dark on a backwards hover that would restart the range', () => {
    expect(computePreviewRange(sep(10), sep(5), { ...opts, allowReverseRange: false })).toBeNull();
  });

  it('stays dark with no anchor, no hover, or the wrong active field', () => {
    expect(computePreviewRange(null, sep(14), opts)).toBeNull();
    expect(computePreviewRange(sep(10), null, opts)).toBeNull();
    expect(computePreviewRange(sep(10), sep(14), { ...opts, activeField: 'start' })).toBeNull();
  });

  it('previews the whole unit under the cursor in unit modes, anchor or not', () => {
    const week = computePreviewRange(null, sep(16), { ...opts, mode: 'week' });
    expect(week && `${toISODate(week.start ?? sep(1))}..${toISODate(week.end ?? sep(1))}`).toBe(
      '2026-09-13..2026-09-19',
    );
    const quarter = computePreviewRange(null, sep(16), { ...opts, mode: 'quarter' });
    expect(
      quarter && `${toISODate(quarter.start ?? sep(1))}..${toISODate(quarter.end ?? sep(1))}`,
    ).toBe('2026-07-01..2026-09-30');
  });

  it('never previews in single or multiple mode', () => {
    expect(computePreviewRange(sep(10), sep(14), { ...opts, mode: 'single' })).toBeNull();
    expect(computePreviewRange(sep(10), sep(14), { ...opts, mode: 'multiple' })).toBeNull();
  });
});

describe('selection: purity', () => {
  it('never mutates the incoming value in any mode', () => {
    const cases: Click[] = [
      { mode: 'single', date: sep(9), value: list(sep(4)) },
      { mode: 'multiple', date: sep(9), value: list(sep(4)) },
      { mode: 'range', date: sep(9), value: range(sep(4), sep(6)) },
      { mode: 'week', date: sep(9), value: range(sep(4), sep(6)) },
    ];
    for (const input of cases) {
      const before = JSON.stringify(input.value);
      click(input);
      expect(JSON.stringify(input.value)).toBe(before);
    }
  });

  it('derives `changed` from value equality rather than from the branch taken', () => {
    const value = list(sep(4));
    expect(
      click({ mode: 'single', date: sep(4), value, options: { toggleOnReselect: false } }).changed,
    ).toBe(false);
    expect(click({ mode: 'single', date: sep(9), value }).changed).toBe(true);
  });
});
