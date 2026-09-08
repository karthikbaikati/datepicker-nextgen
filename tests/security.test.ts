/**
 * Adversarial input-validation ("fuzz") suite for the public API.
 *
 * The library is client-side only, so its whole threat model is *what a host
 * application hands it*: free text typed or pasted into an input, attribute
 * strings on `<nextgen-date-picker>`, JSON that came off the wire, and the
 * callbacks and option objects a consumer wires up. This suite proves four
 * properties across all of those entry points:
 *
 *   1. it never throws uncaught,
 *   2. it never renders or executes untrusted input as markup,
 *   3. it never pollutes prototypes,
 *   4. it never hangs — a quadratic regex or an uncapped loop is a denial of
 *      service in a UI thread, so every heavy case is wall-clock budgeted.
 *
 * A failing test here documents a real gap; each one is marked `FINDING:` with
 * the measured behaviour and a one-line repro. Tests are not weakened to pass.
 */

import { render } from '@testing-library/react';
import { createElement } from 'react';
import type { ButtonHTMLAttributes, ReactElement } from 'react';
// Registers the DOM matchers used below. `tests/setup.ts` loads them for the
// suite; importing here keeps the file typecheckable on its own.
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDatePicker as createEngine } from '../src/core/engine';
import { parseDateString, parseRangeString } from '../src/core/parse';
import type { ParseOptions } from '../src/core/parse';
import {
  daysInMonth,
  fromEpochDay,
  plainDate,
  toDate,
  toEpochDay,
  toPlainDate,
} from '../src/core/plain-date';
import { normalizeValueInput } from '../src/core/selection';
import type {
  CalendarSnapshot,
  DatePickerEngineApi,
  DateRange,
  DayMeta,
  EngineOptions,
  Formatters,
  Labels,
  PlainDate,
  SelectionMode,
  SelectionValue,
} from '../src/core/types';
import { DatePicker } from '../src/react/components/date-picker';
import type { DatePickerProps } from '../src/react/components/date-picker';
import { useDatePicker } from '../src/react/use-date-picker';
import { defineDatePickerElement, parseValueAttribute } from '../src/vanilla/element';
import type { DatePickerElement } from '../src/vanilla/element';
import { attachDatePicker, createDatePicker } from '../src/vanilla/mount';
import type { DatePickerInstance, VanillaOptions } from '../src/vanilla/mount';

/* -------------------------------------------------------------------------- */
/*                                  Fixtures                                  */
/* -------------------------------------------------------------------------- */

/** 2026-09-04 is a Friday; September 2026 starts on a Tuesday. */
const TODAY: PlainDate = plainDate(2026, 9, 4);

const sep = (day: number): PlainDate => plainDate(2026, 9, day);

const PARSE: ParseOptions = { locale: 'en-US', today: TODAY, firstDayOfWeek: 0 };

/** A hang is a finding: nothing a host can pass may block the UI thread this long. */
const BUDGET_MS = 2_000;

const KB = 1_024;
const MB = 1_024 * KB;

vi.setConfig({ testTimeout: BUDGET_MS });

/** Wall-clock milliseconds `fn` took. A throw propagates and fails the test on its own. */
function elapsed(fn: () => unknown): number {
  const started = performance.now();
  fn();
  return performance.now() - started;
}

const json = (text: string): unknown => JSON.parse(text);

const engine = (options: EngineOptions = {}): DatePickerEngineApi =>
  createEngine({ today: TODAY, locale: 'en-US', ...options });

/**
 * A `PlainDate` is only usable downstream if `Intl` can format it, which means
 * `toDate` must produce a real `Date`: anything else throws `RangeError` from
 * every formatter the moment it is rendered.
 */
function isUsableDate(value: unknown): value is PlainDate {
  if (typeof value !== 'object' || value === null) return false;
  const { year, month, day } = value as PlainDate;
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    !Number.isNaN(toDate({ year, month, day }).getTime())
  );
}

/** Every `PlainDate` a renderer would read out of a snapshot. */
function datesIn(snapshot: CalendarSnapshot): unknown[] {
  const out: unknown[] = [
    snapshot.today,
    snapshot.focusedDate,
    snapshot.value.range.start,
    snapshot.value.range.end,
    ...snapshot.value.dates,
  ];
  if (snapshot.hoveredDate) out.push(snapshot.hoveredDate);
  if (snapshot.anchor) out.push(snapshot.anchor);
  for (const month of snapshot.months) {
    out.push(month.date);
    for (const day of month.days) out.push(day.date);
  }
  return out.filter((date) => date !== null);
}

function expectSnapshotSane(snapshot: CalendarSnapshot): void {
  for (const date of datesIn(snapshot)) {
    expect(isUsableDate(date), `unusable PlainDate in snapshot: ${JSON.stringify(date)}`).toBe(
      true,
    );
  }
}

function expectParsed(result: PlainDate | null): void {
  if (result === null) return;
  expect(isUsableDate(result), JSON.stringify(result)).toBe(true);
}

function expectParsedRange(result: DateRange | null): void {
  if (result === null) return;
  if (result.start !== null) expectParsed(result.start);
  if (result.end !== null) expectParsed(result.end);
}

/**
 * Custom-element reactions and DOM event listeners run inside the DOM, where an
 * exception is *reported* (window `error` event, console) rather than thrown to
 * the caller. That is exactly an "uncaught" error in production, so it is
 * captured here and asserted on.
 */
function windowErrorsDuring(fn: () => void): string[] {
  const errors: string[] = [];
  const onError = (event: ErrorEvent): void => {
    errors.push(String(event.error ?? event.message));
    event.preventDefault();
  };
  window.addEventListener('error', onError);
  try {
    fn();
  } finally {
    window.removeEventListener('error', onError);
  }
  return errors;
}

/** React reports render errors to `console.error` before rethrowing; keep the log readable. */
function quietly<T>(fn: () => T): T {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

/* --------------------------------- mounts --------------------------------- */

defineDatePickerElement();

const mounted: { instance?: DatePickerInstance; host: HTMLElement }[] = [];

function mountVanilla(options: VanillaOptions = {}): {
  instance: DatePickerInstance;
  host: HTMLElement;
} {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const instance = createDatePicker(host, { today: TODAY, locale: 'en-US', ...options });
  const entry = { instance, host };
  mounted.push(entry);
  return entry;
}

function mountElement(attributes: Record<string, string>): DatePickerElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const element = document.createElement('nextgen-date-picker') as DatePickerElement;
  element.setAttribute('today', '2026-09-04');
  element.setAttribute('locale', 'en-US');
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  host.appendChild(element);
  mounted.push({ host });
  return element;
}

function observedAttributes(): readonly string[] {
  const ctor = customElements.get('nextgen-date-picker');
  const list: unknown = ctor ? Reflect.get(ctor, 'observedAttributes') : undefined;
  return Array.isArray(list) ? (list as readonly string[]) : [];
}

function mountReact(props: Partial<DatePickerProps> = {}): HTMLElement {
  const { container } = render(
    createElement(DatePicker, { today: TODAY, locale: 'en-US', autoApply: true, ...props }),
  );
  return container;
}

/** A headless consumer: `useDatePicker` + `getDayProps` spread straight onto buttons. */
function Headless(props: { options: EngineOptions }): ReactElement {
  const picker = useDatePicker(props.options);
  const month = picker.snapshot.months[0];
  return createElement(
    'div',
    picker.getRootProps(),
    month?.days.map((day) =>
      createElement(
        'button',
        {
          ...(picker.getDayProps(day) as unknown as ButtonHTMLAttributes<HTMLButtonElement>),
          key: day.key,
        },
        day.label,
      ),
    ),
  );
}

afterEach(() => {
  while (mounted.length > 0) {
    const entry = mounted.pop();
    if (!entry) continue;
    try {
      entry.instance?.destroy();
    } catch {
      /* already destroyed by the test itself */
    }
    entry.host.remove();
  }
  document.body.textContent = '';
});

/* -------------------------------------------------------------------------- */
/*                         1. Strings into the parser                         */
/* -------------------------------------------------------------------------- */

/** Zero code points of every numbering system the parser claims to normalize, plus a few it does not. */
const DIGIT_ZEROS: readonly [name: string, zero: number][] = [
  ['Arabic-Indic', 0x0660],
  ['Extended Arabic-Indic', 0x06f0],
  ['Devanagari', 0x0966],
  ['Bengali', 0x09e6],
  ['Gurmukhi', 0x0a66],
  ['Gujarati', 0x0ae6],
  ['Oriya', 0x0b66],
  ['Tamil', 0x0be6],
  ['Telugu', 0x0c66],
  ['Kannada', 0x0ce6],
  ['Malayalam', 0x0d66],
  ['Thai', 0x0e50],
  ['Lao', 0x0ed0],
  ['Tibetan', 0x0f20],
  ['Myanmar', 0x1040],
  ['Khmer', 0x17e0],
  ['Fullwidth', 0xff10],
  ['Mongolian', 0x1810],
  ['Mathematical bold', 0x1d7ce],
  ['Osmanya', 0x104a0],
];

function inDigits(text: string, zero: number): string {
  return text.replace(/\d/g, (digit) => String.fromCodePoint(zero + Number(digit)));
}

const HOSTILE_STRINGS: readonly string[] = [
  '',
  ' ',
  '\0',
  '\0\0\0today\0',
  'today\u0000<script>',
  '\u202e4202-90-60',
  '\u202d2026-09-04\u202c',
  '\u2066\u2067\u2068\u2069',
  '\u200d\u200d\u200d',
  '2026\u200d-09\u200c-04\u200b',
  '\ufeff2026-09-04',
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  "' OR 1=1 --",
  '"; DROP TABLE dates; --',
  '${7*7}',
  '{{7*7}}',
  '#{7*7}',
  '%s%s%s%n',
  '../../etc/passwd',
  'NaN',
  'Infinity',
  '-Infinity',
  '-0',
  '1e309',
  '0x41',
  '2026-13-45',
  '2026-02-30',
  '2026-00-00',
  '0000-00-00',
  '9999999999-01-01',
  '+275760-09-13',
  '-271821-04-20',
  '2026-09-04T00:00:00+99:99',
  '2026-09-04T25:61:61Z',
  '2026-09-04T00:00:00-24:00',
  '2026-09-04T00:00:00.999999999999999999999Z',
  'in 9999 days',
  'in 99999 days',
  '+9999y',
  // FINDING: both of the next two return `{ year: -7973, month: -3, day: 4 }`.
  // `addMonths` computes `month = (total % 12) + 1`, and JS `%` keeps the sign
  // of a negative `total`, so any result before year 0 gets a month in -10..0.
  // The natural-language layer returns `shift()` output without the `makeDate`
  // validation the numeric layers get, so the invalid date is handed straight
  // to the caller — and `engine.parseInput('-9999y')` selects it.
  // Repro: parseDateString('-9999y', { locale: 'en-US', today, firstDayOfWeek: 0 })
  //        addMonths({ year: 1, month: 1, day: 1 }, -13) → { year: -1, month: 0, day: 1 }
  '-9999y',
  '9999 years ago',
  'next next next next friday',
  'sep 4 – sep 4 – sep 4 – sep 4',
  '9/4 - 9/5 - 9/6 - 9/7',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!',
];

describe('parser: hostile strings', () => {
  it.each(HOSTILE_STRINGS.map((text) => [JSON.stringify(text), text]))(
    'parseDateString / parseRangeString survive %s',
    (_label, text) => {
      let date: PlainDate | null = null;
      let range: DateRange | null = null;
      expect(() => {
        date = parseDateString(text, PARSE);
        range = parseRangeString(text, PARSE);
      }).not.toThrow();
      expectParsed(date);
      expectParsedRange(range);
    },
  );

  it('treats non-string input as unparseable instead of throwing', () => {
    for (const input of [null, undefined, 42, {}, [], () => 'today', Symbol('x'), 1n]) {
      expect(parseDateString(input as never, PARSE)).toBeNull();
      expect(parseRangeString(input as never, PARSE)).toBeNull();
    }
  });

  it('survives garbage parse options', () => {
    const options = {
      locale: '\u0000x-INVALID-@@',
      today: TODAY,
      firstDayOfWeek: Number.NaN,
      preferFuture: 'yes',
    } as unknown as ParseOptions;
    expect(() => parseDateString('next friday', options)).not.toThrow();
    expectParsed(parseDateString('next friday', options));
    expect(() => parseRangeString('sep 4 to sep 9', options)).not.toThrow();
  });

  it.each(DIGIT_ZEROS)(
    'digits in %s either normalize to the same date or fail closed',
    (_name, zero) => {
      for (const shape of ['2026-09-04', '9/4/2026', 'sep 4 2026', '20260904']) {
        const result = parseDateString(inDigits(shape, zero), PARSE);
        expectParsed(result);
        // Digit normalization must never invent a *different* date.
        if (result) expect(result).toEqual(TODAY);
      }
    },
  );

  // FINDING: fails on '-9999y' / '9999 years ago' — see the note in
  // HOSTILE_STRINGS. The engine's `pick()` trusts the parser, so the month -3
  // value lands in `snapshot.value` and in every consumer's `onChange`.
  it('never lets a parse result reach the engine as an unusable date', () => {
    const picker = engine({ mode: 'range' });
    for (const text of HOSTILE_STRINGS) {
      expect(() => picker.parseInput(text)).not.toThrow();
      expectSnapshotSane(picker.getSnapshot());
    }
  });
});

describe('parser: long input', () => {
  /** Shapes that exercise every regex in `parse.ts` without a quadratic blow-up. */
  const LINEAR_SHAPES: readonly [name: string, build: (n: number) => string][] = [
    ['digits', (n) => '1'.repeat(n)],
    ['spaces', (n) => ' '.repeat(n)],
    ['null bytes', (n) => '\0'.repeat(n)],
    ['words', (n) => 'a '.repeat(n / 2)],
    ['dots', (n) => '.'.repeat(n)],
    ['slashes', (n) => '/'.repeat(n)],
    ['arabic digits', (n) => '١'.repeat(n)],
    ['combining marks', (n) => 'é'.repeat(n / 2)],
    ['bidi marks', (n) => '\u202e'.repeat(n)],
    ['CJK date markers', (n) => '1年'.repeat(n / 2)],
    ['"sep 4 " repeated', (n) => 'sep 4 '.repeat(n / 6)],
    ['" to " repeated', (n) => ' to '.repeat(n / 4)],
    ['ISO date + trailing digits', (n) => `2026-09-04T10:00:00.${'1'.repeat(n)}`],
    ['"+" then digits', (n) => `+${'9'.repeat(n)}d`],
    ['"in " then digits', (n) => `in ${'9'.repeat(n)} days`],
    ['ordinal suffixes', (n) => "'".repeat(n / 2) + '4th'],
    ['one huge word', (n) => 'a'.repeat(n)],
  ];

  it.each(LINEAR_SHAPES)('parses 100 kB of %s within budget', (_name, build) => {
    const text = build(100 * KB);
    let date: PlainDate | null = null;
    let range: DateRange | null = null;
    const ms = elapsed(() => {
      date = parseDateString(text, PARSE);
      range = parseRangeString(text, PARSE);
    });
    expect(ms).toBeLessThan(BUDGET_MS);
    expectParsed(date);
    expectParsedRange(range);
  });

  it.each(LINEAR_SHAPES)('parses 1 MB of %s within budget', (_name, build) => {
    const text = build(MB);
    const ms = elapsed(() => {
      parseDateString(text, PARSE);
      parseRangeString(text, PARSE);
    });
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  // FINDING: quadratic backtracking on a long punctuation run ending in a letter.
  // `parseNatural` runs `/[.,!?]+$/` over the whole input and `weekdayMatch(raw)`
  // then runs `EDGE_PUNCTUATION` (`[^\p{L}\p{N}\p{M}]+$`) over it again; both are
  // an unanchored greedy class followed by `$`, so every start position re-scans
  // the run: O(n²). Measured: 10 kB → 50 ms, 20 kB → 193 ms, 100 kB → ~5 s;
  // 1 MB extrapolates to minutes and is deliberately not run here because a
  // synchronous hang cannot be interrupted by the test timeout.
  // Repro: parseDateString('!'.repeat(100_000) + 'a', { locale: 'en-US', today, firstDayOfWeek: 0 })
  // Reachable from `engine.parseInput(text)` and therefore from paste into any
  // `attachDatePicker` input or `getInputProps()` field.
  it('parses 100 kB of punctuation followed by a letter within budget', () => {
    const text = '!'.repeat(100 * KB) + 'a';
    const ms = elapsed(() => parseDateString(text, PARSE));
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  // FINDING: `parseRangeString` falls back to splitting on *every* bare hyphen
  // and re-parses the O(n) prefix for each one, so a run of hyphens costs O(n²).
  // Measured: 5 kB → 52 ms, 10 kB → 195 ms, 20 kB → 697 ms, 100 kB → ~17 s.
  // Repro: parseRangeString('-'.repeat(100_000), { locale: 'en-US', today, firstDayOfWeek: 0 })
  // Reachable from `engine.parseInput(text)` in any range-like mode.
  it('parses 100 kB of hyphens as a range within budget', () => {
    const text = '-'.repeat(100 * KB);
    const ms = elapsed(() => parseRangeString(text, PARSE));
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  // FINDING: same root cause as above, exercised through the public engine API
  // exactly the way a paste into a bound `<input>` reaches it.
  it('engine.parseInput survives a 100 kB paste within budget', () => {
    const picker = engine({ mode: 'range' });
    const ms = elapsed(() => {
      picker.parseInput('!'.repeat(50 * KB) + 'a');
      picker.parseInput('-'.repeat(50 * KB));
    });
    expect(ms).toBeLessThan(BUDGET_MS);
    expectSnapshotSane(picker.getSnapshot());
  });
});

/* -------------------------------------------------------------------------- */
/*                            2. Dates at the edges                           */
/* -------------------------------------------------------------------------- */

describe('dates at the edges', () => {
  const STRUCTURAL_GARBAGE: readonly [label: string, input: unknown][] = [
    ['year NaN', { year: Number.NaN, month: 9, day: 4 }],
    ['month NaN', { year: 2026, month: Number.NaN, day: 4 }],
    ['day NaN', { year: 2026, month: 9, day: Number.NaN }],
    ['year Infinity', { year: Number.POSITIVE_INFINITY, month: 1, day: 1 }],
    ['year -Infinity', { year: Number.NEGATIVE_INFINITY, month: 1, day: 1 }],
    ['year -0', { year: -0, month: 1, day: 1 }],
    ['Feb 30', { year: 2026, month: 2, day: 30 }],
    ['Feb 29 non-leap', { year: 2026, month: 2, day: 29 }],
    ['month 13', { year: 2026, month: 13, day: 1 }],
    ['month 0', { year: 2026, month: 0, day: 1 }],
    ['month -1', { year: 2026, month: -1, day: 1 }],
    ['day 0', { year: 2026, month: 9, day: 0 }],
    ['day -1', { year: 2026, month: 9, day: -1 }],
    ['day 1e6', { year: 2026, month: 9, day: 1e6 }],
    // FINDING: `toPlainDate` only checks `Number.isFinite`, never integrality,
    // and `plainDate()` does float arithmetic on the fields, so a fractional
    // input produces a fractional date: `{ year: 2027, month: 4, day: 1.5999… }`.
    // From there `toISODate` emits `2027-04-1.599999999976717` as the cell key
    // and `data-date`, `fromISODate` can no longer read it back, and every grid
    // cell built from that view month carries a fractional epoch day.
    // Repro: toPlainDate({ year: 2026.5, month: 9.9, day: 4.1 })
    //        createDatePicker({ today }).select({ year: 2026, month: 9, day: 4.5 })
    ['fractional fields', { year: 2026.5, month: 9.9, day: 4.1 }],
    ['string fields', { year: '2026', month: '9', day: '4' }],
    ['new Date(NaN)', new Date(Number.NaN)],
    ['number NaN', Number.NaN],
    ['number Infinity', Number.POSITIVE_INFINITY],
    ['number -0', -0],
    ['number 8.65e15 (past Date range)', 8.65e15],
    ['absurd positive offset', '2026-09-04T00:00:00+99:99'],
    ['absurd negative offset', '2026-09-04T00:00:00-24:00'],
    ['absurd time of day', '2026-09-04T25:61:61Z'],
    ['ISO Feb 30', '2026-02-30'],
    ['ISO month 13', '2026-13-01'],
    ['ISO day 0', '2026-09-00'],
    ['empty string', ''],
    ['whitespace', '   '],
    ['null', null],
    ['undefined', undefined],
    ['boolean', true],
    ['array', [2026, 9, 4]],
    ['nested object', { date: { year: 2026, month: 9, day: 4 } }],
  ];

  it.each(STRUCTURAL_GARBAGE)('toPlainDate(%s) returns null or a usable date', (_label, input) => {
    let result: PlainDate | null = null;
    expect(() => {
      result = toPlainDate(input as never);
    }).not.toThrow();
    if (result !== null) expect(isUsableDate(result)).toBe(true);
  });

  it.each(STRUCTURAL_GARBAGE)('engine actions ignore or normalize %s', (_label, input) => {
    const picker = engine({ mode: 'range' });
    expect(() => {
      picker.select(input as never);
      picker.hover(input as never);
      picker.focusDate(input as never);
      picker.goToMonth(input as never);
      picker.setValue(input as never);
      picker.setValue({ start: input, end: input } as never);
      picker.setValue([input, input] as never);
      picker.zoomIn(input as never);
    }).not.toThrow();
    expectSnapshotSane(picker.getSnapshot());
  });

  it.each(STRUCTURAL_GARBAGE)('engine options accept %s without throwing', (_label, input) => {
    expect(() => {
      const picker = createEngine({
        today: input as never,
        month: input as never,
        defaultMonth: input as never,
        minDate: input as never,
        maxDate: input as never,
        value: input as never,
        disabledDates: [input as never],
        enabledDates: [input as never],
        blockedRanges: [{ start: input as never, end: input as never }],
      });
      expectSnapshotSane(picker.getSnapshot());
      picker.nextMonth();
      picker.previousMonth();
      picker.goToToday();
      expectSnapshotSane(picker.getSnapshot());
    }).not.toThrow();
  });

  // FINDING: `plainDate` accepts any integer year, but every formatter runs the
  // result through `toDate()` + `Intl.DateTimeFormat`, and `Date` only reaches
  // ±275,760 years. Past that, `new Date(...).setFullYear` yields an Invalid
  // Date and `format()` throws `RangeError: Invalid time value` out of
  // `getSnapshot()` (via `formatters.monthYear`/`day`/`year`) and out of
  // `select()` (via `describe()` → `formatters.summary`). `yearRange` walks the
  // same path: `buildYearOptions` formats `view.year ± yearRange`.
  // Repro: createDatePicker({ today: { year: 1e9, month: 1, day: 1 } }).getSnapshot()
  //        createDatePicker({ today }).select({ year: 275760, month: 10, day: 1 })
  //        createDatePicker({ today, yearRange: 1e6 }).getSnapshot()
  const ABSURD_YEARS: readonly [label: string, options: EngineOptions][] = [
    [
      'today at year 275760 (past the Date ceiling)',
      { today: { year: 275760, month: 10, day: 1 } },
    ],
    ['today at year 1e9', { today: { year: 1e9, month: 1, day: 1 } }],
    ['today at year -1e9', { today: { year: -1e9, month: 1, day: 1 } }],
    ['controlled month at year 1e9', { month: { year: 1e9, month: 1, day: 1 } }],
    ['default month at year 275760', { defaultMonth: { year: 275760, month: 9, day: 30 } }],
    ['value at year 1e9', { value: { year: 1e9, month: 1, day: 1 } }],
    ['timestamp at the Date ceiling', { defaultValue: 8.64e15 }],
    ['yearRange 1e6', { yearRange: 1e6 }],
  ];

  it.each(ABSURD_YEARS)('does not throw from getSnapshot with %s', (_label, options) => {
    let picker: DatePickerEngineApi | null = null;
    expect(() => {
      picker = engine(options);
      picker.getSnapshot();
    }).not.toThrow();
    if (picker) expectSnapshotSane((picker as DatePickerEngineApi).getSnapshot());
  });

  it.each([
    ['select', (p: DatePickerEngineApi, d: PlainDate) => p.select(d)],
    ['setValue', (p: DatePickerEngineApi, d: PlainDate) => p.setValue(d)],
    ['goToMonth', (p: DatePickerEngineApi, d: PlainDate) => p.goToMonth(d)],
    ['focusDate', (p: DatePickerEngineApi, d: PlainDate) => p.focusDate(d)],
    ['hover', (p: DatePickerEngineApi, d: PlainDate) => p.hover(d)],
  ] as const)('does not throw from %s with a year past the Date ceiling', (_label, act) => {
    for (const year of [275760, 1e9, -1e9]) {
      const picker = engine({ mode: 'range' });
      expect(() => act(picker, { year, month: 10, day: 1 })).not.toThrow();
      expect(() => picker.getSnapshot()).not.toThrow();
      expectSnapshotSane(picker.getSnapshot());
    }
  });

  it('keeps years 0 and -1 usable end to end', () => {
    for (const year of [0, -1]) {
      const picker = engine({ today: { year, month: 6, day: 15 } });
      expect(() => picker.getSnapshot()).not.toThrow();
      expectSnapshotSane(picker.getSnapshot());
      picker.select({ year, month: 6, day: 15 });
      picker.nextMonth();
      picker.previousMonth(2);
      expectSnapshotSane(picker.getSnapshot());
    }
  });

  // FINDING: the epoch-day conversion is wrong for every date before
  // 0000-03-01. Hinnant's algorithms adjust negative values (`y - 399`,
  // `z - 146096`) to emulate floor with C's truncating division; `plain-date.ts`
  // keeps those adjustments *and* uses `Math.floor`, so negative eras are
  // over-corrected by one. Consequence: `plainDate(0, 1, 1)` returns
  // `{ year: 0, month: 1, day: 2 }`, `plainDate(-1, 12, 31)` returns
  // `{ year: 0, month: 1, day: 1 }`, and `toEpochDay(fromEpochDay(n)) !== n`
  // for n < -719468. Dates rendered for years <= 0 are silently off by a day.
  // Repro: plainDate(0, 1, 1) → { year: 0, month: 1, day: 2 }
  it('round-trips epoch days and calendar fields for years 0 and -1', () => {
    const wrong: string[] = [];
    for (let year = -5; year <= 5; year += 1) {
      for (const [month, day] of [
        [1, 1],
        [2, 28],
        [3, 1],
        [12, 31],
      ] as const) {
        const built = plainDate(year, month, day);
        if (built.year !== year || built.month !== month || built.day !== day) {
          wrong.push(`plainDate(${year}, ${month}, ${day}) → ${JSON.stringify(built)}`);
        }
      }
    }
    for (let epoch = -720_000; epoch <= -719_000; epoch += 37) {
      if (toEpochDay(fromEpochDay(epoch)) !== epoch) {
        wrong.push(`epoch ${epoch} → ${toEpochDay(fromEpochDay(epoch))}`);
      }
    }
    expect(wrong, wrong.slice(0, 5).join('\n')).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*                            3. Options as garbage                           */
/* -------------------------------------------------------------------------- */

describe('options: locale', () => {
  const LOCALES: readonly [label: string, locale: unknown][] = [
    ['x-INVALID-@@', 'x-INVALID-@@'],
    ['10 kB', 'x'.repeat(10 * KB)],
    ['1 MB', 'x'.repeat(MB)],
    ['__proto__', '__proto__'],
    ['constructor', 'constructor'],
    ['empty', ''],
    ['null byte', 'en\0US'],
    ['<script>', '<script>alert(1)</script>'],
    ['non-Gregorian calendar', 'fa-IR-u-ca-persian-nu-arabext'],
    ['number', 123],
    ['object', {}],
    ['array', ['en-US']],
    ['null', null],
    ['function', () => 'en-US'],
  ];

  it.each(LOCALES)('engine survives locale %s', (_label, locale) => {
    let picker: DatePickerEngineApi | null = null;
    expect(() => {
      picker = createEngine({ today: TODAY, mode: 'range', locale: locale as never });
      picker.getSnapshot();
      picker.select(sep(10));
      picker.hover(sep(14));
      picker.select(sep(14));
      picker.parseInput('next friday');
      picker.applyPreset('this-weekend');
      picker.setOptions({ locale: locale as never });
    }).not.toThrow();
    if (picker) expectSnapshotSane((picker as DatePickerEngineApi).getSnapshot());
  });

  it.each(LOCALES.filter(([, locale]) => typeof locale === 'string' && locale.length < MB))(
    'both renderers survive locale %s',
    (_label, locale) => {
      expect(() => mountVanilla({ mode: 'range', locale: locale as never })).not.toThrow();
      expect(() =>
        quietly(() => mountReact({ mode: 'range', locale: locale as never })),
      ).not.toThrow();
    },
  );
});

describe('options: labels', () => {
  it('survives non-string label values in the engine and both renderers', () => {
    const labels = {
      title: 12345,
      startLabel: null,
      endLabel: undefined,
      clear: true,
      today: 0,
      emptyValue: Number.NaN,
      announceCleared: [],
      unavailableDate: '<script>alert(1)</script>',
    } as unknown as Partial<Labels>;
    const picker = engine({ mode: 'range', labels });
    expect(() => {
      picker.getSnapshot();
      picker.select(sep(10));
      picker.clear();
    }).not.toThrow();
    const { host } = mountVanilla({ mode: 'range', labels });
    expect(host.querySelector('script')).toBeNull();
    expect(() => quietly(() => mountReact({ mode: 'range', labels }))).not.toThrow();
    expect(document.querySelector('script')).toBeNull();
  });

  // FINDING: `labels.announceSelected` / `announceMonth` / `minNightsError` /
  // `maxNightsError` are called unguarded. A host that passes a string
  // template where a function is expected (a natural i18n mistake:
  // `announceSelected: 'Selected {summary}'`) turns every selection into
  // `TypeError: s.labels.announceSelected is not a function`, thrown out of
  // `select()`, `applyPreset()`, `parseInput()` and `nextMonth()`.
  // Repro: createDatePicker({ today, labels: { announceSelected: 'Selected' } }).select(today)
  it('survives label functions replaced by strings', () => {
    const labels = {
      announceSelected: 'Selected {summary}',
      announceMonth: 'Showing {label}',
      minNightsError: 'Too short',
      maxNightsError: 'Too long',
    } as unknown as Partial<Labels>;
    const picker = engine({ mode: 'range', labels, minNights: 2 });
    expect(() => {
      picker.select(sep(10));
      picker.select(sep(11));
      picker.nextMonth();
      picker.applyPreset('this-weekend');
      picker.clear();
    }).not.toThrow();
  });

  // FINDING: `resolveLabels` spreads the consumer's object eagerly
  // (`{ ...defaultLabels, ...overrides }`), so a getter that throws — or a
  // Proxy whose traps throw — escapes `createDatePicker()` itself. Low
  // severity: it surfaces synchronously at construction, at the call site of
  // the offending host code, never later in a render.
  // Repro: createDatePicker({ labels: { get title() { throw new Error('x'); } } })
  it('survives a labels object whose getter throws', () => {
    const labels = {
      get title(): string {
        throw new Error('label getter exploded');
      },
    } as unknown as Partial<Labels>;
    expect(() => engine({ labels }).getSnapshot()).not.toThrow();
  });

  it('survives a labels Proxy that throws on every trap', () => {
    const labels = new Proxy(
      {},
      {
        get: () => {
          throw new Error('trap');
        },
        ownKeys: () => {
          throw new Error('trap');
        },
        has: () => {
          throw new Error('trap');
        },
      },
    ) as unknown as Partial<Labels>;
    expect(() => engine({ labels }).getSnapshot()).not.toThrow();
  });
});

describe('options: dayMeta', () => {
  const HTML_META: DayMeta = {
    note: '<img src=x onerror=alert(1)>',
    badge: '<b>bold</b>',
    tooltip: '"><img src=x onerror=alert(1)>',
    className: '"><script>alert(1)</script>',
    holiday: '<script>alert(1)</script>',
    dots: [{ color: 'red; background: url(javascript:alert(1))', label: '<svg onload=alert(1)>' }],
    style: { color: 'expression(alert(1))', 'background-image': 'url("javascript:alert(1)")' },
  };

  it('vanilla renderer writes hostile dayMeta as text and creates no element from it', () => {
    const { host } = mountVanilla({ dayMeta: () => HTML_META });
    const cell = host.querySelector<HTMLElement>('.dpng-day[data-date="2026-09-04"]');
    expect(cell).not.toBeNull();
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('svg:not(.dpng-nav__button svg)')).toBeNull();
    expect(cell?.querySelector('.dpng-day__note')?.textContent).toBe(HTML_META.note);
    expect(cell?.querySelector('.dpng-day__badge')?.textContent).toBe(HTML_META.badge);
    expect(cell?.getAttribute('title')).toBe(HTML_META.tooltip);
    expect(cell?.querySelector('.dpng-day__dot')?.getAttribute('title')).toBe(
      '<svg onload=alert(1)>',
    );
    // The markup survives only as attribute *values* (title, class); it must
    // never have been parsed into nodes, so every descendant is the renderer's own.
    for (const node of Array.from(cell?.querySelectorAll('*') ?? [])) {
      expect(node.className).toMatch(/^dpng-day__/);
    }
  });

  it('React component path writes hostile dayMeta as text and creates no element from it', () => {
    const container = mountReact({ dayMeta: () => HTML_META });
    const cell = container.querySelector<HTMLElement>('.dpng-day[data-date="2026-09-04"]');
    expect(cell).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(cell?.querySelector('.dpng-day__note')?.textContent).toBe(HTML_META.note);
    expect(cell?.querySelector('.dpng-day__badge')?.textContent).toBe(HTML_META.badge);
    expect(cell?.getAttribute('title')).toBe(HTML_META.tooltip);
    for (const node of Array.from(cell?.querySelectorAll('*') ?? [])) {
      expect(node.className).toMatch(/^dpng-day__/);
    }
  });

  it('React getDayProps path exposes hostile dayMeta only as attribute values', () => {
    const { container } = render(
      createElement(Headless, {
        options: { today: TODAY, locale: 'en-US', dayMeta: () => HTML_META },
      }),
    );
    const cell = container.querySelector<HTMLElement>('.dpng-day[data-date="2026-09-04"]');
    expect(cell).not.toBeNull();
    expect(cell?.getAttribute('title')).toBe(HTML_META.tooltip);
    expect(cell?.className).toContain(HTML_META.className ?? '');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(cell?.children).toHaveLength(0);
  });

  // FINDING: `dayMeta` is the one consumer callback in the hot path and it is
  // called unguarded from `buildMonths`. A throw for a single date (an
  // undefined lookup, a bad price map) propagates out of `getSnapshot()`,
  // which in turn throws out of `createDatePicker(host)` (vanilla) and the
  // React render. Presets get `safeGetValue`; `dayMeta` gets nothing.
  // Repro: createDatePicker({ today, dayMeta: () => { throw new Error('x'); } }).getSnapshot()
  it('survives a dayMeta that throws', () => {
    const dayMeta = (date: PlainDate): DayMeta | undefined => {
      if (date.day === 17) throw new Error('price lookup failed');
      return undefined;
    };
    expect(() => engine({ dayMeta }).getSnapshot()).not.toThrow();
    expect(() => mountVanilla({ dayMeta })).not.toThrow();
    expect(() => quietly(() => mountReact({ dayMeta }))).not.toThrow();
  });

  // FINDING: same path as above — the trap fires on the first `meta.holiday` read
  // inside `buildMonths`, so `getSnapshot()` throws before any renderer runs.
  it('survives a dayMeta that returns a Proxy whose traps throw', () => {
    const trap = new Proxy(
      {},
      {
        get: () => {
          throw new Error('trap');
        },
        has: () => {
          throw new Error('trap');
        },
        ownKeys: () => {
          throw new Error('trap');
        },
      },
    ) as DayMeta;
    expect(() => engine({ dayMeta: () => trap }).getSnapshot()).not.toThrow();
    expect(() => mountVanilla({ dayMeta: () => trap })).not.toThrow();
    expect(() => quietly(() => mountReact({ dayMeta: () => trap }))).not.toThrow();
  });

  // FINDING: type-violating but plausible JS input crashes both renderers.
  // `dots: 'red'` → `'red'.slice(0, 3).map` is not a function (React) and
  // `meta.dots.map` is not a function (`metaSignature`, vanilla);
  // `dots: [null]` → `null.color`; `style: 'color: red'` → React refuses a
  // string `style` prop. The engine itself is fine — `buildMonths` only reads
  // `meta.holiday` — so the crash lands in the render layer.
  // `note: {}` reaches React as an object child, which React rejects outright.
  // Repro: createDatePicker(host, { dayMeta: () => ({ dots: 'red' }) })
  it.each([
    ['dots as a string', { dots: 'red' }],
    ['dots containing null', { dots: [null] }],
    ['dots containing a number', { dots: [123] }],
    ['dots as an object', { dots: { length: 1 } }],
    ['style as a string', { style: 'color: red' }],
    ['note as an object', { note: { toString: () => 'x' } }],
    ['badge as a function', { badge: () => 'x' }],
  ])('survives type-violating dayMeta (%s) in both renderers', (_label, meta) => {
    const dayMeta = (): DayMeta => meta as unknown as DayMeta;
    expect(() => engine({ dayMeta }).getSnapshot()).not.toThrow();
    expect(() => mountVanilla({ dayMeta })).not.toThrow();
    expect(() => quietly(() => mountReact({ dayMeta }))).not.toThrow();
  });
});

describe('options: presets', () => {
  it('survives presets whose getValue throws', () => {
    const presets = [
      {
        id: 'boom',
        label: 'Boom',
        getValue: (): never => {
          throw new Error('preset exploded');
        },
      },
      { id: 'ok', label: 'OK', getValue: (): PlainDate => sep(10) },
    ];
    const picker = engine({ mode: 'range', presets });
    expect(() => picker.getSnapshot()).not.toThrow();
    expect(picker.getSnapshot().presets.find((p) => p.id === 'boom')?.disabled).toBe(true);
    expect(() => picker.applyPreset('boom')).not.toThrow();
    expect(() => mountVanilla({ mode: 'range', presets })).not.toThrow();
    expect(() => quietly(() => mountReact({ mode: 'range', presets }))).not.toThrow();
  });

  it('survives presets whose isActive throws', () => {
    const presets = [
      {
        id: 'x',
        label: 'X',
        getValue: (): PlainDate => sep(10),
        isActive: (): never => {
          throw new Error('isActive exploded');
        },
      },
    ];
    expect(() => mountVanilla({ presets })).not.toThrow();
    expect(() => quietly(() => mountReact({ presets }))).not.toThrow();
  });

  // FINDING: `normalizePresetResult` does `'dates' in candidate` on whatever a
  // custom `getValue` returned. For a primitive (a string like `'tomorrow'`, a
  // number, a boolean) the `in` operator throws `TypeError: Cannot use 'in'
  // operator to search for 'dates' in tomorrow`. `applyPreset()` wraps that
  // call, but `resolvePresets()` — which runs on *every* `getSnapshot()` —
  // only wraps `getValue` itself, so a single such preset takes the whole
  // calendar down at render time.
  // A returned Proxy whose `has` trap throws fails at the very same `in`.
  // Repro: createDatePicker({ today, presets: [{ id: 'x', label: 'x', getValue: () => 'tomorrow' }] }).getSnapshot()
  it.each([
    ['a string', 'tomorrow'],
    ['a number', 42],
    ['a boolean', true],
    ['a symbol', Symbol('x')],
    ['a bigint', 7n],
  ])('survives a preset whose getValue returns %s', (_label, value) => {
    const presets = [{ id: 'garbage', label: 'Garbage', getValue: () => value as never }];
    const picker = engine({ mode: 'range', presets });
    expect(() => picker.getSnapshot()).not.toThrow();
    expect(() => picker.applyPreset('garbage')).not.toThrow();
    expectSnapshotSane(picker.getSnapshot());
  });

  it.each([
    ['an array', [sep(10)]],
    ['a Date', new Date(2026, 8, 10)],
    ['an invalid Date', new Date(Number.NaN)],
    ['a garbage range', { start: 'not a date', end: Number.NaN }],
    ['a range of objects', { start: {}, end: [] }],
    ['dates as a string', { dates: 'sep 10' }],
    ['range as a string', { range: '2026-09-10' }],
    ['a range with year NaN', { start: { year: Number.NaN, month: 1, day: 1 }, end: null }],
    [
      'a Proxy that throws',
      new Proxy(
        {},
        {
          has: () => {
            throw new Error('trap');
          },
        },
      ),
    ],
    ['a function', () => sep(10)],
  ])('survives a preset whose getValue returns %s', (_label, value) => {
    const presets = [{ id: 'garbage', label: 'Garbage', getValue: () => value as never }];
    const picker = engine({ mode: 'range', presets });
    expect(() => picker.getSnapshot()).not.toThrow();
    expect(() => picker.applyPreset('garbage')).not.toThrow();
    expectSnapshotSane(picker.getSnapshot());
  });

  it('drops malformed preset entries instead of throwing', () => {
    const presets = [
      null,
      undefined,
      42,
      'not-a-real-preset',
      '__proto__',
      'constructor',
      { id: 123, getValue: () => sep(1) },
      { id: 'no-getValue' },
      {
        id: '<script>alert(1)</script>',
        label: '<script>alert(1)</script>',
        getValue: () => sep(1),
      },
      'this-weekend',
    ] as unknown as VanillaOptions['presets'];
    const { host } = mountVanilla({ mode: 'range', presets });
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelectorAll('.dpng-preset')).toHaveLength(2);
    expect(host.querySelector('.dpng-preset')?.textContent).toContain('<script>alert(1)</script>');
  });
});

describe('options: formatters', () => {
  const FORMATTER_NAMES: readonly (keyof Formatters)[] = [
    'monthYear',
    'month',
    'year',
    'day',
    'fieldDate',
    'ariaDay',
    'duration',
    'summary',
    'weekday',
    'weekNumber',
    'time',
  ];

  // FINDING: formatters are consumer callbacks called unguarded in the hot
  // path. Any one of them throwing escapes `getSnapshot()` (and so both
  // renderers) or `select()` (`describe()` → `summary`).
  // Repro: createDatePicker({ today, formatters: { day: () => { throw new Error('x'); } } }).getSnapshot()
  it.each(FORMATTER_NAMES)('survives formatters.%s throwing', (name) => {
    const formatters = {
      [name]: (): never => {
        throw new Error(`${name} exploded`);
      },
    };
    const picker = engine({
      mode: 'range',
      showWeekNumbers: true,
      time: { enabled: true },
      formatters,
    });
    expect(() => {
      picker.getSnapshot();
      picker.select(sep(10));
      picker.hover(sep(12));
      picker.select(sep(12));
      picker.setView('year');
      picker.getSnapshot();
    }).not.toThrow();
    expect(() =>
      mountVanilla({ mode: 'range', showWeekNumbers: true, time: { enabled: true }, formatters }),
    ).not.toThrow();
    expect(() =>
      quietly(() =>
        mountReact({ mode: 'range', showWeekNumbers: true, time: { enabled: true }, formatters }),
      ),
    ).not.toThrow();
  });

  it.each([
    ['a number', 42],
    ['null', null],
    ['undefined', undefined],
    ['a boolean', false],
    ['markup', '<script>alert(1)</script>'],
  ])('survives every formatter returning %s', (_label, value) => {
    const formatters = Object.fromEntries(
      FORMATTER_NAMES.map((name) => [name, () => value]),
    ) as unknown as Partial<Formatters>;
    const picker = engine({ mode: 'range', showWeekNumbers: true, formatters });
    expect(() => {
      picker.getSnapshot();
      picker.select(sep(10));
      picker.select(sep(12));
    }).not.toThrow();
    const { host } = mountVanilla({ mode: 'range', showWeekNumbers: true, formatters });
    expect(host.querySelector('script')).toBeNull();
    expect(() =>
      quietly(() => mountReact({ mode: 'range', showWeekNumbers: true, formatters })),
    ).not.toThrow();
    expect(document.querySelector('script')).toBeNull();
  });

  // FINDING: same class as the string-valued label functions — `resolveFormatters`
  // spreads the override without checking that each member is callable, so a
  // JSON-shaped `formatters` object (or any non-function value) throws
  // `TypeError: formatters.day is not a function` out of `getSnapshot()`.
  // Repro: createDatePicker({ today, formatters: { day: 'D', month: 42 } }).getSnapshot()
  it('survives formatter overrides that are not functions', () => {
    const formatters = {
      day: 'D',
      month: 42,
      year: null,
      summary: {},
    } as unknown as Partial<Formatters>;
    expect(() => engine({ mode: 'range', formatters }).getSnapshot()).not.toThrow();
    expect(() => mountVanilla({ mode: 'range', formatters })).not.toThrow();
    expect(() => quietly(() => mountReact({ mode: 'range', formatters }))).not.toThrow();
  });
});

describe('options: constraints and predicates', () => {
  // FINDING: `isDateUnavailable` is called unguarded from `evaluateDate`, which
  // runs for every visible cell on every snapshot. A throw escapes
  // `getSnapshot()` and both renderers.
  // Repro: createDatePicker({ today, isDateUnavailable: () => { throw new Error('x'); } }).getSnapshot()
  it('survives an isDateUnavailable that throws', () => {
    const isDateUnavailable = (): never => {
      throw new Error('availability service down');
    };
    expect(() => engine({ isDateUnavailable }).getSnapshot()).not.toThrow();
    expect(() => mountVanilla({ isDateUnavailable })).not.toThrow();
    expect(() => quietly(() => mountReact({ isDateUnavailable }))).not.toThrow();
  });

  it('survives isDateUnavailable returning garbage', () => {
    for (const value of [null, undefined, 'yes', 42, {}, [], { selectable: 'no' }, () => true]) {
      const picker = engine({ isDateUnavailable: () => value as never });
      expect(() => {
        picker.getSnapshot();
        picker.select(sep(10));
      }).not.toThrow();
    }
  });

  it('survives garbage numeric options', () => {
    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      0,
      '7',
      null,
      {},
      [],
    ]) {
      expect(() => {
        const picker = engine({
          mode: 'range',
          minNights: value as never,
          maxNights: value as never,
          minSelections: value as never,
          maxSelections: value as never,
          firstDayOfWeek: value as never,
          disabledDaysOfWeek: [value as never],
        });
        picker.getSnapshot();
        picker.select(sep(10));
        picker.hover(sep(20));
        picker.select(sep(20));
        picker.nextMonth(value as never);
        picker.previousMonth(value as never);
        expectSnapshotSane(picker.getSnapshot());
      }).not.toThrow();
    }
  });

  // FINDING: `nextMonth(count)` / `previousMonth(count)` only require a positive
  // integer, so a huge count moves the view to a year `Date` cannot represent
  // and the next `getSnapshot()` throws `RangeError: Invalid time value` from
  // the month-caption formatter. Same root cause as the absurd-year cases above.
  // Repro: const p = createDatePicker({ today }); p.nextMonth(1e15); p.getSnapshot()
  it('survives an absurd navigation count', () => {
    for (const count of [1e15, Number.MAX_SAFE_INTEGER]) {
      const picker = engine();
      expect(() => {
        picker.nextMonth(count);
        picker.getSnapshot();
        picker.previousMonth(count);
        picker.getSnapshot();
      }).not.toThrow();
      expectSnapshotSane(picker.getSnapshot());
    }
  });

  // FINDING: `numberOfMonths` is only clamped to `>= 1`. Every visible month
  // costs 42 day objects plus a formatter call each, so a large value pins the
  // thread and then exhausts the heap. Engine alone: 20 000 → 1.7 s,
  // 40 000 → 3.5 s, 50 000 → 4.2 s and 1.7 GB, 1 000 000 → `FATAL ERROR:
  // Reached heap limit`. The `months` attribute of `<nextgen-date-picker>` is a
  // direct route to it, and there each month is also 42 live DOM buttons.
  // Repro: createDatePicker({ today, numberOfMonths: 40_000 }).getSnapshot()
  //        <nextgen-date-picker months="1000000">
  it('bounds numberOfMonths so a huge value cannot pin the thread', () => {
    const ms = elapsed(() => engine({ numberOfMonths: 40_000 }).getSnapshot());
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('bounds yearRange so a huge value cannot pin the thread', () => {
    const ms = elapsed(() => engine({ yearRange: 100_000 }).getSnapshot());
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('caps a multiple-mode range spanning ten thousand years', () => {
    const ms = elapsed(() => {
      const picker = engine({
        mode: 'multiple',
        defaultValue: { start: plainDate(1, 1, 1), end: plainDate(9999, 12, 31) },
      });
      expect(picker.getSnapshot().value.dates.length).toBeLessThanOrEqual(10_001);
    });
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it('survives 100 000 disabled dates, enabled dates and blocked ranges', () => {
    const dates = Array.from({ length: 100_000 }, (_, i) => `2${String(i).padStart(3, '0')}-01-01`);
    const ranges = dates.map((start) => ({ start, end: start }));
    const ms = elapsed(() => {
      const picker = engine({
        mode: 'range',
        disabledDates: dates,
        enabledDates: dates,
        blockedRanges: ranges,
        disabledDaysOfWeek: Array.from({ length: 100_000 }, (_, i) => i),
      });
      picker.getSnapshot();
      picker.select(sep(10));
      picker.hover(sep(20));
    });
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});

describe('options: consumer callbacks', () => {
  // FINDING: consumer callbacks are invoked unguarded, so one that throws
  // propagates out of the public method that triggered it (`select`, `hover`,
  // `focusDate`, `nextMonth`, `applyPreset`, `clear`). State is already
  // committed by then, so nothing is corrupted — but the vanilla binding
  // explicitly wraps its own `on()` handlers ("A listener must never break the
  // picker's own bookkeeping"), and `options.onChange` passed to the very same
  // `createDatePicker(host, …)` gets no such protection.
  // Repro: createDatePicker({ today, onChange: () => { throw new Error('x'); } }).select(today)
  const THROWING_CALLBACKS: readonly [
    name: keyof EngineOptions,
    trigger: (p: DatePickerEngineApi) => void,
  ][] = [
    ['onChange', (p) => p.select(sep(10))],
    ['onComplete', (p) => p.select(sep(10))],
    ['onMonthChange', (p) => p.nextMonth()],
    ['onFocusChange', (p) => p.focusDate(sep(20))],
    ['onHoverChange', (p) => p.hover(sep(20))],
    ['onPresetApply', (p) => p.applyPreset('today')],
    ['onInvalidSelection', (p) => p.select(sep(1))],
  ];

  it.each(THROWING_CALLBACKS)('survives a throwing %s', (name, trigger) => {
    const picker = engine({
      mode: 'single',
      disabledDates: [sep(1)],
      [name]: (): never => {
        throw new Error(`${name} exploded`);
      },
    });
    expect(() => trigger(picker)).not.toThrow();
    expect(() => picker.getSnapshot()).not.toThrow();
  });

  it('keeps state consistent even when onChange throws', () => {
    const picker = engine({
      mode: 'single',
      onChange: (): never => {
        throw new Error('onChange exploded');
      },
    });
    try {
      picker.select(sep(10));
    } catch {
      /* the throw itself is asserted on above; this test is about the state after it */
    }
    expect(picker.getSnapshot().value.dates).toEqual([sep(10)]);
    expect(picker.getSnapshot().focusedDate).toEqual(sep(10));
  });

  it('vanilla instance survives a throwing on() handler and keeps rendering', () => {
    const { instance, host } = mountVanilla({ mode: 'single' });
    instance.on('change', () => {
      throw new Error('handler exploded');
    });
    const errors = windowErrorsDuring(() => {
      host.querySelector<HTMLButtonElement>('.dpng-day[data-date="2026-09-10"]')?.click();
    });
    expect(errors).toEqual([]);
    expect(host.querySelector('.dpng-day[data-date="2026-09-10"]')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });
});

/* -------------------------------------------------------------------------- */
/*                           4. Prototype pollution                           */
/* -------------------------------------------------------------------------- */

const POLLUTION_PAYLOADS: readonly string[] = [
  '{"__proto__":{"polluted":true}}',
  '{"constructor":{"prototype":{"polluted":true}}}',
  '[{"__proto__":{"polluted":true}}]',
  '[{"constructor":{"prototype":{"polluted":true}}}]',
  '[{"start":"2026-09-04","end":"2026-09-06","__proto__":{"polluted":true}}]',
  '{"start":"2026-09-04","end":"2026-09-06","__proto__":{"polluted":true}}',
  '{"dates":["2026-09-04"],"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}',
  '{"range":{"start":"2026-09-04","__proto__":{"polluted":true}}}',
  '{"year":2026,"month":9,"day":4,"__proto__":{"polluted":true}}',
];

function expectNoPollution(): void {
  expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  expect(([] as { polluted?: unknown }).polluted).toBeUndefined();
  expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(Array.prototype, 'polluted')).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(Function.prototype, 'polluted')).toBe(false);
}

describe('prototype pollution', () => {
  afterEach(() => {
    // Never let one leak masquerade as a pass in the next test.
    delete (Object.prototype as { polluted?: unknown }).polluted;
    delete (Array.prototype as { polluted?: unknown }).polluted;
  });

  it.each(POLLUTION_PAYLOADS)('custom element attributes carrying %s do not pollute', (payload) => {
    const errors = windowErrorsDuring(() => {
      const element = mountElement({ mode: 'range' });
      for (const name of [
        'value',
        'disabled-dates',
        'enabled-dates',
        'blocked-ranges',
        'presets',
        'disabled-days-of-week',
        'min',
        'max',
        'today',
        'month',
        'locale',
      ]) {
        element.setAttribute(name, payload);
      }
      element.setAttribute('mode', 'multiple');
      element.setAttribute('value', payload);
      element.setAttribute('mode', 'single');
      element.setAttribute('value', payload);
    });
    expect(errors).toEqual([]);
    expectNoPollution();
  });

  it.each(POLLUTION_PAYLOADS)('parseValueAttribute(%s) does not pollute', (payload) => {
    for (const mode of [
      'single',
      'range',
      'multiple',
      'week',
      'month',
      'quarter',
      'year',
    ] as const) {
      expect(() => parseValueAttribute(payload, mode)).not.toThrow();
    }
    expectNoPollution();
  });

  /**
   * These two tests are about pollution only. A payload can also be garbage
   * in other ways (`{ year, month, day }` fed as `formatters` is a table of
   * non-functions), and that failure mode has its own test above — here it
   * must not stop the remaining injections from running.
   */
  function inject(fn: () => void): void {
    try {
      fn();
    } catch {
      /* covered by the throw-behaviour tests */
    }
  }

  it.each(POLLUTION_PAYLOADS)('custom element properties fed %s do not pollute', (payload) => {
    const element = mountElement({ mode: 'range' });
    const parsed = json(payload);
    const list = (Array.isArray(parsed) ? parsed : [parsed]) as never[];
    inject(() => (element.value = parsed));
    inject(() => (element.options = parsed as Partial<VanillaOptions>));
    inject(() => (element.presets = list));
    inject(() => (element.disabledDates = list));
    inject(() => (element.enabledDates = list));
    inject(() => (element.blockedRanges = list));
    inject(() => (element.dayMeta = parsed as never));
    inject(() => (element.labels = parsed as never));
    inject(() => (element.formatters = parsed as never));
    expectNoPollution();
  });

  it.each(POLLUTION_PAYLOADS)('engine options and values fed %s do not pollute', (payload) => {
    const parsed = json(payload);
    const list = (Array.isArray(parsed) ? parsed : [parsed]) as never[];
    let picker: DatePickerEngineApi | null = null;
    inject(() => {
      picker = createEngine(parsed as EngineOptions);
      picker.getSnapshot();
    });
    const target = picker ?? engine();
    inject(() => target.setOptions(parsed as EngineOptions));
    inject(() => target.setOptions({ labels: parsed as never }));
    inject(() => target.setOptions({ formatters: parsed as never }));
    inject(() => target.setOptions({ presets: list }));
    inject(() => target.setValue(parsed as never));
    inject(() => target.setValue(list));
    inject(() => target.select(parsed as never));
    inject(() =>
      target.setOptions({ disabledDates: list, enabledDates: list, blockedRanges: list }),
    );
    inject(() => target.getSnapshot());
    for (const mode of ['single', 'range', 'multiple'] as SelectionMode[]) {
      inject(() => normalizeValueInput(parsed as never, mode));
    }
    inject(() => toPlainDate(parsed as never));
    expectNoPollution();
  });
});

/* -------------------------------------------------------------------------- */
/*                         5. Web component attributes                        */
/* -------------------------------------------------------------------------- */

describe('custom element: attribute abuse', () => {
  it('exposes the observed attribute list used by these tests', () => {
    expect(observedAttributes().length).toBeGreaterThan(40);
  });

  it('accepts 1 MB in every observed attribute before connection within budget', () => {
    const big = 'x'.repeat(MB);
    const errors = windowErrorsDuring(() => {
      const ms = elapsed(() => {
        const attributes: Record<string, string> = {};
        for (const name of observedAttributes()) attributes[name] = big;
        const element = mountElement(attributes);
        expect(element.querySelectorAll('.dpng-day').length).toBeGreaterThan(0);
      });
      expect(ms).toBeLessThan(BUDGET_MS);
    });
    expect(errors).toEqual([]);
  });

  it('accepts 1 MB in every observed attribute after connection within budget', () => {
    const element = mountElement({ mode: 'range' });
    const errors = windowErrorsDuring(() => {
      const ms = elapsed(() => {
        for (const name of observedAttributes()) {
          element.setAttribute(name, '9'.repeat(MB));
          element.setAttribute(name, '<'.repeat(MB / 2) + ',' + '"'.repeat(MB / 2));
        }
      });
      expect(ms).toBeLessThan(BUDGET_MS);
    });
    expect(errors).toEqual([]);
    expect(element.querySelector('script')).toBeNull();
    expect(element.querySelector('img')).toBeNull();
  });

  // FINDING: `parseValueAttribute` in range-like modes and `toRangeList` split
  // on `RANGE_SPLIT`, whose leading `\s*` is followed by alternatives that all
  // fail on a whitespace run, so every position re-scans the run: O(n²).
  // Measured: 10 kB → 57 ms, 20 kB → 208 ms, 40 kB → 837 ms, 100 kB → ~5 s.
  // Repro: parseValueAttribute('a' + ' '.repeat(100_000) + 'b', 'range')
  //        <nextgen-date-picker mode="range" value="a<100 000 spaces>b">
  it('accepts a 100 kB whitespace-heavy value in range mode within budget', () => {
    const text = 'a' + ' '.repeat(100 * KB) + 'b';
    const ms = elapsed(() => {
      parseValueAttribute(text, 'range');
    });
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  // FINDING: a JSON bomb of nested arrays is parsed fine (V8's parser is
  // iterative) but `toDateList` then calls `String(entry)` on the nested
  // array, and `Array.prototype.toString` recurses per level:
  // `RangeError: Maximum call stack size exceeded`, reported as an uncaught
  // error from the custom-element reaction (`attributeChangedCallback` /
  // `connectedCallback`). Affects `disabled-dates`, `enabled-dates`,
  // `disabled-days-of-week` and `presets`; `blocked-ranges` skips non-objects
  // and is unaffected.
  // Repro: el.setAttribute('disabled-dates', '['.repeat(10_000) + ']'.repeat(10_000))
  it.each([
    'disabled-dates',
    'enabled-dates',
    'blocked-ranges',
    'presets',
    'disabled-days-of-week',
    'value',
  ])('does not stack-overflow on a 10 000-deep JSON bomb in %s', (name) => {
    const bomb = '['.repeat(10_000) + ']'.repeat(10_000);
    const before = windowErrorsDuring(() => mountElement({ mode: 'multiple', [name]: bomb }));
    expect(before).toEqual([]);
    const element = mountElement({ mode: 'multiple' });
    const after = windowErrorsDuring(() => element.setAttribute(name, bomb));
    expect(after).toEqual([]);
  });

  it('does not stack-overflow on a 100 000-deep JSON bomb', () => {
    const bomb = '['.repeat(100_000) + ']'.repeat(100_000);
    const element = mountElement({ mode: 'multiple' });
    const errors = windowErrorsDuring(() => {
      element.setAttribute('disabled-dates', bomb);
      element.setAttribute('blocked-ranges', bomb);
    });
    expect(errors).toEqual([]);
  });

  it('accepts arrays of 100 000 entries in every list attribute within budget', () => {
    const dates = Array.from({ length: 100_000 }, (_, i) => `2${String(i).padStart(3, '0')}-01-01`);
    const ranges = JSON.stringify(dates.map((start) => ({ start, end: start })));
    const list = JSON.stringify(dates);
    const numbers = JSON.stringify(Array.from({ length: 100_000 }, (_, i) => i));
    const ids = JSON.stringify(Array.from({ length: 100_000 }, () => 'this-weekend'));
    const commaList = dates.join(',');
    const errors = windowErrorsDuring(() => {
      const ms = elapsed(() => {
        const element = mountElement({
          mode: 'multiple',
          value: commaList,
          'disabled-dates': list,
          'enabled-dates': list,
          'blocked-ranges': ranges,
          presets: ids,
          'disabled-days-of-week': numbers,
        });
        element.setAttribute('disabled-dates', commaList);
        element.setAttribute('blocked-ranges', dates.map((d) => `${d}..${d}`).join(','));
        element.setAttribute('value', list);
      });
      expect(ms).toBeLessThan(BUDGET_MS);
    });
    expect(errors).toEqual([]);
  });

  it('never renders attribute text as markup', () => {
    const hostile = '"><img src=x onerror=alert(1)><script>alert(1)</script>';
    const element = mountElement({
      mode: 'range',
      title: hostile,
      theme: hostile,
      size: hostile,
      variant: hostile,
      orientation: hostile,
      locale: hostile,
      presets: hostile,
    });
    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('script')).toBeNull();
    expect(element.querySelector('.dpng-header__title')?.textContent).toBe(hostile);
    expect(element.querySelector('.dpng')?.getAttribute('data-theme')).toBe(hostile);
  });

  // The `months` attribute forwards `Number(value)` straight into the uncapped
  // `numberOfMonths` (see the FINDING under "options: constraints and
  // predicates"), and here every month is also 42 live buttons: 1 000 months
  // measured at 2.5 s and ~1 GB under jsdom, 2 000 at 5.4 s, 4 000 out of
  // memory. This stays at 300 so the DOM cost alone fits the budget on any
  // machine; the missing cap itself is asserted at the engine level.
  it('renders a few hundred months from the attribute within budget', () => {
    const ms = elapsed(() => mountElement({ months: '300' }));
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});

/* -------------------------------------------------------------------------- */
/*                           6. Callback re-entrancy                          */
/* -------------------------------------------------------------------------- */

describe('callback re-entrancy', () => {
  it('survives an onChange that calls select() again', () => {
    const target = sep(20);
    let calls = 0;
    const picker = engine({
      mode: 'single',
      onChange: (value: SelectionValue) => {
        calls += 1;
        if (calls > 10) throw new Error('runaway re-entrancy');
        if (!value.dates.some((d) => d.day === target.day)) picker.select(target);
      },
    });
    expect(() => picker.select(sep(10))).not.toThrow();
    expect(calls).toBe(2);
    expect(picker.getSnapshot().value.dates).toEqual([target]);
    expect(picker.getSnapshot().focusedDate).toEqual(target);
  });

  it('survives an onChange that clears and re-selects in range mode', () => {
    let depth = 0;
    const picker = engine({
      mode: 'range',
      onChange: (value: SelectionValue, meta) => {
        depth += 1;
        if (depth > 10) throw new Error('runaway re-entrancy');
        if (meta.isComplete && value.range.end?.day === 14) {
          picker.clear();
          picker.select(sep(1));
        }
      },
    });
    expect(() => {
      picker.select(sep(10));
      picker.select(sep(14));
    }).not.toThrow();
    expect(picker.getSnapshot().value.range).toEqual({ start: sep(1), end: null });
    expect(picker.getSnapshot().activeField).toBe('end');
    expectSnapshotSane(picker.getSnapshot());
  });

  it('survives a subscribe listener that re-enters the engine', () => {
    let notifications = 0;
    const picker = engine({ mode: 'single' });
    picker.subscribe(() => {
      notifications += 1;
      if (notifications > 20) throw new Error('runaway re-entrancy');
      if (notifications === 1) {
        picker.setOptions({ numberOfMonths: 2 });
        picker.hover(sep(12));
        picker.focusDate(sep(13));
      }
    });
    expect(() => picker.select(sep(10))).not.toThrow();
    expect(picker.getSnapshot().months).toHaveLength(2);
    expect(picker.getSnapshot().value.dates).toEqual([sep(10)]);
  });

  it('survives a listener that unsubscribes itself and its siblings during notification', () => {
    const picker = engine({ mode: 'single' });
    const calls: string[] = [];
    const offs: (() => void)[] = [];
    offs.push(
      picker.subscribe(() => {
        calls.push('a');
        for (const off of offs) off();
        for (const off of offs) off();
      }),
    );
    offs.push(picker.subscribe(() => calls.push('b')));
    offs.push(picker.subscribe(() => calls.push('c')));
    expect(() => picker.select(sep(10))).not.toThrow();
    // Everyone still receives the notification that was already in flight …
    expect(calls.sort()).toEqual(['a', 'b', 'c']);
    // … and nobody receives the next one.
    calls.length = 0;
    picker.select(sep(11));
    expect(calls).toEqual([]);
  });

  it('survives destroy() called from inside an engine listener', () => {
    const picker = engine({ mode: 'single' });
    const after = vi.fn();
    picker.subscribe(() => picker.destroy());
    picker.subscribe(after);
    expect(() => picker.select(sep(10))).not.toThrow();
    expect(() => {
      picker.select(sep(11));
      picker.hover(sep(12));
      picker.nextMonth();
      picker.setOptions({ mode: 'range' });
      picker.getSnapshot();
      picker.destroy();
    }).not.toThrow();
    expect(picker.subscribe(() => undefined)).toBeTypeOf('function');
  });

  it('survives destroy() called from inside a vanilla change handler', () => {
    const { instance, host } = mountVanilla({ mode: 'single' });
    instance.on('change', () => instance.destroy());
    const errors = windowErrorsDuring(() => {
      host.querySelector<HTMLButtonElement>('.dpng-day[data-date="2026-09-10"]')?.click();
    });
    expect(errors).toEqual([]);
    expect(host.querySelector('.dpng')).toBeNull();
    expect(() => {
      instance.setValue(sep(11));
      instance.update({ mode: 'range' });
      instance.open();
      instance.close();
      instance.destroy();
    }).not.toThrow();
  });

  it('survives an onChange that calls setValue() on a bound input picker', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    let depth = 0;
    const instance = attachDatePicker(input, {
      today: TODAY,
      locale: 'en-US',
      onChange: (value: SelectionValue) => {
        depth += 1;
        if (depth > 10) throw new Error('runaway re-entrancy');
        if (value.dates[0]?.day !== 25) instance.setValue(sep(25));
      },
    });
    mounted.push({ instance, host: input });
    const errors = windowErrorsDuring(() => {
      input.value = 'sep 10';
      input.dispatchEvent(new Event('change'));
    });
    expect(errors).toEqual([]);
    expect(instance.engine.getSnapshot().value.dates).toEqual([sep(25)]);
    expect(input.value).toBe('09/25/2026');
  });

  // FINDING: same class as the throwing `onChange` above — a `subscribe`
  // listener that throws escapes `notify()` and therefore every public
  // mutator, and the listeners queued after it are never called.
  // Repro: const p = createDatePicker({ today }); p.subscribe(() => { throw new Error('x'); }); p.select(today)
  it('survives a subscribe listener that throws without starving its siblings', () => {
    const picker = engine({ mode: 'single' });
    const sibling = vi.fn();
    picker.subscribe(() => {
      throw new Error('listener exploded');
    });
    picker.subscribe(sibling);
    expect(() => picker.select(sep(10))).not.toThrow();
    expect(sibling).toHaveBeenCalledTimes(1);
  });
});
