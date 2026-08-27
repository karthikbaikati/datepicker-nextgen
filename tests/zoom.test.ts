/**
 * Century navigation — the "zoom out to zoom in" model.
 *
 * Four levels, one 3 × 4 grid each: `day` (one month), `month` (one year),
 * `year` (twelve years) and `decade` (twelve decades = 120 years). Everything
 * below is pinned to a fixed `today` of 2026-09-04 so nothing depends on the
 * wall clock.
 *
 * The load-bearing invariant is *alignment*: a zoomed-out screen is a block
 * anchored on a multiple of its own width, never a window sliding with
 * `viewMonth`. Anything else drifts as the user pages, so a chevron press would
 * land on a different set of years depending on how the user arrived.
 */

import { describe, expect, it, vi } from 'vitest';

import { EMPTY_ZOOM, buildYearOptions, buildZoom, resolveYearSpan } from '../src/core/calendar';
import { createDatePicker } from '../src/core/engine';
import { resolveFormatters } from '../src/core/intl';
import { addMonths, plainDate, toISODate } from '../src/core/plain-date';
import { emptySelection } from '../src/core/selection';
import type { BuildZoomInput } from '../src/core/calendar';
import type {
  CalendarView,
  DatePickerEngineApi,
  EngineOptions,
  KeyboardLike,
  PlainDate,
  SelectionValue,
  ZoomCell,
  ZoomState,
} from '../src/core/types';

/** 2026-09-04 is a Friday; September 2026 starts on a Tuesday. */
const TODAY: PlainDate = plainDate(2026, 9, 4);

/** The caption separator `buildZoom` puts between the first and last cell — an en dash. */
const DASH = ' – ';

/** The three zoomed-out levels, in the order `zoomOut` walks them. */
const ZOOM_LEVELS: readonly CalendarView[] = ['month', 'year', 'decade'];

/* -------------------------------------------------------------------------- */
/*                                  helpers                                   */
/* -------------------------------------------------------------------------- */

const zoomInput = (over: Partial<BuildZoomInput> = {}): BuildZoomInput => ({
  level: 'month',
  viewMonth: plainDate(2026, 9, 1),
  today: TODAY,
  value: emptySelection(),
  mode: 'single',
  minDate: null,
  maxDate: null,
  locale: 'en-US',
  formatters: resolveFormatters(),
  ...over,
});

const zoom = (over: Partial<BuildZoomInput> = {}): ZoomState => buildZoom(zoomInput(over));

const keysOf = (state: ZoomState): string[] => state.cells.map((cell) => cell.key);

const cellAt = (state: ZoomState, index: number): ZoomCell => {
  const cell = state.cells[index];
  if (!cell) throw new Error(`no zoom cell at index ${index}`);
  return cell;
};

const cellFor = (state: ZoomState, key: string): ZoomCell => {
  const cell = state.cells.find((candidate) => candidate.key === key);
  if (!cell) throw new Error(`no zoom cell keyed ${key}`);
  return cell;
};

const keysWhere = (state: ZoomState, predicate: (cell: ZoomCell) => boolean): string[] =>
  state.cells.filter(predicate).map((cell) => cell.key);

const dates = (...values: PlainDate[]): SelectionValue => ({
  dates: values,
  range: { start: null, end: null },
});

const range = (start: PlainDate | null, end: PlainDate | null): SelectionValue => ({
  dates: [],
  range: { start, end },
});

const picker = (options: EngineOptions = {}): DatePickerEngineApi =>
  createDatePicker({ today: TODAY, locale: 'en-US', ...options });

/** The first day of the engine's visible month — its `viewMonth`, as an ISO string. */
const viewMonthOf = (engine: DatePickerEngineApi): string =>
  engine.getSnapshot().months[0]?.key ?? '';

const zoomOf = (engine: DatePickerEngineApi): ZoomState => engine.getSnapshot().zoom;

/** Put an engine at `level` without touching `viewMonth`. */
const at = (level: CalendarView, options: EngineOptions = {}): DatePickerEngineApi => {
  const engine = picker(options);
  engine.setView(level);
  return engine;
};

interface Key extends KeyboardLike {
  preventDefault: () => void;
}

const key = (name: string, extra: Partial<KeyboardLike> = {}): Key => ({
  key: name,
  preventDefault: vi.fn(),
  ...extra,
});

/* -------------------------------------------------------------------------- */
/*                             Window alignment                               */
/* -------------------------------------------------------------------------- */

describe('zoom: window alignment', () => {
  it('hands the day level a shared, frozen, empty state', () => {
    const state = zoom({ level: 'day' });

    expect(state).toBe(EMPTY_ZOOM);
    expect(zoom({ level: 'day', viewMonth: plainDate(1955, 3, 1) })).toBe(EMPTY_ZOOM);
    expect(state.cells).toHaveLength(0);
    expect(state.canZoomIn).toBe(false);
    expect(Object.isFrozen(state)).toBe(true);
  });

  it('fills a month screen with the twelve months of the visible year', () => {
    const state = zoom({ level: 'month' });

    expect(state.cells).toHaveLength(12);
    expect(keysOf(state)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
    expect(cellAt(state, 0).label).toBe('January');
    expect(state.label).toBe('2026');
  });

  it('starts every year screen on a multiple of twelve', () => {
    for (let year = 1900; year <= 2200; year += 1) {
      for (const month of [1, 6, 12]) {
        const state = zoom({ level: 'year', viewMonth: plainDate(year, month, 1) });
        const first = cellAt(state, 0).date.year;

        expect(first % 12).toBe(0);
        expect(state.cells).toHaveLength(12);
        // The screen is a contiguous block that contains the visible year.
        expect(cellAt(state, 11).date.year).toBe(first + 11);
        expect(year).toBeGreaterThanOrEqual(first);
        expect(year).toBeLessThanOrEqual(first + 11);
      }
    }
  });

  it('starts every decade screen on a multiple of 120 and steps by ten', () => {
    for (let year = 1900; year <= 2200; year += 1) {
      const state = zoom({ level: 'decade', viewMonth: plainDate(year, 7, 1) });
      const first = cellAt(state, 0).date.year;

      expect(first % 120).toBe(0);
      expect(state.cells.map((cell) => cell.date.year)).toEqual(
        Array.from({ length: 12 }, (_, index) => first + index * 10),
      );
      expect(year).toBeGreaterThanOrEqual(first);
      expect(year).toBeLessThanOrEqual(first + 119);
    }
  });

  it('gives every month of a year the identical year and decade screen', () => {
    const january = zoom({ level: 'year', viewMonth: plainDate(2026, 1, 1) });
    const december = zoom({ level: 'year', viewMonth: plainDate(2026, 12, 1) });

    expect(keysOf(december)).toEqual(keysOf(january));
    expect(december.label).toBe(january.label);
    expect(keysOf(zoom({ level: 'decade', viewMonth: plainDate(2026, 12, 1) }))).toEqual(
      keysOf(zoom({ level: 'decade', viewMonth: plainDate(2026, 1, 1) })),
    );
  });

  it('keeps neighbouring years on one screen and moves to the next at the boundary', () => {
    // 2016–2027 is one block; 2028 opens the next.
    expect(cellAt(zoom({ level: 'year', viewMonth: plainDate(2027, 5, 1) }), 0).date.year).toBe(
      2016,
    );
    expect(cellAt(zoom({ level: 'year', viewMonth: plainDate(2028, 5, 1) }), 0).date.year).toBe(
      2028,
    );
    // 1920–2039 is one decade block; 2040 opens the next.
    expect(cellAt(zoom({ level: 'decade', viewMonth: plainDate(2039, 5, 1) }), 0).date.year).toBe(
      1920,
    );
    expect(cellAt(zoom({ level: 'decade', viewMonth: plainDate(2040, 5, 1) }), 0).date.year).toBe(
      2040,
    );
  });

  it('captions each screen with its own span', () => {
    expect(zoom({ level: 'month' }).label).toBe('2026');
    expect(zoom({ level: 'year' }).label).toBe(`2016${DASH}2027`);
    expect(zoom({ level: 'decade' }).label).toBe(`1920s${DASH}2030s`);
  });

  it('returns to the identical window after paging out and back, at every level', () => {
    for (const level of ZOOM_LEVELS) {
      const engine = at(level);
      const before = zoomOf(engine);
      const beforeMonth = viewMonthOf(engine);

      engine.nextMonth();
      expect(keysOf(zoomOf(engine))).not.toEqual(keysOf(before));

      engine.previousMonth();
      expect(viewMonthOf(engine)).toBe(beforeMonth);
      expect(keysOf(zoomOf(engine))).toEqual(keysOf(before));
      expect(zoomOf(engine).label).toBe(before.label);
    }
  });

  it('does not drift over a long walk in either direction', () => {
    for (const level of ZOOM_LEVELS) {
      const engine = at(level);
      const before = keysOf(zoomOf(engine));

      for (let step = 0; step < 7; step += 1) engine.nextMonth();
      for (let step = 0; step < 14; step += 1) engine.previousMonth();
      for (let step = 0; step < 7; step += 1) engine.nextMonth();

      expect(viewMonthOf(engine)).toBe('2026-09-01');
      expect(keysOf(zoomOf(engine))).toEqual(before);
    }
  });

  it('lands on the same screen however the user got to a year', () => {
    // One chevron press forward from 2016–2027…
    const paged = at('year');
    paged.nextMonth();

    // …and a direct jump into the same block must agree.
    const jumped = at('year');
    jumped.goToMonth(plainDate(2035, 4, 1));

    expect(keysOf(zoomOf(paged))).toEqual([
      '2028',
      '2029',
      '2030',
      '2031',
      '2032',
      '2033',
      '2034',
      '2035',
      '2036',
      '2037',
      '2038',
      '2039',
    ]);
    expect(keysOf(zoomOf(jumped))).toEqual(keysOf(zoomOf(paged)));
  });
});

/* -------------------------------------------------------------------------- */
/*                                   Reach                                    */
/* -------------------------------------------------------------------------- */

describe('zoom: reach', () => {
  it('spans 120 years on a single decade screen', () => {
    const state = zoom({ level: 'decade' });

    expect(state.cells).toHaveLength(12);
    expect(cellAt(state, 0).date.year).toBe(1920);
    expect(cellAt(state, 11).date.year).toBe(2030);
    // First day of the first decade to the last day of the last: 120 whole years.
    expect(cellAt(state, 11).date.year + 10 - cellAt(state, 0).date.year).toBe(120);
    expect(keysOf(state)).toEqual([
      '1920s',
      '1930s',
      '1940s',
      '1950s',
      '1960s',
      '1970s',
      '1980s',
      '1990s',
      '2000s',
      '2010s',
      '2020s',
      '2030s',
    ]);
  });

  /**
   * The headline claim: from the decade screen any date in the century is four
   * clicks away — decade, year, month, day. Getting to that screen from a day
   * grid is three caption presses, which is what the three `zoomOut()` calls are.
   */
  it('reaches a day in 1955 in four clicks from the decade screen', () => {
    const engine = picker({ mode: 'single' });

    engine.zoomOut();
    expect(engine.getSnapshot().view).toBe('month');
    engine.zoomOut();
    expect(engine.getSnapshot().view).toBe('year');
    engine.zoomOut();
    expect(engine.getSnapshot().view).toBe('decade');
    expect(zoomOf(engine).label).toBe(`1920s${DASH}2030s`);

    // 1. the 1950s.
    engine.zoomIn(cellFor(zoomOf(engine), '1950s').date);
    expect(engine.getSnapshot().view).toBe('year');
    expect(zoomOf(engine).label).toBe(`1944${DASH}1955`);

    // 2. 1955.
    engine.zoomIn(cellFor(zoomOf(engine), '1955').date);
    expect(engine.getSnapshot().view).toBe('month');
    expect(zoomOf(engine).label).toBe('1955');

    // 3. March.
    engine.zoomIn(cellFor(zoomOf(engine), '1955-03').date);
    expect(engine.getSnapshot().view).toBe('day');
    expect(viewMonthOf(engine)).toBe('1955-03-01');

    // 4. the 17th — the only click of the four that touches the selection.
    engine.select(plainDate(1955, 3, 17));
    expect(toISODate(engine.getSnapshot().value.dates[0] ?? TODAY)).toBe('1955-03-17');
  });

  it('comes back from 1955 to September 2026 the same way', () => {
    const engine = picker({ mode: 'single', defaultMonth: plainDate(1955, 3, 1) });
    expect(viewMonthOf(engine)).toBe('1955-03-01');

    engine.zoomOut();
    engine.zoomOut();
    engine.zoomOut();
    expect(engine.getSnapshot().view).toBe('decade');
    // 1955 and 2026 share a decade screen, which is why the trip is symmetric.
    expect(zoomOf(engine).label).toBe(`1920s${DASH}2030s`);

    engine.zoomIn(cellFor(zoomOf(engine), '2020s').date);
    engine.zoomIn(cellFor(zoomOf(engine), '2026').date);
    engine.zoomIn(cellFor(zoomOf(engine), '2026-09').date);

    expect(engine.getSnapshot().view).toBe('day');
    expect(viewMonthOf(engine)).toBe('2026-09-01');
  });

  it('stops zooming out at the decade and zooming in at the day', () => {
    const engine = picker();

    engine.zoomOut();
    engine.zoomOut();
    engine.zoomOut();
    engine.zoomOut();
    expect(engine.getSnapshot().view).toBe('decade');
    expect(zoomOf(engine).canZoomOut).toBe(false);

    engine.zoomIn();
    engine.zoomIn();
    engine.zoomIn();
    const settled = engine.getSnapshot();
    engine.zoomIn();
    expect(engine.getSnapshot().view).toBe('day');
    // A no-op zoom must not churn the snapshot — React bails out on identity.
    expect(engine.getSnapshot()).toBe(settled);
  });

  it('reports canZoomOut/canZoomIn per level', () => {
    expect(zoom({ level: 'month' }).canZoomOut).toBe(true);
    expect(zoom({ level: 'year' }).canZoomOut).toBe(true);
    expect(zoom({ level: 'decade' }).canZoomOut).toBe(false);
    for (const level of ZOOM_LEVELS) expect(zoom({ level }).canZoomIn).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*                                 Cell state                                 */
/* -------------------------------------------------------------------------- */

describe('zoom: cell state', () => {
  it('carries exactly one tabIndex 0, on the cell holding viewMonth', () => {
    const cases: { level: CalendarView; viewMonth: PlainDate; key: string }[] = [
      { level: 'month', viewMonth: plainDate(2026, 9, 1), key: '2026-09' },
      { level: 'month', viewMonth: plainDate(2026, 1, 1), key: '2026-01' },
      { level: 'month', viewMonth: plainDate(2026, 12, 1), key: '2026-12' },
      { level: 'year', viewMonth: plainDate(2026, 9, 1), key: '2026' },
      { level: 'year', viewMonth: plainDate(2016, 2, 1), key: '2016' },
      { level: 'year', viewMonth: plainDate(2027, 11, 1), key: '2027' },
      { level: 'decade', viewMonth: plainDate(2026, 9, 1), key: '2020s' },
      { level: 'decade', viewMonth: plainDate(1929, 9, 1), key: '1920s' },
      { level: 'decade', viewMonth: plainDate(2039, 9, 1), key: '2030s' },
    ];

    for (const { level, viewMonth, key: expected } of cases) {
      const state = zoom({ level, viewMonth });
      expect(keysWhere(state, (cell) => cell.tabIndex === 0)).toEqual([expected]);
      expect(state.cells.every((cell) => cell.tabIndex === 0 || cell.tabIndex === -1)).toBe(true);
    }
  });

  it('keeps the tab stop unique across every year of two centuries', () => {
    for (let year = 1900; year <= 2100; year += 1) {
      for (const level of ZOOM_LEVELS) {
        const state = zoom({ level, viewMonth: plainDate(year, 9, 1) });
        expect(state.cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
      }
    }
  });

  it('marks exactly the cell whose span contains today as current', () => {
    expect(keysWhere(zoom({ level: 'month' }), (cell) => cell.isCurrent)).toEqual(['2026-09']);
    expect(keysWhere(zoom({ level: 'year' }), (cell) => cell.isCurrent)).toEqual(['2026']);
    expect(keysWhere(zoom({ level: 'decade' }), (cell) => cell.isCurrent)).toEqual(['2020s']);
  });

  it('marks nothing current on a screen today does not reach', () => {
    for (const level of ZOOM_LEVELS) {
      const state = zoom({ level, viewMonth: plainDate(1830, 4, 1) });
      expect(keysWhere(state, (cell) => cell.isCurrent)).toEqual([]);
    }
  });

  it('marks every cell overlapping the selection', () => {
    expect(
      keysWhere(
        zoom({ level: 'month', mode: 'single', value: dates(plainDate(2026, 3, 2)) }),
        (cell) => cell.isSelected,
      ),
    ).toEqual(['2026-03']);

    expect(
      keysWhere(
        zoom({
          level: 'month',
          mode: 'multiple',
          value: dates(plainDate(2026, 1, 5), plainDate(2026, 11, 20)),
        }),
        (cell) => cell.isSelected,
      ),
    ).toEqual(['2026-01', '2026-11']);

    expect(
      keysWhere(
        zoom({
          level: 'month',
          mode: 'range',
          value: range(plainDate(2026, 3, 31), plainDate(2026, 5, 1)),
        }),
        (cell) => cell.isSelected,
      ),
    ).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('highlights the screen holding a half-picked range', () => {
    expect(
      keysWhere(
        zoom({ level: 'month', mode: 'range', value: range(plainDate(2026, 7, 4), null) }),
        (cell) => cell.isSelected,
      ),
    ).toEqual(['2026-07']);
    expect(
      keysWhere(
        zoom({ level: 'month', mode: 'range', value: range(null, plainDate(2026, 7, 4)) }),
        (cell) => cell.isSelected,
      ),
    ).toEqual(['2026-07']);
  });

  it('spreads a selection across year and decade cells', () => {
    expect(
      keysWhere(
        zoom({
          level: 'year',
          mode: 'range',
          value: range(plainDate(2019, 12, 31), plainDate(2021, 1, 1)),
        }),
        (cell) => cell.isSelected,
      ),
    ).toEqual(['2019', '2020', '2021']);

    expect(
      keysWhere(
        zoom({
          level: 'decade',
          mode: 'range',
          value: range(plainDate(1955, 6, 1), plainDate(1965, 6, 1)),
        }),
        (cell) => cell.isSelected,
      ),
    ).toEqual(['1950s', '1960s']);
  });

  it('selects nothing when the selection is empty', () => {
    for (const level of ZOOM_LEVELS) {
      expect(keysWhere(zoom({ level }), (cell) => cell.isSelected)).toEqual([]);
    }
  });

  it('disables only the cells lying entirely outside the bounds', () => {
    const state = zoom({ level: 'month', minDate: plainDate(2026, 9, 20) });

    // September is only partly reachable — and so stays enabled.
    expect(cellFor(state, '2026-09').disabled).toBe(false);
    expect(cellFor(state, '2026-08').disabled).toBe(true);
    expect(keysWhere(state, (cell) => cell.disabled)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
  });

  it('keeps a partially reachable year and decade enabled', () => {
    const years = zoom({
      level: 'year',
      minDate: plainDate(2020, 7, 15),
      maxDate: plainDate(2024, 3, 2),
    });
    expect(cellFor(years, '2020').disabled).toBe(false);
    expect(cellFor(years, '2024').disabled).toBe(false);
    expect(cellFor(years, '2019').disabled).toBe(true);
    expect(cellFor(years, '2025').disabled).toBe(true);

    const decades = zoom({
      level: 'decade',
      minDate: plainDate(1955, 12, 31),
      maxDate: plainDate(2030, 1, 1),
    });
    expect(cellFor(decades, '1950s').disabled).toBe(false);
    expect(cellFor(decades, '2030s').disabled).toBe(false);
    expect(cellFor(decades, '1940s').disabled).toBe(true);
  });

  it('disables nothing without bounds', () => {
    for (const level of ZOOM_LEVELS) {
      expect(keysWhere(zoom({ level }), (cell) => cell.disabled)).toEqual([]);
    }
  });

  it('labels every cell for the eye and for assistive tech', () => {
    const months = zoom({ level: 'month' });
    expect(cellFor(months, '2026-09').label).toBe('September');
    expect(cellFor(months, '2026-09').ariaLabel).toBe('September 2026');
    expect(toISODate(cellFor(months, '2026-09').date)).toBe('2026-09-01');

    const years = zoom({ level: 'year' });
    expect(cellFor(years, '2026').label).toBe('2026');
    expect(cellFor(years, '2026').ariaLabel).toBe('2026');
    expect(toISODate(cellFor(years, '2026').date)).toBe('2026-01-01');

    const decades = zoom({ level: 'decade' });
    expect(cellFor(decades, '2020s').label).toBe('2020s');
    expect(cellFor(decades, '2020s').ariaLabel).toBe('2020 to 2029');
    expect(toISODate(cellFor(decades, '2020s').date)).toBe('2020-01-01');
  });
});

/* -------------------------------------------------------------------------- */
/*                          Paging follows the level                          */
/* -------------------------------------------------------------------------- */

describe('zoom: paging follows the level', () => {
  const STEPS: { level: CalendarView; next: string; previous: string }[] = [
    { level: 'day', next: '2026-10-01', previous: '2026-08-01' },
    { level: 'month', next: '2027-09-01', previous: '2025-09-01' },
    { level: 'year', next: '2038-09-01', previous: '2014-09-01' },
    { level: 'decade', next: '2146-09-01', previous: '1906-09-01' },
  ];

  it('pages one whole screen per chevron press', () => {
    for (const { level, next, previous } of STEPS) {
      const forward = at(level);
      forward.nextMonth();
      expect(viewMonthOf(forward)).toBe(next);

      const back = at(level);
      back.previousMonth();
      expect(viewMonthOf(back)).toBe(previous);
    }
  });

  it('multiplies the step by the count', () => {
    for (const { level } of STEPS) {
      const single = at(level);
      const triple = at(level);

      single.nextMonth();
      single.nextMonth();
      single.nextMonth();
      triple.nextMonth(3);

      expect(viewMonthOf(triple)).toBe(viewMonthOf(single));
    }
  });

  it('greys both chevrons out when the whole reachable span fits on one screen', () => {
    // 2020-2030 sits inside the single decade screen 1920–2039.
    const engine = at('decade', {
      minDate: plainDate(2020, 1, 1),
      maxDate: plainDate(2030, 12, 31),
    });

    expect(engine.getSnapshot().canGoPrevious).toBe(false);
    expect(engine.getSnapshot().canGoNext).toBe(false);
  });

  it('follows the level when deciding whether a chevron is live', () => {
    const bounded: EngineOptions = {
      minDate: plainDate(2020, 1, 1),
      maxDate: plainDate(2030, 12, 31),
    };

    // The year screen is 2016–2027, so 2030 is one press away but 2020 is not.
    const years = at('year', bounded);
    expect(years.getSnapshot().canGoPrevious).toBe(false);
    expect(years.getSnapshot().canGoNext).toBe(true);

    // One year per press: 2025 and 2027 are both inside the bounds.
    const months = at('month', bounded);
    expect(months.getSnapshot().canGoPrevious).toBe(true);
    expect(months.getSnapshot().canGoNext).toBe(true);

    // One month per press, and the bounds are the visible month itself.
    const days = picker({ minDate: plainDate(2026, 9, 1), maxDate: plainDate(2026, 9, 30) });
    expect(days.getSnapshot().canGoPrevious).toBe(false);
    expect(days.getSnapshot().canGoNext).toBe(false);
  });

  it('re-evaluates the chevrons the moment the level changes', () => {
    const engine = picker({ minDate: plainDate(2026, 1, 1), maxDate: plainDate(2026, 12, 31) });

    // Inside 2026 there are months either side of September…
    expect(engine.getSnapshot().canGoPrevious).toBe(true);
    expect(engine.getSnapshot().canGoNext).toBe(true);

    // …but a whole-year press cannot leave 2026.
    engine.setView('month');
    expect(engine.getSnapshot().canGoPrevious).toBe(false);
    expect(engine.getSnapshot().canGoNext).toBe(false);
  });

  it('lets navigation off the leash when restrictNavigation is false', () => {
    const engine = at('decade', {
      minDate: plainDate(2026, 9, 1),
      maxDate: plainDate(2026, 9, 30),
      restrictNavigation: false,
    });

    expect(engine.getSnapshot().canGoPrevious).toBe(true);
    expect(engine.getSnapshot().canGoNext).toBe(true);
    engine.previousMonth();
    expect(viewMonthOf(engine)).toBe('1906-09-01');
  });
});

/* -------------------------------------------------------------------------- */
/*                        Zooming never touches the value                     */
/* -------------------------------------------------------------------------- */

describe('zoom: navigation only', () => {
  it('leaves the selection referentially identical through a full round trip', () => {
    const onChange = vi.fn();
    const engine = picker({
      mode: 'range',
      defaultValue: { start: plainDate(2026, 9, 4), end: plainDate(2026, 9, 25) },
      onChange,
    });

    const before = engine.getSnapshot().value;

    engine.zoomOut();
    engine.zoomOut();
    engine.zoomOut();
    engine.previousMonth();
    engine.nextMonth();
    engine.zoomIn(plainDate(1950, 1, 1));
    engine.zoomIn(plainDate(1955, 1, 1));
    engine.zoomIn(plainDate(1955, 3, 1));

    const after = engine.getSnapshot().value;
    expect(after).toBe(before);
    expect(after.range.start).toEqual(plainDate(2026, 9, 4));
    expect(after.range.end).toEqual(plainDate(2026, 9, 25));
    expect(engine.getSnapshot().duration).toBe(21);
    expect(onChange).not.toHaveBeenCalled();
    // Navigation moved, though — this is not a no-op test.
    expect(viewMonthOf(engine)).toBe('1955-03-01');
    expect(engine.getSnapshot().view).toBe('day');
  });

  it('never moves the focused date while zooming', () => {
    const engine = picker({ mode: 'single', defaultValue: plainDate(2026, 9, 19) });
    const focused = engine.getSnapshot().focusedDate;

    engine.zoomOut();
    engine.zoomOut();
    engine.nextMonth();
    engine.zoomIn(plainDate(2038, 4, 1));

    expect(engine.getSnapshot().focusedDate).toBe(focused);
  });

  it('returns to the day level once a date is picked', () => {
    const engine = at('decade', { mode: 'single' });

    engine.select(plainDate(2026, 9, 10));

    expect(engine.getSnapshot().view).toBe('day');
    expect(engine.getSnapshot().zoom).toBe(EMPTY_ZOOM);
  });

  it('returns to the day level on goToToday', () => {
    const engine = at('year', { mode: 'single' });

    engine.goToToday();

    expect(engine.getSnapshot().view).toBe('day');
    expect(viewMonthOf(engine)).toBe('2026-09-01');
  });
});

/* -------------------------------------------------------------------------- */
/*                                 yearRange                                  */
/* -------------------------------------------------------------------------- */

describe('zoom: yearRange', () => {
  it('offers a hundred years either side by default', () => {
    const years = picker().getSnapshot().years;

    expect(years).toHaveLength(201);
    expect(years[0]?.year).toBe(1926);
    expect(years[years.length - 1]?.year).toBe(2126);
    expect(years.filter((option) => option.isCurrent).map((option) => option.year)).toEqual([2026]);
    expect(years.every((option) => !option.disabled)).toBe(true);
  });

  it('narrows to a plain number and widens back', () => {
    const narrow = picker({ yearRange: 5 }).getSnapshot().years;
    expect(narrow.map((option) => option.year)).toEqual([
      2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031,
    ]);

    const wide = picker({ yearRange: 250 }).getSnapshot().years;
    expect(wide).toHaveLength(501);
    expect(wide[0]?.year).toBe(1776);
    expect(wide[wide.length - 1]?.year).toBe(2276);
  });

  it('reaches different distances backwards and forwards', () => {
    const years = picker({ yearRange: { past: 80, future: 2 } }).getSnapshot().years;

    expect(years[0]?.year).toBe(1946);
    expect(years[years.length - 1]?.year).toBe(2028);
  });

  it('is navigation reach only — it never restricts what can be selected', () => {
    const engine = picker({ mode: 'single', yearRange: 1 });

    expect(engine.getSnapshot().years).toHaveLength(3);

    engine.select(plainDate(1955, 3, 17));
    expect(toISODate(engine.getSnapshot().value.dates[0] ?? TODAY)).toBe('1955-03-17');
    expect(engine.getSnapshot().validation.valid).toBe(true);

    // …and the grids still go anywhere.
    engine.goToMonth(plainDate(1890, 4, 1));
    expect(viewMonthOf(engine)).toBe('1890-04-01');
  });

  it('follows the visible year rather than today', () => {
    const engine = picker({ yearRange: 3 });

    engine.goToMonth(plainDate(1955, 3, 1));

    expect(engine.getSnapshot().years.map((option) => option.year)).toEqual([
      1952, 1953, 1954, 1955, 1956, 1957, 1958,
    ]);
  });

  it('clamps the list to minDate/maxDate and marks the rest disabled', () => {
    const years = buildYearOptions(
      plainDate(2026, 9, 1),
      plainDate(2024, 6, 1),
      plainDate(2028, 6, 1),
      'en-US',
      resolveFormatters(),
      100,
    );

    expect(years.map((option) => option.year)).toEqual([2024, 2025, 2026, 2027, 2028]);
    expect(years.every((option) => !option.disabled)).toBe(true);
  });

  it('normalizes every shape of the span option', () => {
    expect(resolveYearSpan(undefined)).toEqual({ past: 100, future: 100 });
    expect(resolveYearSpan(12)).toEqual({ past: 12, future: 12 });
    expect(resolveYearSpan(0)).toEqual({ past: 0, future: 0 });
    expect(resolveYearSpan(-5)).toEqual({ past: 0, future: 0 });
    expect(resolveYearSpan({ past: 40 })).toEqual({ past: 40, future: 100 });
    expect(resolveYearSpan({ future: 40 })).toEqual({ past: 100, future: 40 });
    expect(resolveYearSpan(Number.NaN)).toEqual({ past: 100, future: 100 });
  });
});

/* -------------------------------------------------------------------------- */
/*                                  Keyboard                                  */
/* -------------------------------------------------------------------------- */

describe('zoom: keyboard', () => {
  /** How far one cell is, in months, at each level. */
  const CELL_MONTHS: Record<'month' | 'year' | 'decade', number> = {
    month: 1,
    year: 12,
    decade: 120,
  };

  it('walks one cell with the horizontal arrows', () => {
    for (const level of ZOOM_LEVELS) {
      const step = CELL_MONTHS[level as 'month' | 'year' | 'decade'];

      const right = at(level);
      expect(right.handleKeyDown(key('ArrowRight'))).toBe(true);
      expect(viewMonthOf(right)).toBe(toISODate(addMonths(plainDate(2026, 9, 1), step)));

      const left = at(level);
      expect(left.handleKeyDown(key('ArrowLeft'))).toBe(true);
      expect(viewMonthOf(left)).toBe(toISODate(addMonths(plainDate(2026, 9, 1), -step)));
    }
  });

  it('walks three cells — one row — with the vertical arrows', () => {
    for (const level of ZOOM_LEVELS) {
      const step = CELL_MONTHS[level as 'month' | 'year' | 'decade'] * 3;

      const down = at(level);
      expect(down.handleKeyDown(key('ArrowDown'))).toBe(true);
      expect(viewMonthOf(down)).toBe(toISODate(addMonths(plainDate(2026, 9, 1), step)));

      const up = at(level);
      expect(up.handleKeyDown(key('ArrowUp'))).toBe(true);
      expect(viewMonthOf(up)).toBe(toISODate(addMonths(plainDate(2026, 9, 1), -step)));
    }
  });

  it('mirrors the horizontal arrows in RTL and leaves the vertical ones alone', () => {
    const rtl = (): DatePickerEngineApi => {
      const engine = createDatePicker({ today: TODAY, locale: 'he-IL' });
      engine.setView('month');
      return engine;
    };

    const right = rtl();
    right.handleKeyDown(key('ArrowRight'));
    expect(viewMonthOf(right)).toBe('2026-08-01');

    const left = rtl();
    left.handleKeyDown(key('ArrowLeft'));
    expect(viewMonthOf(left)).toBe('2026-10-01');

    const down = rtl();
    down.handleKeyDown(key('ArrowDown'));
    expect(viewMonthOf(down)).toBe('2026-12-01');
  });

  it('carries the tab stop with the arrow keys', () => {
    const engine = at('year');
    expect(keysWhere(zoomOf(engine), (cell) => cell.tabIndex === 0)).toEqual(['2026']);

    engine.handleKeyDown(key('ArrowRight'));
    expect(keysWhere(zoomOf(engine), (cell) => cell.tabIndex === 0)).toEqual(['2027']);

    // …and off the end of the screen, which pages to the next aligned block.
    engine.handleKeyDown(key('ArrowRight'));
    expect(zoomOf(engine).label).toBe(`2028${DASH}2039`);
    expect(keysWhere(zoomOf(engine), (cell) => cell.tabIndex === 0)).toEqual(['2028']);
  });

  it('pages a whole screen with PageUp and PageDown', () => {
    for (const level of ZOOM_LEVELS) {
      const down = at(level);
      expect(down.handleKeyDown(key('PageDown'))).toBe(true);
      const paged = at(level);
      paged.nextMonth();
      expect(viewMonthOf(down)).toBe(viewMonthOf(paged));

      const up = at(level);
      expect(up.handleKeyDown(key('PageUp'))).toBe(true);
      const back = at(level);
      back.previousMonth();
      expect(viewMonthOf(up)).toBe(viewMonthOf(back));
    }
  });

  it('zooms in with Enter and with Space', () => {
    for (const name of ['Enter', ' ', 'Spacebar']) {
      const engine = at('decade');
      expect(engine.handleKeyDown(key(name))).toBe(true);
      expect(engine.getSnapshot().view).toBe('year');
      // The focused cell is the one that opens, so the view month never jumps.
      expect(viewMonthOf(engine)).toBe('2026-09-01');
    }
  });

  it('zooms out with Escape at every zoom level and never closes there', () => {
    const engine = at('month');

    expect(engine.handleKeyDown(key('Escape'))).toBe(true);
    expect(engine.getSnapshot().view).toBe('year');
    expect(engine.handleKeyDown(key('Esc'))).toBe(true);
    expect(engine.getSnapshot().view).toBe('decade');
    // The outermost screen absorbs it rather than falling through to "close".
    expect(engine.handleKeyDown(key('Escape'))).toBe(true);
    expect(engine.getSnapshot().view).toBe('decade');
  });

  it('leaves Escape at the day level to the binding, which closes the picker', () => {
    const engine = picker();

    // `true` is the signal a binding acts on; the view is untouched.
    expect(engine.handleKeyDown(key('Escape'))).toBe(true);
    expect(engine.getSnapshot().view).toBe('day');
    expect(viewMonthOf(engine)).toBe('2026-09-01');
  });

  it('walks a whole level with the keyboard alone', () => {
    const engine = picker({ mode: 'single' });

    engine.handleKeyDown(key('Escape')); // day: the binding's business, view unchanged
    expect(engine.getSnapshot().view).toBe('day');

    engine.setView('decade');
    engine.handleKeyDown(key('ArrowLeft')); // 2020s → 2010s
    engine.handleKeyDown(key('ArrowUp')); // 2010s → 1980s
    engine.handleKeyDown(key('ArrowLeft')); // 1980s → 1970s
    engine.handleKeyDown(key('ArrowLeft')); // 1970s → 1960s
    engine.handleKeyDown(key('ArrowLeft')); // 1960s → 1950s
    expect(keysWhere(zoomOf(engine), (cell) => cell.tabIndex === 0)).toEqual(['1950s']);

    // Enter opens the focused cell in place: the view month is already inside
    // the 1950s, so the year screen is the block that holds it, not the decade's
    // own first year.
    engine.handleKeyDown(key('Enter'));
    expect(engine.getSnapshot().view).toBe('year');
    expect(zoomOf(engine).label).toBe(`1956${DASH}1967`);

    engine.handleKeyDown(key('Enter'));
    expect(engine.getSnapshot().view).toBe('month');
    expect(zoomOf(engine).label).toBe('1956');
    engine.handleKeyDown(key('Enter'));
    expect(engine.getSnapshot().view).toBe('day');
    expect(viewMonthOf(engine)).toBe('1956-09-01');
  });

  it('prevents the default for every key it handles, and only those', () => {
    const engine = at('year');

    for (const name of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown']) {
      const event = key(name);
      expect(engine.handleKeyDown(event)).toBe(true);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    }

    const ignored = key('t');
    expect(engine.handleKeyDown(ignored)).toBe(false);
    expect(ignored.preventDefault).not.toHaveBeenCalled();
  });

  it('keeps out of the way of browser and OS shortcuts', () => {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      const engine = at('year');
      const event = key('ArrowRight', { [modifier]: true });

      expect(engine.handleKeyDown(event)).toBe(false);
      expect(viewMonthOf(engine)).toBe('2026-09-01');
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
  });

  it('clamps zoom-level arrows to the navigable bounds', () => {
    const engine = at('year', { minDate: plainDate(2024, 1, 1), maxDate: plainDate(2028, 12, 31) });

    engine.handleKeyDown(key('ArrowUp')); // three years back, clamped to 2024-01
    expect(viewMonthOf(engine)).toBe('2024-01-01');

    engine.handleKeyDown(key('ArrowDown')); // three years on, clamped to 2028-12
    expect(viewMonthOf(engine)).toBe('2027-01-01');
  });
});
