# Migration

Honest, side-by-side notes for moving from the three most common React date pickers. Each section
has a prop map, a before/after, and the things that will actually bite you.

- [The one change that applies to everyone](#the-one-change-that-applies-to-everyone)
- [From react-datepicker](#from-react-datepicker)
- [From react-day-picker](#from-react-day-picker)
- [From @mui/x-date-pickers](#from-muix-date-pickers)
- [Migrating incrementally](#migrating-incrementally)

## The one change that applies to everyone

**Values are `PlainDate`, and `month` is 1-based.**

```ts
// Everywhere else
new Date(2026, 8, 4)                  // September — 0-based month
// Here
{ year: 2026, month: 9, day: 4 }      // September — 1-based month
```

This is the source of essentially every porting bug. If your app speaks `Date`, keep speaking
`Date`: set an adapter and read values through `engine.getValue()`.

```tsx
import { nativeDateAdapter, toExternalValue } from 'datepicker-nextgen/core';

<DatePicker
  mode="single"
  valueAdapter={nativeDateAdapter}
  defaultValue={someExistingDate} // Date accepted as input anywhere
  onChange={(value) => {
    const date = toExternalValue(value, 'single', nativeDateAdapter) as Date | null;
    setDate(date); // your existing Date-based state, untouched
  }}
/>;
```

Every date-shaped option (`minDate`, `maxDate`, `defaultValue`, `today`, `month`, entries in
`disabledDates`…) already accepts `Date`, ISO strings, timestamps and `PlainDate`, so only the
_outputs_ need the adapter.

The second cross-cutting change: **`onChange` fires for a half-picked range too.** If you had
`onChange={([start, end]) => search(start, end)}`, move that to `onComplete`.

## From react-datepicker

### Prop map

| react-datepicker                    | datepicker-nextgen                                                    | Notes                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `selected`                          | `value` / `defaultValue`                                              | `value` is controlled, `defaultValue` is not                                                                         |
| `onChange`                          | `onChange`                                                            | Receives `(SelectionValue, ChangeMeta)`, not a `Date`                                                                |
| `selectsRange`                      | `mode="range"`                                                        |                                                                                                                      |
| `startDate` / `endDate`             | `value={{ start, end }}`                                              | One value, not two props                                                                                             |
| `selectsMultiple` / `selectedDates` | `mode="multiple"`                                                     | Value in `value.dates`                                                                                               |
| `showWeekPicker`                    | `mode="week"`                                                         |                                                                                                                      |
| `showMonthYearPicker`               | `mode="month"`                                                        |                                                                                                                      |
| `showQuarterYearPicker`             | `mode="quarter"`                                                      |                                                                                                                      |
| `showYearPicker`                    | `mode="year"`                                                         |                                                                                                                      |
| `minDate` / `maxDate`               | `minDate` / `maxDate`                                                 | Same                                                                                                                 |
| `excludeDates`                      | `disabledDates`                                                       | Also accepts ranges and a predicate                                                                                  |
| `excludeDateIntervals`              | `blockedRanges`                                                       | `{ start, end }` pairs                                                                                               |
| `includeDates`                      | `enabledDates`                                                        | Allowlist                                                                                                            |
| `includeDateIntervals`              | `enabledDates`                                                        | Pass `{ start, end }` pairs                                                                                          |
| `filterDate`                        | `disabledDates` (predicate)                                           | Note the **inverted sense**: `filterDate` returns `true` for _allowed_, `disabledDates` returns `true` for _blocked_ |
| `monthsShown`                       | `numberOfMonths`                                                      |                                                                                                                      |
| `showWeekNumbers`                   | `showWeekNumbers`                                                     | Same                                                                                                                 |
| `calendarStartDay`                  | `firstDayOfWeek`                                                      | Or `'locale'`                                                                                                        |
| `locale`                            | `locale`                                                              | A BCP-47 string; **no `registerLocale` and no date-fns locale objects**                                              |
| `dateFormat`                        | `formatters`                                                          | Functions, not format strings — see below                                                                            |
| `placeholderText`                   | `labels.emptyValue`                                                   |                                                                                                                      |
| `inline`                            | `variant="inline"` (default)                                          |                                                                                                                      |
| `open` / `onClickOutside`           | `variant="popover"` + `instance.open()` / `close()`                   | React: the `Popover` component manages it                                                                            |
| `showTimeSelect`                    | `time={{ enabled: true }}`                                            |                                                                                                                      |
| `timeIntervals`                     | `time.minuteStep`                                                     |                                                                                                                      |
| `minTime` / `maxTime`               | `time.minTime` / `time.maxTime`                                       | `PlainTime`, not `Date`                                                                                              |
| `highlightDates`                    | `dayMeta`                                                             | Return `{ className }` or `{ dots }`                                                                                 |
| `dayClassName`                      | `dayMeta` → `className`                                               |                                                                                                                      |
| `renderDayContents`                 | `dayMeta` → `note` / `badge`, or the headless hook                    |                                                                                                                      |
| `renderCustomHeader`                | Compound components, or `getPreviousMonthProps` / `getNextMonthProps` |                                                                                                                      |
| `todayButton`                       | `showFooter` + `showTodayButton`, or `actions.goToToday()`            |                                                                                                                      |
| `fixedHeight`                       | `fixedWeeks`                                                          | Default `true` here                                                                                                  |
| `disabledKeyboardNavigation`        | —                                                                     | Not supported, and not planned: it breaks the ARIA grid pattern                                                      |
| `withPortal`                        | `variant="modal"`, or `container` in vanilla                          |                                                                                                                      |
| `shouldCloseOnSelect`               | `closeOnComplete` (vanilla)                                           |                                                                                                                      |
| `isClearable`                       | `showClear`                                                           | Default `true`                                                                                                       |

### Before / after

```tsx
// react-datepicker
<DatePicker
  selectsRange
  startDate={start}
  endDate={end}
  onChange={([s, e]) => {
    setStart(s);
    setEnd(e);
  }}
  minDate={new Date()}
  excludeDateIntervals={[{ start: booked.from, end: booked.to }]}
  monthsShown={2}
  filterDate={(d) => d.getDay() !== 0}
/>
```

```tsx
// datepicker-nextgen
<DatePicker
  mode="range"
  value={{ start, end }}
  valueAdapter={nativeDateAdapter}
  onComplete={(value) => {
    const r = toExternalValue(value, 'range', nativeDateAdapter) as {
      start: Date | null;
      end: Date | null;
    };
    setStart(r.start);
    setEnd(r.end);
  }}
  disablePast
  blockedRanges={[{ start: booked.from, end: booked.to }]}
  numberOfMonths={2}
  disabledDaysOfWeek={[0]}
/>
```

### What to watch for

- **`dateFormat` has no equivalent.** There are no format strings anywhere — formatting goes through
  `Intl` via `formatters`. `dateFormat="MMM d"` becomes:

  ```ts
  const formatters = {
    fieldDate: (date, locale) =>
      new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
        new Date(date.year, date.month - 1, date.day),
      ),
  }; // module scope — formatters are diffed by reference
  ```

  This is a real trade: you lose one-line format strings, and you gain correct output in 200
  locales without shipping a locale bundle.

- **`filterDate` is inverted.** `filterDate={(d) => isBusinessDay(d)}` becomes
  `disabledDates={(d) => !isBusinessDay(d)}`. Getting this backwards disables the whole calendar,
  which at least fails loudly.

- **No date-fns.** react-datepicker depends on date-fns and its locale objects; this library has
  zero dependencies and takes a locale _string_. Delete the `registerLocale` calls.

- **No `<input>` by default.** react-datepicker renders an input plus a popover. Here, the React
  `<DatePicker>` is an inline calendar unless you set `variant="popover"`; if you want an
  input-driven popover with no ceremony, `attachDatePicker` from `/vanilla` is often the shorter
  path even in a React app.

- **Keyboard navigation cannot be turned off** — see the table.

- **Ranges are "nights" by default.** Sep 4 → Sep 25 reports `duration: 21`. Set
  `rangeSemantics="days"` for the inclusive count of 22, which is what an analytics UI wants.

## From react-day-picker

The closest relative — same headless instincts, same `Date`-free ambitions — so the port is mostly
mechanical.

| react-day-picker                           | datepicker-nextgen                                                                               | Notes                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `mode="single" \| "multiple" \| "range"`   | `mode`                                                                                           | Plus `week`, `month`, `quarter`, `year`                                  |
| `selected` / `onSelect`                    | `value` / `onChange`                                                                             | `onChange` also gets `ChangeMeta`                                        |
| `defaultSelected`                          | `defaultValue`                                                                                   |                                                                          |
| `disabled` (Matcher)                       | `disabledDates`, `disabledDaysOfWeek`, `blockedRanges`, `minDate`/`maxDate`, `isDateUnavailable` | The `Matcher` union is split into named options — see below              |
| `hidden`                                   | —                                                                                                | Use `disabledDates`; there is no separate hidden concept                 |
| `numberOfMonths`                           | `numberOfMonths`                                                                                 | Same                                                                     |
| `month` / `defaultMonth` / `onMonthChange` | Same names                                                                                       |                                                                          |
| `startMonth` / `endMonth`                  | `minDate` / `maxDate` (+ `restrictNavigation`)                                                   |                                                                          |
| `showOutsideDays`                          | `showOutsideDays`                                                                                | Same                                                                     |
| `fixedWeeks`                               | `fixedWeeks`                                                                                     | Default `true` here                                                      |
| `showWeekNumber`                           | `showWeekNumbers`                                                                                | Note the plural                                                          |
| `weekStartsOn`                             | `firstDayOfWeek`                                                                                 |                                                                          |
| `ISOWeek`                                  | —                                                                                                | ISO week numbers are always ISO-8601; `firstDayOfWeek` controls the grid |
| `locale` (date-fns)                        | `locale` (BCP-47 string)                                                                         |                                                                          |
| `dir`                                      | —                                                                                                | Derived from the locale; `snapshot.direction`                            |
| `min` / `max` (multiple)                   | `minSelections` / `maxSelections`                                                                | Plus `rollingSelection`                                                  |
| `min` / `max` (range)                      | `minNights` / `maxNights`                                                                        | Counted per `rangeSemantics`                                             |
| `excludeDisabled`                          | `preventCrossingBlocked`                                                                         | Default `true` here                                                      |
| `modifiers`                                | `dayMeta`                                                                                        | Return `className`, `note`, `dots`, `badge`, `holiday`                   |
| `modifiersClassNames`                      | `dayMeta` → `className`                                                                          |                                                                          |
| `classNames`                               | The `dpng-*` CSS contract, or your own via prop getters                                          |                                                                          |
| `components`                               | Compound components, or the headless hook                                                        |                                                                          |
| `formatters`                               | `formatters`                                                                                     | Same idea, `Intl`-based signatures                                       |
| `labels`                                   | `labels`                                                                                         | Same idea                                                                |
| `footer`                                   | `showFooter` / `PickerFooter`, or children                                                       |                                                                          |
| `autoFocus`                                | —                                                                                                | The roving tabindex handles focus; the popover has `autoFocus`           |
| `useDayPicker()`                           | `useDatePickerContext()`                                                                         |                                                                          |

### Matchers → named options

react-day-picker's single `Matcher` union becomes explicit options. This is more verbose and much
faster: bounds, weekday masks and merged blocked spans are compiled into bitmasks and sorted arrays
once, instead of being re-tested per matcher per day.

```tsx
// react-day-picker
disabled={[
  { before: new Date() },
  { from: booked.start, to: booked.end },
  { dayOfWeek: [0, 6] },
  someDate,
  (date) => isHoliday(date),
]}
```

```tsx
// datepicker-nextgen
disablePast
blockedRanges={[{ start: booked.start, end: booked.end }]}
disabledDaysOfWeek={[0, 6]}
disabledDates={(date) => isSameDay(date, someDate) || isHoliday(date)}
```

The payoff is that each rule reports itself: a rejected click carries `reason: 'blocked-range'` vs
`'disabled-weekday'` vs `'before-min'`, which you can turn into a specific message.

### What to watch for

- **`selected` shapes differ.** rdp gives you `Date | Date[] | DateRange`. Here it is always one
  `SelectionValue` with `dates` and `range` — read `value.dates[0]` for single, `value.dates` for
  multiple, `value.range` for the range-like modes. Or set an adapter and use `engine.getValue()`,
  which projects exactly the rdp shapes.
- **`month` is 1-based.**
- **`components` is a different escape hatch.** rdp lets you swap internals; here you either compose
  the bundled components or render your own markup with prop getters. There is no per-internal
  override slot.
- **You get more for free**: `minNights`/`maxNights` with preview capping, presets, `duration` and
  `summary` on the snapshot, free-text parsing, and a vanilla build.

## From @mui/x-date-pickers

The biggest architectural jump: MUI wraps a date library behind a `LocalizationProvider` and styles
through the MUI theme. Here there is no date library and no theme provider.

| @mui/x-date-pickers                                 | datepicker-nextgen                                      | Notes                                                                          |
| --------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `<LocalizationProvider dateAdapter={AdapterDayjs}>` | `valueAdapter` on the picker                            | Per-picker, not app-wide. `createLibraryAdapter` wraps Day.js/Luxon/Moment     |
| `<DatePicker>`                                      | `<DatePicker mode="single" variant="popover">`          |                                                                                |
| `<DateRangePicker>` (Pro)                           | `<DatePicker mode="range">`                             | **Free and MIT.** No licence key, no Pro tier                                  |
| `<DateCalendar>`                                    | `<DatePicker variant="inline">`                         |                                                                                |
| `<StaticDatePicker>`                                | `variant="inline"`                                      |                                                                                |
| `<MobileDatePicker>`                                | `variant="sheet"`                                       |                                                                                |
| `<DesktopDatePicker>`                               | `variant="popover"`                                     |                                                                                |
| `<DateTimePicker>`                                  | `time={{ enabled: true }}`                              |                                                                                |
| `<MultiInputDateRangeField>`                        | `getInputProps('start')` / `getInputProps('end')`       |                                                                                |
| `value` / `onChange`                                | `value` / `onChange`                                    | `onChange(value, meta)`, not `(value, context)`                                |
| `minDate` / `maxDate`                               | Same                                                    |                                                                                |
| `disablePast` / `disableFuture`                     | Same                                                    |                                                                                |
| `shouldDisableDate`                                 | `disabledDates` (predicate) or `isDateUnavailable`      | The latter also gets a `ConstraintContext`                                     |
| `shouldDisableMonth` / `shouldDisableYear`          | `minDate` / `maxDate`, or `disabledDates`               |                                                                                |
| `slots` / `slotProps`                               | Compound components, or prop getters                    |                                                                                |
| `dayOfWeekFormatter`                                | `formatters.weekday`                                    |                                                                                |
| `format`                                            | `formatters`                                            | No format strings                                                              |
| `views` / `openTo`                                  | `setView('day' \| 'month' \| 'year')`, `showNavSelects` |                                                                                |
| `loading` / `renderLoading`                         | `enabledDates={[]}` + your own spinner                  | See [recipes #3](./recipes.md#3-availability-from-an-api-with-a-loading-state) |
| `showDaysOutsideCurrentMonth`                       | `showOutsideDays`                                       | Default `true` here                                                            |
| `fixedWeekNumber`                                   | `fixedWeeks`                                            | Boolean; always 6 rows                                                         |
| `displayWeekNumber`                                 | `showWeekNumbers`                                       |                                                                                |
| `timezone`                                          | `timeZone`                                              | Only affects what "today" is — values are timezone-free by construction        |
| `localeText`                                        | `labels`                                                |                                                                                |
| `sx` / theme overrides                              | `--dpng-*` tokens                                       | See [theming.md](./theming.md)                                                 |
| `disableHighlightToday`                             | Style `--dpng-today-color`                              |                                                                                |
| `referenceDate`                                     | `defaultMonth` (view) / `today` (the notion of today)   |                                                                                |
| `closeOnSelect`                                     | `closeOnComplete` (vanilla)                             |                                                                                |

### Before / after

```tsx
// @mui/x-date-pickers-pro
<LocalizationProvider dateAdapter={AdapterDayjs}>
  <DateRangePicker
    value={[start, end]}
    onChange={([s, e]) => setRange([s, e])}
    minDate={dayjs()}
    shouldDisableDate={(d) => blocked.has(d.format('YYYY-MM-DD'))}
    calendars={2}
  />
</LocalizationProvider>
```

```tsx
// datepicker-nextgen
import { createLibraryAdapter, toISODate } from 'datepicker-nextgen/core';

const dayjsAdapter = createLibraryAdapter(
  'dayjs',
  (v) => (dayjs.isDayjs(v) ? v.toDate() : null),
  (d) => dayjs(`${d.year}-${d.month}-${d.day}`, 'YYYY-M-D'),
);

<DatePicker
  mode="range"
  numberOfMonths={2}
  valueAdapter={dayjsAdapter}
  value={{ start, end }}
  disablePast
  disabledDates={(date) => blocked.has(toISODate(date))}
  onComplete={() => setRange(picker.engine.getValue())}
/>;
```

### What to watch for

- **No `LocalizationProvider`, and no date library.** If your app is built on Day.js or Luxon
  objects, keep them — that is what `createLibraryAdapter` is for. If it is not, drop the dependency
  entirely; the picker does not need one.
- **Range picking is free here.** `<DateRangePicker>` is part of MUI X **Pro** and requires a
  commercial licence. `mode="range"` (with min/max nights, blocked ranges and preview capping) is
  MIT.
- **Styling is CSS variables, not `sx`.** There is no emotion, no theme provider and no
  `styleOverrides`. Set `--dpng-accent` and friends, or build the UI yourself.
- **`onChange` fires mid-range.** MUI's range picker gives you `[start, null]` too, so this is
  familiar — but `onComplete` is the callback you actually want for search.
- **The value is not a Day.js object unless you ask.** Internally everything is `PlainDate`; the
  adapter only converts at the boundary. That is the point: a DST transition can never move a
  calendar date.
- **Bundle size.** You are dropping `@mui/x-date-pickers`, `@mui/material`, `@emotion/*` and a date
  library for one zero-dependency package. If the picker was the only reason those were installed,
  this is the largest single win in the migration.

## Migrating incrementally

You do not have to convert everything at once.

1. **Start at the edges.** Pick the least-critical picker in the app and port it. Keep your existing
   `Date`-based state and add `valueAdapter={nativeDateAdapter}` — nothing downstream changes.
2. **Move `onChange` logic to `onComplete`** wherever "the user finished choosing" is what you
   meant.
3. **Replace matcher/filter props one at a time**, checking the inverted sense on
   `filterDate` → `disabledDates`.
4. **Delete the date library last**, once no picker imports it. Run `npm ls date-fns dayjs luxon` to
   confirm nothing else needs it.
5. **Then look at what you can delete**: bespoke minimum-stay validation, hand-rolled blocked-range
   logic, custom keyboard handlers, `aria-*` patches. Those are the parts this library exists to
   replace.

Stuck on a prop that has no obvious mapping?
[Open a discussion](https://github.com/karthikbaikati/datepicker-nextgen/issues) with the before
snippet — migration gaps are treated as documentation bugs.
