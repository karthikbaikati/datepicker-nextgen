/**
 * `datepicker-nextgen/vanilla` — the framework-free entry point.
 *
 * No React, no dependencies, no build step required. Everything here is a named
 * export of a side-effect-free module, so a bundler drops whatever you do not
 * import (the custom element included).
 *
 * ```js
 * import { createDatePicker } from 'datepicker-nextgen/vanilla';
 * import 'datepicker-nextgen/styles.css';
 *
 * const picker = createDatePicker('#calendar', { mode: 'range', minNights: 2 });
 * picker.on('complete', ({ selection }) => console.log(selection.range));
 * ```
 *
 * ```html
 * <script type="module">
 *   import { defineDatePickerElement } from 'https://esm.sh/datepicker-nextgen/vanilla';
 *   defineDatePickerElement();
 * </script>
 * <nextgen-date-picker mode="range" months="2" presets="this-weekend,1-week"></nextgen-date-picker>
 * ```
 *
 * @packageDocumentation
 */

/* --------------------------------- mounting -------------------------------- */

export { attachDatePicker, createDatePicker } from './mount';
export type {
  DatePickerChangeDetail,
  DatePickerEventMap,
  DatePickerEventName,
  DatePickerInstance,
  VanillaOptions,
} from './mount';

/* ------------------------------ custom element ----------------------------- */

export { defineDatePickerElement, parseValueAttribute } from './element';
export type { DatePickerElement } from './element';

/* --------------------------------- renderer -------------------------------- */

export { createRenderer, dayKeyOf, FOCUSABLE_SELECTOR } from './renderer';
export type {
  DatePickerRenderer,
  PickerOrientation,
  PickerSize,
  PickerVariant,
  PresentationOptions,
  RenderConfig,
} from './renderer';

/* ----------------------------- core re-exports ----------------------------- */
/* The pieces a vanilla consumer needs to build option objects and read values
   without also importing `datepicker-nextgen/core`. */

export {
  builtInPresets,
  bookingPresets,
  analyticsPresets,
  schedulingPresets,
  defaultPresetsFor,
  createPreset,
  getPreset,
  normalizePresets,
} from '../core/presets';
export {
  isoStringAdapter,
  nativeDateAdapter,
  plainDateAdapter,
  timestampAdapter,
} from '../core/adapters';
export {
  plainDate,
  plainTime,
  toISODate,
  fromISODate,
  toPlainDate,
  today,
} from '../core/plain-date';
export { keyboardShortcuts } from '../core/keyboard';

export type {
  ActiveField,
  CalendarSnapshot,
  ChangeMeta,
  ChangeReason,
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
  Formatters,
  Labels,
  MonthInfo,
  PlainDate,
  PlainTime,
  RangeSemantics,
  ResolvedPreset,
  SelectionMode,
  SelectionValue,
  TimeOptions,
  ZoomCell,
  ZoomState,
  ValueAdapter,
  ValueInput,
  WeekInfo,
  WeekdayInfo,
} from '../core/types';
