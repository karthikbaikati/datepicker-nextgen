# Vanilla JS

No React, no build step, no dependencies. The vanilla binding renders the **same DOM and the same
class names** as the React components, so one stylesheet serves both — and everything you learn here
transfers if you later move to React.

- [Inline calendar](#inline-calendar)
- [Attach to an input](#attach-to-an-input)
- [The instance API](#the-instance-api)
- [Events](#events)
- [Options](#options)
- [The custom element](#the-custom-element)
- [CDN, no bundler](#cdn-no-bundler)
- [Server-rendered pages](#server-rendered-pages)
- [Cleaning up](#cleaning-up)

## Inline calendar

```js
import { createDatePicker } from 'datepicker-nextgen/vanilla';
import 'datepicker-nextgen/styles.css';

const picker = createDatePicker('#calendar', {
  mode: 'range',
  numberOfMonths: 2,
  minNights: 2,
  disablePast: true,
});

picker.on('complete', ({ selection }) => {
  console.log(selection.range.start, selection.range.end);
});
```

`createDatePicker(target, options)` takes an element or a CSS selector, and throws a clear error if
the selector matches nothing. The instance owns everything it adds to the page, so `destroy()`
leaves the DOM exactly as it found it.

Rendering is patched in place: on a month change the renderer rewrites cell text and classes rather
than rebuilding the tree, and it installs one delegated listener per event type on the root — a
42-cell calendar costs four listeners, not two hundred.

## Attach to an input

```js
import { attachDatePicker } from 'datepicker-nextgen/vanilla';

const picker = attachDatePicker(document.querySelector('#dates'), {
  mode: 'range',
  minNights: 2,
  numberOfMonths: 2,
});
```

What you get for free:

- Opens on focus or click (`openOnFocus: false` to require `open()` or `ArrowDown`).
- `ArrowDown` in the input opens the panel; `Escape` closes it and returns focus to the input.
- Whatever the user types is parsed on `Enter`, on `change`, and on blur — ISO, locale-numeric,
  `"Sep 4 – Sep 25"`, `"next friday"`, `"+2w"`. Parsed dates run through the same constraint
  pipeline as clicks.
- The formatted value is written back into the input on every change. Override the text with
  `formatValue(selection, snapshot)`.
- Placement without a positioning library: below the anchor, flipped above when there is no room,
  clamped horizontally to the viewport. The chosen side is exposed as `data-placement`.
- Closes on outside click, on `Escape`, and once the selection is complete (`closeOnComplete`,
  default `true`).
- Focus is trapped in the panel while it is open, with the input counting as inside.
- `autocomplete="off"`, `aria-haspopup="dialog"` and a live `aria-expanded` are set on the input,
  and all three are restored on `destroy()`.

## The instance API

```ts
interface DatePickerInstance {
  readonly engine: DatePickerEngineApi; // the full headless surface
  readonly element: HTMLElement; // the `.dpng` root
  update(options: Partial<VanillaOptions>): void;
  getValue<T = SelectionValue>(): T;
  setValue(value: ValueInput): void;
  open(): void;
  close(): void;
  toggle(): void;
  on(event: DatePickerEventName, handler: (detail: unknown) => void): () => void;
  destroy(): void;
}
```

```js
picker.setValue({ start: '2026-09-04', end: '2026-09-25' });
picker.getValue(); // shaped by `valueAdapter`; PlainDates by default
picker.update({ minNights: 3, theme: 'midnight' });
picker.engine.applyPreset('this-weekend');
picker.engine.goToMonth('2026-12-01');
```

`update()` accepts engine options and presentational flags in the same object and splits them
internally. `instance.engine` is the same engine documented in
[api-reference.md](./api-reference.md#engine-api) — anything not on the instance is on there.

## Events

`on(event, handler)` returns an unsubscribe function. A handler that throws is caught, so a broken
listener cannot corrupt the picker's own bookkeeping.

| Event         | Detail                                                             |
| ------------- | ------------------------------------------------------------------ |
| `change`      | `{ value, selection, meta }` — on every accepted mutation          |
| `complete`    | `{ value, selection, meta }` — when the selection becomes complete |
| `clear`       | `{ value, selection, meta }` — also emitted as a `change`          |
| `monthchange` | `{ month }` — a `PlainDate` for the first visible month            |
| `open`        | `undefined`                                                        |
| `close`       | `undefined`                                                        |

`value` is shaped by the configured `valueAdapter`; `selection` is always the internal, timezone-free
`SelectionValue`; `meta` is `ChangeMeta` (`reason`, `mode`, `isComplete`, `date?`, `preset?`,
`duration`).

```js
const off = picker.on('change', ({ selection, meta }) => {
  if (meta.reason === 'preset') analytics.track('preset_used', { id: meta.preset?.id });
  render(selection);
});
// later
off();
```

## Options

`VanillaOptions` = every [`EngineOptions`](./api-reference.md#engineoptions) field, plus:

### Presentation

| Option              | Type                                          | Default                                         |
| ------------------- | --------------------------------------------- | ----------------------------------------------- |
| `className`         | `string`                                      | —                                               |
| `theme`             | `string`                                      | —                                               |
| `size`              | `'sm' \| 'md' \| 'lg'`                        | `'md'`                                          |
| `variant`           | `'inline' \| 'popover' \| 'modal' \| 'sheet'` | `'inline'` (`'popover'` for `attachDatePicker`) |
| `orientation`       | `'horizontal' \| 'vertical'`                  | `'horizontal'`                                  |
| `title`             | `string`                                      | `labels.title`                                  |
| `showHeader`        | `boolean`                                     | `true`                                          |
| `showDurationBadge` | `boolean`                                     | `true`                                          |
| `showFields`        | `boolean`                                     | `true`                                          |
| `showNav`           | `boolean`                                     | `true`                                          |
| `showMonthCaptions` | `boolean`                                     | `true` when >1 month                            |
| `showNavSelects`    | `boolean`                                     | `false`                                         |
| `showWeekdays`      | `boolean`                                     | `true`                                          |
| `showPresets`       | `boolean`                                     | `true` when presets resolve                     |
| `showClear`         | `boolean`                                     | `true`                                          |
| `showFooter`        | `boolean`                                     | `false`                                         |
| `showTodayButton`   | `boolean`                                     | `true` when the footer shows                    |
| `showApplyButton`   | `boolean`                                     | `true` for non-inline variants                  |
| `showCancelButton`  | `boolean`                                     | `true` for non-inline variants                  |
| `showTime`          | `boolean`                                     | `true` when `time.enabled`                      |
| `showLiveRegion`    | `boolean`                                     | `true`                                          |

`Cancel` restores the value the panel had when it opened — that snapshot is taken in `open()`.

### Popover behaviour

| Option            | Type                              | Default              | Effect                                    |
| ----------------- | --------------------------------- | -------------------- | ----------------------------------------- |
| `formatValue`     | `(selection, snapshot) => string` | round-trippable text | What is written into an attached input    |
| `openOnFocus`     | `boolean`                         | `true`               | Open when the input is focused or clicked |
| `closeOnComplete` | `boolean`                         | `true`               | Close once the selection is complete      |
| `autoFocus`       | `boolean`                         | `true`               | Move focus into the calendar on open      |
| `offset`          | `number`                          | `8`                  | Pixels between the input and the panel    |
| `container`       | `HTMLElement`                     | `document.body`      | Where the panel is appended               |

## The custom element

For pages with no build step at all — Rails, Django, Laravel, a plain HTML file.

```html
<script type="module">
  import { defineDatePickerElement } from 'datepicker-nextgen/vanilla';
  defineDatePickerElement(); // or defineDatePickerElement('my-picker')
</script>

<nextgen-date-picker
  mode="range"
  months="2"
  min-nights="2"
  disable-past
  presets="this-weekend,1-week,2-weeks"
  theme="midnight"
></nextgen-date-picker>
```

`defineDatePickerElement()` is safe to call from module scope: it returns immediately during SSR and
re-registering the same tag is a no-op rather than a throw.

The element renders into its **light DOM** on purpose. The stylesheet is a plain global sheet, and a
shadow root would lock it out.

### Attributes

Attributes cover the flat, serializable options. Booleans are HTML-style: present means true, and
`="false"` / `="no"` / `="0"` opt back out.

| Attribute                                                                                                                                                                   | Maps to               | Notes                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                                                                                                                                                                      | `mode`                | Falls back to `single` if unrecognised                                                                                                      |
| `value`                                                                                                                                                                     | `defaultValue`        | The _initial_ value, like `<input value>`. `"2026-09-04"`, `"2026-09-04..2026-09-25"` (also `/`, `–`, `to`), or a comma list for `multiple` |
| `min` / `max`                                                                                                                                                               | `minDate` / `maxDate` |                                                                                                                                             |
| `locale`                                                                                                                                                                    | `locale`              |                                                                                                                                             |
| `months`                                                                                                                                                                    | `numberOfMonths`      |                                                                                                                                             |
| `theme` / `size` / `variant` / `orientation` / `title`                                                                                                                      | presentation          |                                                                                                                                             |
| `presets`                                                                                                                                                                   | `presets`             | Comma-separated built-in ids, or a JSON array                                                                                               |
| `first-day-of-week`                                                                                                                                                         | `firstDayOfWeek`      | `0`–`6` or `locale`                                                                                                                         |
| `week-numbers`                                                                                                                                                              | `showWeekNumbers`     |                                                                                                                                             |
| `fixed-weeks`                                                                                                                                                               | `fixedWeeks`          |                                                                                                                                             |
| `outside-days`                                                                                                                                                              | `showOutsideDays`     |                                                                                                                                             |
| `select-outside-days`                                                                                                                                                       | `selectOutsideDays`   |                                                                                                                                             |
| `restrict-navigation`                                                                                                                                                       | `restrictNavigation`  |                                                                                                                                             |
| `disabled-dates` / `enabled-dates`                                                                                                                                          | same                  | Comma list or JSON array                                                                                                                    |
| `disabled-days-of-week`                                                                                                                                                     | same                  | e.g. `"0,6"`                                                                                                                                |
| `blocked-ranges`                                                                                                                                                            | same                  | `"2026-09-11..2026-09-14,2026-10-01..2026-10-03"` or JSON                                                                                   |
| `disable-past` / `disable-future` / `disable-weekends`                                                                                                                      | same                  | Boolean                                                                                                                                     |
| `min-nights` / `max-nights`                                                                                                                                                 | same                  |                                                                                                                                             |
| `min-selections` / `max-selections` / `rolling-selection`                                                                                                                   | same                  |                                                                                                                                             |
| `range-semantics`                                                                                                                                                           | `rangeSemantics`      | `nights` (default) or `days`                                                                                                                |
| `allow-reverse-range` / `toggle-on-reselect` / `reset-on-complete` / `auto-advance`                                                                                         | same                  | Boolean                                                                                                                                     |
| `time-zone`                                                                                                                                                                 | `timeZone`            |                                                                                                                                             |
| `today`                                                                                                                                                                     | `today`               | Freeze "today"                                                                                                                              |
| `month` / `default-month`                                                                                                                                                   | same                  |                                                                                                                                             |
| `show-header` `show-duration-badge` `show-fields` `show-nav` `show-nav-selects` `show-month-captions` `show-weekdays` `show-presets` `show-clear` `show-footer` `show-time` | presentation          | Boolean                                                                                                                                     |
| `for`                                                                                                                                                                       | —                     | The `id` of an `<input>`. When set, the element attaches a **popover** to that input instead of rendering inline. Read once on connect.     |

Every attribute except `for` is observed: change it at runtime and the picker updates in place.

### Properties

Properties cover the rich options an attribute cannot carry — functions, arrays of ranges,
formatters. Set them at any time; values set before the element connects are remembered and applied
on connect, and they win over attributes.

| Property                                           | Type                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| `value`                                            | The value in the adapter's shape. Setting it selects.                           |
| `selection`                                        | Read-only `SelectionValue` — the internal, timezone-free selection              |
| `picker`                                           | Read-only `DatePickerInstance \| null` (null before connect)                    |
| `options`                                          | `Partial<VanillaOptions>` — merges an arbitrary option patch. The escape hatch. |
| `presets`                                          | `readonly (DatePreset \| string)[]` — ids and objects both accepted             |
| `disabledDates` / `enabledDates` / `blockedRanges` | Same as the options                                                             |
| `dayMeta`                                          | `(date) => DayMeta \| null`                                                     |
| `formatters` / `labels`                            | Partial overrides                                                               |

```js
const el = document.querySelector('nextgen-date-picker');

el.blockedRanges = await fetchBlocked();
el.dayMeta = (date) => ({ note: prices.get(toISODate(date)) });
el.options = { minNights: 3, onInvalidSelection: (d, e) => toast(e.message) };

el.value = { start: '2026-09-04', end: '2026-09-25' };
console.log(el.selection.range);
el.picker?.engine.applyPreset('this-weekend');
```

### Events

The element re-dispatches every instance event as a `CustomEvent` — `bubbles: true`,
`composed: true`, with the same `detail`:

```js
el.addEventListener('change', (event) => console.log(event.detail.selection));
el.addEventListener('complete', (event) => submit(event.detail.value));
el.addEventListener('monthchange', (event) => prefetch(event.detail.month));
el.addEventListener('open', () => {});
el.addEventListener('close', () => {});
el.addEventListener('clear', () => {});
```

Disconnecting the element destroys the instance and empties itself; reconnecting rebuilds from the
current attributes plus any properties you set.

## CDN, no bundler

```html
<!doctype html>
<link rel="stylesheet" href="https://esm.sh/datepicker-nextgen/styles.css" />
<link rel="stylesheet" href="https://esm.sh/datepicker-nextgen/themes/emerald.css" />

<label for="dates">Trip dates</label>
<input id="dates" placeholder="Add dates" />

<div id="inline"></div>

<script type="module">
  import {
    attachDatePicker,
    createDatePicker,
    defineDatePickerElement,
    normalizePresets,
  } from 'https://esm.sh/datepicker-nextgen/vanilla';

  attachDatePicker(document.querySelector('#dates'), {
    mode: 'range',
    minNights: 2,
    numberOfMonths: 2,
    theme: 'emerald',
  });

  createDatePicker('#inline', {
    mode: 'single',
    presets: normalizePresets(['today', 'tomorrow', 'next-monday']),
  });

  defineDatePickerElement();
</script>

<nextgen-date-picker mode="multiple" max-selections="5" rolling-selection></nextgen-date-picker>
```

`unpkg.com/datepicker-nextgen/dist/vanilla/index.js` and jsDelivr work the same way. Pin a version
in production (`https://esm.sh/datepicker-nextgen@1.0.0/vanilla`).

## Server-rendered pages

The picker is progressive enhancement over an existing input, which is the right shape for Rails,
Django, Laravel or Hotwire. Two things to get right:

**Keep a real form value.** `attachDatePicker` writes formatted, human text into the input it
manages. That text is locale-dependent, so post ISO in hidden fields instead:

```html
<input id="dates" placeholder="Add dates" autocomplete="off" />
<input type="hidden" name="check_in" />
<input type="hidden" name="check_out" />

<script type="module">
  import { attachDatePicker, isoStringAdapter } from 'https://esm.sh/datepicker-nextgen/vanilla';

  const form = document.querySelector('form');
  const picker = attachDatePicker(document.querySelector('#dates'), {
    mode: 'range',
    minNights: 2,
    valueAdapter: isoStringAdapter,
  });

  picker.on('change', ({ value }) => {
    form.check_in.value = value.start ?? '';
    form.check_out.value = value.end ?? '';
  });
</script>
```

**Re-initialise after a partial page update.** Turbo, htmx and friends replace DOM nodes; the
instance attached to the old node is stale. Destroy it and mount again:

```js
const instances = new WeakMap();

function mount(root = document) {
  for (const input of root.querySelectorAll('input[data-datepicker]')) {
    if (instances.has(input)) continue;
    instances.set(input, attachDatePicker(input, JSON.parse(input.dataset.datepicker || '{}')));
  }
}

document.addEventListener('turbo:load', () => mount());
document.addEventListener('turbo:before-cache', () => {
  for (const input of document.querySelectorAll('input[data-datepicker]')) {
    instances.get(input)?.destroy();
    instances.delete(input);
  }
});
```

The custom element handles this for you — `connectedCallback` / `disconnectedCallback` do exactly
this bookkeeping.

## Cleaning up

```js
picker.destroy();
```

Removes every listener (including the window `scroll`/`resize` and document pointer listeners a
popover installs), unsubscribes from the engine, clears the emitter, empties the root, restores the
attributes it changed on an attached input, and destroys the engine. Always call it before removing
the container from the DOM.

---

Next: **[api-reference.md](./api-reference.md)** for the full option and snapshot surface, or
**[theming.md](./theming.md)** to restyle it.
