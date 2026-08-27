# Contributing

Thanks for helping. This is a small, focused library with a high bar for correctness — the notes
below exist so your PR sails through review rather than bouncing on things that were never written
down.

By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Dev setup

```bash
git clone https://github.com/karthikbaikati/datepicker-nextgen.git
cd datepicker-nextgen
npm ci
npm run dev
```

Node 18+ (CI runs 20, 22 and 24). No other tooling required.

| Script                            | What it does                                                        |
| --------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                     | Vite dev server for the demo in `demo/` — the fastest feedback loop |
| `npm test`                        | Vitest, once                                                        |
| `npm run test:watch`              | Vitest, watching                                                    |
| `npm run test:coverage`           | Coverage with the 70% threshold enforced                            |
| `npm run typecheck`               | `tsc --noEmit` over the whole project                               |
| `npm run build`                   | tsup → `dist/` (ESM + CJS + `.d.ts`)                                |
| `npm run size`                    | Per-entry bundle sizes                                              |
| `npm run lint`                    | ESLint                                                              |
| `npm run format` / `format:check` | Prettier                                                            |
| `npm run verify`                  | typecheck + test + build — **the gate. Run it before pushing.**     |

To typecheck a subset of files while you work on one module:

```bash
node scripts/check.mjs src/core/constraints.ts src/core/presets.ts
```

## Project layout

```
src/
  core/            framework-free, dependency-free, DOM-free
    types.ts         the type contract — read this first, it is the spec
    plain-date.ts    timezone-free calendar math
    intl.ts          locale services, default formatters and labels
    constraints.ts   compiles options into fast predicates; evaluates days and ranges
    selection.ts     pure state transitions for one click
    keyboard.ts      key → intent, and the canonical shortcut table
    calendar.ts      builds MonthInfo / WeekInfo / DayInfo trees
    parse.ts         free-text and locale-numeric parsing
    presets.ts       built-ins, factories, bundles, resolution
    adapters.ts      SelectionValue ⇄ Date / ISO / timestamp / library
    engine.ts        the store: state, memoized snapshot, subscribers
    index.ts         public surface of `/core`
  react/           use-date-picker.ts, context.tsx, components/
  vanilla/         mount.ts, renderer.ts, element.ts
  styles/          styles.css + themes/
tests/             one file per core module
demo/              the GitHub Pages demo
scripts/           check.mjs, report-size.mjs, set-repo.mjs
```

## The architecture in ten lines

1. A date is a `PlainDate` — `{ year, month, day }`, 1-based month, no time, no zone.
2. `constraints.ts` compiles the options once into predicates and bitmasks; nothing is re-parsed per
   day.
3. `selection.ts` is a pure function from `(value, click) → value`. Constraints run _before_ it.
4. `calendar.ts` turns state into a `MonthInfo[]` tree with every ARIA flag precomputed.
5. `engine.ts` owns the state, memoizes the snapshot, and notifies subscribers synchronously.
6. `getSnapshot()` must return the **same reference** until state or options change —
   `useSyncExternalStore` depends on it.
7. React is a thin adapter over that store; so is vanilla; so is the custom element.
8. Every binding emits the same DOM and the same `dpng-` classes, so one stylesheet serves all.
9. All styling resolves through `--dpng-*` tokens. Component rules never hard-code a value.
10. Nothing in `core` or `vanilla` may import a runtime dependency. Ever.

## Code style

Enforced by `tsconfig.json`, ESLint and Prettier; the rest is convention.

- **TypeScript strict**, with `noUncheckedIndexedAccess` (indexing an array gives `T | undefined` —
  handle it) and `verbatimModuleSyntax` (type-only imports **must** use `import type`).
- **Named exports only.** No `export default`.
- **Relative imports with no file extension**: `./plain-date`.
- **No `any` in a public signature.** `unknown` plus narrowing is fine.
- **Never construct a `Date` for arithmetic.** Use the `plain-date` helpers. This is the rule the
  whole library rests on.
- **Never mutate inputs.** Return new objects.
- **No runtime dependencies, no polyfills.** Guard optional `Intl` features in `try/catch`.
- **Comment sparingly but meaningfully.** Explain non-obvious algorithms and _why_ — ISO week math,
  preview capping, focus arithmetic. Never narrate what the code already says.
- Public functions get one concise JSDoc line, again about _why_.
- Files stay focused; roughly 150–500 lines is the healthy range.

## Adding things

### A preset

Add it to `src/core/presets.ts`, register the id in `builtInPresets`, and add a test.

```ts
const blackFridayPreset = toDatePreset('black-friday', 'Black Friday', (ctx) =>
  produce(ctx, {
    start: blackFriday(ctx.today.year),
    end: addDays(blackFriday(ctx.today.year), 3),
  }),
);
```

Rules: `getValue` must use `ctx.today`, `ctx.firstDayOfWeek` and `ctx.clamp` — never `new Date()`.
Return `null` when the preset cannot produce a value. Keep the label short enough for a chip. If it
is domain-specific rather than universal, add it to a bundle (`bookingPresets`,
`analyticsPresets`, `schedulingPresets`) rather than making it a built-in.

### A theme

Add `src/styles/themes/<name>.css` containing exactly one `[data-theme="<name>"]` block that
overrides **tokens only** — no component selectors. Set every colour token; an unset one falls back
to the default light value and will look wrong. Check that `--dpng-accent-contrast` on
`--dpng-accent` clears 4.5:1 (this usually means a 600/700-level accent, not a 500). Add a
`@media (prefers-color-scheme: dark)` variant only if the theme should follow the OS. Then list it
in [docs/theming.md](./docs/theming.md) and in the README feature matrix.

### A locale

There is nothing to add. Locales come from `Intl`, so any BCP-47 tag already works. If a locale
behaves wrongly — a bad first day of week, a wrong weekend, an RTL script not detected — the fix
belongs in `src/core/intl.ts` (`localeFirstDayOfWeek`, `localeWeekendDays`, `isRTL`) with a test
that pins the tag. Translations of the default English strings belong in your app's `labels`, not in
the package: shipping locale bundles would break the zero-dependency, zero-bloat promise.

## Tests

Vitest + jsdom, with `@testing-library/react` for the React layer. One test file per core module.

- **Freeze time.** Pass `today: '2026-09-04'` rather than mocking timers; every derived date flows
  from it.
- **Test the core without a DOM.** `createDatePicker(...)`, `engine.select(...)`,
  `engine.getSnapshot()` — most behaviour needs no rendering at all.
- **Assert `aria-disabled`, not `toBeDisabled()`** on day cells; unavailable days stay focusable on
  purpose.
- **Cover the boundaries**: DST transition days, leap days, year and month edges, week 53, the first
  and last rendered cell.
- Coverage thresholds are 70% lines/functions/branches/statements. A bug fix should come with a test
  that fails without it.

## Pull requests

1. Fork, branch from `main`.
2. Make the change, with tests.
3. `npm run verify` — it must pass. CI runs the same thing on three Node versions plus a Prettier
   check.
4. Update the docs if the public API changed. `docs/api-reference.md` is meant to be exhaustive.
5. Open the PR and fill in the template.

Keep PRs single-purpose. A refactor bundled with a fix is much harder to review, and much harder to
revert.

### Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
feat(presets): add fiscal-quarter factory
fix(constraints): allow a check-out on the first blocked night
docs(theming): document --dpng-month-columns
perf(renderer): patch day text via the text node
test(engine): cover the DST transition in America/Santiago
chore(deps): bump vitest to 3.2.7
```

Scopes in use: `core`, `engine`, `constraints`, `selection`, `calendar`, `presets`, `parse`,
`keyboard`, `intl`, `adapters`, `react`, `vanilla`, `styles`, `docs`, `demo`, `ci`.

`feat!:` or a `BREAKING CHANGE:` footer marks a breaking change.

### What will get pushed back

- A new runtime dependency.
- `new Date()` used for arithmetic anywhere in `core`.
- A component selector inside a theme file.
- A public API change with no docs update.
- Removing or weakening an accessibility behaviour for aesthetics.
- A `getSnapshot()` that returns a fresh object when nothing changed — it will loop in React.

## Reporting bugs

Use the issue templates. A date bug is only reproducible with the timezone, the locale, the exact
options and the dates involved — please include all four. A minimal StackBlitz beats a description
every time.

Security issues: follow [SECURITY.md](./SECURITY.md), not the public tracker.

## Releasing

Maintainers only.

1. Update `CHANGELOG.md` — Keep a Changelog format, newest section first.
2. Bump the version: `npm version <patch|minor|major>` (this creates the `vX.Y.Z` tag).
3. `git push --follow-tags`.
4. The `Release to npm` workflow runs `npm run verify`, publishes with provenance
   (`npm publish --provenance`), and opens a GitHub release with generated notes.

Semver, strictly. The `dpng-` class names, the `data-*` attributes and the `--dpng-*` tokens are
**public API** — renaming one is a breaking change.
