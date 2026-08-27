/**
 * datepicker-nextgen — core type contract.
 *
 * Everything in this library is built on a timezone-free "plain date" model.
 * A PlainDate is a calendar date the way a human writes it on a wall calendar:
 * it has no hour, no offset, and no DST. This eliminates the entire class of
 * off-by-one-day bugs that plague `Date`-based pickers.
 *
 * @packageDocumentation
 */

/* -------------------------------------------------------------------------- */
/*                              Date primitives                               */
/* -------------------------------------------------------------------------- */

/** A timezone-free calendar date. `month` is 1-12, `day` is 1-31. */
export interface PlainDate {
  readonly year: number;
  /** 1 = January … 12 = December */
  readonly month: number;
  /** 1-31 */
  readonly day: number;
}

/** A timezone-free wall-clock time. */
export interface PlainTime {
  /** 0-23 */
  readonly hour: number;
  /** 0-59 */
  readonly minute: number;
  /** 0-59 */
  readonly second: number;
}

/** A plain date with an optional attached time. */
export interface PlainDateTime extends PlainDate {
  readonly time?: PlainTime;
}

/**
 * Anything the library will happily accept as a date from user code.
 * Strings are parsed leniently (ISO first, then locale heuristics).
 */
export type DateInput = PlainDate | Date | string | number | null | undefined;

/** An inclusive start / exclusive-or-inclusive end pair (see {@link RangeSemantics}). */
export interface DateRange {
  start: PlainDate | null;
  end: PlainDate | null;
}

/** Same as {@link DateRange} but guaranteed complete. */
export interface CompleteDateRange {
  start: PlainDate;
  end: PlainDate;
}

/**
 * How the end of a range is counted.
 * - `nights`  — hotel/booking semantics: Sep 4 → Sep 25 is 21 nights, 22 days.
 * - `days`    — inclusive day count: Sep 4 → Sep 25 is 22 days.
 */
export type RangeSemantics = 'nights' | 'days';

/* -------------------------------------------------------------------------- */
/*                                 Selection                                  */
/* -------------------------------------------------------------------------- */

export type SelectionMode =
  /** One date. */
  | 'single'
  /** A start and an end date. */
  | 'range'
  /** Any number of individual dates. */
  | 'multiple'
  /** Clicking any day selects that whole week as a range. */
  | 'week'
  /** Clicking any day selects that whole month as a range. */
  | 'month'
  /** Clicking any day selects that whole quarter as a range. */
  | 'quarter'
  /** Clicking any day selects that whole year as a range. */
  | 'year';

/**
 * The canonical, mode-independent internal representation of a selection.
 * Adapters convert this to whatever shape the consumer asked for.
 */
export interface SelectionValue {
  /** Populated for `single` and `multiple`. */
  readonly dates: readonly PlainDate[];
  /** Populated for `range`, `week`, `month`, `quarter`, `year`. */
  readonly range: DateRange;
  /** Optional times, when the time plugin is enabled. */
  readonly times?: { start: PlainTime | null; end: PlainTime | null };
}

/** Public value shape, resolved by {@link SelectionMode}. */
export type ModeValue<M extends SelectionMode> = M extends 'single'
  ? PlainDate | null
  : M extends 'multiple'
    ? PlainDate[]
    : DateRange;

/** Which half of a range the next click will fill. */
export type ActiveField = 'start' | 'end';

/* -------------------------------------------------------------------------- */
/*                                Constraints                                 */
/* -------------------------------------------------------------------------- */

/** Reason a day cannot be chosen — surfaced to UI and screen readers. */
export type DisabledReason =
  | 'before-min'
  | 'after-max'
  | 'disabled-date'
  | 'not-in-allowlist'
  | 'disabled-weekday'
  | 'blocked-range'
  | 'min-nights'
  | 'max-nights'
  | 'max-span'
  | 'crosses-blocked'
  | 'max-selections'
  | 'custom';

export interface DayEvaluation {
  readonly selectable: boolean;
  readonly reason?: DisabledReason;
  /** Human-readable explanation, used for tooltips / aria-description. */
  readonly message?: string;
}

export interface DateConstraints {
  /** Earliest selectable date (inclusive). */
  minDate?: DateInput;
  /** Latest selectable date (inclusive). */
  maxDate?: DateInput;
  /** Blocklist. Array of dates/ranges or a predicate. */
  disabledDates?: DateInput[] | DateRangeInput[] | ((date: PlainDate) => boolean);
  /** Allowlist — when present, ONLY these dates are selectable. */
  enabledDates?: DateInput[] | DateRangeInput[] | ((date: PlainDate) => boolean);
  /** 0 = Sunday … 6 = Saturday. */
  disabledDaysOfWeek?: readonly number[];
  /** Contiguous unavailable spans (e.g. already-booked nights). */
  blockedRanges?: readonly DateRangeInput[];
  /** Convenience: no date before today. */
  disablePast?: boolean;
  /** Convenience: no date after today. */
  disableFuture?: boolean;
  /** Convenience: `disabledDaysOfWeek: [0, 6]`. */
  disableWeekends?: boolean;
  /** Range mode: minimum nights (or days, per {@link RangeSemantics}). */
  minNights?: number;
  /** Range mode: maximum nights. */
  maxNights?: number;
  /** Multiple mode: minimum number of dates. */
  minSelections?: number;
  /** Multiple mode: maximum number of dates. Selecting past it evicts the oldest when `rollingSelection` is true. */
  maxSelections?: number;
  /** When `maxSelections` is hit, replace the oldest pick instead of rejecting. */
  rollingSelection?: boolean;
  /** Prevent a range from spanning across any blocked date. Default `true`. */
  preventCrossingBlocked?: boolean;
  /** Escape hatch — full control, evaluated last. Return `false`/reason to block. */
  isDateUnavailable?: (date: PlainDate, ctx: ConstraintContext) => boolean | DayEvaluation;
}

export interface DateRangeInput {
  start: DateInput;
  end: DateInput;
}

export interface ConstraintContext {
  readonly mode: SelectionMode;
  readonly today: PlainDate;
  readonly value: SelectionValue;
  readonly activeField: ActiveField;
  /** Set while a range is half-picked — lets you validate against the pending start. */
  readonly anchor: PlainDate | null;
}

/* -------------------------------------------------------------------------- */
/*                             Day / week / month                             */
/* -------------------------------------------------------------------------- */

/** Consumer-supplied decoration for a single day (prices, dots, badges, …). */
export interface DayMeta {
  /** Free-form label rendered under the day number, e.g. `"$248"`. */
  note?: string;
  /** Up to 3 dot indicators. */
  dots?: readonly (string | { color: string; label?: string })[];
  /** Badge rendered in the cell corner. */
  badge?: string | number;
  /** Native + aria tooltip. */
  tooltip?: string;
  /** Extra class names merged onto the cell. */
  className?: string;
  /** Inline style overrides (use sparingly; prefer CSS variables). */
  style?: Record<string, string | number>;
  /** Marks the day as a holiday/special day — themed, still selectable. */
  holiday?: string;
  /** Anything else you want to reach in a custom renderer. */
  [key: string]: unknown;
}

export interface DayInfo {
  /** The date this cell represents. */
  readonly date: PlainDate;
  /** Stable ISO key `YYYY-MM-DD`, safe for React `key`. */
  readonly key: string;
  /** Localized day-of-month text. */
  readonly label: string;
  readonly dayOfMonth: number;
  /** 0 = Sunday … 6 = Saturday. */
  readonly weekday: number;
  /** ISO-8601 week number. */
  readonly isoWeek: number;
  /** False for leading/trailing days borrowed from the neighbouring month. */
  readonly inCurrentMonth: boolean;
  readonly isToday: boolean;
  readonly isWeekend: boolean;
  readonly isSelected: boolean;
  readonly isRangeStart: boolean;
  readonly isRangeEnd: boolean;
  readonly isInRange: boolean;
  /** Hover/keyboard preview of the range being drawn. */
  readonly isPreview: boolean;
  readonly isPreviewStart: boolean;
  readonly isPreviewEnd: boolean;
  readonly isDisabled: boolean;
  readonly isBlocked: boolean;
  readonly isOutsideBounds: boolean;
  readonly isFocused: boolean;
  readonly isHovered: boolean;
  readonly isHoliday: boolean;
  /** First/last day of its display week — used for range cap rounding. */
  readonly isWeekStart: boolean;
  readonly isWeekEnd: boolean;
  readonly disabledReason?: DisabledReason;
  readonly disabledMessage?: string;
  readonly meta?: DayMeta;
  /** Roving-tabindex value: exactly one day per calendar is `0`. */
  readonly tabIndex: 0 | -1;
  /** Full localized label for assistive tech. */
  readonly ariaLabel: string;
  readonly ariaSelected: boolean;
  readonly ariaDisabled: boolean;
  readonly ariaCurrent: 'date' | undefined;
}

export interface WeekInfo {
  readonly key: string;
  readonly isoWeek: number;
  readonly weekNumberLabel: string;
  readonly days: readonly DayInfo[];
  readonly isSelected: boolean;
}

export interface MonthInfo {
  /** First day of the month. */
  readonly date: PlainDate;
  readonly key: string;
  readonly year: number;
  /** 1-12 */
  readonly month: number;
  /** e.g. `"September 2026"` */
  readonly label: string;
  /** e.g. `"September"` */
  readonly monthLabel: string;
  readonly yearLabel: string;
  readonly weeks: readonly WeekInfo[];
  /** Flat list of the same days, for grid-based layouts. */
  readonly days: readonly DayInfo[];
  readonly weekdays: readonly WeekdayInfo[];
  /** Index within the visible month strip. */
  readonly index: number;
  readonly isFirstVisible: boolean;
  readonly isLastVisible: boolean;
}

export interface WeekdayInfo {
  /** 0 = Sunday … 6 = Saturday. */
  readonly weekday: number;
  /** e.g. `"M"` */
  readonly short: string;
  /** e.g. `"Mon"` */
  readonly abbreviated: string;
  /** e.g. `"Monday"` */
  readonly long: string;
  readonly isWeekend: boolean;
}

/* -------------------------------------------------------------------------- */
/*                                  Presets                                   */
/* -------------------------------------------------------------------------- */

export interface PresetContext {
  readonly today: PlainDate;
  readonly mode: SelectionMode;
  readonly value: SelectionValue;
  readonly anchor: PlainDate | null;
  readonly focusedDate: PlainDate;
  readonly firstDayOfWeek: number;
  readonly rangeSemantics: RangeSemantics;
  /** Clamps a candidate value into the configured constraints; returns null if impossible. */
  readonly clamp: (value: SelectionValue) => SelectionValue | null;
}

export interface DatePreset {
  readonly id: string;
  readonly label: string;
  /** Secondary line, e.g. `"Fri – Sun"`. */
  readonly hint?: string;
  /** Optional group header for preset lists. */
  readonly group?: string;
  /** Keyboard accelerator, e.g. `"w"`. */
  readonly shortcut?: string;
  /** Produce a value. Return `null` to no-op. */
  readonly getValue: (
    ctx: PresetContext,
  ) => SelectionValue | Partial<SelectionValue> | DateRange | PlainDate | null;
  /** Custom active-state test; defaults to deep value equality. */
  readonly isActive?: (value: SelectionValue, ctx: PresetContext) => boolean;
  /** Hide the chip when it cannot produce a valid value. Default `false` (renders disabled). */
  readonly hideWhenInvalid?: boolean;
}

export interface ResolvedPreset extends DatePreset {
  readonly isActive: (value: SelectionValue, ctx: PresetContext) => boolean;
  readonly disabled: boolean;
  readonly resolvedHint?: string;
}

/* -------------------------------------------------------------------------- */
/*                            Formatting / i18n                               */
/* -------------------------------------------------------------------------- */

export interface Formatters {
  /** `"September 2026"` — calendar caption. */
  monthYear: (date: PlainDate, locale: string) => string;
  /** `"September"` */
  month: (date: PlainDate, locale: string) => string;
  /** `"2026"` */
  year: (date: PlainDate, locale: string) => string;
  /** `"4"` — day number in the grid. */
  day: (date: PlainDate, locale: string) => string;
  /** `"Sep 4"` — the value shown in the check-in field. */
  fieldDate: (date: PlainDate, locale: string) => string;
  /** `"Fri, September 4, 2026"` — screen-reader day label. */
  ariaDay: (date: PlainDate, locale: string) => string;
  /** `"21 nights"` / `"1 night"` */
  duration: (count: number, semantics: RangeSemantics, locale: string) => string;
  /** `"Sep 4 – Sep 25, 2026"` — one-line summary of the whole selection. */
  summary: (value: SelectionValue, locale: string, semantics: RangeSemantics) => string;
  /** Weekday header cells. */
  weekday: (weekday: number, locale: string, width: 'short' | 'abbreviated' | 'long') => string;
  /** `"W36"` */
  weekNumber: (isoWeek: number, locale: string) => string;
  /** `"2:30 PM"` */
  time: (time: PlainTime, locale: string, use12Hours: boolean) => string;
}

/** Every user-visible string, overridable for i18n. */
export interface Labels {
  title: string;
  startLabel: string;
  endLabel: string;
  singleLabel: string;
  multipleLabel: string;
  clear: string;
  apply: string;
  cancel: string;
  today: string;
  nextMonth: string;
  previousMonth: string;
  nextYear: string;
  previousYear: string;
  chooseStart: string;
  chooseEnd: string;
  selectDate: string;
  weekNumberHeader: string;
  monthSelectLabel: string;
  yearSelectLabel: string;
  presetsLabel: string;
  emptyValue: string;
  /** Announced on selection changes. */
  announceSelected: (summary: string) => string;
  announceCleared: string;
  announceMonth: (label: string) => string;
  minNightsError: (n: number) => string;
  maxNightsError: (n: number) => string;
  unavailableDate: string;
}

/* -------------------------------------------------------------------------- */
/*                              Engine options                                */
/* -------------------------------------------------------------------------- */

export type FirstDayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 'locale';

/**
 * The calendar's zoom level.
 *
 * Each level renders a 12-cell grid and each step out multiplies the span by
 * twelve, so a single `decade` screen covers 120 years — any date within a
 * century is four clicks away from any other.
 *
 * `day` → one month · `month` → one year · `year` → twelve years ·
 * `decade` → twelve decades.
 */
export type CalendarView = 'day' | 'month' | 'year' | 'decade';

/** One cell of a zoomed-out calendar grid (`month`, `year` or `decade`). */
export interface ZoomCell {
  /** Stable key, e.g. `"2026-09"`, `"2026"`, `"2020s"`. */
  readonly key: string;
  /** Localized label — a month name, a year, or a decade like `"2020s"`. */
  readonly label: string;
  /** The date this cell zooms into: the first day of its month/year/decade. */
  readonly date: PlainDate;
  /** Contains today. */
  readonly isCurrent: boolean;
  /** Contains part of the current selection. */
  readonly isSelected: boolean;
  /** Entirely outside `minDate`/`maxDate`. */
  readonly disabled: boolean;
  /** Roving-tabindex value: exactly one cell per grid is `0`. */
  readonly tabIndex: 0 | -1;
  readonly ariaLabel: string;
}

/** The zoomed-out grid backing the current {@link CalendarView}. */
export interface ZoomState {
  readonly level: CalendarView;
  /** Caption for the level, e.g. `"2026"` or `"2020 – 2031"`. */
  readonly label: string;
  /** False at the outermost level. */
  readonly canZoomOut: boolean;
  /** False at `day`, where the month grid is the content. */
  readonly canZoomIn: boolean;
  /** Empty at the `day` level. */
  readonly cells: readonly ZoomCell[];
}

export interface TimeOptions {
  enabled?: boolean;
  /** Minute step for the minute list. Default `30`. */
  minuteStep?: number;
  /** Include seconds. Default `false`. */
  withSeconds?: boolean;
  /** Default `'locale'` — follows the locale's hour cycle. */
  use12Hours?: boolean | 'locale';
  /** Default time applied when a date is picked without an explicit time. */
  defaultStartTime?: PlainTime;
  defaultEndTime?: PlainTime;
  /** Restrict pickable times. */
  minTime?: PlainTime;
  maxTime?: PlainTime;
}

export interface EngineOptions extends DateConstraints {
  mode?: SelectionMode;
  /** Uncontrolled initial value. */
  defaultValue?: ValueInput;
  /** Controlled value. When set, the engine never mutates its own value. */
  value?: ValueInput;
  onChange?: (value: SelectionValue, meta: ChangeMeta) => void;
  /** Fires only when a selection is *complete* (both ends of a range, etc.). */
  onComplete?: (value: SelectionValue, meta: ChangeMeta) => void;
  onMonthChange?: (month: PlainDate) => void;
  onFocusChange?: (date: PlainDate) => void;
  onHoverChange?: (date: PlainDate | null) => void;
  onPresetApply?: (preset: DatePreset, value: SelectionValue) => void;
  /** Called when a click is rejected by a constraint. Great for toasts. */
  onInvalidSelection?: (date: PlainDate, evaluation: DayEvaluation) => void;

  /**
   * BCP-47 tag, or `'auto'` to read the runtime default. Default `'auto'`.
   *
   * The `(string & {})` half is what keeps `'auto'` in editor autocomplete —
   * a plain `string | 'auto'` collapses to `string` and the hint is lost.
   */
  locale?: 'auto' | (string & {});
  /** Default `'locale'`. */
  firstDayOfWeek?: FirstDayOfWeek;
  /** IANA zone used to compute "today". Default: runtime zone. */
  timeZone?: string;
  /** Override "today" entirely — invaluable in tests and Storybook. */
  today?: DateInput;
  /** Default `'nights'` for range mode. */
  rangeSemantics?: RangeSemantics;

  /** How many months to render at once. Default `1`. */
  numberOfMonths?: number;
  /** Always render 6 week rows so the calendar never changes height. Default `true`. */
  fixedWeeks?: boolean;
  /** Render leading/trailing days from adjacent months. Default `true`. */
  showOutsideDays?: boolean;
  /** Allow selecting the greyed-out adjacent-month days. Default `true`. */
  selectOutsideDays?: boolean;
  /** Show ISO week numbers in a leading column. Default `false`. */
  showWeekNumbers?: boolean;
  /** Month the calendar opens on. Defaults to the selection, else today. */
  defaultMonth?: DateInput;
  /** Controlled visible month. */
  month?: DateInput;
  /** Clamp navigation to `minDate`/`maxDate`. Default `true`. */
  restrictNavigation?: boolean;
  /**
   * How far the year dropdown and the zoomed-out grids reach, in years either
   * side of the visible month. Default `100`.
   *
   * This is navigation reach only — it never restricts what can be selected.
   * Use `minDate`/`maxDate` for that.
   */
  yearRange?: number | { past?: number; future?: number };

  /** Reverse a backwards range instead of restarting. Default `true`. */
  allowReverseRange?: boolean;
  /** Clicking the selected date clears it. Default `true` for single/multiple. */
  toggleOnReselect?: boolean;
  /** After both ends are picked, the next click starts a new range. Default `true`. */
  resetOnComplete?: boolean;
  /** Auto-advance start→end focus in range mode. Default `true`. */
  autoAdvance?: boolean;

  presets?: readonly DatePreset[];
  /** Per-day decorations. Called for every rendered day — keep it cheap/memoized. */
  dayMeta?: (date: PlainDate) => DayMeta | undefined | null;

  formatters?: Partial<Formatters>;
  labels?: Partial<Labels>;
  time?: TimeOptions;

  /** Value shape handed to `onChange` consumers. Default `'plain'`. */
  valueAdapter?: ValueAdapter<unknown>;
}

/** What `defaultValue` / `value` may look like. */
export type ValueInput = DateInput | DateInput[] | DateRangeInput | SelectionValue | null;

export interface ChangeMeta {
  readonly reason: ChangeReason;
  readonly mode: SelectionMode;
  readonly isComplete: boolean;
  readonly date?: PlainDate;
  readonly preset?: DatePreset;
  /** Nights (or days) in the current range, `0` when not applicable. */
  readonly duration: number;
}

export type ChangeReason =
  | 'select'
  | 'deselect'
  | 'range-start'
  | 'range-end'
  | 'preset'
  | 'clear'
  | 'input'
  | 'controlled'
  | 'time'
  | 'constraint-clamp';

/**
 * Converts between the internal {@link SelectionValue} and whatever the host app
 * uses (Date, ISO strings, Luxon, Day.js, Temporal, …).
 */
export interface ValueAdapter<T> {
  readonly name: string;
  /** External → internal. */
  toPlain: (value: unknown) => PlainDate | null;
  /** Internal → external. */
  fromPlain: (date: PlainDate) => T;
}

/* -------------------------------------------------------------------------- */
/*                                 Snapshot                                   */
/* -------------------------------------------------------------------------- */

/** Everything a renderer needs, computed once per state change. */
export interface CalendarSnapshot {
  readonly mode: SelectionMode;
  readonly view: CalendarView;
  /** The zoomed-out grid for `view`; `cells` is empty while `view` is `'day'`. */
  readonly zoom: ZoomState;
  readonly locale: string;
  readonly direction: 'ltr' | 'rtl';
  readonly today: PlainDate;
  readonly months: readonly MonthInfo[];
  readonly weekdays: readonly WeekdayInfo[];
  readonly value: SelectionValue;
  readonly focusedDate: PlainDate;
  readonly hoveredDate: PlainDate | null;
  readonly activeField: ActiveField;
  readonly anchor: PlainDate | null;
  readonly isSelecting: boolean;
  readonly isComplete: boolean;
  readonly isEmpty: boolean;
  /** Nights or days in the selected range; count of dates in `multiple` mode. */
  readonly duration: number;
  readonly durationLabel: string;
  readonly summary: string;
  readonly startLabel: string;
  readonly endLabel: string;
  readonly canGoPrevious: boolean;
  readonly canGoNext: boolean;
  readonly canClear: boolean;
  readonly presets: readonly ResolvedPreset[];
  /** Years offered by the year view / dropdown. */
  readonly years: readonly { year: number; label: string; disabled: boolean; isCurrent: boolean }[];
  readonly monthOptions: readonly {
    month: number;
    label: string;
    disabled: boolean;
    isCurrent: boolean;
  }[];
  readonly labels: Labels;
  readonly validation: { valid: boolean; reason?: DisabledReason; message?: string };
  /** Live-region text for assistive tech. */
  readonly announcement: string;
}

/** Imperative surface shared by every binding (React, vanilla, web component). */
export interface DatePickerEngineApi {
  getSnapshot(): CalendarSnapshot;
  subscribe(listener: () => void): () => void;
  setOptions(options: Partial<EngineOptions>): void;
  getOptions(): Required<Pick<EngineOptions, 'mode'>> & EngineOptions;

  select(date: DateInput, opts?: { field?: ActiveField }): void;
  hover(date: DateInput | null): void;
  focusDate(date: DateInput, opts?: { scrollIntoView?: boolean }): void;
  moveFocus(step: FocusStep): void;
  clear(): void;
  setValue(value: ValueInput, reason?: ChangeReason): void;
  getValue<T = SelectionValue>(): T;

  applyPreset(presetId: string): void;
  setActiveField(field: ActiveField): void;
  setView(view: CalendarView): void;
  /** Step out one zoom level (`day` → `month` → `year` → `decade`). */
  zoomOut(): void;
  /** Step into `date` one zoom level; at `day` level this is a no-op. */
  zoomIn(date?: DateInput): void;
  goToMonth(date: DateInput): void;
  nextMonth(count?: number): void;
  previousMonth(count?: number): void;
  goToToday(): void;
  setTime(field: ActiveField, time: PlainTime | null): void;
  /** Parse free text into a selection; returns false when unparseable. */
  parseInput(text: string, field?: ActiveField): boolean;
  handleKeyDown(event: KeyboardLike): boolean;
  destroy(): void;
}

export type FocusStep =
  | 'day-next'
  | 'day-previous'
  | 'week-next'
  | 'week-previous'
  | 'week-start'
  | 'week-end'
  | 'month-next'
  | 'month-previous'
  | 'month-start'
  | 'month-end'
  | 'year-next'
  | 'year-previous';

/** Minimal structural type so core never depends on the DOM. */
export interface KeyboardLike {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}
