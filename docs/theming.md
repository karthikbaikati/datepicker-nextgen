# Theming

Every visual decision in `styles.css` resolves through a `--dpng-*` custom property. Component
rules never hard-code a colour, radius or duration — they only read tokens. So restyling the picker
means setting variables, not fighting selectors.

- [The one-liner](#the-one-liner)
- [Token reference](#token-reference)
- [Scoping](#scoping)
- [The six bundled themes](#the-six-bundled-themes)
- [Dark mode](#dark-mode)
- [Sizes and variants](#sizes-and-variants)
- [Tailwind](#tailwind)
- [Writing a theme from scratch](#writing-a-theme-from-scratch)
- [Per-day decoration with `dayMeta`](#per-day-decoration-with-daymeta)
- [The scoping contract](#the-scoping-contract)

## The one-liner

```css
.dpng {
  --dpng-accent: #e11d48;
  --dpng-radius-card: 8px;
  --dpng-cell-size: 44px;
}
```

That is a brand recolour and a touch-friendly grid, done. Nothing else needs to change: the
selected circle, the range band, the today dot, the focus ring, the active field underline and the
preset chip all read `--dpng-accent`.

## Token reference

### Colour

| Token                     | Default (light)          | Used by                                                                         |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `--dpng-accent`           | `#2563eb`                | Selected day, range endpoints, today, active underline, focus ring, active chip |
| `--dpng-accent-hover`     | `#1d4ed8`                | Hover on accent surfaces                                                        |
| `--dpng-accent-contrast`  | `#ffffff`                | Text on an accent background                                                    |
| `--dpng-accent-soft`      | `#eff6ff`                | Tinted accent backgrounds (active chip, badge)                                  |
| `--dpng-range-bg`         | `#eff6ff`                | The in-range band                                                               |
| `--dpng-range-text`       | `#1d4ed8`                | Text inside the band                                                            |
| `--dpng-surface`          | `#ffffff`                | Card background                                                                 |
| `--dpng-surface-elevated` | `#ffffff`                | Popover / modal / sheet background                                              |
| `--dpng-text`             | `#0f172a`                | Primary text                                                                    |
| `--dpng-text-muted`       | `#64748b`                | Secondary text, `Clear`                                                         |
| `--dpng-text-subtle`      | `#94a3b8`                | Field labels                                                                    |
| `--dpng-border`           | `#f1f5f9`                | Hairlines and dividers                                                          |
| `--dpng-border-strong`    | `#e2e8f0`                | Chip and control borders                                                        |
| `--dpng-hover-bg`         | `#f1f5f9`                | Day and button hover                                                            |
| `--dpng-disabled-text`    | `#cbd5e1`                | Unavailable and outside days                                                    |
| `--dpng-today-color`      | `#2563eb`                | Today's number and dot                                                          |
| `--dpng-weekday-color`    | `#94a3b8`                | Weekday header row                                                              |
| `--dpng-badge-bg`         | `#eff6ff`                | Duration badge background                                                       |
| `--dpng-badge-text`       | `#2563eb`                | Duration badge text                                                             |
| `--dpng-blocked-color`    | `#cbd5e1`                | Blocked days and their strike line                                              |
| `--dpng-preview-bg`       | `#f8fafc`                | Hover preview band                                                              |
| `--dpng-ring`             | `#2563eb`                | `focus-visible` outline                                                         |
| `--dpng-day-text`         | `#334155`                | Day numbers                                                                     |
| `--dpng-weekend-color`    | `var(--dpng-day-text)`   | Set it to give weekends their own colour                                        |
| `--dpng-holiday-color`    | `#b45309`                | Days marked `holiday` via `dayMeta`                                             |
| `--dpng-invalid`          | `#dc2626`                | Invalid field state                                                             |
| `--dpng-backdrop`         | `rgba(15, 23, 42, 0.45)` | Modal / sheet backdrop                                                          |
| `--dpng-card-border`      | `rgba(15, 23, 42, 0.06)` | Card border colour                                                              |

### Geometry

| Token                                       | Default              | Meaning                                                     |
| ------------------------------------------- | -------------------- | ----------------------------------------------------------- |
| `--dpng-radius`                             | `10px`               | Controls, chips, nav buttons                                |
| `--dpng-radius-card`                        | `20px`               | The card                                                    |
| `--dpng-cell-size`                          | `36px`               | Day cell width and height                                   |
| `--dpng-cell-radius`                        | `999px`              | Day cell corner radius — set to `8px` for a squared grid    |
| `--dpng-gap`                                | `2px`                | Gap between cells                                           |
| `--dpng-border-width`                       | `1px`                | Hairline thickness                                          |
| `--dpng-card-width`                         | `360px`              | Card width (one month)                                      |
| `--dpng-card-pad`                           | `18px`               | Card padding                                                |
| `--dpng-card-pad-bottom`                    | `14px`               | Card bottom padding                                         |
| `--dpng-month-min` / `--dpng-month-max`     | `244px` / `320px`    | Per-month width bounds                                      |
| `--dpng-months-gap` / `--dpng-months-gap-x` | `16px 20px` / `20px` | Gap between months                                          |
| `--dpng-month-columns`                      | `1`                  | Month grid columns — set to `2` for a 2×2 four-month layout |
| `--dpng-weeknumber-width`                   | `26px`               | Week-number column                                          |
| `--dpng-nav-button-size`                    | `28px`               | Chevron button square                                       |
| `--dpng-vertical-height`                    | `380px`              | Scroll height in `orientation="vertical"`                   |

### Type, depth, motion, density

| Token                 | Default                      | Meaning                                              |
| --------------------- | ---------------------------- | ---------------------------------------------------- |
| `--dpng-font`         | system stack                 | Font family                                          |
| `--dpng-font-size`    | `12.5px`                     | Base size; nearly everything else is `em`-relative   |
| `--dpng-shadow`       | two-layer soft shadow        | Card elevation                                       |
| `--dpng-card-filter`  | `none`                       | `backdrop-filter` hook — how `glass` frosts the card |
| `--dpng-duration`     | `150ms`                      | Transition duration                                  |
| `--dpng-ease`         | `cubic-bezier(0.2, 0, 0, 1)` | Transition easing                                    |
| `--dpng-preset-font`  | `0.86em`                     | Chip text size                                       |
| `--dpng-preset-pad`   | `5px 10px`                   | Chip padding                                         |
| `--dpng-preset-gap`   | `5px`                        | Gap between chips                                    |
| `--dpng-layer`        | `1000`                       | `z-index` of the floating layers                     |
| `--dpng-font`         | system stack                 | Font family for the whole picker                     |
| `--dpng-shadow`       | two-layer soft shadow        | Card and popover elevation                           |
| `--dpng-month-min`    | `244px`                      | Narrowest a month may get before months wrap         |
| `--dpng-month-max`    | `320px`                      | Widest a single month grid may grow                  |
| `--dpng-months-gap`   | `16px 20px`                  | Row and column gap between months                    |
| `--dpng-months-gap-x` | `20px`                       | Column gap alone, used in the card's width calc      |

## Scoping

Pick the narrowest scope that works — but always **target the picker root**, never a bare
ancestor:

```css
/* Everywhere */
.dpng {
  --dpng-accent: #059669;
}

/* One region of the app — note the descendant selector */
.checkout-panel .dpng {
  --dpng-cell-size: 44px;
}

/* One theme */
.dpng[data-theme='brand'] {
  --dpng-accent: #7c3aed;
}
```

> **Why the descendant selector matters.** `styles.css` declares every default _on_ `.dpng`
> itself, and a declaration on an element always wins over a value inherited from an ancestor —
> specificity never enters into it, because the two are not competing for the same element. So
> `.checkout-panel { --dpng-accent: red }` is silently ignored, while
> `.checkout-panel .dpng { --dpng-accent: red }` works. In React you can skip the CSS entirely
> and pass the token through `className` or `style`, both of which land on the root.

```jsx
{
  /* One instance */
}
<DatePicker style={{ '--dpng-accent': '#059669' }} />;
```

## The six bundled themes

Each is a token-only `[data-theme="…"]` block in its own file, so you ship only what you import.

| Theme           | Import                                        | Character                                                                                                                           |
| --------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `midnight`      | `datepicker-nextgen/themes/midnight.css`      | Dark slate + indigo. **Unconditionally** dark — stays dark on a light page, for a picker inside a dark hero or nav bar.             |
| `emerald`       | `datepicker-nextgen/themes/emerald.css`       | Emerald-700 over warm stone. The darker accent is deliberate: white on emerald-500 fails AA.                                        |
| `rose`          | `datepicker-nextgen/themes/rose.css`          | Rose-600, pink hairlines, generous radii.                                                                                           |
| `mono`          | `datepicker-nextgen/themes/mono.css`          | Black, white, grey. Thin hairlines, squarer corners, no shadow — for dense admin chrome.                                            |
| `glass`         | `datepicker-nextgen/themes/glass.css`         | Frosted translucent card for use over photography or video. Falls back to an opaque surface where `backdrop-filter` is unsupported. |
| `high-contrast` | `datepicker-nextgen/themes/high-contrast.css` | Every pair clears WCAG AAA (7:1), 2px borders, solid hover blocks.                                                                  |

```jsx
import 'datepicker-nextgen/styles.css';
import 'datepicker-nextgen/themes/midnight.css';

<DatePicker theme="midnight" />;
```

In vanilla, pass `theme: 'midnight'`; on the custom element, `theme="midnight"`. All three set
`data-theme` on the root.

## Dark mode

Three layers, in cascade order:

1. **Light** values are always defined on `.dpng`. No colour in the stylesheet exists only inside a
   media query, so nothing can end up undefined.
2. **`@media (prefers-color-scheme: dark)`**, guarded so it does not apply when the author pinned a
   theme. Out of the box, the picker follows the OS.
3. **`[data-theme="dark"]`**, which wins in both directions.

So:

```jsx
<DatePicker />                    {/* follows the OS */}
<DatePicker theme="dark" />       {/* always dark */}
<DatePicker theme="light" />      {/* always light, even on a dark OS */}
<DatePicker theme="midnight" />   {/* always the midnight palette */}
```

If your app already has a theme switch, mirror it onto the picker:

```jsx
<DatePicker theme={appTheme === 'system' ? undefined : appTheme} />
```

## Sizes and variants

`size` scales the grid and the type through `[data-size]`:

| Size           | `--dpng-cell-size` | `--dpng-font-size` | Card width |
| -------------- | ------------------ | ------------------ | ---------- |
| `sm`           | `30px`             | `11.5px`           | `292px`    |
| `md` (default) | `36px`             | `12.5px`           | `352px`    |
| `lg`           | `44px`             | `14px`             | `400px`    |

`variant` sets `[data-variant]` and changes how the picker is presented: `inline` (in the flow),
`popover` (floating, positioned against an anchor), `modal` (centred with a backdrop), `sheet`
(bottom sheet, the mobile default). `orientation="vertical"` stacks the months into one column that
scrolls to `--dpng-vertical-height`.

For a 2×2 four-month layout:

```css
.dpng[data-months='4'] {
  --dpng-month-columns: 2;
}
```

## Tailwind

Two ways in, and you can mix them.

### Tokens from your Tailwind theme

```css
@layer components {
  .dpng {
    --dpng-accent: theme('colors.violet.600');
    --dpng-accent-soft: theme('colors.violet.50');
    --dpng-range-bg: theme('colors.violet.50');
    --dpng-surface: theme('colors.white');
    --dpng-text: theme('colors.slate.900');
    --dpng-font: theme('fontFamily.sans');
    --dpng-radius-card: theme('borderRadius.2xl');
  }
}
```

### Utility classes on your own markup

Every stateful class is mirrored as a `data-*` attribute, so Tailwind's data variants target the
picker's states directly. Build the UI with the headless hook and skip `styles.css` entirely:

```tsx
const { snapshot, getDayProps } = useDatePicker({ mode: 'range' });

<button
  {...getDayProps(day, {
    className: [
      'h-9 w-9 rounded-full text-sm transition-colors',
      'hover:bg-slate-100',
      'data-[selected=true]:bg-violet-600 data-[selected=true]:text-white',
      'data-[in-range=true]:bg-violet-50 data-[in-range=true]:text-violet-700',
      'data-[preview=true]:bg-slate-50 data-[preview=true]:ring-1 data-[preview=true]:ring-dashed',
      'data-[today=true]:font-semibold data-[today=true]:text-violet-600',
      'data-[disabled=true]:text-slate-300 data-[disabled=true]:cursor-not-allowed',
      'data-[blocked=true]:line-through',
      'data-[outside=true]:text-slate-300',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
    ].join(' '),
  })}
>
  {day.label}
</button>;
```

The getter's `className` merge concatenates rather than overwrites, so the `dpng-*` classes stay on
the element and your utilities sit alongside them.

Available on a day: `data-today`, `data-selected`, `data-range-start`, `data-range-end`,
`data-in-range`, `data-preview`, `data-preview-start`, `data-preview-end`, `data-disabled`,
`data-blocked`, `data-outside`, `data-weekend`, `data-holiday`, `data-hovered`, `data-focused`.
Boolean flags are present-or-absent with the value `"true"`, so both `data-[selected=true]:` and
`[data-selected]` work.

## Writing a theme from scratch

Copy this skeleton, override tokens only, and never write a component selector — that is what keeps
a theme forward-compatible.

```css
/* my-theme.css */
.dpng[data-theme='sunset'] {
  --dpng-accent: #ea580c;
  --dpng-accent-hover: #c2410c;
  --dpng-accent-contrast: #ffffff;
  --dpng-accent-soft: #fff7ed;
  --dpng-range-bg: #fff7ed;
  --dpng-range-text: #9a3412;
  --dpng-surface: #fffbf7;
  --dpng-surface-elevated: #ffffff;
  --dpng-text: #1c1917;
  --dpng-text-muted: #78716c;
  --dpng-text-subtle: #a8a29e;
  --dpng-border: #f5f5f4;
  --dpng-border-strong: #e7e5e4;
  --dpng-hover-bg: #fef3c7;
  --dpng-disabled-text: #d6d3d1;
  --dpng-today-color: #ea580c;
  --dpng-weekday-color: #a8a29e;
  --dpng-badge-bg: #fff7ed;
  --dpng-badge-text: #c2410c;
  --dpng-blocked-color: #d6d3d1;
  --dpng-preview-bg: #fffbeb;
  --dpng-ring: #ea580c;
  --dpng-day-text: #44403c;
  --dpng-card-border: rgba(28, 25, 23, 0.08);
}
```

Checklist before you ship it:

- **Contrast.** `--dpng-accent-contrast` on `--dpng-accent` must clear 4.5:1 for the selected day.
  Tailwind's 500-level colours usually do not; go one or two steps darker, as `emerald` does.
- **Both schemes.** If the theme should follow the OS, add a
  `@media (prefers-color-scheme: dark) { .dpng[data-theme='sunset'] { … } }` block. If it should be
  unconditional (like `midnight`), leave it out — that is the point.
- **Every colour token.** An unset token falls back to the default light value, which will look
  wrong on a dark theme. Set them all.
- **No component selectors.** If you find yourself writing `.dpng-day--selected`, there is probably
  a token for what you want. If there genuinely is not, open an issue.

## Per-day decoration with `dayMeta`

`dayMeta(date)` returns a `DayMeta` that the renderer turns into real elements inside the cell.

| Field       | Renders as                                                            | Class                                |
| ----------- | --------------------------------------------------------------------- | ------------------------------------ |
| `note`      | Text under the day number                                             | `.dpng-day__note`                    |
| `dots`      | Up to 3 indicators                                                    | `.dpng-day__dots` > `.dpng-day__dot` |
| `badge`     | Corner badge                                                          | `.dpng-day__badge`                   |
| `tooltip`   | `title` + ARIA description                                            | —                                    |
| `className` | Merged onto the cell                                                  | your class                           |
| `style`     | Inline style on the cell                                              | —                                    |
| `holiday`   | Sets `data-holiday` and `DayInfo.isHoliday`; the day stays selectable | `.dpng-day--holiday`                 |

```tsx
const dayMeta = useCallback(
  (date: PlainDate): DayMeta | null => {
    const key = toISODate(date);
    const price = prices.get(key);
    if (!price) return null;
    return {
      note: `$${price}`,
      dots: [{ color: '#059669', label: 'Free cancellation' }],
      badge: price < 200 ? '★' : undefined,
      tooltip: `$${price} per night`,
      style: { '--dpng-cell-size': '52px' } as Record<string, string>,
    };
  },
  [prices],
);
```

Two rules:

1. **It runs for every rendered day, on every snapshot** — 42 cells per month, times
   `numberOfMonths`. Look values up in a `Map`; never allocate, format or fetch inside it.
2. **Memoize the function.** It is diffed by reference; a new arrow function each render rebuilds
   the whole calendar. `useCallback` with the data as the dependency.

Give the cells room when you use `note` or `dots`:

```css
.dpng {
  --dpng-cell-size: 52px;
  --dpng-cell-radius: 12px;
}
.dpng-day__note {
  font-size: 10px;
  line-height: 1;
  opacity: 0.75;
}
.dpng-day--selected .dpng-day__note {
  opacity: 1;
}
```

## The scoping contract

Every selector in `styles.css` is scoped under `.dpng`. There is no global reset, no `!important`,
and no bare element selector. Element resets are wrapped in `:where()` so they carry the specificity
of `.dpng` alone — high enough to beat a host page's bare `button {}` rule, low enough that a single
class of yours wins.

In practice: the host page cannot break the picker, the picker cannot break the host page, and one
class on your side is always enough to override the library.

---

Next: **[accessibility.md](./accessibility.md)** for the contrast and motion requirements a theme
must respect, or **[headless.md](./headless.md)** to drop the stylesheet altogether.
