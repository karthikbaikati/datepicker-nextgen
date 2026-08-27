/**
 * Value adapters — the bridge between the engine's internal {@link SelectionValue}
 * and whatever date type the host application actually speaks.
 *
 * The engine never stores anything but {@link PlainDate}s; an adapter is consulted
 * only at the boundary (`getValue()` and value coercion), so swapping Day.js for
 * Luxon changes one option and nothing else.
 */

import { isPlainDate, toDate, toISODate, toPlainDate } from './plain-date';
import type { DateInput, PlainDate, SelectionMode, SelectionValue, ValueAdapter } from './types';

/** Modes whose external value is a `{ start, end }` pair rather than a date or a list. */
const RANGE_MODES: ReadonlySet<SelectionMode> = new Set<SelectionMode>([
  'range',
  'week',
  'month',
  'quarter',
  'year',
]);

/**
 * Validate and freeze an adapter definition. Use it for custom adapters so a typo
 * in `fromPlain` fails at construction instead of on the first selection.
 */
export function createAdapter<T>(def: ValueAdapter<T>): ValueAdapter<T> {
  if (!def || typeof def.toPlain !== 'function' || typeof def.fromPlain !== 'function') {
    throw new TypeError('createAdapter: `toPlain` and `fromPlain` must both be functions');
  }
  return Object.freeze({
    name: typeof def.name === 'string' && def.name !== '' ? def.name : 'custom',
    toPlain: def.toPlain,
    fromPlain: def.fromPlain,
  });
}

/** The default adapter: values stay {@link PlainDate}s, which is what the engine holds anyway. */
export const plainDateAdapter: ValueAdapter<PlainDate> = createAdapter<PlainDate>({
  name: 'plain',
  toPlain: (value) => toPlainDate(value as DateInput),
  fromPlain: (date) => date,
});

/**
 * Native `Date` at local midnight. Reading a `Date` back only ever touches its
 * local calendar fields, so a value round-trips without a timezone shift.
 */
export const nativeDateAdapter: ValueAdapter<Date> = createAdapter<Date>({
  name: 'date',
  toPlain: (value) => toPlainDate(value as DateInput),
  fromPlain: (date) => toDate(date),
});

/** `"YYYY-MM-DD"` — the shape you want in a form payload or a URL query. */
export const isoStringAdapter: ValueAdapter<string> = createAdapter<string>({
  name: 'iso',
  toPlain: (value) => toPlainDate(value as DateInput),
  fromPlain: (date) => toISODate(date),
});

/** Epoch milliseconds at local midnight. */
export const timestampAdapter: ValueAdapter<number> = createAdapter<number>({
  name: 'timestamp',
  toPlain: (value) => toPlainDate(value as DateInput),
  fromPlain: (date) => toDate(date).getTime(),
});

/* -------------------------------------------------------------------------- */
/*                              Library adapters                              */
/* -------------------------------------------------------------------------- */

/** The members we duck-type for. Every one of them is optional on purpose. */
interface LibraryLike {
  isValid?: boolean | (() => boolean);
  toDate?: () => unknown;
  toJSDate?: () => unknown;
  valueOf?: () => unknown;
}

/**
 * Wrap a date library in an adapter.
 *
 * `create` is yours (`(d) => dayjs(\`${d.year}-${d.month}-${d.day}\`)`), while
 * reading is best-effort by design: the supplied `parse` runs first, then the
 * shapes Day.js, Luxon, Moment and `Temporal.PlainDate` expose — `toDate()`,
 * `toJSDate()`, 1-based `{ year, month, day }` fields, and finally `valueOf()`.
 * An instance that reports itself invalid is rejected before any of that, so a
 * bad parse can never surface as "today".
 */
export function createLibraryAdapter(
  name: string,
  parse: (value: unknown) => Date | null,
  create: (date: PlainDate) => unknown,
): ValueAdapter<unknown> {
  return createAdapter<unknown>({
    name,
    toPlain: (value) => libraryToPlain(value, parse),
    fromPlain: (date) => create(date),
  });
}

function libraryToPlain(value: unknown, parse: (value: unknown) => Date | null): PlainDate | null {
  if (value == null || value === '') return null;
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number') {
    return toPlainDate(value);
  }
  if (typeof value !== 'object') return null;

  if (isInvalidInstance(value)) return null;

  const parsed = safeParse(parse, value);
  if (parsed) return toPlainDate(parsed);

  // Luxon `DateTime` and `Temporal.PlainDate` both expose plain 1-based fields,
  // which is exactly a PlainDate — no formatting or timezone hop required.
  if (isPlainDate(value)) return toPlainDate(value);

  const native = callForDate(value, 'toDate') ?? callForDate(value, 'toJSDate');
  if (native) return toPlainDate(native);

  const primitive = callValueOf(value);
  return typeof primitive === 'number' ? toPlainDate(primitive) : null;
}

/** `isValid` is a boolean on Luxon and a method on Day.js/Moment. */
function isInvalidInstance(candidate: LibraryLike): boolean {
  const validity = candidate.isValid;
  if (validity === false) return true;
  if (typeof validity === 'function') {
    try {
      return validity.call(candidate) === false;
    } catch {
      return true;
    }
  }
  return false;
}

function safeParse(parse: (value: unknown) => Date | null, value: unknown): Date | null {
  if (typeof parse !== 'function') return null;
  try {
    const result = parse(value);
    return result instanceof Date && !Number.isNaN(result.getTime()) ? result : null;
  } catch {
    return null;
  }
}

function callForDate(value: object, key: 'toDate' | 'toJSDate'): Date | null {
  const method = (value as Record<string, unknown>)[key];
  if (typeof method !== 'function') return null;
  try {
    const result = (method as () => unknown).call(value);
    return result instanceof Date && !Number.isNaN(result.getTime()) ? result : null;
  } catch {
    return null;
  }
}

function callValueOf(value: object): unknown {
  const method = (value as LibraryLike).valueOf;
  if (typeof method !== 'function') return null;
  try {
    return method.call(value);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                             Value projection                               */
/* -------------------------------------------------------------------------- */

/**
 * Project the internal selection into the consumer-facing shape for `mode`:
 * `single` → `T | null`, `multiple` → `T[]`, every range-like mode →
 * `{ start: T | null, end: T | null }`.
 */
export function toExternalValue(
  value: SelectionValue,
  mode: SelectionMode,
  adapter: ValueAdapter<unknown>,
): unknown {
  if (RANGE_MODES.has(mode)) {
    const { start, end } = value.range;
    return {
      start: start ? adapter.fromPlain(start) : null,
      end: end ? adapter.fromPlain(end) : null,
    };
  }

  if (mode === 'multiple') {
    return value.dates.map((date) => adapter.fromPlain(date));
  }

  const first = value.dates[0] ?? value.range.start ?? null;
  return first ? adapter.fromPlain(first) : null;
}
