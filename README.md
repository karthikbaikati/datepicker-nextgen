<h1 align="center">datepicker-nextgen</h1>

<p align="center">
  A headless-first, timezone-safe, fully accessible date picker for React and vanilla JS — with a production-grade default look.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/datepicker-nextgen"><img alt="npm version" src="https://img.shields.io/npm/v/datepicker-nextgen?color=2563eb&label=npm"></a>
  <a href="https://bundlephobia.com/package/datepicker-nextgen"><img alt="minzipped size" src="https://img.shields.io/bundlephobia/minzip/datepicker-nextgen?label=core%20gzip"></a>
  <a href="https://github.com/karthikbaikati/datepicker-nextgen/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/karthikbaikati/datepicker-nextgen/actions/workflows/ci.yml/badge.svg"></a>
  <a href="./LICENSE"><img alt="MIT license" src="https://img.shields.io/npm/l/datepicker-nextgen?color=success"></a>
  <img alt="TypeScript strict" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white">
  <img alt="zero dependencies" src="https://img.shields.io/badge/dependencies-0-success">
</p>

<p align="center">
  <a href="https://karthikbaikati.github.io/datepicker-nextgen/"><strong>Live demo →</strong></a>
  ·
  <a href="./docs/getting-started.md">Getting started</a>
  ·
  <a href="./docs/api-reference.md">API reference</a>
  ·
  <a href="./docs/recipes.md">Recipes</a>
</p>

---

## Why another date picker

**1. A timezone-safe core.** The engine never constructs a `Date` to do arithmetic. Everything is a
`PlainDate` — `{ year, month, day }`, no hour, no offset, no DST. That deletes the entire class of
"the booking shifted a day for users in Auckland" bugs. `Date`, ISO strings, timestamps, Day.js,
Luxon and Temporal are all supported, but only at the boundary, through
[adapters](./docs/api-reference.md#adapters).

**2. A headless engine with prop getters.** All the state, constraint math, ARIA wiring and
keyboard handling lives in a framework-free store. `useDatePicker()` hands you a snapshot and a set
of prop getters; spread them onto whatever markup you want and you get the full grid pattern for
free. Use the styled components, replace one of them, or render nothing that ships with the
library — the behaviour is identical.

**3. One library for React _and_ vanilla.** The vanilla renderer emits the same DOM and the same
class names as the React components, so one stylesheet serves both. There is also a
`<nextgen-date-picker>` custom element for pages with no build step at all.

Everything else follows from that: seven selection modes, per-night blocked ranges, minimum-stay
rules, presets, per-day price/dot/badge decoration, six themes, RTL, and a `dpng-` class contract
that is a documented public API rather than an implementation detail.

## Install

```bash
npm i datepicker-nextgen
```

React 17+ is an _optional_ peer dependency — the `core` and `vanilla` entry points do not need it.

```jsx
import { DatePicker } from 'datepicker-nextgen'; // React
import { createDatePicker } from 'datepicker-nextgen/core'; // headless engine
import { createDatePicker } from 'datepicker-nextgen/vanilla'; // DOM renderer
import 'datepicker-nextgen/styles.css';
```

No build step? Load the vanilla build from a CDN:

```html
<link rel="stylesheet" href="https://esm.sh/datepicker-nextgen/styles.css" />

<input id="dates" placeholder="Add dates" />

<script type="module">
  import { attachDatePicker } from 'https://esm.sh/datepicker-nextgen/vanilla';

  attachDatePicker(document.querySelector('#dates'), {
    mode: 'range',
    numberOfMonths: 2,
    minNights: 2,
    disablePast: true,
  });
</script>
```

## 30 seconds

The flagship booking card: a two-night minimum, a handful of already-booked nights, and the
duration badge that reads `21 nights`.

```tsx
import { useState } from 'react';
import { DatePicker } from 'datepicker-nextgen';
import { bookingPresets } from 'datepicker-nextgen/core';
import type { SelectionValue } from 'datepicker-nextgen';
import 'datepicker-nextgen/styles.css';

export function TripDates() {
  const [stay, setStay] = useState<SelectionValue | null>(null);

  return (
    <DatePicker
      mode="range"
      title="Trip dates"
      minNights={2}
      maxNights={30}
      disablePast
      blockedRanges={[
        { start: '2026-09-11', end: '2026-09-14' },
        { start: '2026-09-28', end: '2026-10-02' },
      ]}
      presets={bookingPresets}
      onChange={(value) => setStay(value)}
      onComplete={(value) => console.log(value.range)}
    />
  );
}
```

`value.range` is `{ start: PlainDate | null, end: PlainDate | null }`. Want `Date` objects or ISO
strings instead? Pass `valueAdapter={nativeDateAdapter}` (or `isoStringAdapter`) and read
`engine.getValue()`.

## What is actually in the box

### Selection modes

| Mode       | Click behaviour                    | Value lives in   |
| ---------- | ---------------------------------- | ---------------- |
| `single`   | one date                           | `value.dates[0]` |
| `range`    | start, then end                    | `value.range`    |
| `multiple` | toggles individual dates           | `value.dates`    |
| `week`     | selects the whole display week     | `value.range`    |
| `month`    | selects the whole calendar month   | `value.range`    |
| `quarter`  | selects the whole calendar quarter | `value.range`    |
| `year`     | selects the whole calendar year    | `value.range`    |

Plus `rangeSemantics: 'nights' | 'days'` (Sep 4 → Sep 25 is _21 nights_ or _22 days_),
reverse-range repair, toggle-on-reselect, auto-advance from start to end, and `resetOnComplete`.

### Constraints

`minDate` · `maxDate` · `disabledDates` (list, ranges, or predicate) · `enabledDates` (allowlist) ·
`disabledDaysOfWeek` · `blockedRanges` · `disablePast` · `disableFuture` · `disableWeekends` ·
`minNights` / `maxNights` · `minSelections` / `maxSelections` · `rollingSelection` ·
`preventCrossingBlocked` · `isDateUnavailable(date, ctx)` for anything else.

Every rejection carries a typed `DisabledReason` (`min-nights`, `crosses-blocked`,
`not-in-allowlist`, …) that reaches the cell, the tooltip, the screen reader and
`onInvalidSelection` — so you can raise a toast that says _why_.

### i18n

`Intl`-driven month, weekday, duration and summary formatting · locale-derived first day of week
and weekend days · automatic RTL (`dir` is set for you) · ISO-8601 week numbers · every user-visible
string overridable via `labels` · every formatter overridable via `formatters` · locale-aware
free-text parsing (`"9/4/2026"` vs `"4/9/2026"`, `"Sep 4"`, `"next friday"`, `"+2w"`).

### Accessibility

WAI-ARIA grid pattern (`role="grid"` / `row` / `gridcell` / `rowheader`) · roving tabindex, exactly
one `tabIndex: 0` cell per calendar · unavailable days stay focusable with `aria-disabled` rather
than `disabled` · full keyboard map including `Ctrl+Home/End` and `Shift+PageUp/Down` ·
`aria-live="polite"` announcements on selection, clear and month change · focus trap and focus
return for the popover, modal and sheet variants · `prefers-reduced-motion` respected ·
a `high-contrast` theme that clears WCAG AAA. See [docs/accessibility.md](./docs/accessibility.md).

### Theming

~30 `--dpng-*` design tokens · six bundled themes (`midnight`, `emerald`, `rose`, `mono`, `glass`,
`high-contrast`) · automatic dark mode via `prefers-color-scheme`, overridable with
`data-theme="light" | "dark"` · three sizes · four variants (`inline`, `popover`, `modal`, `sheet`) ·
every stateful class mirrored as a `data-*` attribute so Tailwind's `data-[selected=true]:` variants
work out of the box · `dayMeta` for per-day prices, dots, badges and tooltips.

### Integration

React 17 / 18 / 19 (`useSyncExternalStore`, SSR-safe, StrictMode-safe) · vanilla `createDatePicker`
and `attachDatePicker` · `<nextgen-date-picker>` custom element · a framework-agnostic engine with
`subscribe()` / `getSnapshot()` for Vue, Svelte and Solid · ESM + CJS · full `.d.ts` ·
zero runtime dependencies.

## Recipes

<details open>
<summary><strong>Booking range: minimum stay, maximum stay, blocked nights</strong></summary>

```tsx
<DatePicker
  mode="range"
  numberOfMonths={2}
  minNights={2}
  maxNights={28}
  disablePast
  preventCrossingBlocked
  blockedRanges={[{ start: '2026-09-11', end: '2026-09-14' }]}
  onInvalidSelection={(date, evaluation) => toast(evaluation.message ?? 'Not available')}
/>
```

`preventCrossingBlocked` (on by default) means a guest cannot select Sep 10 → Sep 16 _over_ an
occupied night; the hover preview stops dead at Sep 10.
</details>

<details>
<summary><strong>Analytics preset sidebar</strong></summary>

```tsx
import { DatePicker } from 'datepicker-nextgen';
import { analyticsPresets } from 'datepicker-nextgen/core';

<DatePicker
  mode="range"
  rangeSemantics="days"
  presets={analyticsPresets}
  orientation="vertical"
  disableFuture
  onComplete={(value) => refetch(value.range)}
/>;
```

`analyticsPresets` is Today · Yesterday · Last 7 / 30 / 90 days · This month · Last month ·
This quarter · Year to date.
</details>

<details>
<summary><strong>Multiple dates, capped at five</strong></summary>

```tsx
<DatePicker
  mode="multiple"
  maxSelections={5}
  rollingSelection // a 6th pick evicts the oldest instead of being rejected
  onChange={(value) => setDates(value.dates)}
/>
```

</details>

<details>
<summary><strong>Week picker with ISO week numbers</strong></summary>

```tsx
<DatePicker
  mode="week"
  showWeekNumbers
  firstDayOfWeek={1}
  onComplete={(value) => setReportingWeek(value.range)}
/>
```

Any click selects that entire display week as a range.
</details>

<details>
<summary><strong>Date + time</strong></summary>

```tsx
<DatePicker
  mode="single"
  time={{
    enabled: true,
    minuteStep: 15,
    minTime: { hour: 9, minute: 0, second: 0 },
    maxTime: { hour: 18, minute: 0, second: 0 },
    defaultStartTime: { hour: 10, minute: 0, second: 0 },
  }}
  onChange={(value) => setSlot({ date: value.dates[0], time: value.times?.start })}
/>
```

</details>

<details>
<summary><strong>Controlled, with react-hook-form</strong></summary>

```tsx
import { Controller, useForm } from 'react-hook-form';
import { DatePicker } from 'datepicker-nextgen';
import { isoStringAdapter, toExternalValue } from 'datepicker-nextgen/core';

const { control, handleSubmit } = useForm({ defaultValues: { stay: { start: null, end: null } } });

<Controller
  name="stay"
  control={control}
  render={({ field }) => (
    <DatePicker
      mode="range"
      value={field.value}
      valueAdapter={isoStringAdapter}
      onChange={(value) => field.onChange(toExternalValue(value, 'range', isoStringAdapter))}
    />
  )}
/>;
```

`field.value` is `{ start: '2026-09-04', end: '2026-09-25' }` — exactly what you want to POST.
</details>

<details>
<summary><strong>A completely custom UI with the headless hook</strong></summary>

```tsx
import { useDatePicker } from 'datepicker-nextgen';

function TinyCalendar() {
  const {
    snapshot,
    getRootProps,
    getCalendarProps,
    getGridProps,
    getDayProps,
    getPreviousMonthProps,
    getNextMonthProps,
  } = useDatePicker({ mode: 'range' });
  const month = snapshot.months[0];
  if (!month) return null;

  return (
    <div {...getRootProps({ className: 'my-card' })}>
      <header>
        <button {...getPreviousMonthProps()}>‹</button>
        <h2>{month.label}</h2>
        <button {...getNextMonthProps()}>›</button>
      </header>

      <div {...getCalendarProps()}>
        <div {...getGridProps(month)}>
          {month.weeks.map((week) => (
            <div key={week.key} role="row">
              {week.days.map((day) => (
                <button key={day.key} {...getDayProps(day)}>
                  {day.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <p aria-live="polite">{snapshot.summary}</p>
    </div>
  );
}
```

No stylesheet needed; the prop getters carry the classes _and_ the `data-*` attributes, so Tailwind
alone can style it. Full walkthrough in [docs/headless.md](./docs/headless.md).
</details>

<details>
<summary><strong>Vanilla, in a plain HTML page</strong></summary>

```html
<div id="calendar"></div>

<script type="module">
  import { createDatePicker, normalizePresets } from 'https://esm.sh/datepicker-nextgen/vanilla';

  const picker = createDatePicker('#calendar', {
    mode: 'range',
    numberOfMonths: 2,
    presets: normalizePresets(['this-weekend', '1-week']),
    theme: 'midnight',
  });

  picker.on('complete', ({ selection }) => {
    console.log(selection.range.start, selection.range.end);
  });
</script>
```

Or skip JavaScript entirely with the custom element — see [docs/vanilla.md](./docs/vanilla.md).
</details>

More in **[docs/recipes.md](./docs/recipes.md)**: hotel prices in the cells, flexible-date strips,
API-driven availability, fiscal quarters, birthday pickers, appointment slots, responsive
multi-month layouts, Arabic RTL, Next.js App Router, and Testing Library.

## Documentation

| Guide                                        | What it covers                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| [Getting started](./docs/getting-started.md) | Install, the four ways to use it, controlled vs uncontrolled, value shapes  |
| [API reference](./docs/api-reference.md)     | Every exported symbol, every option, every snapshot field, the CSS contract |
| [Recipes](./docs/recipes.md)                 | 16 worked, copy-pasteable product examples                                  |
| [Theming](./docs/theming.md)                 | Tokens, the six themes, dark mode, Tailwind, `dayMeta`                      |
| [Accessibility](./docs/accessibility.md)     | Keyboard map, ARIA, announcements, focus, how to test it                    |
| [Headless](./docs/headless.md)               | Prop getters, and the engine in Vue / Svelte / Solid                        |
| [Vanilla](./docs/vanilla.md)                 | `createDatePicker`, `attachDatePicker`, the custom element, CDN             |
| [Migration](./docs/migration.md)             | From react-datepicker, react-day-picker, @mui/x-date-pickers                |

## Bundle size

| Entry                           | What you get                                                             |
| ------------------------------- | ------------------------------------------------------------------------ |
| `datepicker-nextgen/core`       | Engine, constraints, presets, calendar builder, parser, adapters — no UI |
| `datepicker-nextgen`            | The core plus the React components and hooks                             |
| `datepicker-nextgen/vanilla`    | The core plus the DOM renderer and the custom element                    |
| `datepicker-nextgen/styles.css` | The whole stylesheet, all variants and both colour schemes               |

Measured by bundling the published package with esbuild (minified, React external):

| You import                                           | gzip    |
| ---------------------------------------------------- | ------- |
| `createDatePicker` from `datepicker-nextgen/core`    | 19.0 kB |
| everything from `datepicker-nextgen/core`            | 21.4 kB |
| `createDatePicker` from `datepicker-nextgen/vanilla` | 26.9 kB |
| `DatePicker` from `datepicker-nextgen`               | 28.4 kB |
| `styles.css`                                         | 11.1 kB |

Two honest caveats about those numbers:

- **The engine really does depend on the parser and the preset resolver**, because `parseInput()`
  and `applyPreset()` are part of its API. They are not dead code and tree-shaking will not remove
  them — that is the whole difference between the first two rows.
- **Importing only `useDatePicker` costs the same as importing `DatePicker`.** The React entry point
  is a single code-split chunk, so pulling in the headless hook still carries the components. If you
  are building a fully custom UI and want none of them, import from `datepicker-nextgen/core` and
  drive the engine with `useSyncExternalStore` yourself — see [docs/headless.md](./docs/headless.md).

Run `npm run size` in a clone for the per-file figures from your own build.

## Browser support

Evergreen Chrome, Edge, Firefox and Safari, plus iOS Safari 14+ and Android Chrome. The build
targets ES2020. `Intl.DateTimeFormat`, `Intl.PluralRules` and `Intl.NumberFormat` are required;
optional extras (`Intl.ListFormat`, `Intl.Locale#getWeekInfo`) are feature-detected and degrade
silently. Node 18+ for SSR. No polyfills are shipped or needed.

## Contributing

Issues and PRs are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) for dev setup, the
architecture tour and the commit conventions, and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
Security reports go to the process in [SECURITY.md](./SECURITY.md).

## License

[MIT](./LICENSE) © 2026 Karthik Baikati, DKGSL

Built by **Karthik Baikati** · **DKGSL**
