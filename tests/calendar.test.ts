import { describe, expect, it, vi } from 'vitest';
import {
  buildMonthOptions,
  buildMonths,
  buildWeekdays,
  buildYearOptions,
} from '../src/core/calendar';
import { resolveFormatters, resolveLabels } from '../src/core/intl';
import { emptySelection } from '../src/core/selection';
import { plainDate, toISODate } from '../src/core/plain-date';
import type { BuildCalendarInput } from '../src/core/calendar';
import type { DayInfo, MonthInfo, PlainDate, SelectionValue } from '../src/core/types';

const sep = (day: number): PlainDate => plainDate(2026, 9, day);

/** September 2026 starts on a Tuesday and has 30 days; 2026-09-04 is a Friday. */
const input = (over: Partial<BuildCalendarInput> = {}): BuildCalendarInput => ({
  viewMonth: plainDate(2026, 9, 1),
  numberOfMonths: 1,
  locale: 'en-US',
  firstDayOfWeek: 0,
  weekendDays: [0, 6],
  fixedWeeks: true,
  showOutsideDays: true,
  showWeekNumbers: false,
  formatters: resolveFormatters(),
  today: sep(4),
  mode: 'range',
  value: emptySelection(),
  previewRange: null,
  focusedDate: sep(4),
  hoveredDate: null,
  evaluate: () => ({ selectable: true }),
  labels: resolveLabels(),
  ...over,
});

const build = (over: Partial<BuildCalendarInput> = {}): MonthInfo[] => buildMonths(input(over));

const first = (over: Partial<BuildCalendarInput> = {}): MonthInfo => {
  const month = build(over)[0];
  if (!month) throw new Error('buildMonths returned no months');
  return month;
};

const dayAt = (month: MonthInfo, key: string): DayInfo => {
  const day = month.days.find((candidate) => candidate.key === key);
  if (!day) throw new Error(`no cell for ${key}`);
  return day;
};

const keysWhere = (months: MonthInfo[], predicate: (day: DayInfo) => boolean): string[] =>
  months.flatMap((month) => month.days.filter(predicate).map((day) => day.key));

const rangeValue = (start: PlainDate, end: PlainDate | null): SelectionValue => ({
  dates: [],
  range: { start, end },
});

describe('calendar: grid geometry', () => {
  it('emits exactly 42 cells and 6 rows when fixedWeeks is on', () => {
    const month = first();
    expect(month.days).toHaveLength(42);
    expect(month.weeks).toHaveLength(6);
    for (const week of month.weeks) expect(week.days).toHaveLength(7);
  });

  it('keeps 42 cells for a short February and for a 31-day month starting late', () => {
    for (const viewMonth of [plainDate(2026, 2, 1), plainDate(2026, 8, 1), plainDate(2027, 5, 1)]) {
      expect(first({ viewMonth, focusedDate: viewMonth }).days).toHaveLength(42);
    }
  });

  it('starts every grid on firstDayOfWeek', () => {
    for (let firstDayOfWeek = 0; firstDayOfWeek < 7; firstDayOfWeek += 1) {
      const month = first({ firstDayOfWeek });
      expect(month.days[0]?.weekday).toBe(firstDayOfWeek);
      expect(month.days[0]?.isWeekStart).toBe(true);
      expect(month.days[6]?.isWeekEnd).toBe(true);
    }
  });

  it('runs consecutive days with no gap or repeat', () => {
    const month = first();
    const keys = month.days.map((day) => day.key);
    expect(new Set(keys).size).toBe(42);
    expect(keys[0]).toBe('2026-08-30');
    expect(keys[41]).toBe('2026-10-10');
  });

  it('trims to the needed rows when fixedWeeks is off', () => {
    const month = first({ viewMonth: plainDate(2026, 9, 1), fixedWeeks: false });
    expect(month.weeks).toHaveLength(5);
    expect(month.days).toHaveLength(35);
  });

  it('emits no empty leading row for a month whose first day is the first day of the week', () => {
    // 2026-02-01 is a Sunday, and February 2026 has exactly 28 days.
    const month = first({
      viewMonth: plainDate(2026, 2, 1),
      focusedDate: plainDate(2026, 2, 3),
      fixedWeeks: false,
      firstDayOfWeek: 0,
    });
    expect(month.weeks).toHaveLength(4);
    expect(month.days).toHaveLength(28);
    expect(month.days[0]?.key).toBe('2026-02-01');
    expect(month.days[0]?.inCurrentMonth).toBe(true);
    expect(month.days.every((day) => day.inCurrentMonth)).toBe(true);
    expect(month.days[27]?.key).toBe('2026-02-28');
  });

  it('pads that same month to 6 rows once fixedWeeks is on', () => {
    const month = first({
      viewMonth: plainDate(2026, 2, 1),
      focusedDate: plainDate(2026, 2, 3),
      fixedWeeks: true,
      firstDayOfWeek: 0,
    });
    expect(month.weeks).toHaveLength(6);
    expect(month.days[0]?.key).toBe('2026-02-01');
    expect(month.days[41]?.key).toBe('2026-03-14');
  });

  it('renders a whole strip of consecutive months', () => {
    const months = build({ numberOfMonths: 3 });
    expect(months.map((month) => month.key)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
    expect(months[0]?.isFirstVisible).toBe(true);
    expect(months[0]?.isLastVisible).toBe(false);
    expect(months[2]?.isLastVisible).toBe(true);
    months.forEach((month, index) => expect(month.index).toBe(index));
  });

  it('coerces a nonsensical month count to one month', () => {
    expect(build({ numberOfMonths: 0 })).toHaveLength(1);
    expect(build({ numberOfMonths: -3 })).toHaveLength(1);
    expect(build({ numberOfMonths: Number.NaN })).toHaveLength(1);
    expect(build({ numberOfMonths: 2.9 })).toHaveLength(2);
  });

  it('normalizes an out-of-range firstDayOfWeek', () => {
    expect(first({ firstDayOfWeek: 7 }).days[0]?.weekday).toBe(0);
    expect(first({ firstDayOfWeek: -1 }).days[0]?.weekday).toBe(6);
    expect(first({ firstDayOfWeek: Number.NaN }).days[0]?.weekday).toBe(0);
  });

  it('normalizes the view month to its first day', () => {
    expect(first({ viewMonth: sep(17) }).key).toBe('2026-09-01');
    expect(first({ viewMonth: sep(17) }).date).toEqual(plainDate(2026, 9, 1));
  });
});

describe('calendar: roving tab stop', () => {
  it('gives exactly one cell tabIndex 0 in a single month', () => {
    const months = build();
    expect(keysWhere(months, (day) => day.tabIndex === 0)).toEqual(['2026-09-04']);
    expect(keysWhere(months, (day) => day.isFocused)).toEqual(['2026-09-04']);
  });

  it('gives exactly one cell tabIndex 0 across a whole three-month strip', () => {
    const months = build({ numberOfMonths: 3, focusedDate: plainDate(2026, 11, 20) });
    expect(keysWhere(months, (day) => day.tabIndex === 0)).toEqual(['2026-11-20']);
    expect(months[2]?.days.filter((day) => day.tabIndex === 0)).toHaveLength(1);
    expect(months[0]?.days.every((day) => day.tabIndex === -1)).toBe(true);
  });

  it('prefers the month that owns the focused date over a neighbour rendering it as an outside day', () => {
    // 2026-10-01 is rendered as a trailing outside day of September too.
    const months = build({ numberOfMonths: 2, focusedDate: plainDate(2026, 10, 1) });
    expect(keysWhere(months, (day) => day.tabIndex === 0)).toEqual(['2026-10-01']);
    expect(months[1]?.days.find((day) => day.tabIndex === 0)?.inCurrentMonth).toBe(true);
  });

  it('falls back to the first day of the first month when the focus is off screen', () => {
    const months = build({ focusedDate: plainDate(2027, 5, 5) });
    expect(keysWhere(months, (day) => day.tabIndex === 0)).toEqual(['2026-09-01']);
  });

  it('uses a visible outside cell when the focused date is only rendered as one', () => {
    // 2026-08-31 is a leading outside day of the September grid.
    const months = build({ focusedDate: plainDate(2026, 8, 31) });
    const focused = keysWhere(months, (day) => day.tabIndex === 0);
    expect(focused).toEqual(['2026-08-31']);
    expect(dayAt(months[0] as MonthInfo, '2026-08-31').inCurrentMonth).toBe(false);
  });

  it('falls back to the first day when outside days are hidden and the focus lives outside', () => {
    const months = build({ focusedDate: plainDate(2026, 8, 31), showOutsideDays: false });
    expect(keysWhere(months, (day) => day.tabIndex === 0)).toEqual(['2026-09-01']);
  });

  it('always leaves exactly one tab stop for any focus date in a two-month strip', () => {
    for (let day = 1; day <= 28; day += 1) {
      const months = build({ numberOfMonths: 2, focusedDate: plainDate(2026, 10, day) });
      expect(keysWhere(months, (cell) => cell.tabIndex === 0)).toHaveLength(1);
    }
  });
});

describe('calendar: outside days', () => {
  it('labels and enables outside days when showOutsideDays is on', () => {
    const month = first();
    const outside = dayAt(month, '2026-08-30');
    expect(outside.inCurrentMonth).toBe(false);
    expect(outside.label).toBe('30');
    expect(outside.isDisabled).toBe(false);
    expect(outside.ariaLabel).toContain('August');
  });

  it('keeps outside cells in the grid but blanks and disables them when hidden', () => {
    const month = first({ showOutsideDays: false });
    const outside = dayAt(month, '2026-08-30');
    expect(month.days).toHaveLength(42);
    expect(outside.inCurrentMonth).toBe(false);
    expect(outside.label).toBe('');
    expect(outside.ariaLabel).toBe('');
    expect(outside.isDisabled).toBe(true);
    expect(outside.disabledReason).toBeUndefined();
  });

  it('never evaluates a hidden outside day', () => {
    const evaluate = vi.fn((_date: PlainDate) => ({ selectable: true }));
    buildMonths(input({ showOutsideDays: false, evaluate }));
    const probed = evaluate.mock.calls.map(([date]) => toISODate(date));
    expect(probed).not.toContain('2026-08-30');
    expect(probed).toContain('2026-09-01');
  });

  it('marks the current month cells correctly at both seams', () => {
    const month = first();
    expect(dayAt(month, '2026-08-31').inCurrentMonth).toBe(false);
    expect(dayAt(month, '2026-09-01').inCurrentMonth).toBe(true);
    expect(dayAt(month, '2026-09-30').inCurrentMonth).toBe(true);
    expect(dayAt(month, '2026-10-01').inCurrentMonth).toBe(false);
    expect(month.days.filter((day) => day.inCurrentMonth)).toHaveLength(30);
  });
});

describe('calendar: selection and preview flags', () => {
  it('flags range start, middle and end on exactly the right cells', () => {
    const month = first({ value: rangeValue(sep(4), sep(7)) });
    expect(keysWhere([month], (day) => day.isRangeStart)).toEqual(['2026-09-04']);
    expect(keysWhere([month], (day) => day.isRangeEnd)).toEqual(['2026-09-07']);
    expect(keysWhere([month], (day) => day.isInRange)).toEqual(['2026-09-05', '2026-09-06']);
    expect(keysWhere([month], (day) => day.isSelected)).toEqual(['2026-09-04', '2026-09-07']);
  });

  it('flags a half-open range on its start alone', () => {
    const month = first({ value: rangeValue(sep(4), null) });
    expect(keysWhere([month], (day) => day.isRangeStart)).toEqual(['2026-09-04']);
    expect(keysWhere([month], (day) => day.isRangeEnd)).toEqual([]);
    expect(keysWhere([month], (day) => day.isInRange)).toEqual([]);
  });

  it('flags a collapsed range as both start and end with no interior', () => {
    const month = first({ value: rangeValue(sep(4), sep(4)) });
    expect(dayAt(month, '2026-09-04').isRangeStart).toBe(true);
    expect(dayAt(month, '2026-09-04').isRangeEnd).toBe(true);
    expect(keysWhere([month], (day) => day.isInRange)).toEqual([]);
  });

  it('flags individual dates in list modes and leaves the range flags off', () => {
    const month = first({
      mode: 'multiple',
      value: { dates: [sep(4), sep(9)], range: { start: null, end: null } },
    });
    expect(keysWhere([month], (day) => day.isSelected)).toEqual(['2026-09-04', '2026-09-09']);
    expect(keysWhere([month], (day) => day.isRangeStart)).toEqual([]);
    expect(keysWhere([month], (day) => day.isInRange)).toEqual([]);
  });

  it('flags a preview band and its two caps', () => {
    const month = first({ previewRange: { start: sep(10), end: sep(12) } });
    expect(keysWhere([month], (day) => day.isPreview)).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ]);
    expect(keysWhere([month], (day) => day.isPreviewStart)).toEqual(['2026-09-10']);
    expect(keysWhere([month], (day) => day.isPreviewEnd)).toEqual(['2026-09-12']);
  });

  it('flags a one-ended preview on that end alone', () => {
    const month = first({ previewRange: { start: sep(10), end: null } });
    expect(keysWhere([month], (day) => day.isPreview)).toEqual(['2026-09-10']);
    expect(keysWhere([month], (day) => day.isPreviewEnd)).toEqual([]);
  });

  it('normalizes a reversed preview range', () => {
    const month = first({ previewRange: { start: sep(12), end: sep(10) } });
    expect(keysWhere([month], (day) => day.isPreviewStart)).toEqual(['2026-09-10']);
    expect(keysWhere([month], (day) => day.isPreviewEnd)).toEqual(['2026-09-12']);
  });

  it('keeps preview and selection flags independent', () => {
    const month = first({
      value: rangeValue(sep(4), sep(6)),
      previewRange: { start: sep(10), end: sep(12) },
    });
    expect(dayAt(month, '2026-09-05').isInRange).toBe(true);
    expect(dayAt(month, '2026-09-05').isPreview).toBe(false);
    expect(dayAt(month, '2026-09-11').isPreview).toBe(true);
    expect(dayAt(month, '2026-09-11').isInRange).toBe(false);
  });

  it('flags today, hover and weekends', () => {
    const month = first({ hoveredDate: sep(9) });
    expect(keysWhere([month], (day) => day.isToday)).toEqual(['2026-09-04']);
    expect(dayAt(month, '2026-09-04').ariaCurrent).toBe('date');
    expect(dayAt(month, '2026-09-05').ariaCurrent).toBeUndefined();
    expect(keysWhere([month], (day) => day.isHovered)).toEqual(['2026-09-09']);
    expect(dayAt(month, '2026-09-05').isWeekend).toBe(true);
    expect(dayAt(month, '2026-09-06').isWeekend).toBe(true);
    expect(dayAt(month, '2026-09-07').isWeekend).toBe(false);
  });

  it('follows a custom weekend definition', () => {
    const month = first({ weekendDays: [5, 6] });
    expect(dayAt(month, '2026-09-04').isWeekend).toBe(true);
    expect(dayAt(month, '2026-09-06').isWeekend).toBe(false);
  });

  it('marks a whole row selected only when every cell is in the range', () => {
    // The week 2026-09-06 … 2026-09-12 lies wholly inside this range.
    const month = first({ value: rangeValue(sep(1), sep(20)) });
    const fullyInside = month.weeks
      .filter((week) => week.isSelected)
      .map((week) => week.days[0]?.key);
    expect(fullyInside).toEqual(['2026-09-06', '2026-09-13']);
  });
});

describe('calendar: disabled state', () => {
  const blocked = (date: PlainDate) =>
    date.day === 10
      ? { selectable: false as const, reason: 'blocked-range' as const, message: 'Not available' }
      : date.day === 11
        ? { selectable: false as const, reason: 'before-min' as const, message: 'Too early' }
        : { selectable: true as const };

  it('separates blocked days from out-of-bounds days', () => {
    const month = first({ evaluate: blocked });
    expect(dayAt(month, '2026-09-10').isDisabled).toBe(true);
    expect(dayAt(month, '2026-09-10').isBlocked).toBe(true);
    expect(dayAt(month, '2026-09-10').isOutsideBounds).toBe(false);
    expect(dayAt(month, '2026-09-11').isBlocked).toBe(false);
    expect(dayAt(month, '2026-09-11').isOutsideBounds).toBe(true);
    expect(dayAt(month, '2026-09-12').isDisabled).toBe(false);
  });

  it('carries the reason and message onto the cell', () => {
    const month = first({ evaluate: blocked });
    expect(dayAt(month, '2026-09-10').disabledReason).toBe('blocked-range');
    expect(dayAt(month, '2026-09-10').disabledMessage).toBe('Not available');
    expect(dayAt(month, '2026-09-12').disabledReason).toBeUndefined();
    expect(dayAt(month, '2026-09-12').disabledMessage).toBeUndefined();
  });

  it('treats crosses-blocked as blocked for styling purposes', () => {
    const month = first({
      evaluate: (date) =>
        date.day === 15 ? { selectable: false, reason: 'crosses-blocked' } : { selectable: true },
    });
    expect(dayAt(month, '2026-09-15').isBlocked).toBe(true);
  });

  it('mirrors disabled state onto the aria attributes', () => {
    const month = first({ evaluate: blocked });
    expect(dayAt(month, '2026-09-10').ariaDisabled).toBe(true);
    expect(dayAt(month, '2026-09-12').ariaDisabled).toBe(false);
  });
});

describe('calendar: aria labels', () => {
  it('labels a plain day with the full localized date', () => {
    expect(dayAt(first(), '2026-09-09').ariaLabel).toBe('Wednesday, September 9, 2026');
  });

  it('appends the today label', () => {
    expect(dayAt(first(), '2026-09-04').ariaLabel).toBe('Friday, September 4, 2026, Today');
  });

  it('appends the range role in range modes', () => {
    const month = first({ value: rangeValue(sep(9), sep(12)) });
    expect(dayAt(month, '2026-09-09').ariaLabel).toBe('Wednesday, September 9, 2026, Check-in');
    expect(dayAt(month, '2026-09-12').ariaLabel).toBe('Saturday, September 12, 2026, Check-out');
    expect(dayAt(month, '2026-09-10').ariaLabel).toBe('Thursday, September 10, 2026, in range');
  });

  it('appends "selected" in list modes', () => {
    const month = first({
      mode: 'multiple',
      value: { dates: [sep(9)], range: { start: null, end: null } },
    });
    expect(dayAt(month, '2026-09-09').ariaLabel).toBe('Wednesday, September 9, 2026, selected');
  });

  it('appends the disabled message, falling back to the generic label', () => {
    const withMessage = first({
      evaluate: (date) =>
        date.day === 9
          ? { selectable: false, reason: 'blocked-range', message: 'Booked' }
          : { selectable: true },
    });
    expect(dayAt(withMessage, '2026-09-09').ariaLabel).toBe('Wednesday, September 9, 2026, Booked');

    const withoutMessage = first({
      evaluate: (date) => (date.day === 9 ? { selectable: false } : { selectable: true }),
    });
    expect(dayAt(withoutMessage, '2026-09-09').ariaLabel).toBe(
      'Wednesday, September 9, 2026, Not available',
    );
  });

  it('honours overridden labels and formatters', () => {
    const month = first({
      value: rangeValue(sep(9), sep(12)),
      labels: resolveLabels({ startLabel: 'Arrivée', endLabel: 'Départ' }),
      formatters: resolveFormatters({ ariaDay: (date) => toISODate(date) }),
    });
    expect(dayAt(month, '2026-09-09').ariaLabel).toBe('2026-09-09, Arrivée');
    expect(dayAt(month, '2026-09-12').ariaLabel).toBe('2026-09-12, Départ');
  });

  it('reports aria-selected for the endpoints and the band alike', () => {
    const month = first({ value: rangeValue(sep(9), sep(12)) });
    expect(dayAt(month, '2026-09-09').ariaSelected).toBe(true);
    expect(dayAt(month, '2026-09-10').ariaSelected).toBe(true);
    expect(dayAt(month, '2026-09-08').ariaSelected).toBe(false);
  });
});

describe('calendar: week numbers', () => {
  it('leaves the label empty until week numbers are switched on', () => {
    expect(first().weeks.every((week) => week.weekNumberLabel === '')).toBe(true);
  });

  it('numbers the September 2026 rows 36 through 41', () => {
    const month = first({ showWeekNumbers: true });
    expect(month.weeks.map((week) => week.isoWeek)).toEqual([36, 37, 38, 39, 40, 41]);
    expect(month.weeks.map((week) => week.weekNumberLabel)).toEqual([
      '36',
      '37',
      '38',
      '39',
      '40',
      '41',
    ]);
  });

  it('rolls the row number over a year boundary', () => {
    const month = first({
      viewMonth: plainDate(2025, 12, 1),
      focusedDate: plainDate(2025, 12, 1),
      showWeekNumbers: true,
    });
    expect(month.weeks.map((week) => week.isoWeek)).toEqual([49, 50, 51, 52, 1, 2]);
  });

  it('gives each day its own ISO week number', () => {
    const month = first();
    expect(dayAt(month, '2026-09-04').isoWeek).toBe(36);
    expect(dayAt(month, '2026-09-07').isoWeek).toBe(37);
    // A Sunday belongs to the ISO week that ends on it, not the one the row starts.
    expect(dayAt(month, '2026-09-06').isoWeek).toBe(36);
  });

  it('honours a custom week-number formatter', () => {
    const month = first({
      showWeekNumbers: true,
      formatters: resolveFormatters({ weekNumber: (week) => `W${week}` }),
    });
    expect(month.weeks[0]?.weekNumberLabel).toBe('W36');
  });

  it('gives every row a unique, stable key', () => {
    const months = build({ numberOfMonths: 2 });
    const keys = months.flatMap((month) => month.weeks.map((week) => week.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(months[0]?.weeks[0]?.key).toBe('2026-09-01:2026-08-30');
  });
});

describe('calendar: dayMeta', () => {
  it('attaches meta to the cells that have it', () => {
    const month = first({
      dayMeta: (date) =>
        date.day === 12 ? { note: '$248', badge: 3, tooltip: 'Busy' } : undefined,
    });
    expect(dayAt(month, '2026-09-12').meta).toEqual({ note: '$248', badge: 3, tooltip: 'Busy' });
    expect(dayAt(month, '2026-09-13').meta).toBeUndefined();
  });

  it('raises isHoliday from the meta', () => {
    const month = first({ dayMeta: (date) => (date.day === 25 ? { holiday: 'Fiesta' } : null) });
    expect(dayAt(month, '2026-09-25').isHoliday).toBe(true);
    expect(dayAt(month, '2026-09-25').meta?.holiday).toBe('Fiesta');
    expect(dayAt(month, '2026-09-24').isHoliday).toBe(false);
  });

  it('treats a null return as no meta', () => {
    const month = first({ dayMeta: () => null });
    expect(dayAt(month, '2026-09-12').meta).toBeUndefined();
    expect(dayAt(month, '2026-09-12').isHoliday).toBe(false);
  });

  it('only asks for meta on current-month cells', () => {
    const dayMeta = vi.fn((_date: PlainDate) => ({ note: 'x' }));
    buildMonths(input({ dayMeta }));
    const probed = dayMeta.mock.calls.map(([date]) => toISODate(date));
    expect(probed).toHaveLength(30);
    expect(probed[0]).toBe('2026-09-01');
    expect(probed).not.toContain('2026-08-30');
  });
});

describe('calendar: buildWeekdays', () => {
  it('starts on Sunday and marks the weekend for en-US', () => {
    const weekdays = buildWeekdays('en-US', 0, [0, 6]);
    expect(weekdays.map((weekday) => weekday.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdays.map((weekday) => weekday.short)).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
    expect(weekdays.map((weekday) => weekday.isWeekend)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('rotates to a Monday-first week', () => {
    const weekdays = buildWeekdays('en-US', 1, [0, 6]);
    expect(weekdays.map((weekday) => weekday.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekdays[0]?.abbreviated).toBe('Mon');
    expect(weekdays[0]?.long).toBe('Monday');
    expect(weekdays[6]?.long).toBe('Sunday');
  });

  it('localizes the names', () => {
    const weekdays = buildWeekdays('de-DE', 1, [0, 6]);
    expect(weekdays.map((weekday) => weekday.abbreviated)).toEqual([
      'Mo',
      'Di',
      'Mi',
      'Do',
      'Fr',
      'Sa',
      'So',
    ]);
    expect(weekdays[0]?.long).toBe('Montag');
  });

  it('normalizes an out-of-range firstDayOfWeek', () => {
    expect(buildWeekdays('en-US', 8, [0, 6])[0]?.weekday).toBe(1);
    expect(buildWeekdays('en-US', -1, [0, 6])[0]?.weekday).toBe(6);
  });

  it('shares one weekday array by reference across every rendered month', () => {
    const months = build({ numberOfMonths: 3 });
    expect(months[1]?.weekdays).toBe(months[0]?.weekdays);
    expect(months[2]?.weekdays).toBe(months[0]?.weekdays);
  });
});

describe('calendar: month captions', () => {
  it('formats the caption, month and year separately', () => {
    const month = first();
    expect(month.label).toBe('September 2026');
    expect(month.monthLabel).toBe('September');
    expect(month.yearLabel).toBe('2026');
    expect(month.year).toBe(2026);
    expect(month.month).toBe(9);
  });

  it('localizes the caption', () => {
    expect(first({ locale: 'de-DE' }).label).toBe('September 2026');
    expect(first({ locale: 'fr-FR' }).monthLabel).toBe('septembre');
  });
});

describe('calendar: buildYearOptions', () => {
  const formatters = resolveFormatters();

  it('reaches a century either side of the visible year by default', () => {
    const years = buildYearOptions(plainDate(2026, 9, 1), null, null, 'en-US', formatters);
    // ±100 years, inclusive of the visible year itself.
    expect(years).toHaveLength(201);
    expect(years[0]?.year).toBe(1926);
    expect(years[200]?.year).toBe(2126);
    expect(years.filter((year) => year.isCurrent).map((year) => year.year)).toEqual([2026]);
    expect(years.every((year) => !year.disabled)).toBe(true);
  });

  it('honours a custom span', () => {
    const years = buildYearOptions(plainDate(2026, 9, 1), null, null, 'en-US', formatters, 2);
    expect(years.map((year) => year.year)).toEqual([2024, 2025, 2026, 2027, 2028]);
    expect(
      buildYearOptions(plainDate(2026, 9, 1), null, null, 'en-US', formatters, 0),
    ).toHaveLength(1);
  });

  it('clips the window to the configured bounds', () => {
    const years = buildYearOptions(
      plainDate(2026, 9, 1),
      plainDate(2025, 1, 1),
      plainDate(2027, 12, 31),
      'en-US',
      formatters,
    );
    expect(years.map((year) => year.year)).toEqual([2025, 2026, 2027]);
  });

  it('still represents the visible year when the bounds exclude it, marked disabled', () => {
    const years = buildYearOptions(
      plainDate(2030, 9, 1),
      plainDate(2025, 1, 1),
      plainDate(2027, 12, 31),
      'en-US',
      formatters,
    );
    const current = years.find((year) => year.isCurrent);
    expect(current?.year).toBe(2030);
    expect(current?.disabled).toBe(true);
  });

  it('labels each year with the formatter', () => {
    const years = buildYearOptions(plainDate(2026, 9, 1), null, null, 'en-US', formatters, 0);
    expect(years[0]?.label).toBe('2026');
  });
});

describe('calendar: buildMonthOptions', () => {
  const formatters = resolveFormatters();

  it('always offers twelve months and flags the visible one', () => {
    const options = buildMonthOptions(plainDate(2026, 9, 1), null, null, 'en-US', formatters);
    expect(options).toHaveLength(12);
    expect(options.map((option) => option.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(options.filter((option) => option.isCurrent).map((option) => option.month)).toEqual([9]);
    expect(options[0]?.label).toBe('January');
  });

  it('disables only the months that lie wholly outside the bounds', () => {
    const options = buildMonthOptions(
      plainDate(2026, 9, 1),
      plainDate(2026, 3, 20),
      plainDate(2026, 10, 5),
      'en-US',
      formatters,
    );
    expect(options.filter((option) => !option.disabled).map((option) => option.month)).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it('localizes the labels', () => {
    const options = buildMonthOptions(plainDate(2026, 9, 1), null, null, 'de-DE', formatters);
    expect(options[8]?.label).toBe('September');
    expect(options[0]?.label).toBe('Januar');
  });
});

describe('calendar: purity', () => {
  it('returns a freshly built strip on every call', () => {
    const options = input();
    const a = buildMonths(options);
    const b = buildMonths(options);
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    expect(a[0]?.days[0]).not.toBe(b[0]?.days[0]);
    expect(a[0]?.days.map((day) => day.key)).toEqual(b[0]?.days.map((day) => day.key));
  });

  it('does not mutate the value or the preview range it is given', () => {
    const value = rangeValue(sep(4), sep(7));
    const previewRange = { start: sep(12), end: sep(10) };
    const before = JSON.stringify({ value, previewRange });
    buildMonths(input({ value, previewRange }));
    expect(JSON.stringify({ value, previewRange })).toBe(before);
  });
});
