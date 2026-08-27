# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The `dpng-` class names, the `data-*` state attributes and the `--dpng-*` CSS tokens are part of the
public API; renaming one is a breaking change.

## [Unreleased]

## [1.0.0] - 2026-08-26

Initial public release.

### Added

**Timezone-safe core.** A `PlainDate` model (`{ year, month, day }`, 1-based month, no time, no
offset) and a complete set of calendar-math helpers that never construct a `Date` for arithmetic —
comparisons, arithmetic, boundaries, ISO-8601 week numbers, quarters, leap years, range utilities
and wall-clock `PlainTime` helpers.

**Headless engine.** `createDatePicker(options)` — a framework-free store with a memoized
`CalendarSnapshot`, synchronous subscribers, controlled and uncontrolled `value` and `month`,
constraint evaluation ahead of every selection, and a `getSnapshot()` that returns a stable
reference between changes so `useSyncExternalStore` and equivalent integrations work without loops.

**Seven selection modes.** `single`, `range`, `multiple`, `week`, `month`, `quarter` and `year`,
with `nights` / `days` range semantics, reverse-range repair, toggle-on-reselect, auto-advance and
reset-on-complete.

**Constraints.** `minDate`, `maxDate`, `disabledDates` (list, ranges or predicate), `enabledDates`
allowlist, `disabledDaysOfWeek`, `blockedRanges`, `disablePast`, `disableFuture`, `disableWeekends`,
`minNights` / `maxNights`, `minSelections` / `maxSelections`, `rollingSelection`,
`preventCrossingBlocked` with hover-preview capping, and an `isDateUnavailable` escape hatch. Every
rejection carries a typed `DisabledReason` that reaches the cell, the tooltip, the screen reader and
`onInvalidSelection`.

**Presets.** 23 built-ins, three curated bundles (`bookingPresets`, `analyticsPresets`,
`schedulingPresets`), factories for nights / days / rolling windows / weekends / months / quarters /
years, per-preset keyboard shortcuts, automatic disabling when a preset cannot produce a valid
value, and resolved localized hints.

**Accessibility.** The WAI-ARIA grid pattern, a roving tabindex with exactly one `tabIndex: 0` cell
per calendar, unavailable days kept focusable via `aria-disabled`, a full keyboard map (arrows,
`Home`/`End`, `Ctrl+Home`/`End`, `PageUp`/`PageDown`, `Shift+PageUp`/`PageDown`, `Enter`/`Space`,
`Backspace`/`Delete`, `T`, `Esc`), polite live-region announcements, focus trapping and focus return
for the floating variants, and full `prefers-reduced-motion` support.

**Internationalization.** `Intl`-driven formatting throughout, locale-derived first day of week and
weekend days, automatic RTL with mirrored arrow keys, ISO-8601 week numbers, and complete override
points for every formatter (`formatters`) and every user-visible string (`labels`).

**Parsing.** Locale-aware free text — ISO, locale-numeric (`9/4/2026` vs `4/9/2026`), `Sep 4`,
`4 September 2026`, natural language (`today`, `next friday`, `in 3 days`, `+2w`, `-1m`) and ranges
split on `-`, `–`, `to`, `until`, `→` with each half inheriting the other's missing parts.

**React binding.** `useDatePicker` with eleven prop getters, `DatePickerProvider` /
`useDatePickerContext`, and a compound component set: `DatePicker`, `Calendar`, `MonthGrid`,
`DayCell`, `WeekdayRow`, `CalendarNav`, `DateFields`, `DurationBadge`, `PresetList`, `PickerFooter`,
`DateInput`, `TimePicker`, `Popover`. SSR-safe and StrictMode-safe; React 17, 18 and 19 supported as
an optional peer dependency.

**Vanilla binding.** `createDatePicker(target, options)` for an inline calendar,
`attachDatePicker(input, options)` for a dependency-free popover with flip-and-clamp placement, and
`defineDatePickerElement()` registering `<nextgen-date-picker>` with 48 reflected attributes, rich
property setters and bubbling `CustomEvent`s. The renderer patches the DOM in place and uses one
delegated listener per event type.

**Value adapters.** `plainDateAdapter`, `nativeDateAdapter`, `isoStringAdapter`, `timestampAdapter`,
`createAdapter` for custom shapes, and `createLibraryAdapter` which duck-types Day.js, Luxon, Moment
and `Temporal.PlainDate`.

**Styling.** A token-driven stylesheet with roughly 30 `--dpng-*` custom properties, three sizes,
four variants (`inline`, `popover`, `modal`, `sheet`), two orientations, automatic dark mode with
explicit `data-theme` overrides, and six bundled themes: `midnight`, `emerald`, `rose`, `mono`,
`glass` and `high-contrast`. Every stateful class is mirrored as a `data-*` attribute for Tailwind's
`data-[selected=true]:` variants.

**Per-day decoration.** `dayMeta(date)` supplying notes, dots, badges, tooltips, class names, inline
styles and holiday marking.

**Packaging.** Zero runtime dependencies, ESM + CJS, complete `.d.ts`, three tree-shakeable entry
points (`.`, `./core`, `./vanilla`), declared `sideEffects`, and npm provenance on publish.

[Unreleased]: https://github.com/karthikbaikati/datepicker-nextgen/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/karthikbaikati/datepicker-nextgen/releases/tag/v1.0.0
