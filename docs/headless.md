# Headless

The engine is a framework-free store: state, constraint math, calendar building, ARIA wiring and
keyboard handling, with no DOM and no dependencies. React gets a hook on top of it; every other
framework gets `subscribe()` / `getSnapshot()`.

- [`useDatePicker` in React](#usedatepicker-in-react)
- [Prop getters](#prop-getters)
- [A complete custom calendar](#a-complete-custom-calendar)
- [Composing with the bundled components](#composing-with-the-bundled-components)
- [The engine directly](#the-engine-directly)
- [Vue 3](#vue-3)
- [Svelte 5](#svelte-5)
- [Solid](#solid)
- [Rules the engine expects you to keep](#rules-the-engine-expects-you-to-keep)

## `useDatePicker` in React

```tsx
import { useDatePicker } from 'datepicker-nextgen';

const picker = useDatePicker({ mode: 'range', minNights: 2 });
```

You get four things:

|                      |                                                                          |
| -------------------- | ------------------------------------------------------------------------ |
| `picker.snapshot`    | Everything a renderer needs, as one immutable value. Read-only.          |
| `picker.actions`     | Pre-bound, referentially stable engine methods.                          |
| `picker.engine`      | The imperative surface, for the rare thing `actions` does not cover.     |
| `picker.get*Props()` | Prop getters — ARIA, classes, `data-*` and event wiring for one element. |

The hook creates exactly one engine for the component's lifetime, mirrors it into React with
`useSyncExternalStore`, and never touches `window` or `document` during render. It is SSR-safe and
StrictMode-safe out of the box.

Options are diffed key by key against the previous render, so a parent re-render with the same
props is a no-op. Callbacks (`onChange` and friends) are installed once as stable forwarders — an
inline `onChange={() => …}` never causes a resync.

## Prop getters

Each getter returns a props bag for one element and takes an optional bag of your own, merged like
this:

| Key             | Merge rule                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `className`     | Concatenated — the `dpng-*` classes stay                                                       |
| `style`         | Shallow-merged, yours winning                                                                  |
| `onX` handlers  | Chained, **yours first**. Call `preventDefault()` in yours to suppress the built-in behaviour. |
| everything else | Yours overrides                                                                                |

```tsx
<button
  {...getDayProps(day, {
    className: 'my-cell',
    onClick: (event) => {
      if (day.isBlocked) {
        event.preventDefault(); // the engine's onClick never runs
        showWhy(day.disabledReason);
      }
    },
  })}
/>
```

The eleven getters, and what each one is responsible for:

| Getter                           | Element                      | Carries                                                                                                                              |
| -------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `getRootProps(props?)`           | Your outermost element       | `className="dpng"`, `dir`, `data-mode`, `data-months`, `data-selecting`, the keyboard handler                                        |
| `getCalendarProps(props?)`       | Months wrapper               | `role="group"`, `aria-label`, `onMouseLeave` that drops the preview                                                                  |
| `getGridProps(month, props?)`    | One month                    | `role="grid"`, `aria-label`, `aria-multiselectable`, a stable `id`                                                                   |
| `getDayProps(day, props?)`       | Day button                   | Every state class and `data-*` flag, `role="gridcell"`, `tabIndex`, all four ARIA attributes, `onClick` / `onMouseEnter` / `onFocus` |
| `getPreviousMonthProps(props?)`  | Prev chevron                 | `aria-label`, `disabled` from `canGoPrevious`, `onClick`                                                                             |
| `getNextMonthProps(props?)`      | Next chevron                 | Mirror of the above                                                                                                                  |
| `getPresetProps(preset, props?)` | Preset chip                  | `aria-pressed`, `disabled`, `title` (resolved hint), `data-preset`, `onClick`                                                        |
| `getClearProps(props?)`          | Clear button                 | `disabled` from `canClear`, `onClick`                                                                                                |
| `getFieldProps(field, props?)`   | Check-in / check-out summary | `aria-pressed`, active / filled / invalid state, `onClick`                                                                           |
| `getInputProps(field, props?)`   | Text input                   | Controlled `value` with draft handling, locale placeholder, `aria-invalid`, `onChange` / `onBlur` / `onKeyDown`                      |

`getRootProps` is generic — it returns `T & Record<string, unknown>`, so your own props keep their
types through the call.

`getInputProps` is a small state machine of its own: what the user types is held as a _draft_ and
only committed on `Enter` or `blur`. A commit that fails to parse marks the input `aria-invalid` and
keeps the text; `Escape` reverts to the formatted value; any change to the selection from elsewhere
drops the draft. Key events are stopped inside the input so the calendar's `t`, arrows and
`Backspace` do not eat the typing.

## A complete custom calendar

No stylesheet, no bundled components, full keyboard and screen-reader support. This is the whole
thing.

```tsx
import { useDatePicker } from 'datepicker-nextgen';

export function CustomRangePicker() {
  const {
    snapshot,
    actions,
    getRootProps,
    getCalendarProps,
    getGridProps,
    getDayProps,
    getPreviousMonthProps,
    getNextMonthProps,
    getPresetProps,
    getClearProps,
    getFieldProps,
  } = useDatePicker({ mode: 'range', numberOfMonths: 2, minNights: 2, disablePast: true });

  return (
    <div {...getRootProps({ className: 'card' })}>
      <header className="card__head">
        <h2>{snapshot.labels.title}</h2>
        {!snapshot.isEmpty && <span className="badge">{snapshot.durationLabel}</span>}
      </header>

      <div className="fields">
        <button {...getFieldProps('start')}>
          <small>{snapshot.labels.startLabel}</small>
          <strong>{snapshot.startLabel}</strong>
        </button>
        <button {...getFieldProps('end')}>
          <small>{snapshot.labels.endLabel}</small>
          <strong>{snapshot.endLabel}</strong>
        </button>
      </div>

      <div {...getCalendarProps({ className: 'months' })}>
        {snapshot.months.map((month) => (
          <section key={month.key} className="month">
            <div className="month__head">
              {month.isFirstVisible && <button {...getPreviousMonthProps()}>‹</button>}
              <h3>{month.label}</h3>
              {month.isLastVisible && <button {...getNextMonthProps()}>›</button>}
            </div>

            <div {...getGridProps(month)}>
              <div role="row" className="weekdays">
                {month.weekdays.map((weekday) => (
                  <abbr key={weekday.weekday} title={weekday.long}>
                    {weekday.short}
                  </abbr>
                ))}
              </div>

              {month.weeks.map((week) => (
                <div key={week.key} role="row" className="week">
                  {week.days.map((day) => (
                    <button
                      key={day.key}
                      {...getDayProps(day, { className: day.inCurrentMonth ? '' : 'is-faded' })}
                    >
                      <span>{day.label}</span>
                      {day.meta?.note && <em>{day.meta.note}</em>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="chips">
        {snapshot.presets.map((preset) => (
          <button key={preset.id} {...getPresetProps(preset)}>
            {preset.label}
            {preset.resolvedHint && <small>{preset.resolvedHint}</small>}
          </button>
        ))}
        <button {...getClearProps()}>{snapshot.labels.clear}</button>
        <button type="button" onClick={() => actions.goToToday()}>
          {snapshot.labels.today}
        </button>
      </footer>

      <div className="sr-only" role="status" aria-live="polite">
        {snapshot.announcement}
      </div>
    </div>
  );
}
```

Two things worth noticing. `month.isFirstVisible` / `isLastVisible` is how you put one chevron on
each end of a multi-month strip. And the live region is yours to render — the hook computes the
text, but it does not inject DOM.

If you skip `styles.css` entirely, style from the `data-*` attributes; see the
[Tailwind section](./theming.md#tailwind).

## Composing with the bundled components

You do not have to choose between "all of it" and "none of it". Create the picker yourself, hand it
to a provider, and mix your markup with the bundled parts:

```tsx
import { DatePickerProvider, Calendar, PresetList, useDatePicker } from 'datepicker-nextgen';

function Sidebar() {
  const picker = useDatePicker({ mode: 'range', rangeSemantics: 'days' });
  const { duration, summary } = picker.snapshot;

  return (
    <DatePickerProvider picker={picker}>
      <MyBrandedHeader summary={summary} days={duration} />
      <PresetList />
      <Calendar />
      <MyApplyBar onApply={() => apply(picker.engine.getValue())} />
    </DatePickerProvider>
  );
}
```

Any component below the provider — yours included — can call `useDatePickerContext()` and get the
same `snapshot`, `actions` and getters. It throws with a readable message when there is no provider
above it, rather than handing back `null` that explodes three components later.

## The engine directly

```ts
import { createDatePicker } from 'datepicker-nextgen/core';

const engine = createDatePicker({
  mode: 'range',
  minNights: 2,
  today: '2026-09-04',
  onComplete: (value) => console.log(value.range),
});

const unsubscribe = engine.subscribe(() => render(engine.getSnapshot()));

engine.select('2026-09-08');
engine.hover('2026-09-12'); // drives the preview band
engine.select('2026-09-12');
engine.getValue(); // { start: PlainDate, end: PlainDate }

unsubscribe();
engine.destroy();
```

The contract, in four lines:

- `getSnapshot()` returns the **same reference** until state or options change. That is what makes
  `useSyncExternalStore` and every other store integration work without infinite loops.
- `subscribe(listener)` calls the listener synchronously after each mutation and returns an
  unsubscribe function.
- `setOptions(patch)` shallow-merges.
- `handleKeyDown(event)` takes anything shaped like `{ key, shiftKey?, ctrlKey?, metaKey?, altKey?,
preventDefault? }` and returns `true` when it handled the key.

Everything is deterministic given `today`, so you can drive the whole thing from a test with no DOM
at all.

## Vue 3

```vue
<script setup lang="ts">
import { onScopeDispose, shallowRef, triggerRef } from 'vue';
import { createDatePicker } from 'datepicker-nextgen/core';
import type { DayInfo } from 'datepicker-nextgen/core';

const engine = createDatePicker({ mode: 'range', minNights: 2 });
const snapshot = shallowRef(engine.getSnapshot());

// `shallowRef` + a fresh snapshot each notification is exactly right here: the
// snapshot is immutable, so identity comparison is the correct change signal.
const stop = engine.subscribe(() => {
  snapshot.value = engine.getSnapshot();
  triggerRef(snapshot);
});

onScopeDispose(() => {
  stop();
  engine.destroy();
});

const dayClass = (day: DayInfo) => ({
  'is-selected': day.isSelected,
  'is-in-range': day.isInRange,
  'is-disabled': day.isDisabled,
  'is-today': day.isToday,
});
</script>

<template>
  <div class="dpng" :dir="snapshot.direction" @keydown="engine.handleKeyDown($event)">
    <div v-for="month in snapshot.months" :key="month.key">
      <header>
        <button :disabled="!snapshot.canGoPrevious" @click="engine.previousMonth()">‹</button>
        <h3>{{ month.label }}</h3>
        <button :disabled="!snapshot.canGoNext" @click="engine.nextMonth()">›</button>
      </header>

      <div role="grid" :aria-label="month.label">
        <div v-for="week in month.weeks" :key="week.key" role="row">
          <button
            v-for="day in week.days"
            :key="day.key"
            type="button"
            role="gridcell"
            :class="dayClass(day)"
            :tabindex="day.tabIndex"
            :aria-label="day.ariaLabel"
            :aria-selected="day.ariaSelected"
            :aria-disabled="day.ariaDisabled"
            :aria-current="day.ariaCurrent"
            @click="engine.select(day.date)"
            @mouseenter="engine.hover(day.date)"
          >
            {{ day.label }}
          </button>
        </div>
      </div>
    </div>

    <p class="sr-only" role="status" aria-live="polite">{{ snapshot.announcement }}</p>
  </div>
</template>
```

Use `shallowRef`, not `ref`: the snapshot is a deep, immutable tree and there is nothing to gain
from making it reactive — you would just pay to proxy 42 day objects per month.

## Svelte 5

```svelte
<script lang="ts">
  import { createDatePicker } from 'datepicker-nextgen/core';
  import type { CalendarSnapshot } from 'datepicker-nextgen/core';

  const engine = createDatePicker({ mode: 'range', minNights: 2 });
  let snapshot = $state<CalendarSnapshot>(engine.getSnapshot());

  $effect(() => {
    const stop = engine.subscribe(() => { snapshot = engine.getSnapshot(); });
    return () => { stop(); engine.destroy(); };
  });
</script>

<div class="dpng" dir={snapshot.direction} onkeydown={(e) => engine.handleKeyDown(e)}>
  {#each snapshot.months as month (month.key)}
    <header>
      <button disabled={!snapshot.canGoPrevious} onclick={() => engine.previousMonth()}>‹</button>
      <h3>{month.label}</h3>
      <button disabled={!snapshot.canGoNext} onclick={() => engine.nextMonth()}>›</button>
    </header>

    <div role="grid" aria-label={month.label}>
      {#each month.weeks as week (week.key)}
        <div role="row">
          {#each week.days as day (day.key)}
            <button
              type="button" role="gridcell"
              class:selected={day.isSelected}
              class:in-range={day.isInRange}
              class:disabled={day.isDisabled}
              tabindex={day.tabIndex}
              aria-label={day.ariaLabel}
              aria-selected={day.ariaSelected}
              aria-disabled={day.ariaDisabled}
              onclick={() => engine.select(day.date)}
              onmouseenter={() => engine.hover(day.date)}
            >{day.label}</button>
          {/each}
        </div>
      {/each}
    </div>
  {/each}

  <p class="sr-only" role="status" aria-live="polite">{snapshot.announcement}</p>
</div>
```

On Svelte 4, the engine is already a store in everything but name — wrap it in three lines:

```ts
import { readable } from 'svelte/store';

export const snapshot = readable(engine.getSnapshot(), (set) =>
  engine.subscribe(() => set(engine.getSnapshot())),
);
```

## Solid

```tsx
import { createSignal, onCleanup, For } from 'solid-js';
import { createDatePicker } from 'datepicker-nextgen/core';

export function Picker() {
  const engine = createDatePicker({ mode: 'range', minNights: 2 });
  const [snapshot, setSnapshot] = createSignal(engine.getSnapshot());

  // The setter form matters: a snapshot is an object, and the bare form would
  // treat it as an updater function… which it is not.
  const stop = engine.subscribe(() => setSnapshot(() => engine.getSnapshot()));
  onCleanup(() => {
    stop();
    engine.destroy();
  });

  return (
    <div class="dpng" dir={snapshot().direction} onKeyDown={(e) => engine.handleKeyDown(e)}>
      <For each={snapshot().months}>
        {(month) => (
          <div role="grid" aria-label={month.label}>
            <For each={month.weeks}>
              {(week) => (
                <div role="row">
                  <For each={week.days}>
                    {(day) => (
                      <button
                        type="button"
                        role="gridcell"
                        tabindex={day.tabIndex}
                        aria-label={day.ariaLabel}
                        aria-selected={day.ariaSelected}
                        aria-disabled={day.ariaDisabled}
                        classList={{ selected: day.isSelected, 'in-range': day.isInRange }}
                        onClick={() => engine.select(day.date)}
                        onMouseEnter={() => engine.hover(day.date)}
                      >
                        {day.label}
                      </button>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        )}
      </For>
      <p class="sr-only" role="status" aria-live="polite">
        {snapshot().announcement}
      </p>
    </div>
  );
}
```

## Rules the engine expects you to keep

Break one of these and things get subtly wrong; keep them and the engine is boring in the best way.

1. **Never mutate a snapshot.** It is a value object, shared with every subscriber and reused
   between changes. Treat it as frozen.
2. **Don't hold onto `snapshot.months` across changes.** Read from the current snapshot every render.
3. **Pass stable identities for `presets`, `formatters`, `labels`, `dayMeta` and `time`.** They are
   diffed by reference. Module scope, or `useMemo` / `computed`.
4. **Keep `dayMeta` cheap.** It runs for every rendered day on every snapshot. `Map` lookups, not
   date formatting.
5. **Route selections through the engine**, not around it. `engine.select()` runs the constraint
   pipeline; writing into your own state does not.
6. **Render one `tabIndex: 0` day.** Use `day.tabIndex` as given; do not compute your own.
7. **Don't use `disabled` on day cells.** Use `aria-disabled` (which `DayInfo.ariaDisabled` gives
   you) so unavailable days stay reachable — see
   [accessibility.md](./accessibility.md#why-unavailable-days-are-not-disabled).
8. **Call `destroy()`** when your component unmounts outside React. (In React, don't: StrictMode's
   mount → unmount → remount reuses the same engine, and a destroyed one is permanently inert. The
   hook deliberately leaves it to the collector.)

---

Next: **[vanilla.md](./vanilla.md)** if you want the DOM renderer instead of writing one, or
**[api-reference.md](./api-reference.md)** for the full snapshot and engine surface.
