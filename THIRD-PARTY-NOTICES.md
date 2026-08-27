# Third-party notices

`datepicker-nextgen` is released under the [MIT License](./LICENSE) and ships with
**zero runtime dependencies** — nothing in `dist/` contains third-party code. The
notices below cover the small number of external works the project draws on, so
that anyone auditing the package has the full picture in one place.

## Bundled in the published package

None. The `files` field publishes only `dist/`, `README.md`, `LICENSE`,
`CHANGELOG.md` and this file, and `dist/` is compiled entirely from
first-party source in `src/`.

## Algorithms

### Howard Hinnant's civil-calendar algorithms

`src/core/plain-date.ts` implements `days_from_civil` and `civil_from_days` from
Howard Hinnant's "chrono-Compatible Low-Level Date Algorithms".

> <https://howardhinnant.github.io/date_algorithms.html>

The author places these algorithms in the public domain. They are reimplemented
here in TypeScript rather than copied, and are credited in the source.

### mulberry32

`demo/src/travel/scenery.tsx` (demo only — never published to npm) uses the
mulberry32 pseudo-random generator to place scenery deterministically. It is a
widely circulated public-domain snippet.

## Documents

### Contributor Covenant

[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) is adapted from the
[Contributor Covenant](https://www.contributor-covenant.org), version 2.1, which
is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The adaptation is attributed inside that file, as the licence requires.

## Demo site only — not part of the npm package

The showcase at `demo/` is published to GitHub Pages and is **not** included in
the npm package.

### Google Fonts

The demo loads two typefaces from Google Fonts by `<link>`; neither is
redistributed in this repository or in the package.

| Font     | Licence                   |
| -------- | ------------------------- |
| Fraunces | SIL Open Font License 1.1 |
| Inter    | SIL Open Font License 1.1 |

### Imagery

Every illustration on the demo — the coastal scene and the listing artwork — is
original inline SVG generated from first-party code. No photographs, stock
imagery, icon sets or traced assets are used anywhere in this repository.

## Development dependencies

Build and test tooling is not distributed with the package. At the time of
writing the installed tree resolves to MIT, ISC, Apache-2.0, BSD-2-Clause,
BSD-3-Clause, BlueOak-1.0.0, MIT-0, Python-2.0 and CC-BY-4.0 — all permissive,
with no copyleft (GPL / AGPL / SSPL) licences present.
