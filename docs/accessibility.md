# Accessibility

Accessibility is the second design pillar of this library, after correctness. It is implemented in
the core — the keyboard map, the roving tabindex, the ARIA labels and the announcements all come out
of the engine — so you get the same behaviour from the styled components, from your own markup via
prop getters, and from the vanilla renderer.

- [Keyboard](#keyboard)
- [ARIA roles](#aria-roles)
- [Why unavailable days are not `disabled`](#why-unavailable-days-are-not-disabled)
- [Screen-reader announcements](#screen-reader-announcements)
- [Focus management](#focus-management)
- [Reduced motion](#reduced-motion)
- [Contrast](#contrast)
- [RTL](#rtl)
- [How to test it](#how-to-test-it)
- [What you still have to do](#what-you-still-have-to-do)

## Keyboard

This table is generated from `keyboardShortcuts` in `src/core/keyboard.ts` — the same constant the
demo's help sheet renders, so the docs cannot drift from the implementation.

| Keys                                    | Action                        |
| --------------------------------------- | ----------------------------- |
| `←` `→`                                 | Previous / next day           |
| `↑` `↓`                                 | Previous / next week          |
| `Home` / `End`                          | First / last day of the week  |
| `Ctrl + Home` / `Ctrl + End`            | First / last day of the month |
| `Page Up` / `Page Down`                 | Previous / next month         |
| `Shift + Page Up` / `Shift + Page Down` | Previous / next year          |
| `Enter` / `Space`                       | Select the focused date       |
| `Backspace` / `Delete`                  | Clear the selection           |
| `T`                                     | Jump to today                 |
| `Esc`                                   | Close the picker              |

Render it in your own UI rather than hard-coding it:

```tsx
import { keyboardShortcuts } from 'datepicker-nextgen/core';

<dl>
  {keyboardShortcuts.map(({ keys, description }) => (
    <div key={keys}>
      <dt>
        <kbd>{keys}</kbd>
      </dt>
      <dd>{description}</dd>
    </div>
  ))}
</dl>;
```

Details that matter:

- **Arrows mirror in RTL.** `←` always moves _visually_ left, which is the next day in an Arabic or
  Hebrew calendar. Vertical arrows never mirror.
- **`Cmd`/`Ctrl`/`Alt` chords are left alone**, except `Ctrl+Home` / `Ctrl+End`, the conventional
  "jump to the edge of the month" chord in a date grid. Everything else bubbles to the browser and
  the OS.
- **Unknown keys bubble.** `resolveKeyboardIntent` returns `null` rather than swallowing a key, so
  browser shortcuts and screen-reader type-ahead keep working.
- **`T` yields to your presets.** A preset with `shortcut: 't'` takes the key; otherwise `T` jumps
  to today. Preset shortcuts are case-insensitive and tolerate `Shift` (a capital letter is still
  that letter), but any other modifier disqualifies the press.
- **Typing in an input is typing.** The root's key handler skips events coming from an
  `input`, `textarea`, `select` or `contenteditable`, and skips `Enter`/`Space` on a button that is
  not a day cell — so Enter on `Clear` is a click, not a date selection.
- **Focus follows the roving tabindex.** After an arrow key or a preset, DOM focus is moved to the
  newly focused cell — but only when focus was already inside the grid. Focus is never stolen from
  a nav button, a select, or the page at large.

## ARIA roles

| Element                          | Role / attributes                                                                                                     | Why                                                                                                                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Root (`.dpng`)                   | `dir`, `data-*` state                                                                                                 | Direction comes from the locale, not from you.                                                                                                                                                         |
| Months wrapper (`.dpng-months`)  | `role="group"`, `aria-label`                                                                                          | A labelled group. **Deliberately not `role="application"`** — that would disable the screen reader's own table navigation inside the grid, which is the single most useful thing a calendar can offer. |
| Month (`.dpng-grid`)             | `role="grid"`, `aria-label` (the month), `aria-multiselectable` in `multiple` mode                                    | The WAI-ARIA grid pattern. One grid per month, so a multi-month picker announces which month you are in.                                                                                               |
| Week (`.dpng-week`)              | `role="row"`                                                                                                          |                                                                                                                                                                                                        |
| Week number (`.dpng-weeknumber`) | `role="rowheader"`                                                                                                    | It labels the row rather than being a cell in it.                                                                                                                                                      |
| Day (`.dpng-day`)                | `role="gridcell"`, `aria-label`, `aria-selected`, `aria-disabled`, `aria-current="date"` on today, `tabIndex` 0 or -1 | `aria-label` is the full localized date (`"Friday, September 4, 2026"`) plus a state suffix when the day is disabled or selected.                                                                      |
| Nav buttons                      | `aria-label` from `labels.previousMonth` / `nextMonth`, `disabled` when navigation is clamped                         | Real `disabled` here is correct: a chevron that cannot navigate has no reason to take focus.                                                                                                           |
| Preset chips                     | `aria-pressed`, `disabled`, `title` (the resolved hint)                                                               | Toggle semantics, so the active range is announced as pressed.                                                                                                                                         |
| Fields                           | `aria-pressed`, `aria-label` from `labels.startLabel` / `endLabel`                                                    |                                                                                                                                                                                                        |
| Live region (`.dpng-live`)       | `role="status"`, `aria-live="polite"`, visually hidden                                                                | See below.                                                                                                                                                                                             |

Exactly **one** day across all rendered months has `tabIndex: 0`. If the focused date is not among
the rendered days, the first day of the first month takes it — the grid is always reachable with a
single `Tab`, and tabbing past it never walks through 42 buttons.

## Why unavailable days are not `disabled`

They carry `aria-disabled="true"` and stay focusable.

The ARIA grid pattern requires that every cell be reachable by the roving tabindex. A natively
`disabled` button is skipped by the browser's focus order _and_ by most screen readers' grid
navigation, which means a user arrowing through September would silently jump over the blocked
nights instead of hearing that they are unavailable. Worse, they would have no way to find out _why_
a range they wanted is impossible.

So: unavailable days receive focus, announce their state, and reject the selection. Assert on
`aria-disabled` in your tests, not on `toBeDisabled()`.

Real `disabled` is used where it is right — nav chevrons that cannot navigate, preset chips that
cannot produce a valid value, and the `Clear` button with nothing to clear.

## Screen-reader announcements

The engine maintains `snapshot.announcement`, a polite live-region string rebuilt from `labels` on
every relevant change:

| Event             | Default announcement                                                        |
| ----------------- | --------------------------------------------------------------------------- |
| Selection changed | `announceSelected(summary)` → `"Selected Sep 4 – Sep 25, 2026 · 21 nights"` |
| Selection cleared | `announceCleared` → `"Selection cleared"`                                   |
| Month changed     | `announceMonth(label)` → `"Showing September 2026"`                         |
| Range too short   | `minNightsError(n)` → `"Minimum stay is 2 nights"`                          |
| Range too long    | `maxNightsError(n)` → `"Maximum stay is 28 nights"`                         |

`showLiveRegion` (default `true`) renders it into `.dpng-live`, a visually hidden
`role="status" aria-live="polite"` element. Building your own UI? Render it yourself:

```tsx
<div className="sr-only" role="status" aria-live="polite">
  {snapshot.announcement}
</div>
```

Translate everything by overriding `labels`; the announcement functions are part of that object, so
a translated picker announces in the user's language:

```tsx
const labels = {
  announceSelected: (summary: string) => `Ausgewählt: ${summary}`,
  announceCleared: 'Auswahl gelöscht',
  announceMonth: (label: string) => `${label} wird angezeigt`,
  minNightsError: (n: number) => `Mindestaufenthalt: ${n} Nächte`,
}; // define at module scope — labels are diffed by reference
```

`aria-live="polite"` is intentional: the calendar changes on every arrow key, and `assertive` would
interrupt the user mid-word on each one.

## Focus management

**Inline.** Nothing to manage — the grid participates in the page's normal tab order via the roving
tabindex.

**Popover, modal, sheet.** The vanilla binding (and the React `Popover`) handle the full cycle:

- Opening moves focus into the calendar, onto the roving-tabindex cell (turn it off with
  `autoFocus: false`).
- `Tab` and `Shift+Tab` cycle within the panel. The anchoring input counts as inside, so a user can
  tab back to what they were typing in.
- `Escape` closes the panel **and returns focus to the input**.
- A click outside closes it, as does completing the selection (`closeOnComplete`, default `true`).
- Closing removes the panel from the DOM, so nothing focusable is left behind.

The floating panel is positioned without any dependency: it sits below the anchor, flips above when
the space below cannot hold it, and clamps horizontally so it never leaves the viewport. The chosen
side is exposed as `data-placement="top" | "bottom"` if you want to animate from the right edge.

## Reduced motion

Every animation in `styles.css` lives inside
`@media (prefers-reduced-motion: no-preference)`. That is opt-_in_, not opt-out: a user who has
never expressed a preference gets motion, and a user who asked for less gets none — including the
day-press `scale(.94)`, the popover entrance and the sheet slide. There is nothing to configure.

## Contrast

The default light theme's foreground/background pairs clear WCAG AA (4.5:1) for text, including
white on the `#2563eb` selected day and `#1D4ED8` on the `#EFF6FF` range band. The dark scheme is
built to the same bar.

Two things to know if you theme it:

- The bundled accents are deliberately a step or two darker than a typical 500-level brand colour.
  White text on emerald-500 or rose-500 fails AA; `emerald.css` uses emerald-700 (5.5:1) and
  `rose.css` uses rose-600 (4.7:1) for exactly this reason.
- Disabled days sit around 3:1 by design. That is the standard treatment for a control that is not
  actionable, and the state is never carried by colour alone — blocked days also get a diagonal
  strike line, and every state is exposed to assistive tech through `aria-disabled` and the label
  suffix.

For users who need more, ship `high-contrast.css`: every pair clears AAA (7:1), the subtle greys are
gone, borders are 2px, and hover is a solid block rather than a faint tint.

```jsx
import 'datepicker-nextgen/themes/high-contrast.css';
<DatePicker theme="high-contrast" />;
```

Focus rings are a 2px `--dpng-ring` outline at 2px offset on **every** control, including day cells,
and they are never removed — only `:focus-visible` decides when they show.

## RTL

Set `locale="ar-EG"` (or any RTL tag) and everything follows: `snapshot.direction` becomes `'rtl'`,
the root gets `dir="rtl"`, the layout mirrors, the chevrons mirror, and the horizontal arrow keys
swap so they still move visually left and right. You never set `dir` yourself.

## How to test it

### Automated

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

test('no axe violations', async () => {
  const { container } = render(<DatePicker mode="range" today="2026-09-04" />);
  expect(await axe(container)).toHaveNoViolations();
});

test('one tab stop reaches the grid, arrows move within it', async () => {
  const user = userEvent.setup();
  render(<DatePicker mode="single" today="2026-09-04" defaultMonth="2026-09-01" />);

  const cells = screen.getAllByRole('gridcell');
  expect(cells.filter((c) => c.tabIndex === 0)).toHaveLength(1);

  await user.tab();
  await user.keyboard('{ArrowRight}{Enter}');
  expect(screen.getByRole('gridcell', { selected: true })).toBeInTheDocument();
});

test('unavailable days are focusable but announce as disabled', () => {
  render(
    <DatePicker
      mode="range"
      today="2026-09-04"
      defaultMonth="2026-09-01"
      blockedRanges={[{ start: '2026-09-11', end: '2026-09-14' }]}
    />,
  );
  const blocked = screen.getByRole('gridcell', { name: /September 12, 2026/ });
  expect(blocked).toHaveAttribute('aria-disabled', 'true');
  expect(blocked).not.toBeDisabled();
});
```

Automated checks catch missing labels and bad roles. They cannot tell you whether the _experience_
works — for that, do the manual pass.

### Manual, in about five minutes

1. **Unplug the mouse.** Tab to the picker, pick a full range with the arrows and `Enter`, clear it
   with `Backspace`, jump to today with `T`, change months with `Page Up`/`Page Down`. If you have
   to reach for the mouse once, that is a bug.
2. **Turn on a screen reader** (VoiceOver `Cmd+F5`, NVDA, Narrator). Enter the grid and arrow
   around: you should hear the full date, whether it is selected, whether it is unavailable, and the
   month when you cross a boundary. Then select a range and listen for the summary announcement.
3. **Zoom to 200%** and set the browser's minimum font size high. Nothing should clip or overlap —
   almost every dimension in the stylesheet is `em`-relative to `--dpng-font-size` for this reason.
4. **Switch the OS to reduce motion** and confirm nothing animates.
5. **Force dark mode**, then force light, then pin `theme="dark"` on a light OS. All three should
   look deliberate.
6. **Switch the OS language to Arabic** (or just pass `locale="ar-EG"`) and check that `←` still
   moves the focus ring visually left.

## What you still have to do

The library owns the picker. A few things are yours:

- **Label the trigger.** If you attach the picker to your own button or input, give it an accessible
  name (`Check-in date`, not `📅`) and `aria-haspopup="dialog"`. `attachDatePicker` sets
  `aria-haspopup` and maintains `aria-expanded` for you on inputs it manages.
- **Associate errors.** If your form shows "Pick both dates", wire it to the field with
  `aria-describedby` and give it `role="alert"`.
- **Don't nest the picker in `role="application"`** or a container that traps arrow keys.
- **Keep `dayMeta` decorations non-essential.** A price in `note` is a nice extra; if the price is
  required information, also put it in `tooltip`, which reaches assistive tech.
- **Test with your real content.** Long translated labels and long month names in German or Finnish
  are the usual source of layout breakage.

Found a gap? [Open an issue](https://github.com/karthikbaikati/datepicker-nextgen/issues) — an
accessibility bug is treated as a correctness bug here, not an enhancement.
