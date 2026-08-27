import { describe, expect, it, vi } from 'vitest';
import { DatePickerEngine, createDatePicker } from '../src/core/engine';
import {
  createLibraryAdapter,
  isoStringAdapter,
  nativeDateAdapter,
  plainDateAdapter,
  timestampAdapter,
} from '../src/core/adapters';
import { builtInPresets, nightsPreset, toDatePreset } from '../src/core/presets';
import { plainDate, toDate, toISODate } from '../src/core/plain-date';
import type {
  CalendarSnapshot,
  ChangeMeta,
  DatePickerEngineApi,
  DateRange,
  DayInfo,
  EngineOptions,
  PlainDate,
  SelectionValue,
} from '../src/core/types';

/** 2026-09-04 is a Friday; September 2026 starts on a Tuesday. */
const TODAY = plainDate(2026, 9, 4);

const sep = (day: number): PlainDate => plainDate(2026, 9, day);

const engine = (options: EngineOptions = {}): DatePickerEngineApi =>
  createDatePicker({ today: TODAY, locale: 'en-US', ...options });

const asRange = (value: SelectionValue | DateRange | null): string => {
  if (!value) return 'null';
  const range = 'range' in value ? value.range : value;
  return `${range.start ? toISODate(range.start) : ''}..${range.end ? toISODate(range.end) : ''}`;
};

const allDays = (snapshot: CalendarSnapshot): DayInfo[] =>
  snapshot.months.flatMap((month) => month.days);

const keysWhere = (snapshot: CalendarSnapshot, predicate: (day: DayInfo) => boolean): string[] =>
  allDays(snapshot)
    .filter(predicate)
    .map((day) => day.key);

describe('engine: snapshot stability', () => {
  it('returns the identical reference across repeated no-op reads', () => {
    const picker = engine({ mode: 'range' });
    const snapshot = picker.getSnapshot();
    expect(picker.getSnapshot()).toBe(snapshot);
    expect(picker.getSnapshot()).toBe(snapshot);
  });

  it('returns a new reference after a real mutation', () => {
    const picker = engine({ mode: 'range' });
    const before = picker.getSnapshot();
    picker.select(sep(10));
    const after = picker.getSnapshot();
    expect(after).not.toBe(before);
    expect(picker.getSnapshot()).toBe(after);
  });

  it('stays stable across every no-op action — the React infinite-loop guard', () => {
    const picker = engine({ mode: 'range', numberOfMonths: 1 });
    picker.select(sep(10));
    picker.select(sep(14));
    const snapshot = picker.getSnapshot();

    picker.hover(null);
    picker.setActiveField(picker.getSnapshot().activeField);
    picker.setView('day');
    picker.goToMonth(sep(20));
    picker.focusDate(picker.getSnapshot().focusedDate);
    picker.setOptions({ mode: 'range', numberOfMonths: 1 });
    picker.setOptions({});
    picker.applyPreset('does-not-exist');
    expect(picker.getSnapshot()).toBe(snapshot);
  });

  it('leaves the snapshot untouched when a rejected pick changes nothing', () => {
    const picker = engine({ mode: 'single', disabledDates: [sep(12)] });
    const snapshot = picker.getSnapshot();
    picker.select(sep(12));
    expect(picker.getSnapshot()).toBe(snapshot);
  });

  it('leaves the snapshot untouched when clearing an already-empty selection', () => {
    const picker = engine({ mode: 'single' });
    const snapshot = picker.getSnapshot();
    picker.clear();
    expect(picker.getSnapshot()).toBe(snapshot);
  });

  it('does not renotify when hovering the same day twice', () => {
    const picker = engine({ mode: 'range' });
    const listener = vi.fn();
    picker.subscribe(listener);
    picker.hover(sep(9));
    picker.hover(sep(9));
    picker.hover(plainDate(2026, 9, 9));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies every subscriber synchronously and honours unsubscription', () => {
    const picker = engine({ mode: 'single' });
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = picker.subscribe(first);
    picker.subscribe(second);
    picker.select(sep(10));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    unsubscribe();
    picker.select(sep(11));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('survives a listener that unsubscribes while being notified', () => {
    const picker = engine({ mode: 'single' });
    const unsubscribe = picker.subscribe(() => unsubscribe());
    const other = vi.fn();
    picker.subscribe(other);
    expect(() => picker.select(sep(10))).not.toThrow();
    expect(other).toHaveBeenCalledTimes(1);
  });
});

describe('engine: controlled value', () => {
  it('never mutates its own value but still reports the change', () => {
    const onChange = vi.fn();
    const picker = engine({ mode: 'single', value: sep(10), onChange });
    picker.select(sep(12));

    expect(picker.getSnapshot().value.dates.map(toISODate)).toEqual(['2026-09-10']);
    expect(onChange).toHaveBeenCalledTimes(1);
    const [value, meta] = onChange.mock.calls[0] as [SelectionValue, ChangeMeta];
    expect(value.dates.map(toISODate)).toEqual(['2026-09-12']);
    expect(meta.reason).toBe('select');
    expect(meta.date && toISODate(meta.date)).toBe('2026-09-12');
  });

  it('adopts a new controlled value pushed through setOptions', () => {
    const picker = engine({ mode: 'range', value: { start: sep(10), end: sep(14) } });
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-10..2026-09-14');
    picker.setOptions({ value: { start: sep(20), end: sep(22) } });
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-20..2026-09-22');
  });

  it('re-derives the pending anchor from a controlled half-open range', () => {
    const picker = engine({ mode: 'range', value: { start: sep(10), end: null } });
    expect(picker.getSnapshot().activeField).toBe('end');
    expect(picker.getSnapshot().anchor && toISODate(picker.getSnapshot().anchor as PlainDate)).toBe(
      '2026-09-10',
    );
    expect(picker.getSnapshot().isSelecting).toBe(true);
  });

  it('leaves the controlled value alone on clear but still emits', () => {
    const onChange = vi.fn();
    const picker = engine({ mode: 'single', value: sep(10), onChange });
    picker.clear();
    expect(picker.getSnapshot().value.dates.map(toISODate)).toEqual(['2026-09-10']);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0] as [SelectionValue, ChangeMeta])[1].reason).toBe('clear');
  });

  it('manages its own value when uncontrolled, seeded from defaultValue', () => {
    const picker = engine({ mode: 'range', defaultValue: { start: sep(10), end: sep(14) } });
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-10..2026-09-14');
    picker.select(sep(20));
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-20..');
  });

  it('honours a controlled month and refuses to navigate away from it', () => {
    const onMonthChange = vi.fn();
    const picker = engine({ mode: 'single', month: sep(1), onMonthChange });
    expect(picker.getSnapshot().months[0]?.key).toBe('2026-09-01');
    picker.nextMonth();
    expect(picker.getSnapshot().months[0]?.key).toBe('2026-09-01');
    expect(onMonthChange).toHaveBeenCalledWith(plainDate(2026, 10, 1));
    picker.setOptions({ month: plainDate(2026, 11, 1) });
    expect(picker.getSnapshot().months[0]?.key).toBe('2026-11-01');
  });
});

describe('engine: onChange and onComplete', () => {
  it('fires onComplete exactly once per completed range', () => {
    const onChange = vi.fn();
    const onComplete = vi.fn();
    const picker = engine({ mode: 'range', onChange, onComplete });

    picker.select(sep(10));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();

    picker.select(sep(14));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledTimes(1);

    picker.select(sep(20));
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onComplete).toHaveBeenCalledTimes(1);

    picker.select(sep(22));
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('hands onComplete the finished value and its duration', () => {
    const onComplete = vi.fn();
    const picker = engine({ mode: 'range', onComplete });
    picker.select(sep(10));
    picker.select(sep(14));
    const [value, meta] = onComplete.mock.calls[0] as [SelectionValue, ChangeMeta];
    expect(asRange(value)).toBe('2026-09-10..2026-09-14');
    expect(meta.isComplete).toBe(true);
    expect(meta.duration).toBe(4);
    expect(meta.mode).toBe('range');
  });

  it('counts a completed range in days when asked to', () => {
    const onComplete = vi.fn();
    const picker = engine({ mode: 'range', rangeSemantics: 'days', onComplete });
    picker.select(sep(10));
    picker.select(sep(14));
    expect((onComplete.mock.calls[0] as [SelectionValue, ChangeMeta])[1].duration).toBe(5);
  });

  it('fires onComplete on the first pick in single mode', () => {
    const onComplete = vi.fn();
    const picker = engine({ mode: 'single', onComplete });
    picker.select(sep(10));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not fire onChange when a pick changes nothing', () => {
    const onChange = vi.fn();
    const picker = engine({ mode: 'single', toggleOnReselect: false, onChange });
    picker.select(sep(10));
    picker.select(sep(10));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('reports the reason for each step of a range', () => {
    const reasons: string[] = [];
    const picker = engine({ mode: 'range', onChange: (_value, meta) => reasons.push(meta.reason) });
    picker.select(sep(10));
    picker.select(sep(14));
    picker.clear();
    expect(reasons).toEqual(['range-start', 'range-end', 'clear']);
  });

  it('reports focus, hover and month callbacks', () => {
    const onFocusChange = vi.fn();
    const onHoverChange = vi.fn();
    const onMonthChange = vi.fn();
    const picker = engine({ mode: 'single', onFocusChange, onHoverChange, onMonthChange });
    picker.focusDate(sep(10));
    picker.hover(sep(12));
    picker.hover(null);
    picker.nextMonth();
    expect(onFocusChange).toHaveBeenCalledWith(sep(10));
    expect(onHoverChange).toHaveBeenNthCalledWith(1, sep(12));
    expect(onHoverChange).toHaveBeenNthCalledWith(2, null);
    expect(onMonthChange).toHaveBeenCalledWith(plainDate(2026, 10, 1));
  });
});

describe('engine: invalid selections', () => {
  it('reports a blocked day through onInvalidSelection and leaves the state untouched', () => {
    const onInvalidSelection = vi.fn();
    const onChange = vi.fn();
    const picker = engine({
      mode: 'single',
      disabledDates: [sep(12)],
      onInvalidSelection,
      onChange,
    });
    const before = picker.getSnapshot();

    picker.select(sep(12));

    expect(onInvalidSelection).toHaveBeenCalledTimes(1);
    const [date, evaluation] = onInvalidSelection.mock.calls[0] as [PlainDate, { reason?: string }];
    expect(toISODate(date)).toBe('2026-09-12');
    expect(evaluation.reason).toBe('disabled-date');
    expect(onChange).not.toHaveBeenCalled();
    expect(picker.getSnapshot()).toBe(before);
    expect(picker.getSnapshot().value.dates).toEqual([]);
  });

  it('reports each constraint with its own reason', () => {
    const seen: string[] = [];
    const picker = engine({
      mode: 'range',
      minDate: sep(5),
      maxDate: sep(25),
      blockedRanges: [{ start: sep(15), end: sep(16) }],
      minNights: 2,
      onInvalidSelection: (_date, evaluation) => seen.push(evaluation.reason ?? 'none'),
    });
    picker.select(sep(1));
    picker.select(sep(30));
    picker.select(sep(15));
    picker.select(sep(10));
    picker.select(sep(11));
    expect(seen).toEqual(['before-min', 'after-max', 'blocked-range', 'min-nights']);
  });

  it('rejects an end pick that would cross a blocked night', () => {
    const onInvalidSelection = vi.fn();
    const picker = engine({
      mode: 'range',
      blockedRanges: [{ start: sep(12), end: sep(12) }],
      onInvalidSelection,
    });
    picker.select(sep(10));
    picker.select(sep(14));
    expect(onInvalidSelection).toHaveBeenCalledTimes(1);
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-10..');
  });

  it('ignores a click on a hidden neighbouring-month day when selectOutsideDays is off', () => {
    const onChange = vi.fn();
    const picker = engine({ mode: 'single', selectOutsideDays: false, onChange });
    picker.select(plainDate(2026, 8, 30));
    expect(onChange).not.toHaveBeenCalled();
    expect(picker.getSnapshot().value.dates).toEqual([]);
    picker.select(sep(10));
    expect(picker.getSnapshot().value.dates.map(toISODate)).toEqual(['2026-09-10']);
  });

  it('accepts a neighbouring-month click by default and pulls the view along', () => {
    const picker = engine({ mode: 'single' });
    picker.select(plainDate(2026, 10, 1));
    expect(picker.getSnapshot().value.dates.map(toISODate)).toEqual(['2026-10-01']);
    expect(picker.getSnapshot().months[0]?.key).toBe('2026-10-01');
  });

  it('surfaces range validation on the snapshot', () => {
    const picker = engine({ mode: 'range', minNights: 5, value: { start: sep(10), end: sep(12) } });
    expect(picker.getSnapshot().validation).toEqual({
      valid: false,
      reason: 'min-nights',
      message: 'Minimum stay is 5 nights',
    });
    const fine = engine({ mode: 'range', minNights: 1, value: { start: sep(10), end: sep(12) } });
    expect(fine.getSnapshot().validation).toEqual({ valid: true });
  });
});

describe('engine: hover preview', () => {
  it('previews the whole span under the cursor', () => {
    const picker = engine({ mode: 'range' });
    picker.select(sep(8));
    picker.hover(sep(12));
    expect(keysWhere(picker.getSnapshot(), (day) => day.isPreview)).toEqual([
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ]);
  });

  it('caps the preview the day before the first blocked night', () => {
    const picker = engine({ mode: 'range', blockedRanges: [{ start: sep(12), end: sep(13) }] });
    picker.select(sep(8));
    picker.hover(sep(20));
    expect(keysWhere(picker.getSnapshot(), (day) => day.isPreview)).toEqual([
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
    ]);
  });

  it('caps the preview at maxNights', () => {
    const picker = engine({ mode: 'range', maxNights: 3 });
    picker.select(sep(8));
    picker.hover(sep(20));
    expect(keysWhere(picker.getSnapshot(), (day) => day.isPreview)).toEqual([
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
    ]);
  });

  it('caps the preview at maxNights counted inclusively under days semantics', () => {
    const picker = engine({ mode: 'range', maxNights: 3, rangeSemantics: 'days' });
    picker.select(sep(8));
    picker.hover(sep(20));
    expect(keysWhere(picker.getSnapshot(), (day) => day.isPreview)).toEqual([
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
    ]);
  });

  it('caps a backwards preview too', () => {
    const picker = engine({ mode: 'range', blockedRanges: [{ start: sep(6), end: sep(6) }] });
    picker.select(sep(10));
    picker.hover(sep(2));
    expect(keysWhere(picker.getSnapshot(), (day) => day.isPreview)).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
    ]);
  });

  it('collapses the preview onto the anchor when the very next night is blocked', () => {
    const picker = engine({ mode: 'range', blockedRanges: [{ start: sep(9), end: sep(9) }] });
    picker.select(sep(8));
    picker.hover(sep(20));
    expect(keysWhere(picker.getSnapshot(), (day) => day.isPreview)).toEqual(['2026-09-08']);
  });

  it('previews the focused day for keyboard users with no pointer', () => {
    const picker = engine({ mode: 'range' });
    picker.select(sep(8));
    picker.moveFocus('day-next');
    picker.moveFocus('day-next');
    expect(keysWhere(picker.getSnapshot(), (day) => day.isPreview)).toEqual([
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
    ]);
  });

  it('draws no preview before a range is started', () => {
    const picker = engine({ mode: 'range' });
    picker.hover(sep(12));
    expect(keysWhere(picker.getSnapshot(), (day) => day.isPreview)).toEqual([]);
  });

  it('draws no preview at all in single mode', () => {
    const picker = engine({ mode: 'single' });
    picker.select(sep(8));
    picker.hover(sep(12));
    expect(keysWhere(picker.getSnapshot(), (day) => day.isPreview)).toEqual([]);
  });

  it('previews the whole unit on hover in week mode', () => {
    const picker = engine({ mode: 'week' });
    picker.hover(sep(16));
    expect(keysWhere(picker.getSnapshot(), (day) => day.isPreview)).toEqual([
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
    ]);
  });
});

describe('engine: keyboard navigation', () => {
  const focus = (picker: DatePickerEngineApi): string =>
    toISODate(picker.getSnapshot().focusedDate);
  const view = (picker: DatePickerEngineApi): string =>
    picker.getSnapshot().months[0]?.key ?? 'none';

  it('moves focus by day and by week', () => {
    const picker = engine({ mode: 'single' });
    expect(picker.handleKeyDown({ key: 'ArrowRight' })).toBe(true);
    expect(focus(picker)).toBe('2026-09-05');
    picker.handleKeyDown({ key: 'ArrowLeft' });
    picker.handleKeyDown({ key: 'ArrowLeft' });
    expect(focus(picker)).toBe('2026-09-03');
    picker.handleKeyDown({ key: 'ArrowDown' });
    expect(focus(picker)).toBe('2026-09-10');
    picker.handleKeyDown({ key: 'ArrowUp' });
    picker.handleKeyDown({ key: 'ArrowUp' });
    expect(focus(picker)).toBe('2026-08-27');
  });

  it('moves focus to the week and month edges', () => {
    const picker = engine({ mode: 'single' });
    picker.handleKeyDown({ key: 'Home' });
    expect(focus(picker)).toBe('2026-08-30');
    picker.handleKeyDown({ key: 'End' });
    expect(focus(picker)).toBe('2026-09-05');
    picker.handleKeyDown({ key: 'Home', ctrlKey: true });
    expect(focus(picker)).toBe('2026-09-01');
    picker.handleKeyDown({ key: 'End', ctrlKey: true });
    expect(focus(picker)).toBe('2026-09-30');
  });

  it('pages by month and by year', () => {
    const picker = engine({ mode: 'single' });
    picker.handleKeyDown({ key: 'PageDown' });
    expect(focus(picker)).toBe('2026-10-04');
    picker.handleKeyDown({ key: 'PageUp' });
    expect(focus(picker)).toBe('2026-09-04');
    picker.handleKeyDown({ key: 'PageDown', shiftKey: true });
    expect(focus(picker)).toBe('2027-09-04');
    picker.handleKeyDown({ key: 'PageUp', shiftKey: true });
    expect(focus(picker)).toBe('2026-09-04');
  });

  it('pulls the visible month along with the focus, and no further', () => {
    const picker = engine({ mode: 'single' });
    expect(view(picker)).toBe('2026-09-01');
    picker.handleKeyDown({ key: 'PageDown' });
    expect(view(picker)).toBe('2026-10-01');
    picker.handleKeyDown({ key: 'PageUp' });
    expect(view(picker)).toBe('2026-09-01');
    picker.handleKeyDown({ key: 'ArrowRight' });
    expect(view(picker)).toBe('2026-09-01');
  });

  it('scrolls a multi-month strip by the minimum needed', () => {
    const picker = engine({ mode: 'single', numberOfMonths: 2 });
    picker.focusDate(plainDate(2026, 10, 15));
    expect(view(picker)).toBe('2026-09-01');
    picker.focusDate(plainDate(2026, 11, 3));
    expect(view(picker)).toBe('2026-10-01');
    picker.focusDate(plainDate(2026, 8, 3));
    expect(view(picker)).toBe('2026-08-01');
  });

  it('selects the focused date on Enter and on Space', () => {
    const picker = engine({ mode: 'single' });
    picker.handleKeyDown({ key: 'ArrowRight' });
    picker.handleKeyDown({ key: 'Enter' });
    expect(picker.getSnapshot().value.dates.map(toISODate)).toEqual(['2026-09-05']);
    picker.handleKeyDown({ key: 'ArrowRight' });
    picker.handleKeyDown({ key: ' ' });
    expect(picker.getSnapshot().value.dates.map(toISODate)).toEqual(['2026-09-06']);
  });

  it('clears on Backspace and Delete', () => {
    const picker = engine({ mode: 'single' });
    picker.select(sep(10));
    picker.handleKeyDown({ key: 'Backspace' });
    expect(picker.getSnapshot().isEmpty).toBe(true);
    picker.select(sep(10));
    picker.handleKeyDown({ key: 'Delete' });
    expect(picker.getSnapshot().isEmpty).toBe(true);
  });

  it('jumps to today on "t"', () => {
    const picker = engine({ mode: 'single' });
    picker.goToMonth(plainDate(2027, 3, 1));
    picker.handleKeyDown({ key: 't' });
    expect(focus(picker)).toBe('2026-09-04');
    expect(view(picker)).toBe('2026-09-01');
  });

  it('handles Escape without touching the state, and lets unknown keys bubble', () => {
    const picker = engine({ mode: 'single' });
    const snapshot = picker.getSnapshot();
    expect(picker.handleKeyDown({ key: 'Escape' })).toBe(true);
    expect(picker.getSnapshot()).toBe(snapshot);
    expect(picker.handleKeyDown({ key: 'q' })).toBe(false);
    expect(picker.handleKeyDown({ key: 'Tab' })).toBe(false);
    expect(picker.getSnapshot()).toBe(snapshot);
  });

  it('calls preventDefault only for keys it handles', () => {
    const picker = engine({ mode: 'single' });
    const handled = vi.fn();
    const ignored = vi.fn();
    picker.handleKeyDown({ key: 'ArrowRight', preventDefault: handled });
    picker.handleKeyDown({ key: 'q', preventDefault: ignored });
    expect(handled).toHaveBeenCalledTimes(1);
    expect(ignored).not.toHaveBeenCalled();
  });

  it('mirrors the horizontal arrows in an RTL locale', () => {
    const picker = engine({ mode: 'single', locale: 'ar-EG' });
    expect(picker.getSnapshot().direction).toBe('rtl');
    picker.handleKeyDown({ key: 'ArrowLeft' });
    expect(focus(picker)).toBe('2026-09-05');
    picker.handleKeyDown({ key: 'ArrowRight' });
    picker.handleKeyDown({ key: 'ArrowRight' });
    expect(focus(picker)).toBe('2026-09-03');
    picker.handleKeyDown({ key: 'ArrowDown' });
    expect(focus(picker)).toBe('2026-09-10');
  });

  it('routes a preset shortcut to the matching preset', () => {
    const shortcutPreset = { ...nightsPreset(3), shortcut: 'n' };
    const picker = engine({ mode: 'range', presets: [shortcutPreset] });
    expect(picker.handleKeyDown({ key: 'n' })).toBe(true);
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-04..2026-09-07');
  });

  it('lets a preset claim "t" away from the today shortcut', () => {
    const claimed = { ...nightsPreset(2), shortcut: 't' };
    const picker = engine({ mode: 'range', presets: [claimed] });
    picker.handleKeyDown({ key: 't' });
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-04..2026-09-06');
  });

  it('clamps keyboard focus to the configured bounds', () => {
    const picker = engine({ mode: 'single', minDate: sep(3), maxDate: sep(6) });
    picker.handleKeyDown({ key: 'ArrowLeft' });
    picker.handleKeyDown({ key: 'ArrowLeft' });
    expect(focus(picker)).toBe('2026-09-03');
    for (let i = 0; i < 6; i += 1) picker.handleKeyDown({ key: 'ArrowRight' });
    expect(focus(picker)).toBe('2026-09-06');
  });

  it('lets focus land on a disabled day, which merely cannot be selected', () => {
    const onInvalidSelection = vi.fn();
    const picker = engine({ mode: 'single', disabledDates: [sep(5)], onInvalidSelection });
    picker.handleKeyDown({ key: 'ArrowRight' });
    expect(focus(picker)).toBe('2026-09-05');
    picker.handleKeyDown({ key: 'Enter' });
    expect(onInvalidSelection).toHaveBeenCalledTimes(1);
    expect(picker.getSnapshot().isEmpty).toBe(true);
  });
});

describe('engine: presets', () => {
  it('applies a preset and moves the view to its start', () => {
    const picker = engine({ mode: 'range', presets: ['last-90-days'] as never });
    picker.applyPreset('last-90-days');
    expect(asRange(picker.getSnapshot().value)).toBe('2026-06-07..2026-09-04');
    expect(picker.getSnapshot().months[0]?.key).toBe('2026-06-01');
    expect(toISODate(picker.getSnapshot().focusedDate)).toBe('2026-06-07');
  });

  it('moves the view forward too', () => {
    const picker = engine({ mode: 'range', presets: [builtInPresets['next-month'] as never] });
    picker.applyPreset('next-month');
    expect(asRange(picker.getSnapshot().value)).toBe('2026-10-01..2026-10-31');
    expect(picker.getSnapshot().months[0]?.key).toBe('2026-10-01');
  });

  it('reports the preset through onChange and onPresetApply', () => {
    const onChange = vi.fn();
    const onPresetApply = vi.fn();
    const picker = engine({
      mode: 'range',
      presets: [builtInPresets['1-week'] as never],
      onChange,
      onPresetApply,
    });
    picker.applyPreset('1-week');
    const [, meta] = onChange.mock.calls[0] as [SelectionValue, ChangeMeta];
    expect(meta.reason).toBe('preset');
    expect(meta.preset?.id).toBe('1-week');
    expect(meta.duration).toBe(7);
    expect(onPresetApply).toHaveBeenCalledTimes(1);
    expect((onPresetApply.mock.calls[0] as [{ id: string }])[0].id).toBe('1-week');
  });

  it('clamps the preset value against the constraints before applying it', () => {
    const picker = engine({
      mode: 'range',
      maxDate: sep(8),
      presets: [builtInPresets['1-week'] as never],
    });
    picker.applyPreset('1-week');
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-04..2026-09-08');
  });

  it('does nothing for an unknown id or an unclampable preset', () => {
    const onChange = vi.fn();
    const picker = engine({
      mode: 'range',
      minDate: plainDate(2027, 1, 1),
      presets: [builtInPresets['last-30-days'] as never],
      onChange,
    });
    picker.applyPreset('nope');
    picker.applyPreset('last-30-days');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('survives a preset whose getValue throws', () => {
    const explosive = toDatePreset('boom', 'Boom', () => {
      throw new Error('nope');
    });
    const picker = engine({ mode: 'range', presets: [explosive] });
    expect(() => picker.applyPreset('boom')).not.toThrow();
    expect(picker.getSnapshot().isEmpty).toBe(true);
  });

  it('exposes resolved presets, active state and disabled state on the snapshot', () => {
    const picker = engine({ mode: 'range', presets: [builtInPresets['1-week'] as never] });
    const before = picker.getSnapshot().presets[0];
    expect(before?.id).toBe('1-week');
    expect(before?.disabled).toBe(false);
    expect(before?.resolvedHint).toBe('Sep 4 – Sep 11');
    picker.applyPreset('1-week');
    const after = picker.getSnapshot().presets[0];
    expect(
      after?.isActive(picker.getSnapshot().value, {
        today: TODAY,
        mode: 'range',
        value: picker.getSnapshot().value,
        anchor: null,
        focusedDate: TODAY,
        firstDayOfWeek: 0,
        rangeSemantics: 'nights',
        clamp: (value) => value,
      }),
    ).toBe(true);
  });

  it('falls back to the mode defaults when no presets are configured', () => {
    expect(
      engine({ mode: 'range' })
        .getSnapshot()
        .presets.map((preset) => preset.id),
    ).toEqual(['this-weekend', '3-nights', '1-week', '2-weeks']);
    expect(engine({ mode: 'multiple' }).getSnapshot().presets).toEqual([]);
  });

  it('accepts preset ids as strings', () => {
    const picker = engine({ mode: 'single', presets: ['today', 'nope', 'tomorrow'] as never });
    expect(picker.getSnapshot().presets.map((preset) => preset.id)).toEqual(['today', 'tomorrow']);
  });
});

describe('engine: getValue through each adapter', () => {
  it('returns PlainDate shapes by default', () => {
    const picker = engine({ mode: 'single' });
    picker.select(sep(4));
    expect(picker.getValue()).toEqual(sep(4));
    expect(engine({ mode: 'single' }).getValue()).toBeNull();
  });

  it('returns ISO strings, Dates and timestamps', () => {
    const isoPicker = engine({ mode: 'single', valueAdapter: isoStringAdapter });
    isoPicker.select(sep(4));
    expect(isoPicker.getValue()).toBe('2026-09-04');

    const datePicker = engine({ mode: 'single', valueAdapter: nativeDateAdapter });
    datePicker.select(sep(4));
    const native = datePicker.getValue<Date>();
    expect(native).toBeInstanceOf(Date);
    expect(native.getFullYear()).toBe(2026);
    expect(native.getMonth()).toBe(8);
    expect(native.getDate()).toBe(4);

    const stampPicker = engine({ mode: 'single', valueAdapter: timestampAdapter });
    stampPicker.select(sep(4));
    expect(stampPicker.getValue()).toBe(toDate(sep(4)).getTime());
  });

  it('shapes the value per mode', () => {
    const single = engine({ mode: 'single', valueAdapter: isoStringAdapter });
    single.select(sep(4));
    expect(single.getValue()).toBe('2026-09-04');

    const multiple = engine({ mode: 'multiple', valueAdapter: isoStringAdapter });
    multiple.select(sep(4));
    multiple.select(sep(6));
    expect(multiple.getValue()).toEqual(['2026-09-04', '2026-09-06']);

    const ranged = engine({ mode: 'range', valueAdapter: isoStringAdapter });
    ranged.select(sep(4));
    expect(ranged.getValue()).toEqual({ start: '2026-09-04', end: null });
    ranged.select(sep(6));
    expect(ranged.getValue()).toEqual({ start: '2026-09-04', end: '2026-09-06' });

    const weekly = engine({ mode: 'week', valueAdapter: isoStringAdapter });
    weekly.select(sep(16));
    expect(weekly.getValue()).toEqual({ start: '2026-09-13', end: '2026-09-19' });
  });

  it('returns nulls for an empty selection in every shape', () => {
    expect(engine({ mode: 'range', valueAdapter: isoStringAdapter }).getValue()).toEqual({
      start: null,
      end: null,
    });
    expect(engine({ mode: 'multiple', valueAdapter: isoStringAdapter }).getValue()).toEqual([]);
    expect(engine({ mode: 'single', valueAdapter: isoStringAdapter }).getValue()).toBeNull();
  });

  it('works with a duck-typed library adapter', () => {
    const adapter = createLibraryAdapter(
      'fake',
      (value) =>
        typeof value === 'object' && value !== null && 'ms' in value
          ? new Date((value as { ms: number }).ms)
          : null,
      (date) => ({ tag: toISODate(date) }),
    );
    const picker = engine({ mode: 'multiple', valueAdapter: adapter });
    picker.select(sep(4));
    picker.select(sep(6));
    expect(picker.getValue()).toEqual([{ tag: '2026-09-04' }, { tag: '2026-09-06' }]);
    expect(adapter.name).toBe('fake');
    expect(adapter.toPlain({ isValid: false })).toBeNull();
    expect(adapter.toPlain(null)).toBeNull();
    expect(plainDateAdapter.toPlain('2026-09-04')).toEqual(sep(4));
  });
});

describe('engine: navigation and view state', () => {
  it('steps and jumps between months', () => {
    const picker = engine({ mode: 'single' });
    picker.nextMonth();
    expect(picker.getSnapshot().months[0]?.key).toBe('2026-10-01');
    picker.nextMonth(2);
    expect(picker.getSnapshot().months[0]?.key).toBe('2026-12-01');
    picker.previousMonth(3);
    expect(picker.getSnapshot().months[0]?.key).toBe('2026-09-01');
    picker.goToMonth(plainDate(2027, 3, 20));
    expect(picker.getSnapshot().months[0]?.key).toBe('2027-03-01');
  });

  it('coerces a nonsensical step count to one month', () => {
    const picker = engine({ mode: 'single' });
    picker.nextMonth(0);
    expect(picker.getSnapshot().months[0]?.key).toBe('2026-10-01');
    picker.previousMonth(Number.NaN);
    expect(picker.getSnapshot().months[0]?.key).toBe('2026-09-01');
  });

  it('clamps navigation to the bounds and reports canGoPrevious / canGoNext', () => {
    const picker = engine({ mode: 'single', minDate: sep(1), maxDate: plainDate(2026, 11, 30) });
    expect(picker.getSnapshot().canGoPrevious).toBe(false);
    expect(picker.getSnapshot().canGoNext).toBe(true);
    picker.previousMonth(5);
    expect(picker.getSnapshot().months[0]?.key).toBe('2026-09-01');
    picker.nextMonth(12);
    expect(picker.getSnapshot().months[0]?.key).toBe('2026-11-01');
    expect(picker.getSnapshot().canGoNext).toBe(false);
    expect(picker.getSnapshot().canGoPrevious).toBe(true);
  });

  it('allows free navigation when restrictNavigation is off', () => {
    const picker = engine({ mode: 'single', minDate: sep(1), restrictNavigation: false });
    expect(picker.getSnapshot().canGoPrevious).toBe(true);
    picker.previousMonth(5);
    expect(picker.getSnapshot().months[0]?.key).toBe('2026-04-01');
  });

  it('keeps the last panel of a multi-month strip on maxDate', () => {
    const picker = engine({
      mode: 'single',
      numberOfMonths: 2,
      maxDate: plainDate(2026, 11, 30),
    });
    picker.nextMonth(12);
    expect(picker.getSnapshot().months.map((month) => month.key)).toEqual([
      '2026-10-01',
      '2026-11-01',
    ]);
  });

  it('switches the calendar view', () => {
    const picker = engine({ mode: 'single' });
    expect(picker.getSnapshot().view).toBe('day');
    picker.setView('year');
    expect(picker.getSnapshot().view).toBe('year');
  });

  it('switches the active field', () => {
    const picker = engine({ mode: 'range' });
    expect(picker.getSnapshot().activeField).toBe('start');
    picker.setActiveField('end');
    expect(picker.getSnapshot().activeField).toBe('end');
    picker.setActiveField('nonsense' as 'end');
    expect(picker.getSnapshot().activeField).toBe('end');
  });

  it('opens on the selection, then on defaultMonth, then on today', () => {
    expect(
      engine({
        mode: 'range',
        defaultValue: { start: plainDate(2027, 4, 10), end: null },
      }).getSnapshot().months[0]?.key,
    ).toBe('2027-04-01');
    expect(
      engine({ mode: 'single', defaultMonth: plainDate(2027, 4, 1) }).getSnapshot().months[0]?.key,
    ).toBe('2027-04-01');
    expect(engine({ mode: 'single' }).getSnapshot().months[0]?.key).toBe('2026-09-01');
  });

  it('returns to today from anywhere', () => {
    const picker = engine({ mode: 'single' });
    picker.goToMonth(plainDate(2027, 3, 1));
    picker.goToToday();
    expect(picker.getSnapshot().months[0]?.key).toBe('2026-09-01');
    expect(toISODate(picker.getSnapshot().focusedDate)).toBe('2026-09-04');
  });
});

describe('engine: snapshot content', () => {
  it('summarizes an empty selection', () => {
    const snapshot = engine({ mode: 'range' }).getSnapshot();
    expect(snapshot.isEmpty).toBe(true);
    expect(snapshot.isComplete).toBe(false);
    expect(snapshot.canClear).toBe(false);
    expect(snapshot.duration).toBe(0);
    expect(snapshot.durationLabel).toBe('');
    expect(snapshot.summary).toBe('');
    expect(snapshot.startLabel).toBe('Add date');
    expect(snapshot.endLabel).toBe('Add date');
  });

  it('summarizes a completed range', () => {
    const picker = engine({ mode: 'range' });
    picker.select(sep(4));
    picker.select(sep(25));
    const snapshot = picker.getSnapshot();
    expect(snapshot.duration).toBe(21);
    expect(snapshot.durationLabel).toBe('21 nights');
    expect(snapshot.summary).toBe('Sep 4 – Sep 25, 2026 · 21 nights');
    expect(snapshot.startLabel).toBe('Sep 4');
    expect(snapshot.endLabel).toBe('Sep 25');
    expect(snapshot.canClear).toBe(true);
    expect(snapshot.isComplete).toBe(true);
    expect(snapshot.isSelecting).toBe(false);
  });

  it('counts days rather than nights when asked', () => {
    const picker = engine({ mode: 'range', rangeSemantics: 'days' });
    picker.select(sep(4));
    picker.select(sep(25));
    expect(picker.getSnapshot().durationLabel).toBe('22 days');
  });

  it('leaves the end label empty in single mode', () => {
    const picker = engine({ mode: 'single' });
    picker.select(sep(4));
    const snapshot = picker.getSnapshot();
    expect(snapshot.startLabel).toBe('Sep 4');
    expect(snapshot.endLabel).toBe('');
    expect(snapshot.durationLabel).toBe('');
  });

  it('counts picks in multiple mode', () => {
    const picker = engine({ mode: 'multiple' });
    picker.select(sep(4));
    picker.select(sep(6));
    expect(picker.getSnapshot().duration).toBe(2);
    expect(picker.getSnapshot().durationLabel).toBe('2 days');
  });

  it('announces selections, clears and month changes', () => {
    const picker = engine({ mode: 'range' });
    picker.select(sep(4));
    picker.select(sep(6));
    expect(picker.getSnapshot().announcement).toBe('Selected Sep 4 – Sep 6, 2026 · 2 nights');
    picker.nextMonth();
    expect(picker.getSnapshot().announcement).toBe('Showing October 2026');
    picker.clear();
    expect(picker.getSnapshot().announcement).toBe('Selection cleared');
  });

  it('honours label and formatter overrides', () => {
    const picker = engine({
      mode: 'range',
      labels: { emptyValue: 'Pick one', announceCleared: 'Gone' },
      formatters: { fieldDate: (date) => toISODate(date) },
    });
    expect(picker.getSnapshot().startLabel).toBe('Pick one');
    picker.select(sep(4));
    expect(picker.getSnapshot().startLabel).toBe('2026-09-04');
    expect(picker.getSnapshot().labels.emptyValue).toBe('Pick one');
  });

  it('exposes locale, direction and today', () => {
    const snapshot = engine({ mode: 'single', locale: 'de-DE' }).getSnapshot();
    expect(snapshot.locale).toBe('de-DE');
    expect(snapshot.direction).toBe('ltr');
    expect(snapshot.today).toEqual(TODAY);
    expect(snapshot.months[0]?.label).toBe('September 2026');
  });

  it('resolves firstDayOfWeek from the locale unless overridden', () => {
    expect(engine({ mode: 'single', locale: 'en-US' }).getSnapshot().weekdays[0]?.weekday).toBe(0);
    expect(engine({ mode: 'single', locale: 'de-DE' }).getSnapshot().weekdays[0]?.weekday).toBe(1);
    expect(
      engine({ mode: 'single', locale: 'de-DE', firstDayOfWeek: 0 }).getSnapshot().weekdays[0]
        ?.weekday,
    ).toBe(0);
  });
});

describe('engine: setValue, setTime and parseInput', () => {
  it('sets a whole value at once and moves the focus onto it', () => {
    const onChange = vi.fn();
    const picker = engine({ mode: 'range', onChange });
    picker.setValue({ start: sep(10), end: sep(14) });
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-10..2026-09-14');
    expect(toISODate(picker.getSnapshot().focusedDate)).toBe('2026-09-10');
    expect((onChange.mock.calls[0] as [SelectionValue, ChangeMeta])[1].reason).toBe('controlled');
    picker.setValue(null, 'input');
    expect(picker.getSnapshot().isEmpty).toBe(true);
  });

  it('attaches times without disturbing the dates', () => {
    const onChange = vi.fn();
    const picker = engine({ mode: 'range', onChange });
    picker.select(sep(10));
    picker.select(sep(14));
    picker.setTime('start', { hour: 15, minute: 0, second: 0 });
    picker.setTime('end', { hour: 11, minute: 0, second: 0 });
    const value = picker.getSnapshot().value;
    expect(asRange(value)).toBe('2026-09-10..2026-09-14');
    expect(value.times).toEqual({
      start: { hour: 15, minute: 0, second: 0 },
      end: { hour: 11, minute: 0, second: 0 },
    });
    expect((onChange.mock.calls.at(-1) as [SelectionValue, ChangeMeta])[1].reason).toBe('time');
  });

  it('clamps a time into the configured window', () => {
    const picker = engine({
      mode: 'single',
      time: {
        minTime: { hour: 9, minute: 0, second: 0 },
        maxTime: { hour: 17, minute: 0, second: 0 },
      },
    });
    picker.select(sep(10));
    picker.setTime('start', { hour: 6, minute: 0, second: 0 });
    expect(picker.getSnapshot().value.times?.start).toEqual({ hour: 9, minute: 0, second: 0 });
    picker.setTime('start', { hour: 22, minute: 0, second: 0 });
    expect(picker.getSnapshot().value.times?.start).toEqual({ hour: 17, minute: 0, second: 0 });
  });

  it('routes typed text through the normal selection path', () => {
    const picker = engine({ mode: 'range' });
    expect(picker.parseInput('Sep 10 to Sep 14')).toBe(true);
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-10..2026-09-14');
    expect(picker.parseInput('nonsense')).toBe(false);
    expect(picker.parseInput('')).toBe(false);
    expect(picker.parseInput('   ')).toBe(false);
  });

  it('parses a single field when one is named', () => {
    const picker = engine({ mode: 'range' });
    expect(picker.parseInput('Sep 10', 'start')).toBe(true);
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-10..');
    expect(picker.parseInput('Sep 14', 'end')).toBe(true);
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-10..2026-09-14');
  });

  it('refuses typed text that violates a constraint', () => {
    const onInvalidSelection = vi.fn();
    const picker = engine({ mode: 'single', maxDate: sep(10), onInvalidSelection });
    expect(picker.parseInput('Sep 20')).toBe(false);
    expect(onInvalidSelection).toHaveBeenCalledTimes(1);
    expect(picker.getSnapshot().isEmpty).toBe(true);
  });

  it('applies the same constraints to a typed range', () => {
    const picker = engine({ mode: 'range', minNights: 5 });
    expect(picker.parseInput('Sep 10 to Sep 12')).toBe(false);
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-10..');
  });
});

describe('engine: options merging', () => {
  it('ignores a setOptions call that changes nothing', () => {
    const picker = engine({ mode: 'single', numberOfMonths: 2 });
    const listener = vi.fn();
    picker.subscribe(listener);
    picker.setOptions({ mode: 'single', numberOfMonths: 2 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('re-renders when a real option changes', () => {
    const picker = engine({ mode: 'single' });
    const listener = vi.fn();
    picker.subscribe(listener);
    picker.setOptions({ numberOfMonths: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(picker.getSnapshot().months).toHaveLength(3);
  });

  it('re-normalizes the value when the mode changes', () => {
    const picker = engine({ mode: 'range', defaultValue: { start: sep(4), end: sep(6) } });
    picker.setOptions({ mode: 'multiple' });
    expect(picker.getSnapshot().value.dates.map(toISODate)).toEqual([
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
    expect(picker.getSnapshot().mode).toBe('multiple');
  });

  it('re-resolves the constraints and re-clamps the focus', () => {
    const picker = engine({ mode: 'single' });
    picker.focusDate(sep(20));
    picker.setOptions({ maxDate: sep(10) });
    expect(toISODate(picker.getSnapshot().focusedDate)).toBe('2026-09-10');
    expect(picker.getSnapshot().canGoNext).toBe(false);
  });

  it('reports its options back with the resolved mode', () => {
    const picker = engine({ minNights: 2 });
    expect(picker.getOptions().mode).toBe('single');
    expect(picker.getOptions().minNights).toBe(2);
    picker.setOptions({ mode: 'range' });
    expect(picker.getOptions().mode).toBe('range');
  });

  it('defaults to single mode', () => {
    expect(engine().getSnapshot().mode).toBe('single');
    expect(createDatePicker().getSnapshot().mode).toBe('single');
    expect(new DatePickerEngine().getSnapshot().mode).toBe('single');
  });
});

describe('engine: destroy', () => {
  it('stops notifying subscribers', () => {
    const picker = engine({ mode: 'single' });
    const listener = vi.fn();
    picker.subscribe(listener);
    picker.destroy();
    picker.select(sep(10));
    picker.hover(sep(11));
    picker.clear();
    picker.nextMonth();
    expect(listener).not.toHaveBeenCalled();
  });

  it('refuses new subscriptions after destruction', () => {
    const picker = engine({ mode: 'single' });
    picker.destroy();
    const listener = vi.fn();
    const unsubscribe = picker.subscribe(listener);
    picker.select(sep(10));
    expect(listener).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  it('stops mutating state and firing callbacks', () => {
    const onChange = vi.fn();
    const picker = engine({ mode: 'single', onChange });
    picker.destroy();
    picker.select(sep(10));
    picker.setValue(sep(12));
    picker.applyPreset('today');
    picker.setOptions({ mode: 'range' });
    picker.parseInput('Sep 10');
    picker.handleKeyDown({ key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
    expect(picker.getSnapshot().isEmpty).toBe(true);
  });

  it('is idempotent', () => {
    const picker = engine({ mode: 'single' });
    picker.destroy();
    expect(() => picker.destroy()).not.toThrow();
  });

  it('still serves a readable snapshot', () => {
    const picker = engine({ mode: 'single' });
    picker.select(sep(10));
    picker.destroy();
    const snapshot = picker.getSnapshot();
    expect(snapshot.value.dates.map(toISODate)).toEqual(['2026-09-10']);
    expect(snapshot.months).toHaveLength(1);
  });
});

describe('engine: modes end to end', () => {
  it('drives a single-date picker', () => {
    const picker = engine({ mode: 'single' });
    picker.select(sep(10));
    expect(picker.getSnapshot().value.dates.map(toISODate)).toEqual(['2026-09-10']);
    picker.select(sep(10));
    expect(picker.getSnapshot().isEmpty).toBe(true);
  });

  it('drives a multi-date picker with a rolling cap', () => {
    const picker = engine({ mode: 'multiple', maxSelections: 2, rollingSelection: true });
    picker.select(sep(1));
    picker.select(sep(2));
    picker.select(sep(3));
    expect(picker.getSnapshot().value.dates.map(toISODate)).toEqual(['2026-09-02', '2026-09-03']);
  });

  it('rejects a pick past a hard multi-date cap', () => {
    const picker = engine({ mode: 'multiple', maxSelections: 2 });
    picker.select(sep(1));
    picker.select(sep(2));
    picker.select(sep(3));
    expect(picker.getSnapshot().value.dates.map(toISODate)).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('drives every unit mode from a single click', () => {
    const expected: Record<string, string> = {
      week: '2026-09-13..2026-09-19',
      month: '2026-09-01..2026-09-30',
      quarter: '2026-07-01..2026-09-30',
      year: '2026-01-01..2026-12-31',
    };
    for (const [mode, range] of Object.entries(expected)) {
      const picker = engine({ mode: mode as 'week' });
      picker.select(sep(16));
      expect(asRange(picker.getSnapshot().value)).toBe(range);
      expect(picker.getSnapshot().isComplete).toBe(true);
    }
  });

  it('reverses a backwards range pick', () => {
    const picker = engine({ mode: 'range' });
    picker.select(sep(14));
    picker.select(sep(10));
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-10..2026-09-14');
  });

  it('restarts instead of reversing when allowReverseRange is off', () => {
    const picker = engine({ mode: 'range', allowReverseRange: false });
    picker.select(sep(14));
    picker.select(sep(10));
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-10..');
  });

  it('nudges the nearer edge when resetOnComplete is off', () => {
    const picker = engine({ mode: 'range', resetOnComplete: false });
    picker.select(sep(10));
    picker.select(sep(14));
    picker.select(sep(20));
    expect(asRange(picker.getSnapshot().value)).toBe('2026-09-10..2026-09-20');
  });
});
