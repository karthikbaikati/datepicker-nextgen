/**
 * Calendar view-model builder.
 *
 * Turns engine state into the {@link MonthInfo} / {@link DayInfo} structures every
 * renderer consumes. This is the hottest code in the library — it re-runs on every
 * state change for every visible cell — so the inner loop works in *epoch-day
 * integers*: each cell materialises its `PlainDate` once and every selection,
 * range and preview test is a plain integer comparison rather than a field-by-field
 * date compare.
 *
 * Nothing here mutates its input and every object handed back is freshly built, so
 * a snapshot can be memoized by reference upstream.
 */
import { weekdayInfos } from './intl';
import {
  addMonths,
  endOfMonth,
  fromEpochDay,
  getISOWeek,
  isAfter,
  isBefore,
  isSameMonth,
  normalizeRange,
  startOfMonth,
  startOfWeek,
  startOfYear,
  toEpochDay,
  toISODate,
} from './plain-date';
import type {
  CalendarSnapshot,
  CalendarView,
  DateRange,
  DayEvaluation,
  DayInfo,
  DayMeta,
  Formatters,
  Labels,
  MonthInfo,
  PlainDate,
  SelectionMode,
  SelectionValue,
  WeekInfo,
  WeekdayInfo,
  ZoomCell,
  ZoomState,
} from './types';

export interface BuildZoomInput {
  /** Which zoomed-out screen to build. `'day'` yields the shared empty state. */
  level: CalendarView;
  viewMonth: PlainDate;
  today: PlainDate;
  value: SelectionValue;
  mode: SelectionMode;
  minDate: PlainDate | null;
  maxDate: PlainDate | null;
  locale: string;
  formatters: Formatters;
}

export interface BuildCalendarInput {
  viewMonth: PlainDate;
  numberOfMonths: number;
  locale: string;
  firstDayOfWeek: number;
  weekendDays: readonly number[];
  fixedWeeks: boolean;
  showOutsideDays: boolean;
  showWeekNumbers: boolean;
  formatters: Formatters;
  today: PlainDate;
  mode: SelectionMode;
  value: SelectionValue;
  previewRange: DateRange | null;
  focusedDate: PlainDate;
  hoveredDate: PlainDate | null;
  evaluate: (date: PlainDate) => DayEvaluation;
  dayMeta?: (date: PlainDate) => DayMeta | undefined | null;
  labels: Labels;
}

type YearOption = CalendarSnapshot['years'][number];
type MonthOption = CalendarSnapshot['monthOptions'][number];

/** Modes whose selection lives in `value.range` rather than `value.dates`. */
const RANGE_MODES: ReadonlySet<SelectionMode> = new Set<SelectionMode>([
  'range',
  'week',
  'month',
  'quarter',
  'year',
]);

/** `Labels` has no key for these two states; override `formatters.ariaDay` for full control. */
const SELECTED_TEXT = 'selected';
const IN_RANGE_TEXT = 'in range';

const DEFAULT_YEAR_SPAN = 100;

/** Three columns by four rows — the same geometry at every zoomed-out level. */
const ZOOM_CELL_COUNT = 12;

/** A `year` screen is a fixed block of twelve; a `decade` screen twelve of those. */
const YEAR_BLOCK = 12;
const DECADE_SPAN = 10;
const DECADE_BLOCK = DECADE_SPAN * ZOOM_CELL_COUNT;

/** Caption separator between the first and last cell of a multi-year screen. */
const RANGE_DASH = ' – ';

/** Days marked unavailable because the calendar hides them, not because a rule rejected them. */
const HIDDEN_DAY_EVALUATION: DayEvaluation = { selectable: false };

const mod7 = (value: number): number => ((value % 7) + 7) % 7;

function normalizeWeekday(value: number): number {
  return Number.isFinite(value) ? mod7(Math.trunc(value)) : 0;
}

interface EpochRange {
  start: number | null;
  end: number | null;
}

function toEpochRange(range: DateRange | null | undefined): EpochRange {
  if (!range) return { start: null, end: null };
  const { start, end } = normalizeRange(range);
  return { start: start ? toEpochDay(start) : null, end: end ? toEpochDay(end) : null };
}

function toEpochSet(dates: readonly PlainDate[] | undefined): Set<number> {
  const set = new Set<number>();
  if (dates) for (const date of dates) set.add(toEpochDay(date));
  return set;
}

/**
 * Weekday header cells for one locale/week configuration. Built once per calendar
 * build and shared by reference across every rendered month so renderers can skip
 * re-rendering the header when only the day grid changed.
 */
export function buildWeekdays(
  locale: string,
  firstDayOfWeek: number,
  weekendDays: readonly number[],
): WeekdayInfo[] {
  return weekdayInfos(locale, normalizeWeekday(firstDayOfWeek), weekendDays);
}

/**
 * Build the visible month strip. Grids always run whole weeks starting on
 * `firstDayOfWeek`, and outside days are always emitted so the grid geometry never
 * shifts — `showOutsideDays` only decides whether they are labelled and reachable.
 */
export function buildMonths(input: BuildCalendarInput): MonthInfo[] {
  const {
    viewMonth,
    locale,
    fixedWeeks,
    showOutsideDays,
    showWeekNumbers,
    formatters,
    value,
    previewRange,
    evaluate,
    dayMeta,
    labels,
  } = input;

  const firstDayOfWeek = normalizeWeekday(input.firstDayOfWeek);
  const monthCount = Number.isFinite(input.numberOfMonths)
    ? Math.max(1, Math.trunc(input.numberOfMonths))
    : 1;
  const weekdays = buildWeekdays(locale, firstDayOfWeek, input.weekendDays);

  const weekendLookup = [false, false, false, false, false, false, false];
  for (const day of input.weekendDays) weekendLookup[normalizeWeekday(day)] = true;

  const todayEpoch = toEpochDay(input.today);
  const focusEpoch = toEpochDay(input.focusedDate);
  const hoverEpoch = input.hoveredDate ? toEpochDay(input.hoveredDate) : null;

  const rangeMode = RANGE_MODES.has(input.mode);
  const selected = rangeMode ? toEpochRange(value.range) : null;
  const selectedDates = rangeMode ? null : toEpochSet(value.dates);
  const preview = toEpochRange(previewRange);

  // Grid geometry first: focus resolution needs to know which months actually
  // render `focusedDate` before any cell is built.
  const base = startOfMonth(viewMonth);
  const grids: { start: PlainDate; gridStartEpoch: number; rows: number }[] = [];
  for (let index = 0; index < monthCount; index += 1) {
    const start = index === 0 ? base : addMonths(base, index);
    const gridStartEpoch = toEpochDay(startOfWeek(start, firstDayOfWeek));
    const rows = fixedWeeks
      ? 6
      : Math.ceil((toEpochDay(endOfMonth(start)) - gridStartEpoch + 1) / 7);
    grids.push({ start, gridStartEpoch, rows });
  }

  // Exactly one cell in the whole strip is the roving tab stop. Prefer the month
  // that owns `focusedDate`, then any grid that renders it as a *visible* outside
  // day, and fall back to the first day of the first month when it is off-screen.
  let tabMonthIndex = -1;
  let tabEpoch = focusEpoch;
  for (let index = 0; index < grids.length; index += 1) {
    const grid = grids[index];
    if (grid && isSameMonth(input.focusedDate, grid.start)) {
      tabMonthIndex = index;
      break;
    }
  }
  if (tabMonthIndex === -1 && showOutsideDays) {
    for (let index = 0; index < grids.length; index += 1) {
      const grid = grids[index];
      if (!grid) continue;
      if (focusEpoch >= grid.gridStartEpoch && focusEpoch < grid.gridStartEpoch + grid.rows * 7) {
        tabMonthIndex = index;
        break;
      }
    }
  }
  if (tabMonthIndex === -1) {
    tabMonthIndex = 0;
    const first = grids[0];
    if (first) tabEpoch = toEpochDay(first.start);
  }

  // ISO weeks run Monday→Sunday, so a 42-cell grid spans at most 7 of them.
  // Caching by the week's Monday turns 42 computations into 6 or 7.
  let cachedMonday = Number.NaN;
  let cachedIsoWeek = 0;
  const isoWeekAt = (epoch: number): number => {
    const monday = epoch - mod7(epoch + 3); // epoch day 0 (1970-01-01) was a Thursday
    if (monday !== cachedMonday) {
      cachedMonday = monday;
      cachedIsoWeek = getISOWeek(fromEpochDay(monday));
    }
    return cachedIsoWeek;
  };

  const makeDay = (
    epoch: number,
    column: number,
    isoWeek: number,
    monthStart: PlainDate,
    monthIndex: number,
  ): DayInfo => {
    const date = fromEpochDay(epoch);
    const inCurrentMonth = date.year === monthStart.year && date.month === monthStart.month;
    // Outside days survive in the grid for geometry, but when they are hidden they
    // must not be labelled or reachable by keyboard/click.
    const hidden = !inCurrentMonth && !showOutsideDays;

    const meta = inCurrentMonth && dayMeta ? (dayMeta(date) ?? undefined) : undefined;
    const evaluation = hidden ? HIDDEN_DAY_EVALUATION : evaluate(date);
    const isDisabled = !evaluation.selectable;
    const reason = isDisabled ? evaluation.reason : undefined;
    const message = isDisabled ? evaluation.message : undefined;

    let isSelected = false;
    let isRangeStart = false;
    let isRangeEnd = false;
    let isInRange = false;
    if (selected) {
      const { start, end } = selected;
      isRangeStart = start !== null && epoch === start;
      isRangeEnd = end !== null && epoch === end;
      isSelected = isRangeStart || isRangeEnd;
      // `isInRange` is the band *between* the endpoints; the endpoints carry their
      // own flags so renderers can round the band and draw the solid caps.
      isInRange = start !== null && end !== null && epoch > start && epoch < end;
    } else if (selectedDates) {
      isSelected = selectedDates.has(epoch);
    }

    const isPreviewStart = preview.start !== null && epoch === preview.start;
    const isPreviewEnd = preview.end !== null && epoch === preview.end;
    const isPreview =
      preview.start !== null && preview.end !== null
        ? epoch >= preview.start && epoch <= preview.end
        : isPreviewStart || isPreviewEnd;

    const isToday = epoch === todayEpoch;
    const isFocusCell = monthIndex === tabMonthIndex && epoch === tabEpoch;

    let ariaLabel = '';
    if (!hidden) {
      const parts = [formatters.ariaDay(date, locale)];
      if (selected) {
        if (isRangeStart) parts.push(labels.startLabel);
        if (isRangeEnd) parts.push(labels.endLabel);
        if (isInRange) parts.push(IN_RANGE_TEXT);
      } else if (isSelected) {
        parts.push(SELECTED_TEXT);
      }
      if (isDisabled) parts.push(message ?? labels.unavailableDate);
      if (isToday) parts.push(labels.today);
      ariaLabel = parts.join(', ');
    }

    return {
      date,
      key: toISODate(date),
      label: hidden ? '' : formatters.day(date, locale),
      dayOfMonth: date.day,
      weekday: mod7(firstDayOfWeek + column),
      isoWeek,
      inCurrentMonth,
      isToday,
      isWeekend: weekendLookup[mod7(firstDayOfWeek + column)] === true,
      isSelected,
      isRangeStart,
      isRangeEnd,
      isInRange,
      isPreview,
      isPreviewStart,
      isPreviewEnd,
      isDisabled,
      isBlocked:
        reason === 'blocked-range' || reason === 'disabled-date' || reason === 'crosses-blocked',
      isOutsideBounds: reason === 'before-min' || reason === 'after-max',
      isFocused: isFocusCell,
      isHovered: hoverEpoch !== null && epoch === hoverEpoch,
      isHoliday: !!meta?.holiday,
      isWeekStart: column === 0,
      isWeekEnd: column === 6,
      disabledReason: reason,
      disabledMessage: message,
      meta,
      tabIndex: isFocusCell ? 0 : -1,
      ariaLabel,
      ariaSelected: isSelected || isInRange,
      ariaDisabled: isDisabled,
      ariaCurrent: isToday ? 'date' : undefined,
    };
  };

  const months: MonthInfo[] = [];
  for (let monthIndex = 0; monthIndex < grids.length; monthIndex += 1) {
    const grid = grids[monthIndex];
    if (!grid) continue;
    const monthStart = grid.start;
    const monthKey = toISODate(monthStart);
    const weeks: WeekInfo[] = [];
    const days: DayInfo[] = [];
    let epoch = grid.gridStartEpoch;

    for (let row = 0; row < grid.rows; row += 1) {
      const rowDays: DayInfo[] = [];
      let rowKey = '';
      let rowIsoWeek = 0;
      let isRowSelected = true;

      for (let column = 0; column < 7; column += 1, epoch += 1) {
        const isoWeek = isoWeekAt(epoch);
        const day = makeDay(epoch, column, isoWeek, monthStart, monthIndex);
        // The row's number follows its midweek day, which is the ISO Thursday for
        // Monday-first weeks and the majority week for every other offset.
        if (column === 0) rowKey = day.key;
        if (column === 3) rowIsoWeek = isoWeek;
        if (!day.isSelected && !day.isInRange) isRowSelected = false;
        rowDays.push(day);
        days.push(day);
      }

      weeks.push({
        key: `${monthKey}:${rowKey}`,
        isoWeek: rowIsoWeek,
        weekNumberLabel: showWeekNumbers ? formatters.weekNumber(rowIsoWeek, locale) : '',
        days: rowDays,
        isSelected: isRowSelected,
      });
    }

    months.push({
      date: monthStart,
      key: monthKey,
      year: monthStart.year,
      month: monthStart.month,
      label: formatters.monthYear(monthStart, locale),
      monthLabel: formatters.month(monthStart, locale),
      yearLabel: formatters.year(monthStart, locale),
      weeks,
      days,
      weekdays,
      index: monthIndex,
      isFirstVisible: monthIndex === 0,
      isLastVisible: monthIndex === grids.length - 1,
    });
  }

  return months;
}

/**
 * How far navigation reaches from the visible year, in years either side. A plain
 * number means the same reach both ways.
 */
export type YearSpan = number | { past?: number; future?: number };

function toReach(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value as number)) : DEFAULT_YEAR_SPAN;
}

/** Normalize a {@link YearSpan} into an explicit backwards/forwards reach. */
export function resolveYearSpan(span: YearSpan | undefined): { past: number; future: number } {
  if (typeof span === 'object' && span !== null) {
    return { past: toReach(span.past), future: toReach(span.future) };
  }
  const both = toReach(span);
  return { past: both, future: both };
}

/**
 * Year choices for the year view / dropdown: a window around the visible year,
 * clamped to the configured bounds so navigation can never leave them.
 */
export function buildYearOptions(
  view: PlainDate,
  min: PlainDate | null,
  max: PlainDate | null,
  locale: string,
  formatters: Formatters,
  span: YearSpan = DEFAULT_YEAR_SPAN,
): CalendarSnapshot['years'] {
  const { past, future } = resolveYearSpan(span);
  let first = view.year - past;
  let last = view.year + future;
  if (min && min.year > first) first = min.year;
  if (max && max.year < last) last = max.year;
  // The bounds can exclude the year currently on screen (a controlled month outside
  // min/max, say). The list still has to be able to represent that year — a year
  // <select> with no matching option renders the wrong value — so widen back to it
  // and let `disabled` mark it as unreachable.
  if (first > view.year) first = view.year;
  if (last < view.year) last = view.year;

  const years: YearOption[] = [];
  for (let year = first; year <= last; year += 1) {
    years.push({
      year,
      label: formatters.year({ year, month: 1, day: 1 }, locale),
      disabled: (min !== null && year < min.year) || (max !== null && year > max.year),
      isCurrent: year === view.year,
    });
  }
  return years;
}

/**
 * The twelve months of the visible year. A month is disabled only when *every* day
 * in it falls outside the bounds, so a partially reachable month stays selectable.
 */
export function buildMonthOptions(
  view: PlainDate,
  min: PlainDate | null,
  max: PlainDate | null,
  locale: string,
  formatters: Formatters,
): CalendarSnapshot['monthOptions'] {
  const options: MonthOption[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const start: PlainDate = { year: view.year, month, day: 1 };
    const end = endOfMonth(start);
    options.push({
      month,
      label: formatters.month(start, locale),
      disabled: (min !== null && isBefore(end, min)) || (max !== null && isAfter(start, max)),
      isCurrent: month === view.month,
    });
  }
  return options;
}

/* -------------------------------------------------------------------------- */
/*                                    Zoom                                    */
/* -------------------------------------------------------------------------- */

/**
 * The `day` level's zoom state. Frozen and shared: `getSnapshot()` re-runs on
 * every hover, and the overwhelmingly common case is a picker that never leaves
 * the month grid, so it must not allocate.
 */
export const EMPTY_ZOOM: ZoomState = Object.freeze({
  level: 'day',
  label: '',
  canZoomOut: true,
  canZoomIn: false,
  cells: Object.freeze([]),
});

/** First year of the aligned block of `size` years that contains `year`. */
function blockStart(year: number, size: number): number {
  return Math.floor(year / size) * size;
}

function monthKey(date: PlainDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}`;
}

/**
 * The twelve-cell grid behind a zoomed-out {@link CalendarView}.
 *
 * Screens are *aligned blocks*, never windows sliding with `viewMonth`: a `year`
 * screen always starts at a multiple of twelve and a `decade` screen at a multiple
 * of a hundred and twenty. Anything else drifts as the user pages, so the same
 * chevron press would land on a different set of years depending on how the user
 * got there.
 */
export function buildZoom(input: BuildZoomInput): ZoomState {
  const { level, viewMonth, today, value, mode, minDate, maxDate, locale, formatters } = input;
  if (level === 'day') return EMPTY_ZOOM;

  const rangeMode = RANGE_MODES.has(mode);
  const selectedRange = rangeMode ? toEpochRange(value.range) : null;
  const selectedDates = rangeMode ? [] : value.dates.map(toEpochDay);
  const todayEpoch = toEpochDay(today);
  const minEpoch = minDate ? toEpochDay(minDate) : null;
  const maxEpoch = maxDate ? toEpochDay(maxDate) : null;

  const yearBase =
    level === 'year'
      ? blockStart(viewMonth.year, YEAR_BLOCK)
      : level === 'decade'
        ? blockStart(viewMonth.year, DECADE_BLOCK)
        : viewMonth.year;

  const rawFocus =
    level === 'month'
      ? viewMonth.month - 1
      : level === 'year'
        ? viewMonth.year - yearBase
        : Math.floor((viewMonth.year - yearBase) / DECADE_SPAN);
  const focusIndex = Math.min(ZOOM_CELL_COUNT - 1, Math.max(0, rawFocus));

  const cells: ZoomCell[] = [];
  for (let index = 0; index < ZOOM_CELL_COUNT; index += 1) {
    let date: PlainDate;
    let end: PlainDate;
    let key: string;
    let label: string;
    let ariaLabel: string;

    if (level === 'month') {
      date = { year: yearBase, month: index + 1, day: 1 };
      end = endOfMonth(date);
      key = monthKey(date);
      label = formatters.month(date, locale);
      ariaLabel = formatters.monthYear(date, locale);
    } else if (level === 'year') {
      const year = yearBase + index;
      date = { year, month: 1, day: 1 };
      end = { year, month: 12, day: 31 };
      key = String(year);
      label = formatters.year(date, locale);
      ariaLabel = label;
    } else {
      const year = yearBase + index * DECADE_SPAN;
      const lastYear = year + DECADE_SPAN - 1;
      date = { year, month: 1, day: 1 };
      end = { year: lastYear, month: 12, day: 31 };
      key = `${year}s`;
      // Decade names have no Intl pattern — `NumberFormat` cannot produce "2020s".
      label = key;
      ariaLabel = `${formatters.year(date, locale)} to ${formatters.year({ year: lastYear, month: 1, day: 1 }, locale)}`;
    }

    const startEpoch = toEpochDay(date);
    const endEpoch = toEpochDay(end);

    let isSelected = false;
    if (selectedRange) {
      const { start, end: rangeEnd } = selectedRange;
      if (start !== null && rangeEnd !== null) {
        isSelected = start <= endEpoch && rangeEnd >= startEpoch;
      } else {
        // A half-picked range still highlights the screen holding its one endpoint.
        const single = start ?? rangeEnd;
        isSelected = single !== null && single >= startEpoch && single <= endEpoch;
      }
    } else {
      for (const epoch of selectedDates) {
        if (epoch >= startEpoch && epoch <= endEpoch) {
          isSelected = true;
          break;
        }
      }
    }

    cells.push({
      key,
      label,
      date,
      isCurrent: todayEpoch >= startEpoch && todayEpoch <= endEpoch,
      isSelected,
      disabled:
        (minEpoch !== null && endEpoch < minEpoch) || (maxEpoch !== null && startEpoch > maxEpoch),
      tabIndex: index === focusIndex ? 0 : -1,
      ariaLabel,
    });
  }

  const first = cells[0];
  const last = cells[ZOOM_CELL_COUNT - 1];
  const label =
    level === 'month'
      ? formatters.year(startOfYear(viewMonth), locale)
      : `${first?.label ?? ''}${RANGE_DASH}${last?.label ?? ''}`;

  return { level, label, canZoomOut: level !== 'decade', canZoomIn: true, cells };
}
