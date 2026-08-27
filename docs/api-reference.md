# API reference

Every exported symbol, every option, every snapshot field, and the CSS contract.

- [Entry points](#entry-points)
- [EngineOptions](#engineoptions)
- [`<DatePicker>` and the React components](#datepicker-and-the-react-components)
- [`useDatePicker`](#usedatepicker)
- [Prop getters](#prop-getters)
- [Engine API](#engine-api)
- [CalendarSnapshot](#calendarsnapshot)
- [MonthInfo, WeekInfo, WeekdayInfo](#monthinfo-weekinfo-weekdayinfo)
- [DayInfo](#dayinfo)
- [DayMeta](#daymeta)
- [Constraints](#constraints)
- [Presets](#presets)
- [Selection](#selection)
- [Keyboard](#keyboard)
- [Calendar builder](#calendar-builder)
- [Parsing](#parsing)
- [Adapters](#adapters)
- [Formatters and labels](#formatters-and-labels)
- [Plain-date math](#plain-date-math)
- [Vanilla API](#vanilla-api)
- [CSS classes and data attributes](#css-classes-and-data-attributes)
- [Type index](#type-index)

## Entry points

| Specifier                                                                        | Exports                                                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `datepicker-nextgen`                                                             | React components, `useDatePicker`, `DatePickerProvider`, `useDatePickerContext`, and the core re-exports                        |
| `datepicker-nextgen/core`                                                        | Engine + every pure module below it. No React, no DOM.                                                                          |
| `datepicker-nextgen/vanilla`                                                     | `createDatePicker`, `attachDatePicker`, `defineDatePickerElement`, `createRenderer`, plus the core symbols a vanilla page needs |
| `datepicker-nextgen/styles.css`                                                  | Default stylesheet                                                                                                              |
| `datepicker-nextgen/themes/{midnight,emerald,rose,mono,glass,high-contrast}.css` | Token-only theme overrides                                                                                                      |

Named exports only. Both ESM and CJS.

## EngineOptions

Accepted by `createDatePicker()` (core and vanilla), `useDatePicker()`, `<DatePicker>` and
`engine.setOptions()`. Every field is optional.

### Mode and value

| Option           | Type                                                                            | Default            | Description                                                                                         |
| ---------------- | ------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| `mode`           | `'single' \| 'range' \| 'multiple' \| 'week' \| 'month' \| 'quarter' \| 'year'` | `'single'`         | What a click selects.                                                                               |
| `defaultValue`   | `ValueInput`                                                                    | `null`             | Uncontrolled initial selection.                                                                     |
| `value`          | `ValueInput`                                                                    | —                  | Controlled selection. When set, the engine never mutates its own value; feed changes back yourself. |
| `rangeSemantics` | `'nights' \| 'days'`                                                            | `'nights'`         | How a range's length is counted. Sep 4 → Sep 25 is 21 nights or 22 days.                            |
| `valueAdapter`   | `ValueAdapter<unknown>`                                                         | `plainDateAdapter` | Shape returned by `engine.getValue()`. Does **not** change what `onChange` receives.                |

### Callbacks

| Option               | Signature                                              | Fires when                                                                         |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `onChange`           | `(value: SelectionValue, meta: ChangeMeta) => void`    | Any accepted mutation, including a half-picked range.                              |
| `onComplete`         | `(value: SelectionValue, meta: ChangeMeta) => void`    | The selection becomes complete (`meta.isComplete`). Always preceded by `onChange`. |
| `onMonthChange`      | `(month: PlainDate) => void`                           | The first visible month changes.                                                   |
| `onFocusChange`      | `(date: PlainDate) => void`                            | The roving focus moves.                                                            |
| `onHoverChange`      | `(date: PlainDate \| null) => void`                    | The hovered day changes.                                                           |
| `onPresetApply`      | `(preset: DatePreset, value: SelectionValue) => void`  | A preset chip produces a value.                                                    |
| `onInvalidSelection` | `(date: PlainDate, evaluation: DayEvaluation) => void` | A click is rejected by a constraint. Ideal for a toast.                            |

`ChangeMeta` is `{ reason, mode, isComplete, date?, preset?, duration }`, where `reason` is one of
`select`, `deselect`, `range-start`, `range-end`, `preset`, `clear`, `input`, `controlled`, `time`,
`constraint-clamp`.

### Locale and time

| Option           | Type                                          | Default      | Description                                                                                                            |
| ---------------- | --------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `locale`         | `string \| 'auto'`                            | `'auto'`     | BCP-47 tag. `'auto'` reads the runtime default. Drives formatting, first day of week, weekend days and text direction. |
| `firstDayOfWeek` | `0 \| 1 \| 2 \| 3 \| 4 \| 5 \| 6 \| 'locale'` | `'locale'`   | 0 = Sunday. `'locale'` derives it from `Intl.Locale#getWeekInfo` where available.                                      |
| `timeZone`       | `string`                                      | runtime zone | IANA zone used **only** to compute "today".                                                                            |
| `today`          | `DateInput`                                   | current date | Override "today" entirely. Freeze this in tests and Storybook.                                                         |
| `time`           | `TimeOptions`                                 | —            | Enables the time row. See below.                                                                                       |

`TimeOptions`:

| Field              | Type                  | Default    | Description                                         |
| ------------------ | --------------------- | ---------- | --------------------------------------------------- |
| `enabled`          | `boolean`             | `false`    | Turns the time selection on.                        |
| `minuteStep`       | `number`              | `30`       | Step of the minute list.                            |
| `withSeconds`      | `boolean`             | `false`    | Include a seconds field.                            |
| `use12Hours`       | `boolean \| 'locale'` | `'locale'` | Hour cycle.                                         |
| `defaultStartTime` | `PlainTime`           | —          | Applied when a start date is picked without a time. |
| `defaultEndTime`   | `PlainTime`           | —          | Same for the end.                                   |
| `minTime`          | `PlainTime`           | —          | Times are clamped into `[minTime, maxTime]`.        |
| `maxTime`          | `PlainTime`           | —          |                                                     |

### Calendar layout

| Option               | Type        | Default               | Description                                                                                                                                      |
| -------------------- | ----------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `numberOfMonths`     | `number`    | `1`                   | Months rendered side by side (or stacked when `orientation="vertical"`).                                                                         |
| `fixedWeeks`         | `boolean`   | `true`                | Always emit 6 week rows so the calendar never changes height.                                                                                    |
| `showOutsideDays`    | `boolean`   | `true`                | Render leading/trailing days from neighbouring months. Outside cells are always emitted for grid geometry; this controls whether they are shown. |
| `selectOutsideDays`  | `boolean`   | `true`                | Allow clicking those greyed-out days.                                                                                                            |
| `showWeekNumbers`    | `boolean`   | `false`               | Leading ISO-8601 week-number column (`role="rowheader"`).                                                                                        |
| `defaultMonth`       | `DateInput` | selection, else today | Month the calendar opens on.                                                                                                                     |
| `month`              | `DateInput` | —                     | Controlled visible month. Pair with `onMonthChange`.                                                                                             |
| `restrictNavigation` | `boolean`   | `true`                | Clamp month navigation to `minDate`/`maxDate` — this is what disables the prev/next chevrons.                                                    |

### Interaction

| Option              | Type      | Default | Description                                                                 |
| ------------------- | --------- | ------- | --------------------------------------------------------------------------- |
| `allowReverseRange` | `boolean` | `true`  | Picking an end before the start swaps them instead of restarting the range. |
| `toggleOnReselect`  | `boolean` | `true`  | Clicking an already-selected date clears it (`single` / `multiple`).        |
| `resetOnComplete`   | `boolean` | `true`  | After both ends are picked, the next click starts a new range.              |
| `autoAdvance`       | `boolean` | `true`  | Move the active field from `start` to `end` automatically.                  |

### Content

| Option       | Type                                                | Default                   | Description                                                                                          |
| ------------ | --------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `presets`    | `readonly DatePreset[]`                             | `defaultPresetsFor(mode)` | Preset chips. Pass `[]` for none. Use `normalizePresets(['today', …])` to build the array from ids.  |
| `dayMeta`    | `(date: PlainDate) => DayMeta \| undefined \| null` | —                         | Per-day decoration. Called for **every rendered day** on every snapshot — keep it O(1) and memoized. |
| `formatters` | `Partial<Formatters>`                               | `defaultFormatters`       | Override any formatter. Pass a stable object identity.                                               |
| `labels`     | `Partial<Labels>`                                   | `defaultLabels`           | Override any user-visible string. Pass a stable object identity.                                     |

> **Identity matters.** `presets`, `formatters`, `labels`, `dayMeta` and `time` are diffed by
> reference. Define them at module scope or wrap them in `useMemo`, or the engine rebuilds its
> derived state on every render.

### Constraints

All of `DateConstraints` is part of `EngineOptions`.

| Option                   | Type                                                                | Default | Description                                                                                               |
| ------------------------ | ------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `minDate`                | `DateInput`                                                         | —       | Earliest selectable date, inclusive.                                                                      |
| `maxDate`                | `DateInput`                                                         | —       | Latest selectable date, inclusive.                                                                        |
| `disabledDates`          | `DateInput[] \| DateRangeInput[] \| ((date: PlainDate) => boolean)` | —       | Blocklist.                                                                                                |
| `enabledDates`           | `DateInput[] \| DateRangeInput[] \| ((date: PlainDate) => boolean)` | —       | Allowlist. When present, **only** these dates are selectable.                                             |
| `disabledDaysOfWeek`     | `readonly number[]`                                                 | `[]`    | 0 = Sunday … 6 = Saturday.                                                                                |
| `blockedRanges`          | `readonly DateRangeInput[]`                                         | `[]`    | Contiguous unavailable spans, e.g. already-booked nights. Merged and sorted internally.                   |
| `disablePast`            | `boolean`                                                           | `false` | Shorthand for `minDate: today`.                                                                           |
| `disableFuture`          | `boolean`                                                           | `false` | Shorthand for `maxDate: today`.                                                                           |
| `disableWeekends`        | `boolean`                                                           | `false` | Shorthand for `disabledDaysOfWeek: [0, 6]`.                                                               |
| `minNights`              | `number`                                                            | —       | Range: minimum span. Counted in nights or days per `rangeSemantics`.                                      |
| `maxNights`              | `number`                                                            | —       | Range: maximum span.                                                                                      |
| `minSelections`          | `number`                                                            | —       | `multiple`: minimum count before the selection is complete.                                               |
| `maxSelections`          | `number`                                                            | —       | `multiple`: maximum count.                                                                                |
| `rollingSelection`       | `boolean`                                                           | `false` | At `maxSelections`, evict the oldest pick instead of rejecting the new one.                               |
| `preventCrossingBlocked` | `boolean`                                                           | `true`  | Reject any range whose span crosses a blocked/disabled date, and cap the hover preview at it.             |
| `isDateUnavailable`      | `(date, ctx: ConstraintContext) => boolean \| DayEvaluation`        | —       | Escape hatch, evaluated **last**. Return `true` (or a `DayEvaluation` with `selectable: false`) to block. |

`minNights` and `maxNights` only restrict the **end** pick — when an anchor exists and the active
field is `end`. Evaluation order, and therefore the `DisabledReason` you get, is fixed:

`before-min` → `after-max` → `not-in-allowlist` → `disabled-weekday` → `blocked-range` →
`disabled-date` → `min-nights` → `max-nights` → `crosses-blocked` → `custom`.

`ConstraintContext` passed to `isDateUnavailable` is
`{ mode, today, value, activeField, anchor }` — the anchor is the half-picked start, so you can
validate against a pending range.

## `<DatePicker>` and the React components

`<DatePicker>` takes **every `EngineOptions` field** plus the presentational props below, and
provides the picker context to its children. The other components are presentational consumers of
`useDatePickerContext()`; they take `className` and `style` and forward refs where sensible.

| Presentational prop | Type                                          | Default                        | Effect                                                                     |
| ------------------- | --------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| `className`         | `string`                                      | —                              | Merged onto the `.dpng` root.                                              |
| `theme`             | `string`                                      | —                              | Sets `data-theme`. Pairs with the theme stylesheets.                       |
| `size`              | `'sm' \| 'md' \| 'lg'`                        | `'md'`                         | Sets `data-size`; scales `--dpng-cell-size` and `--dpng-font-size`.        |
| `variant`           | `'inline' \| 'popover' \| 'modal' \| 'sheet'` | `'inline'`                     | Sets `data-variant`.                                                       |
| `orientation`       | `'horizontal' \| 'vertical'`                  | `'horizontal'`                 | Sets `data-orientation`. Vertical stacks months into one scrolling column. |
| `title`             | `string`                                      | `labels.title`                 | Header title.                                                              |
| `showHeader`        | `boolean`                                     | `true`                         | Title row with the duration badge.                                         |
| `showDurationBadge` | `boolean`                                     | `true`                         | The `21 nights` pill.                                                      |
| `showFields`        | `boolean`                                     | `true`                         | Check-in / check-out summary fields.                                       |
| `showNav`           | `boolean`                                     | `true`                         | Month navigation row.                                                      |
| `showMonthCaptions` | `boolean`                                     | `true` when >1 month           | Per-month captions.                                                        |
| `showNavSelects`    | `boolean`                                     | `false`                        | Month + year `<select>`s in the nav row.                                   |
| `showWeekdays`      | `boolean`                                     | `true`                         | Weekday header row.                                                        |
| `showPresets`       | `boolean`                                     | `true` when presets resolve    | Preset chip row.                                                           |
| `showClear`         | `boolean`                                     | `true`                         | Trailing `Clear` action in the preset row.                                 |
| `showFooter`        | `boolean`                                     | `false`                        | Footer row.                                                                |
| `showTodayButton`   | `boolean`                                     | `true` when the footer shows   | `Today` action.                                                            |
| `showApplyButton`   | `boolean`                                     | `true` for non-inline variants | `Apply` action.                                                            |
| `showCancelButton`  | `boolean`                                     | `true` for non-inline variants | `Cancel` action (restores the value the panel opened with).                |
| `showTime`          | `boolean`                                     | `true` when `time.enabled`     | Time selects.                                                              |
| `showLiveRegion`    | `boolean`                                     | `true`                         | The visually hidden `aria-live` region.                                    |
| `children`          | `ReactNode`                                   | —                              | Replaces the default arrangement with your own composition.                |

### Component list

| Component       | Renders                                                                           |
| --------------- | --------------------------------------------------------------------------------- |
| `DatePicker`    | Everything, and provides the context. The only component that creates state.      |
| `Calendar`      | The months wrapper (`.dpng-months`) containing one `MonthGrid` per visible month. |
| `MonthGrid`     | One month: `role="grid"`, its weekday row and its day cells.                      |
| `DayCell`       | A single day button with every state class, data attribute and ARIA flag.         |
| `WeekdayRow`    | The `M T W T F S S` header row.                                                   |
| `CalendarNav`   | Month caption, prev/next chevrons, optional month/year selects.                   |
| `DateFields`    | The check-in / check-out summary fields with the active underline.                |
| `DurationBadge` | The `21 nights` pill.                                                             |
| `PresetList`    | The preset chip row plus the `Clear` action.                                      |
| `PickerFooter`  | Footer with `Today` / `Cancel` / `Apply`.                                         |
| `DateInput`     | A masked, locale-aware text input bound to one field.                             |
| `TimePicker`    | The time selects.                                                                 |
| `Popover`       | The floating panel, backdrop and focus trap used by the non-inline variants.      |

### Context

```tsx
import { DatePickerProvider, useDatePickerContext } from 'datepicker-nextgen';
```

| Symbol                 | Signature                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `DatePickerProvider`   | `(props: DatePickerProviderProps) => ReactNode`                                          |
| `useDatePickerContext` | `() => UseDatePickerReturn` — throws with a helpful message when used outside a provider |
| `DatePickerContext`    | The raw context, for advanced composition and test harnesses                             |

`DatePickerProviderProps` is `Omit<UseDatePickerOptions, 'value'>` plus:

| Prop       | Type                                | Description                                                                 |
| ---------- | ----------------------------------- | --------------------------------------------------------------------------- |
| `picker`   | `UseDatePickerReturn`               | An existing picker to adopt. Wins over `value`.                             |
| `value`    | `ValueInput \| UseDatePickerReturn` | Either the controlled selection or a picker to adopt — told apart by shape. |
| `children` | `ReactNode`                         |                                                                             |

## `useDatePicker`

```ts
function useDatePicker(options?: UseDatePickerOptions): UseDatePickerReturn;

interface UseDatePickerOptions extends EngineOptions {}
```

Creates exactly one engine for the component's lifetime, mirrors it through
`useSyncExternalStore`, and never touches `window` or `document` during render (SSR-safe,
StrictMode-safe). Returns:

| Field                            | Type                  | Description                                                        |
| -------------------------------- | --------------------- | ------------------------------------------------------------------ |
| `engine`                         | `DatePickerEngineApi` | The imperative surface.                                            |
| `snapshot`                       | `CalendarSnapshot`    | Everything a renderer needs. Referentially stable between changes. |
| `actions`                        | `DatePickerActions`   | Pre-bound, referentially stable engine methods.                    |
| `getRootProps` … `getInputProps` | prop getters          | See below.                                                         |

`DatePickerActions` mirrors the engine: `select`, `clear`, `applyPreset`, `goToMonth`, `nextMonth`,
`previousMonth`, `goToToday`, `setActiveField`, `setView`, `focusDate`, `hover`, `setValue`,
`setTime`, `parseInput`.

Callbacks (`onChange` and friends) are installed once as stable forwarders, so an inline arrow
function never causes a resync. All other options are diffed key by key against the previous render.

## Prop getters

Every getter accepts an optional props object and merges it: `className` concatenates, `style`
shallow-merges, `onX` handlers **chain with yours first** (call `preventDefault()` in your handler
to suppress the built-in behaviour), everything else overrides.

```ts
getRootProps<T extends Record<string, unknown>>(props?: T): T & Record<string, unknown>;
getCalendarProps(props?): Record<string, unknown>;
getGridProps(month: MonthInfo, props?): Record<string, unknown>;
getDayProps(day: DayInfo, props?): Record<string, unknown>;
getPreviousMonthProps(props?): Record<string, unknown>;
getNextMonthProps(props?): Record<string, unknown>;
getPresetProps(preset: ResolvedPreset, props?): Record<string, unknown>;
getClearProps(props?): Record<string, unknown>;
getFieldProps(field: 'start' | 'end', props?): Record<string, unknown>;
getInputProps(field: 'start' | 'end', props?): Record<string, unknown>;
```

| Getter                                        | Produces                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getRootProps`                                | `className="dpng"`, `dir`, `data-mode`, `data-months`, `data-selecting`, and the `onKeyDown` that routes keys to the engine (it deliberately does not claim keys typed into an input, or Enter/Space on a button that is not a day cell).                                                                                                          |
| `getCalendarProps`                            | `className="dpng-months"`, `role="group"`, `aria-label`, `data-months`, `onMouseLeave` that drops the hover preview. Never `role="application"` — that would break screen-reader table navigation inside the grid.                                                                                                                                 |
| `getGridProps`                                | `className="dpng-grid"`, `role="grid"`, `aria-label` (the month label), `aria-multiselectable` in `multiple` mode, `data-month`, a stable `id`.                                                                                                                                                                                                    |
| `getDayProps`                                 | `type="button"`, `role="gridcell"`, `id`, the full state class string, `tabIndex`, `aria-disabled` / `aria-selected` / `aria-current` / `aria-label`, `title` and `style` from `dayMeta`, every `data-*` state flag, and `onClick` / `onMouseEnter` / `onFocus`. **Not** `disabled` — unavailable days must stay reachable by the roving tabindex. |
| `getPreviousMonthProps` / `getNextMonthProps` | `type="button"`, nav classes, `aria-label` from `labels`, `disabled` from `canGoPrevious` / `canGoNext`, `data-direction`, `onClick`.                                                                                                                                                                                                              |
| `getPresetProps`                              | `type="button"`, `dpng-preset` + `--active` / `--disabled`, `aria-pressed`, `disabled`, `title` (the resolved hint), `data-preset`, `data-active`, `data-disabled`, `onClick`.                                                                                                                                                                     |
| `getClearProps`                               | `type="button"`, `dpng-button dpng-button--ghost`, `aria-label`, `disabled` from `canClear`, `data-action="clear"`, `onClick`.                                                                                                                                                                                                                     |
| `getFieldProps`                               | `type="button"`, `dpng-field` + `--active` / `--filled` / `--invalid`, `aria-pressed`, `aria-label`, `data-field` / `data-active` / `data-filled` / `data-invalid`, `onClick` that sets the active field.                                                                                                                                          |
| `getInputProps`                               | A controlled text input: `value` (a locale-formatted date, or the user's uncommitted draft), `placeholder` from the locale, `inputMode="numeric"`, `aria-invalid`, and `onChange` / `onBlur` / `onKeyDown`. Enter commits, Escape reverts the draft, and key events are stopped so the calendar's shortcuts do not eat typing.                     |

Day `data-*` flags, all present-or-absent with the value `"true"`: `data-today`, `data-selected`,
`data-range-start`, `data-range-end`, `data-in-range`, `data-preview`, `data-preview-start`,
`data-preview-end`, `data-disabled`, `data-blocked`, `data-outside`, `data-weekend`,
`data-holiday`, `data-hovered`, `data-focused`. Plus `data-date` with the ISO key.

## Engine API

```ts
import { createDatePicker, DatePickerEngine } from 'datepicker-nextgen/core';

const engine = createDatePicker(options?: EngineOptions): DatePickerEngineApi;
// `DatePickerEngine` is the class behind it, exported for subclassing and instanceof checks.
```

| Method                        | Signature                                                        | Notes                                                                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getSnapshot`                 | `() => CalendarSnapshot`                                         | Memoized; the same reference is returned until state or options change, which is what `useSyncExternalStore` requires.                                                                                       |
| `subscribe`                   | `(listener: () => void) => () => void`                           | Called synchronously after each mutation. Returns an unsubscribe.                                                                                                                                            |
| `setOptions`                  | `(options: Partial<EngineOptions>) => void`                      | Shallow-merged.                                                                                                                                                                                              |
| `getOptions`                  | `() => Required<Pick<EngineOptions, 'mode'>> & EngineOptions`    |                                                                                                                                                                                                              |
| `select`                      | `(date: DateInput, opts?: { field?: ActiveField }) => void`      | Runs constraints first; a rejection calls `onInvalidSelection` and changes nothing.                                                                                                                          |
| `hover`                       | `(date: DateInput \| null) => void`                              | Drives the range preview.                                                                                                                                                                                    |
| `focusDate`                   | `(date: DateInput, opts?: { scrollIntoView?: boolean }) => void` | Moves the roving focus; pulls the view along unless `scrollIntoView: false`.                                                                                                                                 |
| `moveFocus`                   | `(step: FocusStep) => void`                                      |                                                                                                                                                                                                              |
| `clear`                       | `() => void`                                                     |                                                                                                                                                                                                              |
| `setValue`                    | `(value: ValueInput, reason?: ChangeReason) => void`             | Default reason `'controlled'`.                                                                                                                                                                               |
| `getValue`                    | `<T = SelectionValue>() => T`                                    | Projected through `valueAdapter` and the mode.                                                                                                                                                               |
| `applyPreset`                 | `(presetId: string) => void`                                     |                                                                                                                                                                                                              |
| `setActiveField`              | `(field: 'start' \| 'end') => void`                              |                                                                                                                                                                                                              |
| `setView`                     | `(view: 'day' \| 'month' \| 'year') => void`                     |                                                                                                                                                                                                              |
| `goToMonth`                   | `(date: DateInput) => void`                                      |                                                                                                                                                                                                              |
| `nextMonth` / `previousMonth` | `(count?: number) => void`                                       | Default `1`.                                                                                                                                                                                                 |
| `goToToday`                   | `() => void`                                                     | Clamped into `minDate`/`maxDate`.                                                                                                                                                                            |
| `setTime`                     | `(field: ActiveField, time: PlainTime \| null) => void`          | Clamped into `time.minTime`/`maxTime`.                                                                                                                                                                       |
| `parseInput`                  | `(text: string, field?: ActiveField) => boolean`                 | Routes parsed text through the normal selection path, so typed dates obey the same constraints as clicked ones. In a range mode with no `field`, parses both halves.                                         |
| `handleKeyDown`               | `(event: KeyboardLike) => boolean`                               | Returns `true` when it handled the key (and calls `preventDefault` if present). Escape returns `true` without changing state — the core has no open/closed concept, so the binding acts on the return value. |
| `destroy`                     | `() => void`                                                     | Drops listeners and caches; the engine is inert afterwards.                                                                                                                                                  |

`KeyboardLike` is a structural type (`{ key, shiftKey?, metaKey?, ctrlKey?, altKey?, preventDefault?, stopPropagation? }`)
so the core never depends on the DOM. A React `KeyboardEvent` satisfies it as is.

`FocusStep`: `day-next`, `day-previous`, `week-next`, `week-previous`, `week-start`, `week-end`,
`month-next`, `month-previous`, `month-start`, `month-end`, `year-next`, `year-previous`.

## CalendarSnapshot

Everything a renderer needs, recomputed once per state change.

| Field           | Type                                                                                 | Description                                                                 |
| --------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `mode`          | `SelectionMode`                                                                      |                                                                             |
| `view`          | `'day' \| 'month' \| 'year'`                                                         | Current picker view.                                                        |
| `locale`        | `string`                                                                             | The resolved BCP-47 tag (never `'auto'`).                                   |
| `direction`     | `'ltr' \| 'rtl'`                                                                     | Derived from the locale; put it on `dir`.                                   |
| `today`         | `PlainDate`                                                                          | As resolved by `today` / `timeZone`.                                        |
| `months`        | `readonly MonthInfo[]`                                                               | One per visible month.                                                      |
| `weekdays`      | `readonly WeekdayInfo[]`                                                             | Header row, already rotated to `firstDayOfWeek`.                            |
| `value`         | `SelectionValue`                                                                     | The internal selection.                                                     |
| `focusedDate`   | `PlainDate`                                                                          | The roving-tabindex date.                                                   |
| `hoveredDate`   | `PlainDate \| null`                                                                  |                                                                             |
| `activeField`   | `'start' \| 'end'`                                                                   | Which half the next click fills.                                            |
| `anchor`        | `PlainDate \| null`                                                                  | The half-picked start, or `null`.                                           |
| `isSelecting`   | `boolean`                                                                            | A range is mid-pick.                                                        |
| `isComplete`    | `boolean`                                                                            |                                                                             |
| `isEmpty`       | `boolean`                                                                            |                                                                             |
| `duration`      | `number`                                                                             | Nights or days in the range; count of dates in `multiple`.                  |
| `durationLabel` | `string`                                                                             | e.g. `"21 nights"`.                                                         |
| `summary`       | `string`                                                                             | e.g. `"Sep 4 – Sep 25, 2026 · 21 nights"`.                                  |
| `startLabel`    | `string`                                                                             | Field value text, or the empty-value label.                                 |
| `endLabel`      | `string`                                                                             |                                                                             |
| `canGoPrevious` | `boolean`                                                                            |                                                                             |
| `canGoNext`     | `boolean`                                                                            |                                                                             |
| `canClear`      | `boolean`                                                                            |                                                                             |
| `presets`       | `readonly ResolvedPreset[]`                                                          | Already resolved: `disabled`, `resolvedHint`, bound `isActive`.             |
| `years`         | `readonly { year: number; label: string; disabled: boolean; isCurrent: boolean }[]`  | For the year view / dropdown.                                               |
| `monthOptions`  | `readonly { month: number; label: string; disabled: boolean; isCurrent: boolean }[]` |                                                                             |
| `labels`        | `Labels`                                                                             | Fully resolved.                                                             |
| `validation`    | `{ valid: boolean; reason?: DisabledReason; message?: string }`                      | Verdict on the current selection (min/max nights, crossing a blocked date). |
| `announcement`  | `string`                                                                             | Live-region text for assistive tech.                                        |

## MonthInfo, WeekInfo, WeekdayInfo

`MonthInfo`

| Field                              | Type                     | Description                                          |
| ---------------------------------- | ------------------------ | ---------------------------------------------------- |
| `date`                             | `PlainDate`              | First day of the month.                              |
| `key`                              | `string`                 | Stable key.                                          |
| `year` / `month`                   | `number`                 | `month` is 1-12.                                     |
| `label`                            | `string`                 | `"September 2026"`.                                  |
| `monthLabel` / `yearLabel`         | `string`                 | `"September"` / `"2026"`.                            |
| `weeks`                            | `readonly WeekInfo[]`    | Row-based layout.                                    |
| `days`                             | `readonly DayInfo[]`     | The same days flat, for CSS-grid layouts.            |
| `weekdays`                         | `readonly WeekdayInfo[]` |                                                      |
| `index`                            | `number`                 | Position in the visible strip.                       |
| `isFirstVisible` / `isLastVisible` | `boolean`                | Use these to decide which month shows which chevron. |

`WeekInfo`: `{ key, isoWeek, weekNumberLabel, days, isSelected }`.

`WeekdayInfo`: `{ weekday, short, abbreviated, long, isWeekend }` — `short` is the narrow form
(`"M"`), `abbreviated` is `"Mon"`, `long` is `"Monday"`.

## DayInfo

| Field                                           | Type                          | Description                                                         |
| ----------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| `date`                                          | `PlainDate`                   |                                                                     |
| `key`                                           | `string`                      | ISO `YYYY-MM-DD`; safe as a React `key`.                            |
| `label`                                         | `string`                      | Localized day-of-month text.                                        |
| `dayOfMonth`                                    | `number`                      |                                                                     |
| `weekday`                                       | `number`                      | 0 = Sunday.                                                         |
| `isoWeek`                                       | `number`                      | ISO-8601 week number.                                               |
| `inCurrentMonth`                                | `boolean`                     | False for borrowed neighbouring-month days.                         |
| `isToday`                                       | `boolean`                     |                                                                     |
| `isWeekend`                                     | `boolean`                     | Per the locale's weekend days, not hard-coded Sat/Sun.              |
| `isSelected`                                    | `boolean`                     |                                                                     |
| `isRangeStart` / `isRangeEnd` / `isInRange`     | `boolean`                     |                                                                     |
| `isPreview` / `isPreviewStart` / `isPreviewEnd` | `boolean`                     | Hover/keyboard preview of the range being drawn.                    |
| `isDisabled`                                    | `boolean`                     | Not selectable, for any reason.                                     |
| `isBlocked`                                     | `boolean`                     | Specifically inside a `blockedRanges` span.                         |
| `isOutsideBounds`                               | `boolean`                     | Outside `minDate`/`maxDate`.                                        |
| `isFocused` / `isHovered`                       | `boolean`                     |                                                                     |
| `isHoliday`                                     | `boolean`                     | From `dayMeta().holiday`. Themed, still selectable.                 |
| `isWeekStart` / `isWeekEnd`                     | `boolean`                     | First/last cell of its display week — used to round the range band. |
| `disabledReason`                                | `DisabledReason \| undefined` |                                                                     |
| `disabledMessage`                               | `string \| undefined`         | Human-readable; good for a tooltip.                                 |
| `meta`                                          | `DayMeta \| undefined`        | Whatever `dayMeta` returned.                                        |
| `tabIndex`                                      | `0 \| -1`                     | Exactly one day per calendar is `0`.                                |
| `ariaLabel`                                     | `string`                      | Full localized label plus a state suffix when disabled or selected. |
| `ariaSelected`                                  | `boolean`                     |                                                                     |
| `ariaDisabled`                                  | `boolean`                     |                                                                     |
| `ariaCurrent`                                   | `'date' \| undefined`         |                                                                     |

`DisabledReason`: `before-min`, `after-max`, `disabled-date`, `not-in-allowlist`,
`disabled-weekday`, `blocked-range`, `min-nights`, `max-nights`, `max-span`, `crosses-blocked`,
`max-selections`, `custom`.

## DayMeta

Returned from `dayMeta(date)` and surfaced on `DayInfo.meta`.

| Field             | Type                                                       | Rendered as                                                         |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `note`            | `string`                                                   | `.dpng-day__note` under the day number, e.g. `"$248"`.              |
| `dots`            | `readonly (string \| { color: string; label?: string })[]` | Up to 3 `.dpng-day__dot`s.                                          |
| `badge`           | `string \| number`                                         | `.dpng-day__badge` in the cell corner.                              |
| `tooltip`         | `string`                                                   | Native `title` + ARIA description.                                  |
| `className`       | `string`                                                   | Merged onto the cell.                                               |
| `style`           | `Record<string, string \| number>`                         | Inline style on the cell. Prefer CSS variables.                     |
| `holiday`         | `string`                                                   | Sets `isHoliday` and `data-holiday`; the day stays selectable.      |
| _(anything else)_ | `unknown`                                                  | Index signature — carry your own data through to a custom renderer. |

## Constraints

```ts
import {
  resolveConstraints,
  evaluateDate,
  isSelectable,
  evaluateRange,
  findSelectable,
  nextBlockedAfter,
  previousBlockedBefore,
  clampSelection,
  alwaysSelectable,
} from 'datepicker-nextgen/core';
```

| Export                  | Signature                                                                                                   | Purpose                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `resolveConstraints`    | `(options: DateConstraints & { rangeSemantics?: RangeSemantics }, today: PlainDate) => ResolvedConstraints` | Compile options into fast predicates once.                                        |
| `evaluateDate`          | `(date, c: ResolvedConstraints, ctx: ConstraintContext) => DayEvaluation`                                   | Full evaluation, including range-relative rules.                                  |
| `isSelectable`          | `(date, c, ctx) => boolean`                                                                                 | Cheap boolean form.                                                               |
| `evaluateRange`         | `(range: DateRange, c, ctx) => DayEvaluation`                                                               | Validates a complete range: span bounds and no blocked date inside.               |
| `findSelectable`        | `(from, c, ctx, direction: 1 \| -1) => PlainDate \| null`                                                   | Nearest selectable date, walking at most 366 steps.                               |
| `nextBlockedAfter`      | `(from, c, limit = 366) => PlainDate \| null`                                                               | First unavailable date strictly after `from`. Caps hover previews.                |
| `previousBlockedBefore` | `(from, c, limit = 366) => PlainDate \| null`                                                               | Mirror, walking backwards.                                                        |
| `clampSelection`        | `(value: SelectionValue, c, ctx) => SelectionValue \| null`                                                 | Force a value inside the constraints, or `null` when impossible. Used by presets. |
| `alwaysSelectable`      | `ResolvedConstraints`                                                                                       | Permissive frozen default.                                                        |

`ResolvedConstraints` exposes `minDate`, `maxDate`, `isDisabled`, `isAllowed`, `blockedRanges`,
`disabledDaysOfWeek`, `minNights`, `maxNights`, `minSelections`, `maxSelections`,
`rollingSelection`, `preventCrossingBlocked`, `custom`, `rangeSemantics`.

> The blocked walkers consider only the _day_ rules (bounds, weekday mask, blocked ranges,
> block/allow lists) — never `minNights`/`maxNights` (properties of a span, not a day) and never
> `isDateUnavailable` (which needs a context describing a pick). If you want a predicate to cap
> hover previews, put it in `disabledDates`, not in `isDateUnavailable`.

## Presets

```ts
import {
  builtInPresets,
  getPreset,
  normalizePresets,
  resolvePresets,
  createPreset,
  toDatePreset,
  nightsPreset,
  daysPreset,
  lastNDaysPreset,
  nextNDaysPreset,
  weekendPreset,
  monthPreset,
  quarterPreset,
  yearPreset,
  bookingPresets,
  analyticsPresets,
  schedulingPresets,
  defaultPresetsFor,
  normalizePresetResult,
} from 'datepicker-nextgen/core';
```

### Built-in ids

| id             | Label        | Produces                   |
| -------------- | ------------ | -------------------------- |
| `today`        | Today        | Today                      |
| `tomorrow`     | Tomorrow     | Tomorrow                   |
| `yesterday`    | Yesterday    | Yesterday                  |
| `this-weekend` | Weekend      | The upcoming Fri → Sun     |
| `next-weekend` | Next weekend | The Fri → Sun after that   |
| `3-nights`     | 3 nights     | Anchor → anchor + 3 days   |
| `1-week`       | 1 week       | Anchor → anchor + 7 days   |
| `2-weeks`      | 2 weeks      | Anchor → anchor + 14 days  |
| `1-month`      | 1 month      | Anchor → anchor + 1 month  |
| `last-7-days`  | Last 7 days  | 7-day window ending today  |
| `last-30-days` | Last 30 days | 30-day window ending today |
| `last-90-days` | Last 90 days | 90-day window ending today |
| `this-week`    | This week    | The current display week   |
| `next-week`    | Next week    | The following display week |
| `this-month`   | This month   | Calendar month             |
| `last-month`   | Last month   | Calendar month             |
| `next-month`   | Next month   | Calendar month             |
| `this-quarter` | This quarter | Calendar quarter           |
| `last-quarter` | Last quarter | Calendar quarter           |
| `this-year`    | This year    | Jan 1 → Dec 31             |
| `year-to-date` | Year to date | Jan 1 → today              |
| `next-monday`  | Next Monday  | Strictly after today       |
| `in-2-weeks`   | In 2 weeks   | Today + 14 days            |

"Anchor" means the half-picked check-in, falling back to the current range start, then today — so
tapping _1 week_ after choosing a check-in extends from that check-in.

### Bundles

| Export                    | Contents                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `bookingPresets`          | `this-weekend`, `3-nights`, `1-week`, `2-weeks`                                                                                 |
| `analyticsPresets`        | `today`, `yesterday`, `last-7-days`, `last-30-days`, `last-90-days`, `this-month`, `last-month`, `this-quarter`, `year-to-date` |
| `schedulingPresets`       | `today`, `tomorrow`, `next-week`, `next-monday`, `in-2-weeks`, `next-month`                                                     |
| `defaultPresetsFor(mode)` | `range` → `bookingPresets`; `single` → today / tomorrow / next-monday; every other mode → `[]`                                  |

### Factories

| Function          | Signature                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `createPreset`    | `(def: DatePreset) => DatePreset` — validates and freezes. Throws on a missing `id` or `getValue`.        |
| `toDatePreset`    | `(id: string, label: string, getValue: DatePreset['getValue']) => DatePreset`                             |
| `nightsPreset`    | `(nights: number, options?: DurationPresetOptions) => DatePreset`                                         |
| `daysPreset`      | `(days: number, options?: DurationPresetOptions) => DatePreset`                                           |
| `lastNDaysPreset` | `(days: number, options?: WindowPresetOptions) => DatePreset`                                             |
| `nextNDaysPreset` | `(days: number, options?: WindowPresetOptions) => DatePreset`                                             |
| `weekendPreset`   | `(options?: UnitPresetOptions & { offset?: number }) => DatePreset` — `offset` 0 = this weekend, 1 = next |
| `monthPreset`     | `(offset: number, options?: UnitPresetOptions) => DatePreset` — 0 = this month, -1 = last                 |
| `quarterPreset`   | `(offset: number, options?: UnitPresetOptions) => DatePreset`                                             |
| `yearPreset`      | `(offset: number, options?: UnitPresetOptions) => DatePreset`                                             |

`DurationPresetOptions`: `{ id?, label?, hint?, from?: 'today' | 'anchor' | 'focused' }` (default
`'anchor'`). `WindowPresetOptions`: `{ id?, label?, hint?, includeToday? }` (default `true`).
`UnitPresetOptions`: `{ id?, label?, hint? }`.

### Resolution

| Function                | Signature                                                                                   | Notes                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `getPreset`             | `(id: string) => DatePreset \| undefined`                                                   |                                                                                                                      |
| `normalizePresets`      | `(input?: readonly (DatePreset \| string)[]) => DatePreset[]`                               | Accepts presets, built-in ids or a mix. Unknown ids, malformed entries and duplicates are dropped.                   |
| `resolvePresets`        | `(presets, ctx: PresetContext, value: SelectionValue, locale?: string) => ResolvedPreset[]` | One `getValue` per preset per snapshot. A preset that throws disables its own chip instead of breaking the calendar. |
| `normalizePresetResult` | `(result, mode) => SelectionValue \| null`                                                  | Coerces any `getValue` return shape into a `SelectionValue`.                                                         |

### Writing one

```ts
import { createPreset } from 'datepicker-nextgen/core';
import { addDays } from 'datepicker-nextgen/core';

export const blackFriday = createPreset({
  id: 'black-friday',
  label: 'Black Friday week',
  group: 'Campaigns',
  shortcut: 'b',
  getValue: (ctx) =>
    ctx.clamp({
      dates: [],
      range: { start: ctx.today, end: addDays(ctx.today, 6) },
    }),
});
```

`getValue(ctx: PresetContext)` receives `{ today, mode, value, anchor, focusedDate, firstDayOfWeek,
rangeSemantics, clamp }`. **Always** use `ctx.today` and `ctx.clamp`, never `new Date()` — that is
what makes presets testable and timezone-safe. Return `null` to disable the chip. `clamp` returns
`null` when the value cannot be made valid, which disables the chip too (or hides it, with
`hideWhenInvalid: true`).

`ResolvedPreset` adds `disabled`, `resolvedHint` (a localized preview of the value it would produce)
and a bound `isActive`.

## Selection

Pure state transitions, exported so you can reuse them outside the engine.

| Export                | Signature                                                    |
| --------------------- | ------------------------------------------------------------ |
| `emptySelection`      | `() => SelectionValue`                                       |
| `normalizeValueInput` | `(input: ValueInput, mode: SelectionMode) => SelectionValue` |
| `isSelectionEmpty`    | `(value: SelectionValue) => boolean`                         |
| `isSelectionComplete` | `(value: SelectionValue, mode: SelectionMode) => boolean`    |
| `selectionEquals`     | `(a: SelectionValue, b: SelectionValue) => boolean`          |
| `selectionDuration`   | `(value, mode, semantics: RangeSemantics) => number`         |
| `selectionDates`      | `(value, mode) => PlainDate[]`                               |
| `applySelection`      | `(request: SelectionRequest) => SelectionResult`             |
| `computePreviewRange` | `(anchor, hovered, opts) => DateRange \| null`               |
| `unitRangeFor`        | `(date, mode, firstDayOfWeek) => DateRange`                  |
| `withTimes`           | `(value, times) => SelectionValue`                           |

`SelectionRequest` is `{ mode, value, date, activeField, anchor, firstDayOfWeek, options }` where
`options` is `{ allowReverseRange, toggleOnReselect, resetOnComplete, autoAdvance, maxSelections,
rollingSelection, rangeSemantics }`. `SelectionResult` is `{ value, reason, isComplete, activeField,
anchor, changed }`. Constraint checks happen in the engine _before_ `applySelection`.

## Keyboard

| Export                  | Signature                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `resolveKeyboardIntent` | `(event: KeyboardLike, opts: { rtl: boolean; presetShortcuts?: readonly string[] }) => KeyboardIntent` |
| `applyFocusStep`        | `(date: PlainDate, step: FocusStep, firstDayOfWeek: number) => PlainDate`                              |
| `keyboardShortcuts`     | `readonly { keys: string; description: string }[]`                                                     |

`KeyboardIntent` is `{ type: 'move', step } | { type: 'select' } | { type: 'clear' } |
{ type: 'close' } | { type: 'today' } | { type: 'preset', shortcut } | null`. `null` means "let it
bubble" — the picker never swallows keys it does not own. See
[accessibility.md](./accessibility.md) for the binding table.

## Calendar builder

| Export              | Signature                                                                      |
| ------------------- | ------------------------------------------------------------------------------ |
| `buildMonths`       | `(input: BuildCalendarInput) => MonthInfo[]`                                   |
| `buildWeekdays`     | `(locale, firstDayOfWeek, weekendDays) => WeekdayInfo[]`                       |
| `buildYearOptions`  | `(view, min, max, locale, formatters, span = 12) => CalendarSnapshot['years']` |
| `buildMonthOptions` | `(view, min, max, locale, formatters) => CalendarSnapshot['monthOptions']`     |

`BuildCalendarInput`: `{ viewMonth, numberOfMonths, locale, firstDayOfWeek, weekendDays, fixedWeeks,
showOutsideDays, showWeekNumbers, formatters, today, mode, value, previewRange, focusedDate,
hoveredDate, evaluate, dayMeta?, labels }`. Exactly one day across all built months gets
`tabIndex: 0`; if `focusedDate` is not among them, the first day of the first month gets it.

## Parsing

| Export                  | Signature                                                    | Notes                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parseDateString`       | `(text: string, options: ParseOptions) => PlainDate \| null` | ISO, locale-numeric (`"9/4/2026"` vs `"4/9/2026"`), `"Sep 4"`, `"4 September 2026"`, and natural language: `today`, `tomorrow`, `yesterday`, `next friday`, `in 3 days`, `+2w`, `-1m`. |
| `parseRangeString`      | `(text: string, options: ParseOptions) => DateRange \| null` | Splits on `-`, `–`, `to`, `until`, `→`; each half inherits the missing year/month from the other.                                                                                      |
| `localeDateOrder`       | `(locale: string) => DatePart[]`                             | e.g. `['month', 'day', 'year']`.                                                                                                                                                       |
| `localeDatePlaceholder` | `(locale: string) => string`                                 | e.g. `"MM/DD/YYYY"`.                                                                                                                                                                   |
| `formatForInput`        | `(date: PlainDate, locale: string) => string`                | The round-trippable text `parseDateString` reads back.                                                                                                                                 |
| `clearParseCaches`      | `() => void`                                                 | Drops the memoized per-locale layouts.                                                                                                                                                 |

`ParseOptions`: `{ locale, today, firstDayOfWeek, preferFuture? }` — `preferFuture` (default `true`)
resolves ambiguous input (a bare weekday, a missing year) forwards.

## Adapters

| Export                                      | Produces                                                                                                                                                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plainDateAdapter`                          | `PlainDate` (default)                                                                                                                                                                                                                                |
| `nativeDateAdapter`                         | `Date` at local midnight                                                                                                                                                                                                                             |
| `isoStringAdapter`                          | `"YYYY-MM-DD"`                                                                                                                                                                                                                                       |
| `timestampAdapter`                          | Epoch milliseconds at local midnight                                                                                                                                                                                                                 |
| `createAdapter<T>(def)`                     | Validates and freezes a custom `ValueAdapter<T>`. Throws when `toPlain`/`fromPlain` are not both functions.                                                                                                                                          |
| `createLibraryAdapter(name, parse, create)` | Duck-types Day.js / Luxon / Moment / `Temporal.PlainDate`. Reading tries your `parse`, then `{ year, month, day }` fields, then `toDate()` / `toJSDate()`, then `valueOf()`. An instance that reports itself invalid is rejected before any of that. |
| `toExternalValue(value, mode, adapter)`     | Projects a `SelectionValue`: `single` → `T \| null`, `multiple` → `T[]`, range-like → `{ start, end }`.                                                                                                                                              |

## Formatters and labels

`Formatters` — every entry is `(…) => string`:

| Key          | Signature                    | Default output                       |
| ------------ | ---------------------------- | ------------------------------------ |
| `monthYear`  | `(date, locale)`             | `"September 2026"`                   |
| `month`      | `(date, locale)`             | `"September"`                        |
| `year`       | `(date, locale)`             | `"2026"`                             |
| `day`        | `(date, locale)`             | `"4"`                                |
| `fieldDate`  | `(date, locale)`             | `"Sep 4"`                            |
| `ariaDay`    | `(date, locale)`             | `"Friday, September 4, 2026"`        |
| `duration`   | `(count, semantics, locale)` | `"21 nights"` (plural-rule aware)    |
| `summary`    | `(value, locale, semantics)` | `"Sep 4 – Sep 25, 2026 · 21 nights"` |
| `weekday`    | `(weekday, locale, width)`   | `"M"` / `"Mon"` / `"Monday"`         |
| `weekNumber` | `(isoWeek, locale)`          | `"36"`                               |
| `time`       | `(time, locale, use12Hours)` | `"2:30 PM"`                          |

`Labels` — strings unless noted:

`title` (`"Select dates"`), `startLabel` (`"Check-in"`), `endLabel` (`"Check-out"`), `singleLabel`
(`"Date"`), `multipleLabel` (`"Dates"`), `clear`, `apply`, `cancel`, `today`, `nextMonth`,
`previousMonth`, `nextYear`, `previousYear`, `chooseStart` / `chooseEnd` (`"Add date"`),
`selectDate`, `weekNumberHeader` (`"Wk"`), `monthSelectLabel`, `yearSelectLabel`, `presetsLabel`
(`"Quick options"`), `emptyValue` (`"Add date"`), `unavailableDate` (`"Not available"`), plus the
functions `announceSelected(summary)`, `announceCleared`, `announceMonth(label)`,
`minNightsError(n)`, `maxNightsError(n)`.

Helpers: `defaultFormatters`, `resolveFormatters(overrides?)`, `defaultLabels`,
`resolveLabels(overrides?)`, `runtimeLocale()`, `resolveLocale(locale)`,
`formatDate(date, locale, options)`, `localeFirstDayOfWeek(locale)`, `localeWeekendDays(locale)`,
`isRTL(locale)`, `localeUses12Hour(locale)`, `weekdayInfos(locale, firstDayOfWeek, weekendDays)`,
`isoWeekOf(date)`, `clearIntlCaches()`.

## Plain-date math

Every helper is pure, never mutates, and never touches `Date` for arithmetic.

| Group               | Exports                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Construct / convert | `plainDate(y, m, d)`, `isPlainDate`, `toPlainDate`, `toDate(date, time?)`, `toISODate`, `fromISODate`, `toEpochDay`, `fromEpochDay`, `today(timeZone?)`        |
| Compare             | `compareDates`, `isSameDay`, `isBefore`, `isAfter`, `isSameOrBefore`, `isSameOrAfter`, `isSameMonth`, `isSameYear`, `isBetween`, `minOf`, `maxOf`, `clampDate` |
| Arithmetic          | `addDays`, `subDays`, `addWeeks`, `addMonths`, `addYears`, `diffInDays`, `diffInMonths`                                                                        |
| Boundaries          | `startOfWeek`, `endOfWeek`, `startOfMonth`, `endOfMonth`, `startOfQuarter`, `endOfQuarter`, `startOfYear`, `endOfYear`                                         |
| Calendar facts      | `getWeekday`, `getQuarter`, `getDayOfYear`, `getISOWeek`, `getISOWeekYear`, `isLeapYear`, `daysInMonth`, `isWeekend`                                           |
| Ranges              | `normalizeRange`, `rangeLength(range, semantics)`, `rangeContains`, `rangesOverlap`, `eachDayOfInterval`                                                       |
| Time                | `plainTime(h, m?, s?)`, `toPlainTime`, `timeToMinutes`, `minutesToTime`, `compareTimes`, `clampTime`                                                           |

## Vanilla API

| Export                    | Signature                                                                         |
| ------------------------- | --------------------------------------------------------------------------------- |
| `createDatePicker`        | `(target: HTMLElement \| string, options?: VanillaOptions) => DatePickerInstance` |
| `attachDatePicker`        | `(input: HTMLInputElement, options?: VanillaOptions) => DatePickerInstance`       |
| `defineDatePickerElement` | `(tagName = 'nextgen-date-picker') => void`                                       |
| `createRenderer`          | `(doc: Document, config?: RenderConfig) => DatePickerRenderer`                    |
| `parseValueAttribute`     | `(text: string \| null, mode: SelectionMode) => ValueInput`                       |
| `dayKeyOf`                | `(target: Element \| null) => string \| null`                                     |
| `FOCUSABLE_SELECTOR`      | `string`                                                                          |

`VanillaOptions` = `EngineOptions` + the presentational flags + `formatValue`, `openOnFocus`
(default `true`), `closeOnComplete` (default `true`), `autoFocus` (default `true`), `offset`
(default `8`), `container` (default `document.body`).

`DatePickerInstance`: `{ engine, element, update, getValue, setValue, open, close, toggle, on,
destroy }`. Events: `change`, `complete`, `clear`, `monthchange`, `open`, `close`. Full details in
[vanilla.md](./vanilla.md).

## CSS classes and data attributes

Everything is prefixed `dpng-` and scoped under `.dpng`. This list is a public contract: React and
vanilla emit identical markup, and both are safe to target.

### Root

`.dpng` carries `dir` plus `data-mode`, `data-size` (`sm|md|lg`), `data-variant`
(`inline|popover|modal|sheet`), `data-theme`, `data-orientation` (`horizontal|vertical`),
`data-months` (a count) and `data-selecting` (`"true"` mid-pick). It is also the CSS-variable scope.

| Class                                                                                                      | Element                                                                    |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `dpng`                                                                                                     | Root                                                                       |
| `dpng-card`                                                                                                | The surface / card                                                         |
| `dpng-header`, `dpng-header__title`, `dpng-header__badge`                                                  | Title row and duration badge                                               |
| `dpng-fields`, `dpng-field`, `dpng-field__label`, `dpng-field__value`, `dpng-fields__divider`              | Check-in / check-out fields                                                |
| `dpng-nav`, `dpng-nav__button`, `dpng-nav__label`, `dpng-nav__selects`, `dpng-nav__select`                 | Month navigation                                                           |
| `dpng-months`, `dpng-month`, `dpng-month__caption`                                                         | Months wrapper                                                             |
| `dpng-weekdays`, `dpng-weekday`                                                                            | Weekday header row                                                         |
| `dpng-grid`, `dpng-week`, `dpng-weeknumber`                                                                | `role="grid"`, `role="row"`, `role="rowheader"`                            |
| `dpng-day`                                                                                                 | The day `<button>`                                                         |
| `dpng-day__number`, `dpng-day__note`, `dpng-day__dots`, `dpng-day__dot`, `dpng-day__badge`, `dpng-day__bg` | Cell internals (`__bg` is the absolutely positioned range band)            |
| `dpng-presets`, `dpng-preset`, `dpng-preset__hint`                                                         | Preset chip row                                                            |
| `dpng-footer`, `dpng-footer__info`, `dpng-footer__actions`                                                 | Footer                                                                     |
| `dpng-button`                                                                                              | Any action button                                                          |
| `dpng-time`, `dpng-time__field`, `dpng-time__select`                                                       | Time row                                                                   |
| `dpng-input`, `dpng-input__field`, `dpng-input__icon`                                                      | Text input                                                                 |
| `dpng-popover`, `dpng-backdrop`, `dpng-sheet`                                                              | Floating layers                                                            |
| `dpng-live`                                                                                                | Visually hidden `aria-live` region (`role="status"`, `aria-live="polite"`) |
| `dpng-tooltip`                                                                                             | Tooltip                                                                    |

### Modifiers

| Base               | Modifiers                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dpng-day`         | `--today` `--selected` `--range-start` `--range-end` `--in-range` `--preview` `--preview-start` `--preview-end` `--disabled` `--blocked` `--outside` `--weekend` `--holiday` `--hovered` `--focused` |
| `dpng-field`       | `--active` `--filled` `--invalid`                                                                                                                                                                    |
| `dpng-preset`      | `--active` `--disabled`                                                                                                                                                                              |
| `dpng-nav__button` | `--prev` `--next`                                                                                                                                                                                    |
| `dpng-button`      | `--primary` `--ghost` `--subtle` `--icon`                                                                                                                                                            |
| `dpng-weekday`     | `--weekend`                                                                                                                                                                                          |

### Data attributes

Every stateful class has a matching data attribute on the same element, so you can style with
either strategy — or with Tailwind's `data-[selected=true]:` variants.

| Element      | Attributes                                                                                                                                                                                                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Day          | `data-date` (ISO key), `data-today`, `data-selected`, `data-range-start`, `data-range-end`, `data-in-range`, `data-preview`, `data-preview-start`, `data-preview-end`, `data-disabled`, `data-blocked`, `data-outside`, `data-weekend`, `data-holiday`, `data-hovered`, `data-focused` |
| Field        | `data-field` (`start`/`end`), `data-active`, `data-filled`, `data-invalid`                                                                                                                                                                                                             |
| Preset       | `data-preset` (id), `data-active`, `data-disabled`                                                                                                                                                                                                                                     |
| Nav button   | `data-direction` (`previous`/`next`)                                                                                                                                                                                                                                                   |
| Grid         | `data-month` (month key)                                                                                                                                                                                                                                                               |
| Popover root | `data-placement` (`top`/`bottom`)                                                                                                                                                                                                                                                      |

Boolean flags are present-or-absent with the value `"true"`, so `[data-selected]` and
`[data-selected="true"]` both match.

The full token list is in [theming.md](./theming.md).

## Type index

Exported from every entry point that needs them:

`ActiveField`, `CalendarSnapshot`, `CalendarView`, `ChangeMeta`, `ChangeReason`,
`CompleteDateRange`, `ConstraintContext`, `DateConstraints`, `DateInput`, `DatePickerEngineApi`,
`DatePreset`, `DateRange`, `DateRangeInput`, `DayEvaluation`, `DayInfo`, `DayMeta`,
`DisabledReason`, `EngineOptions`, `FirstDayOfWeek`, `FocusStep`, `Formatters`, `KeyboardLike`,
`Labels`, `ModeValue`, `MonthInfo`, `PlainDate`, `PlainDateTime`, `PlainTime`, `PresetContext`,
`RangeSemantics`, `ResolvedPreset`, `SelectionMode`, `SelectionValue`, `TimeOptions`,
`ValueAdapter`, `ValueInput`, `WeekInfo`, `WeekdayInfo`.

Module-local types: `ResolvedConstraints`, `DurationPresetOptions`, `WindowPresetOptions`,
`UnitPresetOptions`, `PresetResult`, `SelectionRequest`, `SelectionResult`, `KeyboardIntent`,
`BuildCalendarInput`, `ParseOptions`, `DatePart` (core); `UseDatePickerOptions`,
`UseDatePickerReturn`, `DatePickerActions`, `DatePickerProps`, `DatePickerProviderProps` (React);
`VanillaOptions`, `DatePickerInstance`, `DatePickerChangeDetail`, `DatePickerEventName`,
`DatePickerElement`, `DatePickerRenderer`, `RenderConfig`, `PresentationOptions`, `PickerVariant`,
`PickerSize`, `PickerOrientation` (vanilla).
