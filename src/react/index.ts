/**
 * `datepicker-nextgen` — the React entry point.
 *
 * ```tsx
 * import { DatePicker } from 'datepicker-nextgen';
 * import 'datepicker-nextgen/styles.css';
 *
 * <DatePicker mode="range" numberOfMonths={2} minNights={2} onChange={setValue} />
 * ```
 *
 * Three levels of control, all from this one module:
 *
 * 1. `<DatePicker>` — the finished card, configured by props.
 * 2. The compound parts (`Calendar`, `DateFields`, `PresetList`, …) inside a
 *    `<DatePickerProvider>`, for a layout of your own.
 * 3. `useDatePicker()` and its prop getters, for markup of your own.
 *
 * The headless engine and the date math are re-exported here too, so a normal
 * app never needs a deep import.
 *
 * @packageDocumentation
 */

/* ------------------------------- components ------------------------------- */

export {
  Calendar,
  CalendarNav,
  CalendarZoom,
  DateFields,
  DateInput,
  DatePicker,
  DayCell,
  DurationBadge,
  MonthGrid,
  PickerFooter,
  Popover,
  PresetList,
  TimePicker,
  WeekdayRow,
} from './components';
export type {
  CalendarNavProps,
  CalendarProps,
  CalendarZoomProps,
  DateFieldsProps,
  DateInputProps,
  DatePickerProps,
  DatePickerSize,
  DatePickerVariant,
  DayCellProps,
  DurationBadgeProps,
  MonthGridProps,
  PickerFooterProps,
  PopoverPlacement,
  PopoverProps,
  PresetListProps,
  TimePickerProps,
  WeekdayRowProps,
} from './components';

/* ---------------------------- hook and context ---------------------------- */

export { useDatePicker } from './use-date-picker';
export type {
  DatePickerActions,
  UseDatePickerOptions,
  UseDatePickerReturn,
} from './use-date-picker';
/**
 * The loose prop bag returned by every prop getter. Exported under a
 * disambiguating name because `DatePickerProps` belongs to the component.
 */
export type { DatePickerProps as PropGetterProps } from './use-date-picker';

export { DatePickerContext, DatePickerProvider, useDatePickerContext } from './context';
export type { DatePickerProviderProps } from './context';

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
  DateInput as DateInputValue,
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
  WeekInfo,
  WeekdayInfo,
  ZoomCell,
  ZoomState,
} from '../core/types';

/* --------------------------------- engine --------------------------------- */

/**
 * The headless engine. Aliased so it does not collide with the vanilla
 * `createDatePicker`, which mounts DOM.
 */
export { createDatePicker as createDatePickerEngine, DatePickerEngine } from '../core/engine';

/* -------------------------------- adapters -------------------------------- */

export {
  createAdapter,
  createLibraryAdapter,
  isoStringAdapter,
  nativeDateAdapter,
  plainDateAdapter,
  timestampAdapter,
  toExternalValue,
} from '../core/adapters';

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
  normalizePresets,
  quarterPreset,
  schedulingPresets,
  toDatePreset,
  weekendPreset,
  yearPreset,
} from '../core/presets';

/* ------------------------------ date helpers ------------------------------ */

export {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  compareDates,
  diffInDays,
  endOfMonth,
  endOfWeek,
  fromISODate,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  plainDate,
  plainTime,
  rangeLength,
  startOfMonth,
  startOfWeek,
  subDays,
  toDate,
  toISODate,
  toPlainDate,
  toPlainTime,
  today,
} from '../core/plain-date';

/* ---------------------------------- i18n ---------------------------------- */

export {
  defaultFormatters,
  defaultLabels,
  formatDate,
  localeFirstDayOfWeek,
  localeUses12Hour,
  resolveFormatters,
  resolveLabels,
  resolveLocale,
  runtimeLocale,
} from '../core/intl';

export {
  localeDateOrder,
  localeDatePlaceholder,
  parseDateString,
  parseRangeString,
} from '../core/parse';

/* -------------------------------- keyboard -------------------------------- */

export { keyboardShortcuts } from '../core/keyboard';
