/**
 * `datepicker-nextgen/core` — the headless entry point.
 *
 * Everything here is framework-free, dependency-free and timezone-safe: the
 * engine store, the pure calendar/constraint/selection modules it is built from,
 * the plain-date math, the i18n services and the value adapters. Import from
 * `datepicker-nextgen/react` or `datepicker-nextgen/vanilla` for a UI.
 *
 * ```ts
 * import { createDatePicker, isoStringAdapter } from 'datepicker-nextgen/core';
 *
 * const picker = createDatePicker({ mode: 'range', minNights: 2 });
 * picker.subscribe(() => render(picker.getSnapshot()));
 * ```
 *
 * @packageDocumentation
 */

/* --------------------------------- types ---------------------------------- */

export type {
  ActiveField,
  CalendarSnapshot,
  CalendarView,
  ChangeMeta,
  ChangeReason,
  CompleteDateRange,
  ConstraintContext,
  DateConstraints,
  DateInput,
  DatePickerEngineApi,
  DatePreset,
  DateRange,
  DateRangeInput,
  DayEvaluation,
  DayInfo,
  DayMeta,
  DisabledReason,
  EngineOptions,
  FirstDayOfWeek,
  FocusStep,
  Formatters,
  KeyboardLike,
  Labels,
  ModeValue,
  MonthInfo,
  PlainDate,
  PlainDateTime,
  PlainTime,
  PresetContext,
  RangeSemantics,
  ResolvedPreset,
  SelectionMode,
  SelectionValue,
  TimeOptions,
  ValueAdapter,
  ValueInput,
  WeekdayInfo,
  WeekInfo,
  ZoomCell,
  ZoomState,
} from './types';

/* ------------------------------- plain date ------------------------------- */

export {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  clampDate,
  clampTime,
  compareDates,
  compareTimes,
  daysInMonth,
  diffInDays,
  diffInMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  fromEpochDay,
  fromISODate,
  getDayOfYear,
  getISOWeek,
  getISOWeekYear,
  getQuarter,
  getWeekday,
  isAfter,
  isBefore,
  isBetween,
  isLeapYear,
  isPlainDate,
  isSameDay,
  isSameMonth,
  isSameOrAfter,
  isSameOrBefore,
  isSameYear,
  isWeekend,
  maxOf,
  minOf,
  minutesToTime,
  normalizeRange,
  plainDate,
  plainTime,
  rangeContains,
  rangeLength,
  rangesOverlap,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  timeToMinutes,
  toDate,
  toEpochDay,
  toISODate,
  toPlainDate,
  toPlainTime,
  today,
} from './plain-date';

/* ---------------------------------- intl ---------------------------------- */

export {
  clearIntlCaches,
  defaultFormatters,
  defaultLabels,
  formatDate,
  isRTL,
  isoWeekOf,
  localeFirstDayOfWeek,
  localeUses12Hour,
  localeWeekendDays,
  resolveFormatters,
  resolveLabels,
  resolveLocale,
  runtimeLocale,
  weekdayInfos,
} from './intl';

/* ------------------------------- constraints ------------------------------ */

export {
  alwaysSelectable,
  clampSelection,
  evaluateDate,
  evaluateRange,
  findSelectable,
  isSelectable,
  nextBlockedAfter,
  previousBlockedBefore,
  resolveConstraints,
} from './constraints';
export type { ResolvedConstraints } from './constraints';

/* --------------------------------- presets -------------------------------- */

export {
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
} from './presets';
export type {
  DurationPresetOptions,
  PresetResult,
  UnitPresetOptions,
  WindowPresetOptions,
} from './presets';

/* -------------------------------- selection ------------------------------- */

export {
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
} from './selection';
export type { SelectionRequest, SelectionResult } from './selection';

/* -------------------------------- keyboard -------------------------------- */

export { applyFocusStep, keyboardShortcuts, resolveKeyboardIntent } from './keyboard';
export type { KeyboardIntent } from './keyboard';

/* -------------------------------- calendar -------------------------------- */

export {
  buildMonthOptions,
  buildMonths,
  buildWeekdays,
  buildYearOptions,
  buildZoom,
  EMPTY_ZOOM,
  resolveYearSpan,
} from './calendar';
export type { BuildCalendarInput, BuildZoomInput, YearSpan } from './calendar';

/* ---------------------------------- parse --------------------------------- */

export {
  clearParseCaches,
  formatForInput,
  localeDateOrder,
  localeDatePlaceholder,
  parseDateString,
  parseRangeString,
} from './parse';
export type { DatePart, ParseOptions } from './parse';

/* -------------------------------- adapters -------------------------------- */

export {
  createAdapter,
  createLibraryAdapter,
  isoStringAdapter,
  nativeDateAdapter,
  plainDateAdapter,
  timestampAdapter,
  toExternalValue,
} from './adapters';

/* --------------------------------- engine --------------------------------- */

export { DatePickerEngine, createDatePicker } from './engine';
