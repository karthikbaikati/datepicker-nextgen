import { describe, expect, it, vi } from 'vitest';
import {
  analyticsPresets,
  bookingPresets,
  builtInPresets,
  createPreset,
  daysPreset,
  defaultPresetsFor,
  getPreset,
  lastNDaysPreset,
  monthPreset,
  nextNDaysPreset,
  nightsPreset,
  normalizePresetResult,
  normalizePresets,
  quarterPreset,
  resolvePresets,
  schedulingPresets,
  toDatePreset,
  weekendPreset,
  yearPreset,
} from '../src/core/presets';
import { clampSelection, resolveConstraints } from '../src/core/constraints';
import { emptySelection } from '../src/core/selection';
import { plainDate, toISODate } from '../src/core/plain-date';
import type {
  DatePreset,
  PlainDate,
  PresetContext,
  SelectionMode,
  SelectionValue,
} from '../src/core/types';

/** 2026-09-04 is a Friday. Every expectation below is pinned to it. */
const TODAY = plainDate(2026, 9, 4);
const LOCALE = 'en-US';

const sep = (day: number): PlainDate => plainDate(2026, 9, day);

const context = (over: Partial<PresetContext> = {}): PresetContext => ({
  today: TODAY,
  mode: 'range',
  value: emptySelection(),
  anchor: null,
  focusedDate: TODAY,
  firstDayOfWeek: 0,
  rangeSemantics: 'nights',
  clamp: (value) => value,
  ...over,
});

/** `"2026-09-04..2026-09-11"`, `"2026-09-04.."` or `"[a,b]"` for a date list. */
const shape = (value: SelectionValue | null): string | null => {
  if (!value) return null;
  if (value.range.start || value.range.end) {
    return `${value.range.start ? toISODate(value.range.start) : ''}..${value.range.end ? toISODate(value.range.end) : ''}`;
  }
  return `[${value.dates.map(toISODate).join(',')}]`;
};

const run = (preset: DatePreset, ctx: PresetContext = context()): string | null =>
  shape(normalizePresetResult(preset.getValue(ctx), ctx.mode));

const runById = (id: string, ctx: PresetContext = context()): string | null => {
  const preset = builtInPresets[id];
  expect(preset, `built-in preset "${id}" is missing`).toBeDefined();
  return run(preset as DatePreset, ctx);
};

describe('presets: the built-in catalogue', () => {
  it('ships every id the contract lists, with the documented label', () => {
    const expected: Record<string, string> = {
      today: 'Today',
      tomorrow: 'Tomorrow',
      yesterday: 'Yesterday',
      'this-weekend': 'Weekend',
      'next-weekend': 'Next weekend',
      '3-nights': '3 nights',
      '1-week': '1 week',
      '2-weeks': '2 weeks',
      '1-month': '1 month',
      'last-7-days': 'Last 7 days',
      'last-30-days': 'Last 30 days',
      'last-90-days': 'Last 90 days',
      'this-week': 'This week',
      'this-month': 'This month',
      'last-month': 'Last month',
      'this-quarter': 'This quarter',
      'last-quarter': 'Last quarter',
      'year-to-date': 'Year to date',
      'this-year': 'This year',
      'next-week': 'Next week',
      'next-month': 'Next month',
      'next-monday': 'Next Monday',
    };
    for (const [id, label] of Object.entries(expected)) {
      expect(builtInPresets[id], `missing preset "${id}"`).toBeDefined();
      expect(builtInPresets[id]?.label).toBe(label);
      expect(builtInPresets[id]?.id).toBe(id);
    }
  });

  it('looks presets up by id and returns undefined for unknown ones', () => {
    expect(getPreset('today')).toBe(builtInPresets['today']);
    expect(getPreset('nope')).toBeUndefined();
    expect(getPreset('')).toBeUndefined();
  });
});

describe('presets: exact output for Friday 2026-09-04 in range mode', () => {
  it('resolves the single-day presets', () => {
    expect(runById('today')).toBe('2026-09-04..');
    expect(runById('tomorrow')).toBe('2026-09-05..');
    expect(runById('yesterday')).toBe('2026-09-03..');
    expect(runById('next-monday')).toBe('2026-09-07..');
    expect(runById('in-2-weeks')).toBe('2026-09-18..');
  });

  it('resolves the weekend presets Friday through Sunday', () => {
    expect(runById('this-weekend')).toBe('2026-09-04..2026-09-06');
    expect(runById('next-weekend')).toBe('2026-09-11..2026-09-13');
  });

  it('resolves the stay-length presets', () => {
    expect(runById('3-nights')).toBe('2026-09-04..2026-09-07');
    expect(runById('1-week')).toBe('2026-09-04..2026-09-11');
    expect(runById('2-weeks')).toBe('2026-09-04..2026-09-18');
    expect(runById('1-month')).toBe('2026-09-04..2026-10-04');
  });

  it('resolves the rolling-window presets inclusively', () => {
    expect(runById('last-7-days')).toBe('2026-08-29..2026-09-04');
    expect(runById('last-30-days')).toBe('2026-08-06..2026-09-04');
    expect(runById('last-90-days')).toBe('2026-06-07..2026-09-04');
    expect(runById('year-to-date')).toBe('2026-01-01..2026-09-04');
  });

  it('resolves the calendar-unit presets', () => {
    expect(runById('this-week')).toBe('2026-08-30..2026-09-05');
    expect(runById('next-week')).toBe('2026-09-06..2026-09-12');
    expect(runById('this-month')).toBe('2026-09-01..2026-09-30');
    expect(runById('last-month')).toBe('2026-08-01..2026-08-31');
    expect(runById('next-month')).toBe('2026-10-01..2026-10-31');
    expect(runById('this-quarter')).toBe('2026-07-01..2026-09-30');
    expect(runById('last-quarter')).toBe('2026-04-01..2026-06-30');
    expect(runById('this-year')).toBe('2026-01-01..2026-12-31');
  });

  it('follows firstDayOfWeek for the week presets', () => {
    expect(runById('this-week', context({ firstDayOfWeek: 1 }))).toBe('2026-08-31..2026-09-06');
    expect(runById('next-week', context({ firstDayOfWeek: 1 }))).toBe('2026-09-07..2026-09-13');
    expect(runById('this-week', context({ firstDayOfWeek: 6 }))).toBe('2026-08-29..2026-09-04');
  });

  it('never reads the wall clock — the same context always gives the same answer', () => {
    const other = context({ today: plainDate(2019, 2, 14) });
    expect(runById('today', other)).toBe('2019-02-14..');
    expect(runById('this-month', other)).toBe('2019-02-01..2019-02-28');
    expect(runById('last-90-days', other)).toBe('2018-11-17..2019-02-14');
  });
});

describe('presets: single and multiple modes', () => {
  it('produces a bare date rather than a range in single mode', () => {
    const ctx = context({ mode: 'single' });
    expect(runById('today', ctx)).toBe('[2026-09-04]');
    expect(runById('tomorrow', ctx)).toBe('[2026-09-05]');
    expect(runById('next-monday', ctx)).toBe('[2026-09-07]');
  });

  it('expands a span into every day in multiple mode', () => {
    const ctx = context({ mode: 'multiple' });
    expect(runById('this-weekend', ctx)).toBe('[2026-09-04,2026-09-05,2026-09-06]');
  });

  it('collapses a day preset to a same-day range under days semantics', () => {
    expect(runById('today', context({ rangeSemantics: 'days' }))).toBe('2026-09-04..2026-09-04');
    expect(runById('today', context({ rangeSemantics: 'nights' }))).toBe('2026-09-04..');
  });
});

describe('presets: duration presets extend from an existing check-in', () => {
  it('measures "1 week" from the pending anchor, not from today', () => {
    expect(runById('1-week', context({ anchor: sep(20) }))).toBe('2026-09-20..2026-09-27');
    expect(runById('3-nights', context({ anchor: sep(20) }))).toBe('2026-09-20..2026-09-23');
    expect(runById('1-month', context({ anchor: plainDate(2026, 1, 31) }))).toBe(
      '2026-01-31..2026-02-28',
    );
  });

  it('falls back to the current range start when there is no anchor', () => {
    const value: SelectionValue = { dates: [], range: { start: sep(12), end: sep(14) } };
    expect(runById('1-week', context({ value }))).toBe('2026-09-12..2026-09-19');
  });

  it('falls back to today when nothing is picked yet', () => {
    expect(runById('1-week')).toBe('2026-09-04..2026-09-11');
  });

  it('anchors the weekend and window presets on today regardless of the anchor', () => {
    const ctx = context({ anchor: sep(20) });
    expect(runById('this-weekend', ctx)).toBe('2026-09-04..2026-09-06');
    expect(runById('last-7-days', ctx)).toBe('2026-08-29..2026-09-04');
  });

  it('honours an explicit `from` on the duration factories', () => {
    const ctx = context({ anchor: sep(20), focusedDate: sep(2) });
    expect(run(nightsPreset(2, { from: 'today' }), ctx)).toBe('2026-09-04..2026-09-06');
    expect(run(nightsPreset(2, { from: 'focused' }), ctx)).toBe('2026-09-02..2026-09-04');
    expect(run(nightsPreset(2, { from: 'anchor' }), ctx)).toBe('2026-09-20..2026-09-22');
  });
});

describe('presets: factories', () => {
  it('names and measures nightsPreset', () => {
    const one = nightsPreset(1);
    expect(one.id).toBe('1-night');
    expect(one.label).toBe('1 night');
    expect(run(one)).toBe('2026-09-04..2026-09-05');
    const five = nightsPreset(5);
    expect(five.id).toBe('5-nights');
    expect(run(five)).toBe('2026-09-04..2026-09-09');
    expect(run(nightsPreset(0))).toBe('2026-09-04..2026-09-05');
    expect(run(nightsPreset(2.7))).toBe('2026-09-04..2026-09-06');
  });

  it('measures daysPreset against the picker semantics', () => {
    const three = daysPreset(3);
    expect(three.id).toBe('3-days');
    expect(three.label).toBe('3 days');
    expect(run(three, context({ rangeSemantics: 'nights' }))).toBe('2026-09-04..2026-09-07');
    expect(run(three, context({ rangeSemantics: 'days' }))).toBe('2026-09-04..2026-09-06');
  });

  it('builds inclusive rolling windows', () => {
    expect(run(lastNDaysPreset(1))).toBe('2026-09-04..2026-09-04');
    expect(run(lastNDaysPreset(7))).toBe('2026-08-29..2026-09-04');
    expect(run(lastNDaysPreset(7, { includeToday: false }))).toBe('2026-08-28..2026-09-03');
    expect(lastNDaysPreset(1).label).toBe('Last 1 day');
    expect(run(nextNDaysPreset(7))).toBe('2026-09-04..2026-09-10');
    expect(run(nextNDaysPreset(7, { includeToday: false }))).toBe('2026-09-05..2026-09-11');
    expect(nextNDaysPreset(30).id).toBe('next-30-days');
  });

  it('offsets the weekend preset by whole weeks and keeps a Fri–Sun hint', () => {
    expect(run(weekendPreset({ offset: 0 }))).toBe('2026-09-04..2026-09-06');
    expect(run(weekendPreset({ offset: 2 }))).toBe('2026-09-18..2026-09-20');
    expect(weekendPreset({ offset: 2 }).id).toBe('weekend-plus-2');
    expect(weekendPreset({ offset: 2 }).label).toBe('Weekend +2');
    expect(weekendPreset().hint).toBe('Fri – Sun');
  });

  it('offers the current weekend while it is still running on Saturday', () => {
    const saturday = context({ today: sep(5) });
    expect(run(weekendPreset(), saturday)).toBe('2026-09-04..2026-09-06');
    const sunday = context({ today: sep(6) });
    expect(run(weekendPreset(), sunday)).toBe('2026-09-11..2026-09-13');
    const monday = context({ today: sep(7) });
    expect(run(weekendPreset(), monday)).toBe('2026-09-11..2026-09-13');
  });

  it('offsets the calendar-unit factories in both directions', () => {
    expect(run(monthPreset(-2))).toBe('2026-07-01..2026-07-31');
    expect(monthPreset(-2).id).toBe('month-minus-2');
    expect(monthPreset(-2).label).toBe('2 months ago');
    expect(monthPreset(2).id).toBe('month-plus-2');
    expect(monthPreset(2).label).toBe('In 2 months');
    expect(run(quarterPreset(1))).toBe('2026-10-01..2026-12-31');
    expect(run(quarterPreset(-2))).toBe('2026-01-01..2026-03-31');
    expect(run(yearPreset(-1))).toBe('2025-01-01..2025-12-31');
    expect(run(yearPreset(1))).toBe('2027-01-01..2027-12-31');
  });

  it('accepts id, label and hint overrides', () => {
    const custom = nightsPreset(3, { id: 'weekender', label: 'Long weekend', hint: 'Fri – Mon' });
    expect(custom.id).toBe('weekender');
    expect(custom.label).toBe('Long weekend');
    expect(custom.hint).toBe('Fri – Mon');
  });

  it('validates definitions passed to createPreset', () => {
    expect(() => createPreset({ id: '', label: 'x', getValue: () => null })).toThrow(TypeError);
    expect(() => createPreset({ id: 'x', label: 'x' } as unknown as DatePreset)).toThrow(TypeError);
    const preset = createPreset({ id: 'x', getValue: () => null } as unknown as DatePreset);
    expect(preset.label).toBe('x');
    expect(Object.isFrozen(preset)).toBe(true);
  });

  it('builds a terse one-off preset with toDatePreset', () => {
    const nye = toDatePreset('nye', 'New Year', (ctx) => ({
      start: plainDate(ctx.today.year, 12, 31),
      end: plainDate(ctx.today.year + 1, 1, 1),
    }));
    expect(nye.id).toBe('nye');
    expect(nye.label).toBe('New Year');
    expect(run(nye)).toBe('2026-12-31..2027-01-01');
  });
});

describe('presets: bundles', () => {
  it('lists the flagship booking chips in order', () => {
    expect(bookingPresets.map((p) => p.id)).toEqual([
      'this-weekend',
      '3-nights',
      '1-week',
      '2-weeks',
    ]);
  });

  it('lists the analytics sidebar in order', () => {
    expect(analyticsPresets.map((p) => p.id)).toEqual([
      'today',
      'yesterday',
      'last-7-days',
      'last-30-days',
      'last-90-days',
      'this-month',
      'last-month',
      'this-quarter',
      'year-to-date',
    ]);
  });

  it('lists the scheduling shortcuts in order', () => {
    expect(schedulingPresets.map((p) => p.id)).toEqual([
      'today',
      'tomorrow',
      'next-week',
      'next-monday',
      'in-2-weeks',
      'next-month',
    ]);
  });

  it('picks a sensible default set per mode and returns a fresh array', () => {
    expect(defaultPresetsFor('range').map((p) => p.id)).toEqual(bookingPresets.map((p) => p.id));
    expect(defaultPresetsFor('range')).not.toBe(defaultPresetsFor('range'));
    expect(defaultPresetsFor('single').map((p) => p.id)).toEqual([
      'today',
      'tomorrow',
      'next-monday',
    ]);
    for (const mode of ['multiple', 'week', 'month', 'quarter', 'year'] as SelectionMode[]) {
      expect(defaultPresetsFor(mode)).toEqual([]);
    }
  });
});

describe('presets: normalizePresets', () => {
  it('resolves built-in ids, keeps preset objects and drops the rest', () => {
    const custom = nightsPreset(4);
    const result = normalizePresets(['today', custom, 'nope', ' last-7-days ']);
    expect(result.map((p) => p.id)).toEqual(['today', '4-nights', 'last-7-days']);
  });

  it('drops duplicates by id, keeping the first', () => {
    const result = normalizePresets(['today', 'today', builtInPresets['today'] as DatePreset]);
    expect(result).toHaveLength(1);
  });

  it('returns an empty array for undefined input', () => {
    expect(normalizePresets(undefined)).toEqual([]);
    expect(normalizePresets([])).toEqual([]);
  });

  it('drops malformed entries', () => {
    const malformed = [{ id: 'x' }, { getValue: () => null }, null] as unknown as DatePreset[];
    expect(normalizePresets(malformed)).toEqual([]);
  });
});

describe('presets: normalizePresetResult', () => {
  it('accepts a bare PlainDate', () => {
    expect(shape(normalizePresetResult(sep(4), 'single'))).toBe('[2026-09-04]');
    expect(shape(normalizePresetResult(sep(4), 'range'))).toBe('2026-09-04..');
  });

  it('accepts a DateRange and a full SelectionValue', () => {
    expect(shape(normalizePresetResult({ start: sep(4), end: sep(6) }, 'range'))).toBe(
      '2026-09-04..2026-09-06',
    );
    expect(
      shape(
        normalizePresetResult({ dates: [sep(4)], range: { start: null, end: null } }, 'multiple'),
      ),
    ).toBe('[2026-09-04]');
  });

  it('normalizes a reversed range and de-duplicates a date list', () => {
    expect(shape(normalizePresetResult({ start: sep(6), end: sep(4) }, 'range'))).toBe(
      '2026-09-04..2026-09-06',
    );
    expect(
      shape(
        normalizePresetResult(
          { dates: [sep(6), sep(4), sep(6)], range: { start: null, end: null } },
          'multiple',
        ),
      ),
    ).toBe('[2026-09-04,2026-09-06]');
  });

  it('keeps only the first date in single mode', () => {
    expect(
      shape(
        normalizePresetResult(
          { dates: [sep(4), sep(6)], range: { start: null, end: null } },
          'single',
        ),
      ),
    ).toBe('[2026-09-04]');
  });

  it('turns a date list into a range for range-like modes', () => {
    expect(
      shape(
        normalizePresetResult(
          { dates: [sep(4), sep(5), sep(6)], range: { start: null, end: null } },
          'range',
        ),
      ),
    ).toBe('2026-09-04..2026-09-06');
  });

  it('rejects null and unrecognizable shapes', () => {
    expect(normalizePresetResult(null, 'range')).toBeNull();
    expect(normalizePresetResult(undefined, 'range')).toBeNull();
    expect(normalizePresetResult({ nope: 1 } as unknown as SelectionValue, 'range')).toBeNull();
  });

  it('carries times through', () => {
    const withTime = normalizePresetResult(
      {
        dates: [],
        range: { start: sep(4), end: sep(6) },
        times: { start: { hour: 15, minute: 0, second: 0 }, end: null },
      },
      'range',
    );
    expect(withTime?.times?.start?.hour).toBe(15);
  });
});

describe('presets: clamping against constraints', () => {
  const constrained = (options: Parameters<typeof resolveConstraints>[0]): PresetContext => {
    const constraints = resolveConstraints(options, TODAY);
    return context({
      clamp: (value) =>
        clampSelection(value, constraints, {
          mode: 'range',
          today: TODAY,
          value: emptySelection(),
          activeField: 'start',
          anchor: null,
        }),
    });
  };

  it('shortens a preset that would run past maxDate', () => {
    expect(runById('1-week', constrained({ maxDate: sep(8) }))).toBe('2026-09-04..2026-09-08');
  });

  it('shortens a preset that would cross a blocked night', () => {
    expect(
      runById('1-week', constrained({ blockedRanges: [{ start: sep(7), end: sep(7) }] })),
    ).toBe('2026-09-04..2026-09-06');
  });

  it('pulls a backward-looking preset up to minDate', () => {
    expect(runById('last-30-days', constrained({ minDate: sep(1) }))).toBe(
      '2026-09-01..2026-09-04',
    );
  });

  it('returns null when the preset cannot be made valid at all', () => {
    expect(runById('last-30-days', constrained({ minDate: plainDate(2027, 1, 1) }))).toBeNull();
    expect(runById('1-week', constrained({ minNights: 30, maxDate: sep(8) }))).toBeNull();
  });

  it('applies the clamp to every built-in without throwing', () => {
    const ctx = constrained({ minDate: sep(3), maxDate: sep(6) });
    for (const id of Object.keys(builtInPresets)) {
      expect(() => runById(id, ctx)).not.toThrow();
    }
  });
});

describe('presets: resolvePresets', () => {
  const list = [
    builtInPresets['1-week'] as DatePreset,
    builtInPresets['3-nights'] as DatePreset,
    builtInPresets['2-weeks'] as DatePreset,
  ];

  it('marks exactly the chip whose value matches the current selection', () => {
    const value: SelectionValue = { dates: [], range: { start: sep(4), end: sep(11) } };
    const ctx = context({ value });
    const resolved = resolvePresets(list, ctx, value, LOCALE);
    const active = resolved
      .filter((preset) => preset.isActive(value, ctx))
      .map((preset) => preset.id);
    expect(active).toEqual(['1-week']);
  });

  it('marks the 3-nights chip when that is what is selected', () => {
    const value: SelectionValue = { dates: [], range: { start: sep(4), end: sep(7) } };
    const ctx = context({ value });
    const active = resolvePresets(list, ctx, value, LOCALE)
      .filter((preset) => preset.isActive(value, ctx))
      .map((preset) => preset.id);
    expect(active).toEqual(['3-nights']);
  });

  it('marks nothing when the selection matches no chip', () => {
    const value: SelectionValue = { dates: [], range: { start: sep(4), end: sep(9) } };
    const ctx = context({ value });
    expect(
      resolvePresets(list, ctx, value, LOCALE).some((preset) => preset.isActive(value, ctx)),
    ).toBe(false);
  });

  it('marks nothing for an empty selection', () => {
    const ctx = context();
    expect(
      resolvePresets(list, ctx, emptySelection(), LOCALE).some((preset) =>
        preset.isActive(emptySelection(), ctx),
      ),
    ).toBe(false);
  });

  it('computes a resolved hint from the produced value', () => {
    const resolved = resolvePresets(list, context(), emptySelection(), LOCALE);
    expect(resolved.map((preset) => preset.resolvedHint)).toEqual([
      'Sep 4 – Sep 11',
      'Sep 4 – Sep 7',
      'Sep 4 – Sep 18',
    ]);
  });

  it('adds the year to a hint that leaves the current year', () => {
    const [resolved] = resolvePresets(
      [builtInPresets['1-month'] as DatePreset],
      context({ anchor: plainDate(2026, 12, 20) }),
      emptySelection(),
      LOCALE,
    );
    expect(resolved?.resolvedHint).toBe('Dec 20, 2026 – Jan 20, 2027');
  });

  it('renders a single-day hint without a dash', () => {
    const [resolved] = resolvePresets(
      [builtInPresets['today'] as DatePreset],
      context({ mode: 'single' }),
      emptySelection(),
      LOCALE,
    );
    expect(resolved?.resolvedHint).toBe('Sep 4');
  });

  it('summarizes a long date list as "a, b +n"', () => {
    const many = toDatePreset('many', 'Many', () => ({
      dates: [sep(1), sep(2), sep(3), sep(4), sep(5)],
      range: { start: null, end: null },
    }));
    const [resolved] = resolvePresets(
      [many],
      context({ mode: 'multiple' }),
      emptySelection(),
      LOCALE,
    );
    expect(resolved?.resolvedHint).toBe('Sep 1, Sep 2 +3');
  });

  it('disables a chip whose value cannot be clamped and falls back to its static hint', () => {
    const impossible = context({ clamp: () => null });
    const [resolved] = resolvePresets([weekendPreset()], impossible, emptySelection(), LOCALE);
    expect(resolved?.disabled).toBe(true);
    expect(resolved?.resolvedHint).toBe('Fri – Sun');
  });

  it('hides a chip that opted into hideWhenInvalid', () => {
    const impossible = context({ clamp: () => null });
    const hidden: DatePreset = { ...weekendPreset(), hideWhenInvalid: true };
    expect(resolvePresets([hidden], impossible, emptySelection(), LOCALE)).toHaveLength(0);
    expect(resolvePresets([weekendPreset()], impossible, emptySelection(), LOCALE)).toHaveLength(1);
  });

  it('disables — never throws for — a preset whose getValue throws', () => {
    const explosive = toDatePreset('boom', 'Boom', () => {
      throw new Error('nope');
    });
    const resolved = resolvePresets([explosive], context(), emptySelection(), LOCALE);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.disabled).toBe(true);
    expect(resolved[0]?.isActive(emptySelection(), context())).toBe(false);
  });

  it('runs getValue exactly once per preset per resolve pass', () => {
    const spy = vi.fn(() => sep(4));
    const counted = toDatePreset('counted', 'Counted', spy);
    resolvePresets([counted], context(), emptySelection(), LOCALE);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('keeps a custom isActive instead of the default equality test', () => {
    const custom: DatePreset = { ...nightsPreset(3), isActive: () => true };
    const resolved = resolvePresets([custom], context(), emptySelection(), LOCALE);
    expect(resolved[0]?.isActive(emptySelection(), context())).toBe(true);
  });

  it('skips malformed entries in the list', () => {
    const malformed = [null, { id: 'x' }] as unknown as DatePreset[];
    expect(resolvePresets(malformed, context(), emptySelection(), LOCALE)).toEqual([]);
  });

  it('recomputes against a foreign context rather than reusing the resolve-time value', () => {
    const ctx = context();
    const [resolved] = resolvePresets(list, ctx, emptySelection(), LOCALE);
    const other = context({ today: sep(20) });
    const matching: SelectionValue = { dates: [], range: { start: sep(20), end: sep(27) } };
    expect(resolved?.isActive(matching, other)).toBe(true);
    expect(resolved?.isActive(matching, ctx)).toBe(false);
  });

  it('preserves id, label and every other preset field', () => {
    const [resolved] = resolvePresets(
      [{ ...nightsPreset(3), group: 'Stays', shortcut: 'n' }],
      context(),
      emptySelection(),
      LOCALE,
    );
    expect(resolved?.id).toBe('3-nights');
    expect(resolved?.label).toBe('3 nights');
    expect(resolved?.group).toBe('Stays');
    expect(resolved?.shortcut).toBe('n');
  });
});
