/**
 * The headless engine — the store every binding (React, vanilla, web component)
 * sits on top of.
 *
 * It owns the mutable state, runs the pure modules (constraints → selection →
 * calendar) in the right order, and hands renderers a single immutable
 * {@link CalendarSnapshot}. The snapshot reference is stable until state or
 * options actually change, which is what makes `useSyncExternalStore` safe.
 */

import { plainDateAdapter, toExternalValue } from './adapters';
import {
  EMPTY_ZOOM,
  buildMonthOptions,
  buildMonths,
  buildWeekdays,
  buildYearOptions,
  buildZoom,
  resolveYearSpan,
} from './calendar';
import {
  clampSelection,
  evaluateDate,
  evaluateRange,
  nextBlockedAfter,
  previousBlockedBefore,
  resolveConstraints,
  type ResolvedConstraints,
} from './constraints';
import {
  isRTL,
  localeFirstDayOfWeek,
  localeWeekendDays,
  resolveFormatters,
  resolveLabels,
  resolveLocale,
} from './intl';
import { applyFocusStep, resolveKeyboardIntent } from './keyboard';
import { parseDateString, parseRangeString, type ParseOptions } from './parse';
import {
  addDays,
  addMonths,
  clampDate,
  clampTime,
  diffInDays,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfMonth,
  subDays,
  toEpochDay,
  toPlainDate,
  today as currentDate,
} from './plain-date';
import {
  defaultPresetsFor,
  normalizePresetResult,
  normalizePresets,
  resolvePresets,
} from './presets';
import {
  applySelection,
  computePreviewRange,
  emptySelection,
  isSelectionComplete,
  isSelectionEmpty,
  normalizeValueInput,
  selectionDuration,
  withTimes,
} from './selection';
import type {
  ActiveField,
  CalendarSnapshot,
  CalendarView,
  ChangeMeta,
  ChangeReason,
  ConstraintContext,
  DateInput,
  DatePickerEngineApi,
  DatePreset,
  DateRange,
  DayEvaluation,
  EngineOptions,
  FocusStep,
  Formatters,
  KeyboardLike,
  Labels,
  PlainDate,
  PlainTime,
  PresetContext,
  RangeSemantics,
  SelectionMode,
  SelectionValue,
  ValueAdapter,
  ValueInput,
} from './types';

/* -------------------------------------------------------------------------- */
/*                                  Internals                                 */
/* -------------------------------------------------------------------------- */

/** Modes whose selection lives in `value.range`. */
const RANGE_MODES: ReadonlySet<SelectionMode> = new Set<SelectionMode>([
  'range',
  'week',
  'month',
  'quarter',
  'year',
]);

/** Modes where one click selects a whole calendar unit — they preview on focus alone. */
const UNIT_MODES: ReadonlySet<SelectionMode> = new Set<SelectionMode>([
  'week',
  'month',
  'quarter',
  'year',
]);

/** Option keys that feed {@link resolveConstraints}; any change re-resolves them. */
const CONSTRAINT_KEYS: readonly (keyof EngineOptions)[] = [
  'minDate',
  'maxDate',
  'disabledDates',
  'enabledDates',
  'disabledDaysOfWeek',
  'blockedRanges',
  'disablePast',
  'disableFuture',
  'disableWeekends',
  'minNights',
  'maxNights',
  'minSelections',
  'maxSelections',
  'rollingSelection',
  'preventCrossingBlocked',
  'isDateUnavailable',
  'rangeSemantics',
];

const VALID: CalendarSnapshot['validation'] = Object.freeze({ valid: true });

/** Zoom levels, innermost first. `zoomOut` walks up it, `zoomIn` walks back down. */
const ZOOM_ORDER: readonly CalendarView[] = ['day', 'month', 'year', 'decade'];

/** Every zoomed-out grid is three columns wide, so vertical arrows move by three. */
const ZOOM_COLUMNS = 3;

/**
 * Years one screen covers at each zoomed-out level — the single number the rest of
 * the zoom navigation is derived from. A screen is `block × 12` months wide, one of
 * its twelve cells is `block` months wide, and screens are *aligned* on multiples
 * of `block`: paging by a whole screen preserves `year % block`, so the same block
 * always comes back however the user got there. `day` is measured in months rather
 * than years, so it carries `0` and is handled on its own.
 */
const VIEW_BLOCK_YEARS: Readonly<Record<CalendarView, number>> = {
  day: 0,
  month: 1,
  year: 12,
  decade: 120,
};

function zoomIndex(view: CalendarView): number {
  const index = ZOOM_ORDER.indexOf(view);
  return index === -1 ? 0 : index;
}

const NOOP = (): void => {};

interface EngineState {
  value: SelectionValue;
  focusedDate: PlainDate;
  hoveredDate: PlainDate | null;
  previewRange: DateRange | null;
  viewMonth: PlainDate;
  view: CalendarView;
  activeField: ActiveField;
  anchor: PlainDate | null;
  times: { start: PlainTime | null; end: PlainTime | null } | null;
  announcement: string;
}

/** Everything derived from options. Rebuilt piecewise so unchanged parts keep their identity. */
interface ResolvedSettings {
  readonly mode: SelectionMode;
  readonly locale: string;
  readonly direction: 'ltr' | 'rtl';
  readonly firstDayOfWeek: number;
  readonly weekendDays: readonly number[];
  readonly today: PlainDate;
  readonly rangeSemantics: RangeSemantics;
  readonly numberOfMonths: number;
  readonly fixedWeeks: boolean;
  readonly showOutsideDays: boolean;
  readonly selectOutsideDays: boolean;
  readonly showWeekNumbers: boolean;
  readonly allowReverseRange: boolean;
  readonly toggleOnReselect: boolean;
  readonly resetOnComplete: boolean;
  readonly autoAdvance: boolean;
  readonly restrictNavigation: boolean;
  /** Navigation reach in years either side of the visible month — never a constraint. */
  readonly yearRange: { past: number; future: number };
  readonly formatters: Formatters;
  readonly labels: Labels;
  readonly constraints: ResolvedConstraints;
  readonly presets: readonly DatePreset[];
  readonly presetShortcuts: readonly string[];
  readonly adapter: ValueAdapter<unknown>;
  readonly controlledValue: boolean;
  readonly controlledMonth: boolean;
}

interface Previous {
  readonly options: EngineOptions;
  readonly settings: ResolvedSettings;
}

interface PickOptions {
  field?: ActiveField;
  reason?: ChangeReason;
  /** Force a fresh range even when `resetOnComplete` is off (text input redraws). */
  restart?: boolean;
}

interface ApplyValueMeta {
  reason: ChangeReason;
  preset?: DatePreset;
  date?: PlainDate;
  /** Move the view to the value's start instead of only scrolling it into sight. */
  jumpToStart?: boolean;
}

const isRangeMode = (mode: SelectionMode): boolean => RANGE_MODES.has(mode);

function firstDateOf(value: SelectionValue): PlainDate | null {
  return value.range.start ?? value.dates[0] ?? value.range.end ?? null;
}

function optionsDiffer(
  a: EngineOptions,
  b: EngineOptions,
  keys: readonly (keyof EngineOptions)[],
): boolean {
  for (const key of keys) {
    if (a[key] !== b[key]) return true;
  }
  return false;
}

function toValidation(evaluation: DayEvaluation): CalendarSnapshot['validation'] {
  if (evaluation.selectable) return VALID;
  return { valid: false, reason: evaluation.reason, message: evaluation.message };
}

function positiveCount(value: number | undefined, fallback: number): number {
  const count = Math.trunc(Number(value));
  return Number.isFinite(count) && count > 0 ? count : fallback;
}

function resolveFirstDayOfWeek(option: EngineOptions['firstDayOfWeek'], locale: string): number {
  if (option === undefined || option === 'locale') return localeFirstDayOfWeek(locale);
  const day = Math.trunc(Number(option));
  return Number.isFinite(day) ? ((day % 7) + 7) % 7 : localeFirstDayOfWeek(locale);
}

/* -------------------------------------------------------------------------- */
/*                                   Engine                                   */
/* -------------------------------------------------------------------------- */

export class DatePickerEngine implements DatePickerEngineApi {
  private options: EngineOptions;
  private settings: ResolvedSettings;
  private state: EngineState;
  private snapshot: CalendarSnapshot | null = null;
  private readonly listeners = new Set<() => void>();
  private destroyed = false;

  constructor(options: EngineOptions = {}) {
    this.options = { ...options };
    this.settings = this.buildSettings(null);

    const settings = this.settings;
    const initial = options.value !== undefined ? options.value : (options.defaultValue ?? null);
    const value = normalizeValueInput(initial ?? null, settings.mode);
    const pending = isRangeMode(settings.mode) && !!value.range.start && !value.range.end;
    const selected = firstDateOf(value);
    const view =
      toPlainDate(options.month) ?? toPlainDate(options.defaultMonth) ?? selected ?? settings.today;

    this.state = {
      value,
      focusedDate: clampDate(
        selected ?? settings.today,
        settings.constraints.minDate,
        settings.constraints.maxDate,
      ),
      hoveredDate: null,
      previewRange: null,
      viewMonth: this.clampMonth(startOfMonth(view)),
      view: 'day',
      activeField: pending ? 'end' : 'start',
      anchor: pending ? value.range.start : null,
      times: value.times ?? null,
      announcement: '',
    };
    this.state.previewRange = this.buildPreview();
  }

  /* ------------------------------ subscription ----------------------------- */

  /**
   * The same object comes back until something actually changes — React bails out
   * of a re-render on reference equality, and re-renders forever without it.
   */
  getSnapshot(): CalendarSnapshot {
    const cached = this.snapshot;
    if (cached) return cached;

    const s = this.settings;
    const st = this.state;
    const ctx = this.constraintContext();
    const { minDate, maxDate } = s.constraints;

    // Adjacent months share their outside days, so a tiny memo saves a second pass
    // over every seam day (and over any user `isDateUnavailable`).
    const evaluations = new Map<number, DayEvaluation>();
    const evaluate = (date: PlainDate): DayEvaluation => {
      const key = toEpochDay(date);
      const hit = evaluations.get(key);
      if (hit) return hit;
      const result = evaluateDate(date, s.constraints, ctx);
      evaluations.set(key, result);
      return result;
    };

    const months = buildMonths({
      viewMonth: st.viewMonth,
      numberOfMonths: s.numberOfMonths,
      locale: s.locale,
      firstDayOfWeek: s.firstDayOfWeek,
      weekendDays: s.weekendDays,
      fixedWeeks: s.fixedWeeks,
      showOutsideDays: s.showOutsideDays,
      showWeekNumbers: s.showWeekNumbers,
      formatters: s.formatters,
      today: s.today,
      mode: s.mode,
      value: st.value,
      previewRange: st.previewRange,
      focusedDate: st.focusedDate,
      hoveredDate: st.hoveredDate,
      evaluate,
      dayMeta: this.options.dayMeta,
      labels: s.labels,
    });

    const value = st.value;
    const rangeLike = isRangeMode(s.mode);
    const isEmpty = isSelectionEmpty(value);
    const duration = selectionDuration(value, s.mode, s.rangeSemantics);
    const startDate = rangeLike ? value.range.start : (value.dates[0] ?? null);
    const endDate = rangeLike
      ? value.range.end
      : value.dates.length > 1
        ? (value.dates[value.dates.length - 1] ?? null)
        : null;

    const snapshot: CalendarSnapshot = {
      mode: s.mode,
      view: st.view,
      // `getSnapshot` re-runs on every hover; the day level pays nothing for zoom.
      zoom:
        st.view === 'day'
          ? EMPTY_ZOOM
          : buildZoom({
              level: st.view,
              viewMonth: st.viewMonth,
              today: s.today,
              value: st.value,
              mode: s.mode,
              minDate,
              maxDate,
              locale: s.locale,
              formatters: s.formatters,
            }),
      locale: s.locale,
      direction: s.direction,
      today: s.today,
      months,
      weekdays: buildWeekdays(s.locale, s.firstDayOfWeek, s.weekendDays),
      value,
      focusedDate: st.focusedDate,
      hoveredDate: st.hoveredDate,
      activeField: st.activeField,
      anchor: st.anchor,
      isSelecting: st.anchor !== null,
      isComplete: isSelectionComplete(value, s.mode),
      isEmpty,
      duration,
      durationLabel:
        duration > 0 && s.mode !== 'single'
          ? s.formatters.duration(duration, rangeLike ? s.rangeSemantics : 'days', s.locale)
          : '',
      summary: s.formatters.summary(value, s.locale, s.rangeSemantics),
      startLabel: startDate ? s.formatters.fieldDate(startDate, s.locale) : s.labels.emptyValue,
      endLabel: endDate
        ? s.formatters.fieldDate(endDate, s.locale)
        : rangeLike
          ? s.labels.emptyValue
          : '',
      canGoPrevious: this.canGoPrevious(),
      canGoNext: this.canGoNext(),
      canClear: !isEmpty,
      presets: resolvePresets(s.presets, this.presetContext(), value, s.locale),
      years: buildYearOptions(st.viewMonth, minDate, maxDate, s.locale, s.formatters, s.yearRange),
      monthOptions: buildMonthOptions(st.viewMonth, minDate, maxDate, s.locale, s.formatters),
      labels: s.labels,
      validation:
        rangeLike && value.range.start && value.range.end
          ? toValidation(evaluateRange(value.range, s.constraints, ctx))
          : VALID,
      announcement: st.announcement,
    };

    this.snapshot = snapshot;
    return snapshot;
  }

  subscribe(listener: () => void): () => void {
    if (this.destroyed || typeof listener !== 'function') return NOOP;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /* -------------------------------- options -------------------------------- */

  /**
   * Merge new options in. Only the sub-resolvers whose inputs changed run again,
   * so a parent re-render that passes the same `disabledDates` array does not
   * rebuild the constraint predicates. Nothing is emitted when nothing changed.
   */
  setOptions(options: Partial<EngineOptions>): void {
    if (this.destroyed || !options) return;

    const previousOptions = this.options;
    const keys = Object.keys(options) as (keyof EngineOptions)[];
    let changed = false;
    for (const key of keys) {
      if (previousOptions[key] !== options[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;

    const previousSettings = this.settings;
    this.options = { ...previousOptions, ...options };
    this.settings = this.buildSettings({ options: previousOptions, settings: previousSettings });

    const s = this.settings;
    const modeChanged = previousSettings.mode !== s.mode;
    const valueChanged = previousOptions.value !== this.options.value;

    if (s.controlledValue && (valueChanged || modeChanged)) {
      this.state.value = this.normalizeIncoming(this.options.value ?? null);
      this.syncPending();
    } else if (modeChanged) {
      this.state.value = normalizeValueInput(this.state.value, s.mode);
      this.syncPending();
    }

    if (s.controlledMonth) {
      const month = toPlainDate(this.options.month);
      if (month) this.state.viewMonth = startOfMonth(month);
    }
    this.state.viewMonth = this.clampMonth(this.state.viewMonth);
    this.state.focusedDate = clampDate(
      this.state.focusedDate,
      s.constraints.minDate,
      s.constraints.maxDate,
    );
    this.state.previewRange = this.buildPreview();

    this.markDirty();
    this.notify();
  }

  getOptions(): Required<Pick<EngineOptions, 'mode'>> & EngineOptions {
    return { ...this.options, mode: this.settings.mode };
  }

  /* ------------------------------- selection ------------------------------- */

  /**
   * Select a date, subject to every constraint. A rejected pick leaves the state
   * untouched and reports through `onInvalidSelection` — never silently.
   */
  select(date: DateInput, opts?: { field?: ActiveField }): void {
    const target = toPlainDate(date);
    if (!target || this.destroyed) return;
    // A click on a greyed-out neighbouring-month day is ignored when the host
    // opted out of it; keyboard and programmatic picks pull the view instead.
    if (!this.settings.selectOutsideDays && !this.isVisibleMonthDay(target)) return;
    this.pick(target, opts?.field ? { field: opts.field } : undefined);
  }

  hover(date: DateInput | null): void {
    if (this.destroyed) return;
    const next = date == null ? null : toPlainDate(date);
    const current = this.state.hoveredDate;
    if (next === null ? current === null : current !== null && isSameDay(next, current)) return;

    this.state.hoveredDate = next;
    this.state.previewRange = this.buildPreview();
    this.markDirty();
    this.notify();
    this.options.onHoverChange?.(next);
  }

  /**
   * Move the roving-tabindex focus. Focus may land on a disabled day — that is the
   * documented ARIA grid behaviour; it just cannot be selected.
   */
  focusDate(date: DateInput, opts?: { scrollIntoView?: boolean }): void {
    const target = toPlainDate(date);
    if (!target || this.destroyed) return;

    const s = this.settings;
    const next = clampDate(target, s.constraints.minDate, s.constraints.maxDate);
    const scroll = opts?.scrollIntoView !== false;
    if (isSameDay(next, this.state.focusedDate) && (!scroll || this.isVisibleMonthDay(next)))
      return;

    this.state.focusedDate = next;
    if (scroll) this.ensureVisible(next);
    this.state.previewRange = this.buildPreview();
    this.markDirty();
    this.notify();
    this.options.onFocusChange?.(next);
  }

  moveFocus(step: FocusStep): void {
    if (this.destroyed) return;
    this.focusDate(applyFocusStep(this.state.focusedDate, step, this.settings.firstDayOfWeek), {
      scrollIntoView: true,
    });
  }

  clear(): void {
    if (this.destroyed) return;
    const s = this.settings;
    if (isSelectionEmpty(this.state.value) && this.state.anchor === null) return;

    const next = emptySelection();
    if (!s.controlledValue) this.state.value = next;
    this.state.times = null;
    this.state.anchor = null;
    this.state.activeField = 'start';
    this.state.hoveredDate = null;
    this.state.previewRange = null;
    this.state.announcement = s.labels.announceCleared;
    this.markDirty();
    this.notify();

    this.emitChange(next, { reason: 'clear', mode: s.mode, isComplete: false, duration: 0 });
  }

  setValue(value: ValueInput, reason: ChangeReason = 'controlled'): void {
    if (this.destroyed) return;
    this.applyValue(this.normalizeIncoming(value), { reason });
  }

  /** The selection in the host's own date type, shaped by the current mode. */
  getValue<T = SelectionValue>(): T {
    return toExternalValue(this.state.value, this.settings.mode, this.settings.adapter) as T;
  }

  /* -------------------------------- presets -------------------------------- */

  applyPreset(presetId: string): void {
    if (this.destroyed) return;
    const s = this.settings;
    let preset: DatePreset | undefined;
    for (const candidate of s.presets) {
      if (candidate.id === presetId) {
        preset = candidate;
        break;
      }
    }
    if (!preset) return;

    let produced: SelectionValue | null = null;
    try {
      produced = normalizePresetResult(preset.getValue(this.presetContext()), s.mode);
    } catch {
      produced = null;
    }
    if (!produced) return;

    const clamped = clampSelection(produced, s.constraints, this.constraintContext());
    if (!clamped) return;

    const applied = preset;
    this.applyValue(clamped, { reason: 'preset', preset: applied, jumpToStart: true }, () => {
      this.options.onPresetApply?.(applied, clamped);
    });
  }

  /* ------------------------------- navigation ------------------------------ */

  setActiveField(field: ActiveField): void {
    if (this.destroyed || (field !== 'start' && field !== 'end')) return;
    if (this.state.activeField === field) return;
    this.state.activeField = field;
    this.state.previewRange = this.buildPreview();
    this.markDirty();
    this.notify();
  }

  setView(view: CalendarView): void {
    if (this.destroyed || this.state.view === view || !ZOOM_ORDER.includes(view)) return;
    this.state.view = view;
    this.markDirty();
    this.notify();
  }

  /** Step out one level. `decade` is the outermost screen, so it stays put. */
  zoomOut(): void {
    if (this.destroyed) return;
    const next = ZOOM_ORDER[zoomIndex(this.state.view) + 1];
    if (next) this.setView(next);
  }

  /**
   * Step into `date` one level. Moving the view and changing the level are one
   * transition, so listeners see a single notification rather than an intermediate
   * state where the old level is showing the new month.
   */
  zoomIn(date?: DateInput): void {
    if (this.destroyed) return;
    // `day` is the innermost level, so index 0 walks off the front and stops here.
    const next = ZOOM_ORDER[zoomIndex(this.state.view) - 1];
    if (!next) return;

    const target = date === undefined ? null : toPlainDate(date);
    if (target) this.applyViewMonth(target);
    this.state.view = next;
    this.markDirty();
    this.notify();
  }

  goToMonth(date: DateInput): void {
    const target = toPlainDate(date);
    if (!target || this.destroyed) return;
    if (!this.applyViewMonth(target)) return;
    this.markDirty();
    this.notify();
  }

  nextMonth(count = 1): void {
    this.goToMonth(addMonths(this.state.viewMonth, positiveCount(count, 1) * this.viewStep()));
  }

  previousMonth(count = 1): void {
    this.goToMonth(addMonths(this.state.viewMonth, -positiveCount(count, 1) * this.viewStep()));
  }

  goToToday(): void {
    if (this.destroyed) return;
    const s = this.settings;
    const target = clampDate(s.today, s.constraints.minDate, s.constraints.maxDate);
    const moved = this.applyViewMonth(target);
    const refocused = !isSameDay(target, this.state.focusedDate);
    const zoomed = this.state.view !== 'day';
    if (!moved && !refocused && !zoomed) return;

    this.state.view = 'day';
    this.state.focusedDate = target;
    this.state.previewRange = this.buildPreview();
    this.markDirty();
    this.notify();
    if (refocused) this.options.onFocusChange?.(target);
  }

  /* ---------------------------------- time --------------------------------- */

  setTime(field: ActiveField, time: PlainTime | null): void {
    if (this.destroyed) return;
    const s = this.settings;
    const bounds = this.options.time;
    const bounded = time ? clampTime(time, bounds?.minTime, bounds?.maxTime) : null;
    const current = this.state.value.times ?? this.state.times ?? { start: null, end: null };
    const times =
      field === 'end'
        ? { start: current.start, end: bounded }
        : { start: bounded, end: current.end };

    const next = withTimes(this.state.value, times);
    this.state.times = times;
    if (!s.controlledValue) this.state.value = next;
    this.markDirty();
    this.notify();

    this.emitChange(next, {
      reason: 'time',
      mode: s.mode,
      isComplete: isSelectionComplete(next, s.mode),
      duration: selectionDuration(next, s.mode, s.rangeSemantics),
    });
  }

  /* --------------------------------- input --------------------------------- */

  /**
   * Parse free text and route it through the normal selection path, so typed
   * dates obey exactly the same constraints as clicked ones.
   */
  parseInput(text: string, field?: ActiveField): boolean {
    if (this.destroyed || typeof text !== 'string' || text.trim() === '') return false;
    const s = this.settings;
    const options: ParseOptions = {
      locale: s.locale,
      today: s.today,
      firstDayOfWeek: s.firstDayOfWeek,
      preferFuture: true,
    };

    if (isRangeMode(s.mode) && !field) {
      const range = parseRangeString(text, options);
      if (!range?.start) return false;
      if (!this.pick(range.start, { reason: 'input', field: 'start', restart: true })) return false;
      if (!range.end) return true;
      return this.pick(range.end, { reason: 'input' });
    }

    const date = parseDateString(text, options);
    if (!date) return false;
    return this.pick(date, field ? { reason: 'input', field } : { reason: 'input' });
  }

  handleKeyDown(event: KeyboardLike): boolean {
    if (this.destroyed || !event) return false;
    if (this.state.view !== 'day') return this.handleZoomKeyDown(event);

    const s = this.settings;
    const intent = resolveKeyboardIntent(event, {
      rtl: s.direction === 'rtl',
      presetShortcuts: s.presetShortcuts,
    });
    if (!intent) return false;

    switch (intent.type) {
      case 'move':
        this.moveFocus(intent.step);
        break;
      case 'select':
        this.pick(this.state.focusedDate);
        break;
      case 'clear':
        this.clear();
        break;
      case 'today':
        this.goToToday();
        break;
      case 'preset': {
        const preset = this.presetForShortcut(intent.shortcut);
        if (!preset) return false;
        this.applyPreset(preset.id);
        break;
      }
      case 'close':
        // The core has no open/closed state; bindings act on the `true` return.
        break;
      default:
        return false;
    }

    event.preventDefault?.();
    return true;
  }

  /**
   * Keyboard inside a zoomed-out grid. `viewMonth` *is* the focus here — it is what
   * gives a cell `tabIndex: 0` — so moving focus is moving the view, and stepping
   * past an edge pages to the next aligned screen for free.
   */
  private handleZoomKeyDown(event: KeyboardLike): boolean {
    if (event.ctrlKey === true || event.metaKey === true || event.altKey === true) return false;

    const rtl = this.settings.direction === 'rtl';
    let cells = 0;

    switch (event.key) {
      case 'ArrowLeft':
        cells = rtl ? 1 : -1;
        break;
      case 'ArrowRight':
        cells = rtl ? -1 : 1;
        break;
      case 'ArrowUp':
        cells = -ZOOM_COLUMNS;
        break;
      case 'ArrowDown':
        cells = ZOOM_COLUMNS;
        break;
      case 'PageUp':
        this.previousMonth(1);
        event.preventDefault?.();
        return true;
      case 'PageDown':
        this.nextMonth(1);
        event.preventDefault?.();
        return true;
      case 'Enter':
      case ' ':
      case 'Spacebar':
        this.zoomIn();
        event.preventDefault?.();
        return true;
      case 'Escape':
      case 'Esc':
        // Handled either way: Escape must never close the picker above `day`.
        this.zoomOut();
        event.preventDefault?.();
        return true;
      default:
        return false;
    }

    // One cell is `block` years wide, which is `block` months at the level below.
    this.goToMonth(addMonths(this.state.viewMonth, cells * VIEW_BLOCK_YEARS[this.state.view]));
    event.preventDefault?.();
    return true;
  }

  /** Drop every listener and cache. The engine is inert afterwards. */
  destroy(): void {
    this.destroyed = true;
    this.listeners.clear();
    this.snapshot = null;
    this.state.previewRange = null;
    this.state.hoveredDate = null;
  }

  /* -------------------------------------------------------------------------- */
  /*                                  internals                                 */
  /* -------------------------------------------------------------------------- */

  private markDirty(): void {
    this.snapshot = null;
  }

  /** Copy the set first: a listener is allowed to unsubscribe while being notified. */
  private notify(): void {
    if (this.listeners.size === 0) return;
    for (const listener of [...this.listeners]) listener();
  }

  private emitChange(value: SelectionValue, meta: ChangeMeta): void {
    this.options.onChange?.(value, meta);
    if (meta.isComplete) this.options.onComplete?.(value, meta);
  }

  private constraintContext(): ConstraintContext {
    return {
      mode: this.settings.mode,
      today: this.settings.today,
      value: this.state.value,
      activeField: this.state.activeField,
      anchor: this.state.anchor,
    };
  }

  private presetContext(): PresetContext {
    const s = this.settings;
    const ctx = this.constraintContext();
    return {
      today: s.today,
      mode: s.mode,
      value: this.state.value,
      anchor: this.state.anchor,
      focusedDate: this.state.focusedDate,
      firstDayOfWeek: s.firstDayOfWeek,
      rangeSemantics: s.rangeSemantics,
      clamp: (value) => clampSelection(value, s.constraints, ctx),
    };
  }

  private presetForShortcut(shortcut: string): DatePreset | undefined {
    const wanted = shortcut.toLowerCase();
    for (const preset of this.settings.presets) {
      if (typeof preset.shortcut === 'string' && preset.shortcut.toLowerCase() === wanted) {
        return preset;
      }
    }
    return undefined;
  }

  /**
   * The one path every selection goes through: evaluate → reduce → commit.
   * Returns whether the pick was accepted.
   */
  private pick(date: PlainDate, opts?: PickOptions): boolean {
    const s = this.settings;
    if (opts?.field && opts.field !== this.state.activeField) {
      this.state.activeField = opts.field;
      if (opts.field === 'start') this.state.anchor = null;
    }

    const evaluation = evaluateDate(date, s.constraints, this.constraintContext());
    if (!evaluation.selectable) {
      this.options.onInvalidSelection?.(date, evaluation);
      return false;
    }

    const result = applySelection({
      mode: s.mode,
      value: this.state.value,
      date,
      activeField: this.state.activeField,
      anchor: this.state.anchor,
      firstDayOfWeek: s.firstDayOfWeek,
      options: {
        allowReverseRange: s.allowReverseRange,
        toggleOnReselect: s.toggleOnReselect,
        resetOnComplete: opts?.restart === true ? true : s.resetOnComplete,
        autoAdvance: s.autoAdvance,
        maxSelections: s.constraints.maxSelections,
        rollingSelection: s.constraints.rollingSelection,
        rangeSemantics: s.rangeSemantics,
      },
    });

    // Selection always happens in the day grid, so a pick lands the user back on it.
    this.state.view = 'day';
    this.state.activeField = result.activeField;
    this.state.anchor = result.anchor;
    this.state.focusedDate = date;
    this.state.times = result.value.times ?? this.state.times;
    if (!s.controlledValue) this.state.value = result.value;
    this.ensureVisible(date);
    this.state.previewRange = this.buildPreview();
    this.state.announcement = this.describe(result.value);
    this.markDirty();
    this.notify();

    if (result.changed) {
      this.emitChange(result.value, {
        reason: opts?.reason ?? result.reason,
        mode: s.mode,
        isComplete: result.isComplete,
        date,
        duration: selectionDuration(result.value, s.mode, s.rangeSemantics),
      });
    }
    return true;
  }

  /** Commit a whole value at once (presets, `setValue`, parsed ranges). */
  private applyValue(next: SelectionValue, meta: ApplyValueMeta, beforeEmit?: () => void): void {
    const s = this.settings;
    const pending = isRangeMode(s.mode) && !!next.range.start && !next.range.end;

    if (!s.controlledValue) this.state.value = next;
    this.state.times = next.times ?? this.state.times;
    this.state.view = 'day';
    this.state.anchor = pending ? next.range.start : null;
    this.state.activeField = pending ? 'end' : 'start';

    const focus = firstDateOf(next);
    if (focus) {
      this.state.focusedDate = clampDate(focus, s.constraints.minDate, s.constraints.maxDate);
      if (meta.jumpToStart) this.applyViewMonth(focus);
      else this.ensureVisible(focus);
    }
    this.state.previewRange = this.buildPreview();
    this.state.announcement = this.describe(next);
    this.markDirty();
    this.notify();

    beforeEmit?.();
    this.emitChange(next, {
      reason: meta.reason,
      mode: s.mode,
      isComplete: isSelectionComplete(next, s.mode),
      date: meta.date,
      preset: meta.preset,
      duration: selectionDuration(next, s.mode, s.rangeSemantics),
    });
  }

  private normalizeIncoming(input: ValueInput): SelectionValue {
    const next = normalizeValueInput(input, this.settings.mode);
    return !next.times && this.state.times ? withTimes(next, this.state.times) : next;
  }

  /** Re-derive the half-picked range state after a value arrives from outside. */
  private syncPending(): void {
    const value = this.state.value;
    const pending = isRangeMode(this.settings.mode) && !!value.range.start && !value.range.end;
    this.state.anchor = pending ? value.range.start : null;
    this.state.activeField = pending ? 'end' : 'start';
  }

  private describe(value: SelectionValue): string {
    const s = this.settings;
    if (isSelectionEmpty(value)) return s.labels.announceCleared;
    const summary = s.formatters.summary(value, s.locale, s.rangeSemantics);
    return s.labels.announceSelected(summary === '' ? s.labels.selectDate : summary);
  }

  /* ------------------------------- view month ------------------------------ */

  private isVisibleMonthDay(date: PlainDate): boolean {
    const { numberOfMonths } = this.settings;
    for (let index = 0; index < numberOfMonths; index += 1) {
      if (isSameMonth(addMonths(this.state.viewMonth, index), date)) return true;
    }
    return false;
  }

  private clampMonth(month: PlainDate): PlainDate {
    const s = this.settings;
    if (!s.restrictNavigation) return month;
    const { minDate, maxDate } = s.constraints;
    let out = month;
    if (maxDate) {
      // The last month the strip may start on still shows `maxDate` in its last panel.
      const last = addMonths(startOfMonth(maxDate), -(s.numberOfMonths - 1));
      if (isAfter(out, last)) out = last;
    }
    if (minDate) {
      const first = startOfMonth(minDate);
      if (isBefore(out, first)) out = first;
    }
    return out;
  }

  /** Mutates the view month and announces it; the caller owns dirty-marking and notifying. */
  private applyViewMonth(month: PlainDate): boolean {
    const s = this.settings;
    const target = this.clampMonth(startOfMonth(month));
    if (isSameMonth(target, this.state.viewMonth)) return false;

    if (!s.controlledMonth) this.state.viewMonth = target;
    this.state.announcement = s.labels.announceMonth(s.formatters.monthYear(target, s.locale));
    this.options.onMonthChange?.(target);
    return true;
  }

  /** Pull the view along so `date` is on screen — never further than necessary. */
  private ensureVisible(date: PlainDate): boolean {
    const s = this.settings;
    const target = startOfMonth(date);
    const first = this.state.viewMonth;
    if (isBefore(target, first)) return this.applyViewMonth(target);
    const lastVisible = addMonths(first, s.numberOfMonths - 1);
    if (isAfter(target, lastVisible)) {
      return this.applyViewMonth(addMonths(target, -(s.numberOfMonths - 1)));
    }
    return false;
  }

  /** Months one chevron press covers at the current zoom level. */
  private viewStep(): number {
    const block = VIEW_BLOCK_YEARS[this.state.view];
    return block === 0 ? 1 : block * 12;
  }

  /** Whether two months land on the same screen — the same aligned block, at zoom. */
  private sameScreen(a: PlainDate, b: PlainDate): boolean {
    const block = VIEW_BLOCK_YEARS[this.state.view];
    if (block === 0) return isSameMonth(a, b);
    return Math.floor(a.year / block) === Math.floor(b.year / block);
  }

  /**
   * A chevron is live exactly when pressing it would land on a different screen.
   * Testing the clamped destination is what keeps this honest at every level: the
   * bounds may sit deep inside the neighbouring block — so a fixed step comparison
   * would grey out a chevron that still has somewhere to go — or inside the current
   * one, where a clamped step moves the month but not the screen.
   */
  private canPage(months: number): boolean {
    if (!this.settings.restrictNavigation) return true;
    const current = this.state.viewMonth;
    return !this.sameScreen(this.clampMonth(addMonths(current, months)), current);
  }

  private canGoPrevious(): boolean {
    return this.canPage(-this.viewStep());
  }

  private canGoNext(): boolean {
    return this.canPage(this.viewStep());
  }

  /* -------------------------------- preview -------------------------------- */

  /**
   * The band drawn under the cursor. Keyboard users get the same feedback: with a
   * pending anchor (or in a unit mode) the focused day stands in for the pointer.
   */
  private buildPreview(): DateRange | null {
    const s = this.settings;
    const st = this.state;
    const source =
      st.hoveredDate ?? (st.anchor !== null || UNIT_MODES.has(s.mode) ? st.focusedDate : null);

    const base = computePreviewRange(st.anchor, source, {
      mode: s.mode,
      activeField: st.activeField,
      allowReverseRange: s.allowReverseRange,
      firstDayOfWeek: s.firstDayOfWeek,
    });
    if (!base || s.mode !== 'range' || st.anchor === null) return base;
    return this.capPreview(base, st.anchor);
  }

  /**
   * A preview must never promise a range the user cannot have: it stops the day
   * before the first unavailable night and respects `maxNights`. Without this the
   * band happily paints straight through a booked-out week.
   */
  private capPreview(range: DateRange, anchor: PlainDate): DateRange {
    const { start, end } = range;
    if (!start || !end) return range;

    const s = this.settings;
    const forward = isSameDay(start, anchor);
    let cappedStart = start;
    let cappedEnd = end;

    const span = Math.abs(diffInDays(anchor, forward ? end : start));
    const max = s.constraints.maxNights;
    if (max !== null) {
      const reach = Math.max(0, s.rangeSemantics === 'nights' ? max : max - 1);
      if (span > reach) {
        if (forward) cappedEnd = addDays(anchor, reach);
        else cappedStart = subDays(anchor, reach);
      }
    }

    const limit = Math.max(1, Math.abs(diffInDays(anchor, forward ? cappedEnd : cappedStart)));
    const blocked = forward
      ? nextBlockedAfter(anchor, s.constraints, limit)
      : previousBlockedBefore(anchor, s.constraints, limit);
    if (blocked) {
      if (forward) {
        const stop = subDays(blocked, 1);
        cappedEnd = isBefore(stop, anchor) ? anchor : stop;
      } else {
        const stop = addDays(blocked, 1);
        cappedStart = isAfter(stop, anchor) ? anchor : stop;
      }
    }

    if (isSameDay(cappedStart, start) && isSameDay(cappedEnd, end)) return range;
    return { start: cappedStart, end: cappedEnd };
  }

  /* -------------------------------- settings ------------------------------- */

  private buildSettings(previous: Previous | null): ResolvedSettings {
    const o = this.options;
    const before = previous ? previous.options : null;
    const cached = previous ? previous.settings : null;

    const mode: SelectionMode = o.mode ?? 'single';
    const rangeSemantics: RangeSemantics = o.rangeSemantics === 'days' ? 'days' : 'nights';

    const localeSame = before !== null && before.locale === o.locale;
    const locale = localeSame && cached ? cached.locale : resolveLocale(o.locale);
    const direction: 'ltr' | 'rtl' =
      localeSame && cached ? cached.direction : isRTL(locale) ? 'rtl' : 'ltr';
    const weekendDays = localeSame && cached ? cached.weekendDays : localeWeekendDays(locale);
    const firstDayOfWeek =
      localeSame && cached && before.firstDayOfWeek === o.firstDayOfWeek
        ? cached.firstDayOfWeek
        : resolveFirstDayOfWeek(o.firstDayOfWeek, locale);

    const todaySame = before !== null && before.today === o.today && before.timeZone === o.timeZone;
    const today =
      todaySame && cached ? cached.today : (toPlainDate(o.today) ?? currentDate(o.timeZone));

    const constraints =
      cached && before !== null && todaySame && !optionsDiffer(before, o, CONSTRAINT_KEYS)
        ? cached.constraints
        : resolveConstraints({ ...o, rangeSemantics }, today);

    const yearRange =
      cached && before !== null && before.yearRange === o.yearRange
        ? cached.yearRange
        : resolveYearSpan(o.yearRange);

    const formatters =
      cached && before !== null && before.formatters === o.formatters
        ? cached.formatters
        : resolveFormatters(o.formatters);
    const labels =
      cached && before !== null && before.labels === o.labels
        ? cached.labels
        : resolveLabels(o.labels);

    const presetsSame =
      cached !== null && before !== null && before.presets === o.presets && cached.mode === mode;
    const presets =
      presetsSame && cached
        ? cached.presets
        : normalizePresets(o.presets ?? defaultPresetsFor(mode));
    const presetShortcuts =
      presetsSame && cached ? cached.presetShortcuts : collectShortcuts(presets);

    return {
      mode,
      locale,
      direction,
      firstDayOfWeek,
      weekendDays,
      today,
      rangeSemantics,
      numberOfMonths: positiveCount(o.numberOfMonths, 1),
      fixedWeeks: o.fixedWeeks !== false,
      showOutsideDays: o.showOutsideDays !== false,
      selectOutsideDays: o.selectOutsideDays !== false,
      showWeekNumbers: o.showWeekNumbers === true,
      allowReverseRange: o.allowReverseRange !== false,
      toggleOnReselect: o.toggleOnReselect !== false,
      resetOnComplete: o.resetOnComplete !== false,
      autoAdvance: o.autoAdvance !== false,
      restrictNavigation: o.restrictNavigation !== false,
      yearRange,
      formatters,
      labels,
      constraints,
      presets,
      presetShortcuts,
      adapter: o.valueAdapter ?? plainDateAdapter,
      controlledValue: o.value !== undefined,
      controlledMonth: o.month !== undefined,
    };
  }
}

function collectShortcuts(presets: readonly DatePreset[]): readonly string[] {
  const shortcuts: string[] = [];
  for (const preset of presets) {
    if (typeof preset.shortcut === 'string' && preset.shortcut !== '') {
      shortcuts.push(preset.shortcut);
    }
  }
  return shortcuts;
}

/** Create a picker engine. The functional entry point every binding calls. */
export function createDatePicker(options?: EngineOptions): DatePickerEngineApi {
  return new DatePickerEngine(options);
}
