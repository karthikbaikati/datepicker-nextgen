# Getting started

Install, pick one of the four usage levels, and wire up a value. Ten minutes, end to end.

- [Install](#install)
- [The four ways to use it](#the-four-ways-to-use-it)
- [Controlled vs uncontrolled](#controlled-vs-uncontrolled)
- [Value shapes and adapters](#value-shapes-and-adapters)
- [Common first questions](#common-first-questions)

## Install

```bash
npm i datepicker-nextgen
# pnpm add datepicker-nextgen · yarn add datepicker-nextgen · bun add datepicker-nextgen
```

React (17, 18 or 19) and `react-dom` are **optional** peer dependencies. If you only use
`datepicker-nextgen/core` or `datepicker-nextgen/vanilla`, you never install them.

### Entry points

| Import                            | Contents                                                                          | Needs React |
| --------------------------------- | --------------------------------------------------------------------------------- | ----------- |
| `datepicker-nextgen`              | React components, `useDatePicker`, `DatePickerProvider`, plus the core re-exports | yes         |
| `datepicker-nextgen/core`         | Engine, constraints, presets, calendar builder, parser, adapters, plain-date math | no          |
| `datepicker-nextgen/vanilla`      | `createDatePicker`, `attachDatePicker`, `defineDatePickerElement`, the renderer   | no          |
| `datepicker-nextgen/styles.css`   | The default stylesheet — required for the bundled look                            | no          |
| `datepicker-nextgen/themes/*.css` | `midnight`, `emerald`, `rose`, `mono`, `glass`, `high-contrast`                   | no          |

Both ESM and CJS builds ship, with `.d.ts` for every entry.

### The stylesheet

```js
import 'datepicker-nextgen/styles.css';
```

Import it once, anywhere in your app. It is entirely scoped under `.dpng` — no resets, no bare
element selectors, no `!important` — so it cannot touch the rest of your page. Skip it only if you
are building your own UI with the [headless hook](./headless.md).

## The four ways to use it

They are four points on one line, and you can move along it later without rewriting your data
layer: all four drive the same engine.

### 1. The all-in-one component

Everything wired, styled and accessible. Pass options, read values.

```tsx
import { DatePicker } from 'datepicker-nextgen';
import 'datepicker-nextgen/styles.css';

export function StayPicker() {
  return (
    <DatePicker
      mode="range"
      numberOfMonths={2}
      minNights={2}
      disablePast
      onComplete={(value) => console.log(value.range)}
    />
  );
}
```

`<DatePicker>` accepts every [`EngineOptions`](./api-reference.md#engineoptions) field plus the
presentational flags (`title`, `theme`, `size`, `variant`, `orientation`, `showHeader`,
`showPresets`, `showFooter`, …). It is also the provider for everything below it, so you can drop a
custom child in and it will read the same state.

### 2. Compound components

Same styling, your layout. `<DatePicker>` renders a default arrangement; when you pass `children`,
you arrange the parts yourself.

```tsx
import {
  DatePicker,
  DateFields,
  DurationBadge,
  CalendarNav,
  Calendar,
  PresetList,
  PickerFooter,
} from 'datepicker-nextgen';

<DatePicker mode="range" minNights={2}>
  <header className="flex items-center justify-between">
    <h2>Trip dates</h2>
    <DurationBadge />
  </header>
  <DateFields />
  <CalendarNav />
  <Calendar />
  <MyAvailabilityLegend /> {/* your own component, anywhere in the tree */}
  <PresetList />
  <PickerFooter />
</DatePicker>;
```

Any component of yours inside the tree can call `useDatePickerContext()` to reach the same snapshot
and actions. To keep the picker's state in a parent instead, create it yourself and adopt it:

```tsx
import { DatePickerProvider, Calendar, useDatePicker } from 'datepicker-nextgen';

function Booking() {
  const picker = useDatePicker({ mode: 'range', minNights: 2 });
  const nights = picker.snapshot.duration;

  return (
    <DatePickerProvider picker={picker}>
      <Calendar />
      <p>
        {nights} nights · {picker.snapshot.summary}
      </p>
    </DatePickerProvider>
  );
}
```

### 3. The headless hook

No stylesheet, no components — just state, ARIA and event wiring, handed to you as prop getters.

```tsx
import { useDatePicker } from 'datepicker-nextgen';

function MiniCalendar() {
  const picker = useDatePicker({ mode: 'single' });
  const month = picker.snapshot.months[0];
  if (!month) return null;

  return (
    <div {...picker.getRootProps()}>
      <button {...picker.getPreviousMonthProps()}>Prev</button>
      <strong>{month.label}</strong>
      <button {...picker.getNextMonthProps()}>Next</button>

      <div {...picker.getCalendarProps()}>
        <div {...picker.getGridProps(month)}>
          {month.weeks.map((week) => (
            <div key={week.key} role="row">
              {week.days.map((day) => (
                <button key={day.key} {...picker.getDayProps(day)}>
                  {day.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

Every getter accepts your own props and merges them intelligently: `className` concatenates,
`style` shallow-merges, `onX` handlers chain (yours first — call `preventDefault()` to opt out of
the built-in behaviour), everything else overrides. Full tour in [headless.md](./headless.md).

### 4. Vanilla / no framework

```js
import { createDatePicker } from 'datepicker-nextgen/vanilla';
import 'datepicker-nextgen/styles.css';

const picker = createDatePicker('#calendar', { mode: 'range', numberOfMonths: 2 });
const off = picker.on('complete', ({ selection }) => submit(selection.range));
// later: off(); picker.destroy();
```

Attach a popover to an existing input instead:

```js
import { attachDatePicker } from 'datepicker-nextgen/vanilla';

attachDatePicker(document.querySelector('#checkin'), { mode: 'range', minNights: 2 });
```

Or register the custom element and write markup only:

```html
<script type="module">
  import { defineDatePickerElement } from 'datepicker-nextgen/vanilla';
  defineDatePickerElement();
</script>

<nextgen-date-picker mode="range" months="2" min-nights="2" disable-past></nextgen-date-picker>
```

See [vanilla.md](./vanilla.md) for the instance API, the event payloads and the attribute table.

## Controlled vs uncontrolled

### Uncontrolled (default)

Give `defaultValue` — or nothing — and the engine owns the selection.

```tsx
<DatePicker mode="single" defaultValue="2026-09-04" onChange={(v) => save(v.dates[0])} />
```

### Controlled

Give `value` and the engine **never mutates its own selection**; it only reports what the user
tried to do. You must feed the new value back.

```tsx
const [range, setRange] = useState<DateRangeInput>({ start: null, end: null });

<DatePicker
  mode="range"
  value={range}
  onChange={(value) => setRange({ start: value.range.start, end: value.range.end })}
/>;
```

`month` / `defaultMonth` work the same way for the visible month:

```tsx
const [month, setMonth] = useState('2026-09-01');
<DatePicker month={month} onMonthChange={(m) => setMonth(`${m.year}-${m.month}-01`)} />;
```

> **Note.** `onChange` always receives the internal, timezone-free `SelectionValue` — not the
> adapter shape. Constraints run _before_ `onChange`, so a value you receive is always one the
> engine considered valid. Rejected clicks go to `onInvalidSelection` instead.

### `onChange` vs `onComplete`

`onChange` fires on every accepted mutation, including a half-picked range. `onComplete` fires only
when the selection is _complete_ — both ends of a range, at least one date in `single`, at least
`minSelections` in `multiple`. For search-on-select flows, use `onComplete`.

```tsx
<DatePicker
  mode="range"
  onChange={(value, meta) => console.log(meta.reason, meta.duration)}
  onComplete={(value) => search(value.range)}
/>
```

`meta.reason` is one of `select`, `deselect`, `range-start`, `range-end`, `preset`, `clear`,
`input`, `controlled`, `time`, `constraint-clamp`.

## Value shapes and adapters

### The internal shape

Every mode uses one `SelectionValue`:

```ts
interface SelectionValue {
  readonly dates: readonly PlainDate[]; // single, multiple
  readonly range: { start: PlainDate | null; end: PlainDate | null }; // range, week, month, quarter, year
  readonly times?: { start: PlainTime | null; end: PlainTime | null };
}
```

A `PlainDate` is `{ year, month, day }` with a **1-based month** (September is `9`, not `8`). It is
a wall-calendar date: no hour, no timezone, no DST — which is precisely why nothing here ever
shifts a day.

### What you can pass in

`defaultValue` / `value` accept anything in `ValueInput`, and every field that takes a date
(`minDate`, `maxDate`, `today`, `month`, entries in `disabledDates`, …) accepts `DateInput`:

```ts
'2026-09-04'                              // ISO string (also parsed leniently)
new Date(2026, 8, 4)                      // native Date (local calendar fields)
1757030400000                             // epoch milliseconds
{ year: 2026, month: 9, day: 4 }          // PlainDate
{ start: '2026-09-04', end: '2026-09-25' }// range
['2026-09-04', '2026-09-11']              // multiple
```

### Getting values back out

Three routes, pick one:

| You want                          | Do this                                              |
| --------------------------------- | ---------------------------------------------------- |
| The raw `PlainDate` selection     | Read `value.dates` / `value.range` in `onChange`     |
| `Date`, ISO strings or timestamps | Set `valueAdapter` and call `engine.getValue()`      |
| A one-off conversion              | `toExternalValue(value, mode, adapter)` from `/core` |

```tsx
import { isoStringAdapter, toExternalValue } from 'datepicker-nextgen/core';

<DatePicker
  mode="range"
  valueAdapter={isoStringAdapter}
  onChange={(value) => {
    // value.range.start is a PlainDate…
    const iso = toExternalValue(value, 'range', isoStringAdapter);
    // …and iso is { start: '2026-09-04', end: '2026-09-25' }
    setForm(iso);
  }}
/>;
```

Built-in adapters: `plainDateAdapter` (default), `nativeDateAdapter`, `isoStringAdapter`,
`timestampAdapter`. For Day.js, Luxon, Moment or Temporal, use `createLibraryAdapter`:

```ts
import dayjs from 'dayjs';
import { createLibraryAdapter } from 'datepicker-nextgen/core';

export const dayjsAdapter = createLibraryAdapter(
  'dayjs',
  (value) => (dayjs.isDayjs(value) ? value.toDate() : null),
  (date) => dayjs(`${date.year}-${date.month}-${date.day}`, 'YYYY-M-D'),
);
```

The projection is mode-aware: `single` → `T | null`, `multiple` → `T[]`, every range-like mode →
`{ start: T | null; end: T | null }`.

### Manual conversion helpers

```ts
import { toISODate, fromISODate, toDate, toPlainDate } from 'datepicker-nextgen/core';

toISODate({ year: 2026, month: 9, day: 4 }); // '2026-09-04'
fromISODate('2026-09-04'); // { year: 2026, month: 9, day: 4 }
toDate({ year: 2026, month: 9, day: 4 }); // Date at local midnight
toPlainDate(new Date()); // PlainDate from a Date's local fields
```

## Common first questions

**Nothing is styled.** Import `datepicker-nextgen/styles.css`, or build your own UI with the
headless hook — there is no injected CSS.

**Why is the month `9` for September?** `PlainDate.month` is 1-based, unlike `Date.getMonth()`.
This is the single most common porting bug; see [migration.md](./migration.md).

**My week starts on the wrong day.** `firstDayOfWeek` defaults to `'locale'`. Pin it with
`firstDayOfWeek={1}` (Monday) if you need it fixed regardless of the visitor's locale.

**Tests are flaky around midnight / in CI.** Freeze today: `today="2026-09-04"`. Every date the
engine derives — presets, `disablePast`, the initial month — flows from that one option.

**SSR renders a different month than the client.** The default "today" comes from the runtime
timezone, which differs between your server and your visitor. Pass an explicit `timeZone` (an IANA
name) or an explicit `today` to make both sides agree.

**Does it work in React Server Components?** The hook and the components are client components —
add `'use client'` to the file that imports them. The `core` entry is safe to import anywhere.

---

Next: **[API reference](./api-reference.md)** for every option, or **[Recipes](./recipes.md)** for
worked product examples.
