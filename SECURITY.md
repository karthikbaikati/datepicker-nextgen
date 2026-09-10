# Security Policy

## Reporting a vulnerability

Report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/karthikbaikati/datepicker-nextgen/security/advisories/new)
rather than the public issue tracker. You will get a first response within 72 hours.

That advisory link only accepts reports while private vulnerability reporting is switched on for
the repository (Settings → Advanced Security → Private vulnerability reporting). GitHub leaves it
off by default; if the link shows a 404 or refuses the form, the setting has not been enabled and
no report can be filed through it until it is.

## Supported versions

The latest minor release of the current major version receives security fixes.

## What this package is and is not

`datepicker-nextgen` is a client-side date picker: a framework-free engine (`src/core`), a
React binding (`src/react`) and a vanilla/custom-element binding (`src/vanilla`). It has zero
runtime dependencies (`package.json` declares only optional `react` peers), it makes no network
requests, it reads and writes no storage, and it ships no server. There is nothing in this
repository that authenticates, stores or transmits anything. Every `grep` count below was taken
against `src/` and `demo/` at the time of writing: `innerHTML`, `dangerouslySetInnerHTML`,
`insertAdjacentHTML`, `eval`, `new Function`, `fetch`, `XMLHttpRequest`, `WebSocket`,
`localStorage`, `sessionStorage`, `document.cookie` and `indexedDB` each appear **0** times.

The only console output in `src/` is two `console.error` sites: `reportHostError` in
`src/core/intl.ts` (a host-supplied function threw or returned the wrong type) and
`reportAttribute` in `src/vanilla/element.ts` (an attribute was dropped). Both are described
below; nothing else is logged.

## Threat model

### Strings the host passes in are rendered as text

Every consumer-supplied string reaches the DOM as text, never as markup:

- The vanilla renderer (`src/vanilla/renderer.ts`) writes text only through `textContent`
  (17 uses) and `createTextNode` (5 uses). There are no HTML-parsing sinks anywhere in `src/`.
- The React binding renders the same strings as JSX children, which React escapes.
- `dayMeta.tooltip`, `dots[].label` and the weekday `long` name become a `title` attribute
  (`setAttribute('title', …)` / the `title` property in the vanilla renderer, the `title` prop
  in React). Attribute values are not parsed as HTML either.

That covers `labels`, the header `title`, `dayMeta.note` / `badge` / `tooltip`, preset `label`
/ `hint`, `formatters` output and every attribute of `<nextgen-date-picker>`.

`dayMeta.note`, `badge` and `tooltip` are additionally shape-checked at the render boundary:
`metaText` in `src/vanilla/renderer.ts` and `dayMetaText` in `src/react/use-date-picker.ts`
accept a non-empty string or a finite number (rendered via `String()`) and drop anything else —
an object, a function or `NaN` in a `note` produces no node rather than `"[object Object]"`.

### The trust boundary that does exist: `dayMeta.style`, `dayMeta.className`, `dots[].color`

Three `DayMeta` fields (`src/core/types.ts`) are not text and reach the cell as CSS:

- `style` — the vanilla renderer (`metaStyle`, then the `setProperty` loop in
  `src/vanilla/renderer.ts`) accepts only a plain, non-array object and applies only its
  string- and number-valued entries with `CSSStyleDeclaration.setProperty`; the React binding
  (`dayMetaStyle` in `src/react/use-date-picker.ts`, used by `getDayProps`) filters the object the
  same way before passing it to the `style` prop. A `style` that is a string, an array or `null`
  is ignored in both.
- `className` — appended to the cell's class list only when it is a string; it is trimmed and an
  empty string adds nothing (`normalizeMeta` in the vanilla renderer, `dayClassName` in React).
- `dots[].color` — `dots` must be an array (`Array.isArray`); each entry must be a string or an
  object whose `color` is a string, `label` is kept only when it is a string, and the first 3
  valid dots are used (`MAX_DOTS = 3` in `metaDots` and `dayMetaDots`). The colour is written to
  `style.backgroundColor` on the dot element in both bindings.

That shape checking is about type, not content. CSS is not script: a string in `style` cannot run
code, exfiltrate data or make requests on its own. What it can do is take over layout — an
attacker who controls a `style` value can turn a day cell into a full-viewport overlay, hide or
mislabel neighbouring controls, or perform clickjacking-style tricks inside the host page. Treat
these three hooks exactly as you would a `style` or `className` prop on any element: **never
populate them from untrusted input.** The library does not sanitise CSS values because there is
no safe subset of CSS worth promising.

### Host-supplied functions

`presets[].getValue`, `presets[].isActive`, `formatters.*`, `labels.*` functions, `dayMeta`,
`isDateUnavailable`, every `on*` callback and every `subscribe` listener are host code. They run
with the host page's privileges and the library neither sandboxes nor validates what they do.
What it does guarantee is that none of them can take the picker down: every call site is guarded,
the failure is reported and a default is used.

| Member                               | Guard                                                                                                                                             | On throw / bad result                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `on*` callbacks (`onChange` and kin) | `invoke` in `src/core/engine.ts`; state is committed before the callback fires                                                                    | `console.error` naming `options.<name>`; the action that triggered it returns normally                                                                                    |
| `subscribe` listeners                | `notify` in `src/core/engine.ts`, iterating a copy of the set                                                                                     | `console.error` (`subscribe listener`); the remaining listeners still run                                                                                                 |
| `formatters.*`, `labels.*` functions | `readMember` + `guardTextFn` in `src/core/intl.ts` (`resolveFormatters` / `resolveLabels`); a getter or Proxy trap that throws reads as absent    | Throw, or a result that is not a string / number / bigint: `console.error` once per function (a `WeakSet`), then the default implementation answers for that call         |
| `dayMeta`                            | `try`/`catch` per cell in `buildMonths` (`src/core/calendar.ts`); a non-object result is ignored                                                  | `console.error` once per function; that cell renders without decoration                                                                                                   |
| `isDateUnavailable`                  | `evaluateCustom` in `src/core/constraints.ts`                                                                                                     | Fails **closed**: the day is treated as unavailable; `console.error` once per function                                                                                    |
| `presets[].getValue`                 | `safeGetValue` in `src/core/presets.ts` when presets are resolved for a snapshot; `normalizePresetResult` reads the returned shape inside a guard | `console.error` once per function and the chip is disabled; `applyPreset` in `src/core/engine.ts` additionally catches a throw and returns without changing the selection |
| `presets[].isActive`                 | `try`/`catch` in `isPresetActive` (`src/vanilla/renderer.ts`) and `getPresetProps` (`src/react/use-date-picker.ts`)                               | The chip renders inactive; not logged                                                                                                                                     |

`reportHostError` is the single `console.error` behind that table. Hot-path callers pass the
offending function so a formatter that fails for every cell is logged one time, not once per cell.

### Attribute parsing in the custom element

`<nextgen-date-picker>` (`src/vanilla/element.ts`) decodes attributes with a fixed switch over a
closed list of names (`OBSERVED`); unknown attributes produce nothing. Decoding uses `Number()`,
string comparison and, for list-valued attributes that start with `[`, a single `JSON.parse`. There
is no `eval`, no `Function` and no template evaluation.

Parsed entries are filtered by shape and never coerced: `toDateList` keeps only string entries,
`toDayOfWeekList` keeps strings and finite numbers (so both `"0,6"` and `[0,6]` work),
`toRangeList` keeps strings and plain objects (`isPlainObject`: prototype is `Object.prototype`
or `null`, not an array) whose `start` and `end` are both strings. Nothing else in a JSON array
is read, so a nested array or an object of any depth is dropped rather than stringified.

There is no explicit `__proto__` / `constructor` guard in `toList`, and none is needed for the way
the values are used: `JSON.parse` creates own properties rather than setting a prototype, and
only `start` and `end` are ever read. Setting
`blocked-ranges='[{"__proto__":{"polluted":true},"start":"2026-09-10","end":"2026-09-12"}]'` and
`disabled-dates='[{"__proto__":{"polluted":true}}]'` on a connected element leaves
`Object.prototype` untouched; the first yields the range `{start, end}` and the second yields
nothing. The `presets` attribute only resolves ids against the built-in table (`getPreset` in
`src/core/presets.ts`); unknown ids are dropped. The `for` attribute is passed to
`getElementById` and only an `<input>` is attached to.

`attributeChangedCallback` never throws into `window.onerror`: an attribute longer than
`MAX_ATTRIBUTE_LENGTH` is dropped before any parsing, and a decode or update failure is caught.
Both cases produce exactly one `console.error` naming the attribute (`reportAttribute`), and the
element keeps its previous state.

### Denial of service

Everything the library does is synchronous on the UI thread, so the exposure is a frozen page,
not a remote service. Every input that reaches a loop, a regular expression or an `Intl`
formatter is bounded as follows. Each bound is exercised by `tests/security.test.ts`, which runs
its heavy cases (100 kB and 1 MB strings, absurd numeric options) under a 2,000 ms wall-clock
budget (`BUDGET_MS`).

**Free-text parser (`src/core/parse.ts`)**

- `parseDateString` and `parseRangeString` return `null` for any string longer than
  `MAX_INPUT_LENGTH = 256` characters, checked before preprocessing or any regular expression
  runs. `engine.parseInput` calls these, so a 100 kB paste is refused in constant time.
- Within that length, tokenised input is rejected past 3 numeric or 8 named tokens
  (`parseNumericParts` / `parseNamedParts`).
- The quadratic patterns previously in this file are gone: edge punctuation is trimmed by a
  two-ended linear scan (`trimPunctuation`, one code point at a time against `NAME_CHARACTER`)
  and trailing sentence punctuation by `stripTrailing`, neither of which backtracks.

**Custom element attributes (`src/vanilla/element.ts`)**

- `MAX_ATTRIBUTE_LENGTH = 512 * 1024` characters (512 KiB). Longer values are rejected before
  parsing, both on first connection (`safeOptionsForAttribute`) and on change
  (`attributeChangedCallback`), with one `console.error`.
- `MAX_LIST_LENGTH = 10_000` entries, applied to JSON arrays, comma-separated lists and the
  `value` attribute in `multiple` mode before any per-entry work.
- `RANGE_SPLIT` has no leading `\s*`, so a whitespace-heavy `value` in range mode splits in
  linear time; parts are trimmed instead.

**Engine, calendar and constraints (`src/core`)**

- Every date the engine stores or navigates to is bounded to `MIN_YEAR = -270_000` …
  `MAX_YEAR = 274_000` (`src/core/intl.ts`, `clampYear`). `readDate` in `src/core/engine.ts`
  applies it to `today`, `month`, `defaultMonth`, the arguments of `select` / `hover` /
  `focusDate` / `goToMonth`, parser output, and every stored value (`normalizeBounded`).
  `resolveConstraints` clamps `minDate` / `maxDate` the same way and clips every epoch-day span
  (`blockedRanges`, disabled and enabled ranges) to `LOWEST_DAY` … `HIGHEST_DAY`
  (`src/core/constraints.ts`); every date a preset yields is clamped in `src/core/presets.ts`.
  The bounds stop short of the `Date` limit (±275,760) so derived dates — outside days, decade
  screens, the year list — still format without `Intl` throwing.
- `nextMonth(count)` / `previousMonth(count)` clamp their target through `clampYear`
  (`src/core/engine.ts`), so a huge count lands on the first or last _formattable_ month —
  years `-270000` / `274000`, `MIN_YEAR` / `MAX_YEAR` in `src/core/intl.ts`, kept inside the
  wider `Date`-representable range so the decade screen and the year list still format at the
  edge — rather than overflowing or being ignored; the count arithmetic itself is bounded by
  `MAX_NAVIGATION_MONTHS`.
- `numberOfMonths` is capped at `MAX_NUMBER_OF_MONTHS = 24` (`src/core/calendar.ts`, applied in
  `buildMonths` and in the engine's `buildSettings`).
- `yearRange` is capped at `MAX_YEAR_SPAN = 1_000` years on each side (`toReach` in
  `src/core/calendar.ts`), and `buildYearOptions` never lists a year outside
  `[MIN_YEAR, MAX_YEAR]`.
- `eachDayOfInterval` (`src/core/plain-date.ts`) returns an empty array when the span exceeds
  10,000 days.
- Day dots are capped at 3 (`MAX_DOTS` in both bindings).

**Still unbounded, by design**

Arrays passed as JavaScript options or element properties (`disabledDates`, `enabledDates`,
`blockedRanges`, `presets`, a `multiple`-mode `value`) have no length cap; `resolveConstraints`
walks them once per option change. These are host configuration written in code, not text an
end user can type or an attribute a template can inject, and a host that builds them from an
untrusted source should cap them first.

### Supply chain

- Zero runtime dependencies; the tarball (`files` in `package.json`, verified with
  `npm pack --dry-run`) contains only `dist/`, `README.md`, `LICENSE`,
  `THIRD-PARTY-NOTICES.md`, `CHANGELOG.md` and `package.json`.
- `package-lock.json` is committed and every workflow installs with `npm ci`.
- Releases are published with `npm publish --provenance` from `.github/workflows/release.yml`,
  so every version on npm carries a signed attestation linking it to the tag and workflow run
  that built it. The only secret in the project, `NPM_TOKEN`, lives in GitHub Actions secrets and
  is exposed to that single step.
- Every workflow declares least-privilege `permissions` (`contents: read` at the top level,
  elevated per job) and pins every action to a full commit SHA.
- `.github/workflows/ci.yml` runs an `audit` job on every push and pull request:
  `npm audit --omit=dev --audit-level=high` for the production tree and
  `npm audit --audit-level=critical` for the whole tree. At the time of writing
  `npm audit --omit=dev` reports 0 vulnerabilities and the full tree reports **3 moderate**
  advisories, all one issue: GHSA-82fw-gwwq-j7x9, a path-traversal / arbitrary-file-read in
  `@vitest/mocker`, reported through `vitest`, `@vitest/mocker` and `@vitest/coverage-v8`
  (installed at 3.2.7). The advisory's vulnerable range is `>=2.1.0 <4.1.11`, and the fix
  `npm audit` offers is `vitest@5.0.0`, a semver-major upgrade, which is why it has not been
  applied by a routine bump. The test runner never ships and is only reachable by someone who
  can already run the test suite locally.
- `.github/workflows/codeql.yml` runs CodeQL with the `security-extended` query suite on every
  push to `main`, every pull request and weekly.
- `.github/dependabot.yml` opens weekly update PRs for npm packages and GitHub Actions; the SHA
  pins are updated by the same PRs.
- Git history has been scanned for committed secrets; none were found.

## The demo site

The demo at <https://karthikbaikati.github.io/datepicker-nextgen/> is a static Vite build
(`demo/`) deployed by `.github/workflows/pages.yml` after each release workflow completes (or
by manual dispatch), after the same lint, typecheck and test gates as CI.

- **HTTPS**: `http://` requests receive a `301` to `https://` (verified with `curl -I`). The CSP
  below also carries `upgrade-insecure-requests`.
- **Content Security Policy**: GitHub Pages cannot send response headers, so
  `vite.config.ts` injects the policy as a `<meta http-equiv>` tag at build time. The one inline
  script (the dark-mode flash preventer) is allow-listed by a SHA-256 hash computed over the
  emitted body, and the build fails if a second inline script or any `style="…"` attribute
  appears. The policy is:

  ```
  default-src 'none';
  script-src 'self' 'sha256-…';
  style-src 'self' https://fonts.googleapis.com;
  font-src https://fonts.gstatic.com;
  img-src 'self' data:;
  connect-src 'none';
  base-uri 'none';
  form-action 'none';
  object-src 'none';
  upgrade-insecure-requests
  ```

  No `'unsafe-inline'` or `'unsafe-eval'` anywhere. The library and the demo style elements
  through the CSSOM, which `style-src` does not govern, so inline styles are not needed.

- **Referrer policy**: `<meta name="referrer" content="strict-origin-when-cross-origin">`,
  injected by the same plugin.

Two things GitHub Pages genuinely cannot provide, stated as limitations rather than hidden:

- **No HSTS.** Project sites on `*.github.io` send no `Strict-Transport-Security` header
  (verified with `curl -I` on the live site) and Pages offers no way for a site to add one. The
  `github.io` domain is **not on the HSTS preload list** — only `github.com` is (checked against
  <https://hstspreload.org>, which reports `github.io` as `unknown` and `github.com` as
  `preloaded`) — so a visitor's very first plain-`http://` request relies solely on the `301`
  redirect, which a hostile network could intercept before the browser ever sees the secure
  page. The `301` and `upgrade-insecure-requests` cover every later request and every
  sub-resource, but not that first navigation. Mitigation: every published link to the demo
  uses `https://` (the README's "Live demo" link; no `http://` link to the site exists in
  `README.md`, `CHANGELOG.md`, `package.json` or `demo/index.html`), so a visitor who follows a
  link never makes the plain request.
- **No clickjacking protection.** The CSP specification ignores `frame-ancestors` when the
  policy is delivered in a `<meta>` tag, and `X-Frame-Options` is header-only. The demo can be
  framed by any origin. It is deliberately omitted from the meta policy so the document does not
  claim a protection it cannot enforce. The demo holds no state and submits nothing
  (`form-action 'none'`), so there is nothing for a framing page to hijack.

## The checklist, item by item

| #   | Item                          | Status                  | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Hide API keys                 | Done                    | The project has exactly one secret, `NPM_TOKEN`; it lives in GitHub Actions secrets, reaches only the `npm publish` step of `release.yml`, and nothing in the repo, bundle or demo contains a key.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2   | Purge secrets from Git        | Done                    | Every commit in history has been scanned; no secret has ever been committed, so there is nothing to purge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 3   | Expose only the public DB key | Not applicable          | There is no database and no database client; this would apply only if the demo or library talked to a hosted data service, which neither does.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 4   | Enable row-level security     | Not applicable          | No database, so there are no rows and no policies to attach to them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 5   | Encrypt sensitive data        | Not applicable          | The library stores and transmits nothing; the only data it holds is the in-memory date selection, which the host reads through `onChange` and is responsible for from there.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 6   | Enforce server-side auth      | Not applicable          | There is no server, no accounts and no protected resource; this would apply only if a backend existed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 7   | Lock record access            | Not applicable          | No records exist; see items 4 and 6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 8   | Block field tampering         | Not applicable          | Constraint checks in `src/core/constraints.ts` reject a disabled date even if the DOM is tampered with, but that is a UX guard; the host's own server must re-validate any submitted date, because everything in this package runs in the user's browser.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 9   | Secure session cookies        | Not applicable          | No sessions and zero uses of `document.cookie`; the demo sets no cookies and the CSP denies all `connect-src`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 10  | Hash passwords                | Not applicable          | No accounts and no passwords anywhere in the project.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 11  | Rate limit login              | Not applicable          | No login exists to rate-limit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 12  | Add bot protection            | Not applicable          | Nothing accepts a submission: the library emits events to host code and the demo's CSP sets `form-action 'none'`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 13  | Parameterize queries          | Not applicable          | No queries of any kind are constructed; there is no SQL, no query language and no interpreter fed by strings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 14  | Validate all input            | Done                    | `toPlainDate` (`src/core/plain-date.ts`) returns `null` for a non-integer `year` / `month` / `day` (`Number.isInteger`, which also rejects `NaN` and `±Infinity`), for a year outside what `Date` represents (`-271820` … `275759`) and for an unparseable string or number; `plainDate()` truncates fractional arguments. The engine then clamps every accepted date to `[-270000, 274000]` (`readDate`). Numbers pass `Number.isFinite`; the parser refuses text over 256 characters; attributes go through a closed switch with `JSON.parse` only, a 512 KiB length cap, a 10,000-entry list cap and shape filtering. The three CSS hooks in item 15 are type-checked, not content-validated. |
| 15  | Escape user content           | Done                    | Every string is rendered via `textContent`, `createTextNode`, React escaping or a plain attribute; the only non-text sinks are `dayMeta.style`, `dayMeta.className` and `dots[].color`, which are shape-checked in both renderers and documented above as host-trusted CSS.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 16  | Restrict file uploads         | Not applicable          | No upload control, no `<input type="file">` and no server to receive one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 17  | Trim API responses            | Not applicable          | There is no API; the nearest analogue, the npm tarball, is limited by the `files` allowlist to `dist/`, the licence and the docs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 18  | Add security headers          | Partial-with-limitation | A strict hashed CSP and a referrer policy are injected as `<meta>` tags at build; GitHub Pages cannot send HSTS, `X-Frame-Options` or a header CSP, so `frame-ancestors` protection is not available on the demo.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 19  | Force HTTPS                   | Done                    | `http://` requests to the demo receive a `301` to `https://`, and the CSP adds `upgrade-insecure-requests` for every sub-resource. Caveat: `github.io` is not HSTS-preloaded and Pages sends no HSTS header, so the very first plain-`http://` navigation is protected only by that redirect; every published link uses `https://`.                                                                                                                                                                                                                                                                                                                                                              |
| 20  | Scan dependencies             | Done                    | Zero runtime dependencies; committed lockfile; `npm audit` gate in CI (production tree clean, 3 moderate dev-only advisories, all GHSA-82fw-gwwq-j7x9 in the test runner); CodeQL `security-extended` on every push to `main`, PR and weekly; Dependabot for npm and Actions; every action pinned to a commit SHA.                                                                                                                                                                                                                                                                                                                                                                               |
