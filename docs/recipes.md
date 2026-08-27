# Recipes

Sixteen worked examples for real product problems. Each one is complete and copy-pasteable.

1. [Hotel booking with per-night prices](#1-hotel-booking-with-per-night-prices)
2. [Flight search with a flexible-dates strip](#2-flight-search-with-a-flexible-dates-strip)
3. [Availability from an API, with a loading state](#3-availability-from-an-api-with-a-loading-state)
4. [Business-days picker](#4-business-days-picker)
5. [Fiscal-quarter picker](#5-fiscal-quarter-picker)
6. [Birthday picker with a year dropdown](#6-birthday-picker-with-a-year-dropdown)
7. [Appointment slots with time](#7-appointment-slots-with-time)
8. [Responsive: two months on desktop, one on mobile](#8-responsive-two-months-on-desktop-one-on-mobile)
9. [RTL: Arabic locale](#9-rtl-arabic-locale)
10. [A preset that reads from your own state](#10-a-preset-that-reads-from-your-own-state)
11. [react-hook-form](#11-react-hook-form)
12. [Formik](#12-formik)
13. [Next.js App Router](#13-nextjs-app-router)
14. [Testing with Testing Library](#14-testing-with-testing-library)
15. [Dashboard range synced to the URL](#15-dashboard-range-synced-to-the-url)
16. [Explaining rejections with a toast](#16-explaining-rejections-with-a-toast)

---

## 1. Hotel booking with per-night prices

Prices and a "cheapest night" badge go in through `dayMeta`. It is called for **every rendered day
on every snapshot**, so back it with a `Map` and memoize it — never do work per call.

```tsx
import { useCallback, useMemo } from 'react';
import { DatePicker } from 'datepicker-nextgen';
import { toISODate } from 'datepicker-nextgen/core';
import type { DayMeta, PlainDate } from 'datepicker-nextgen';

interface Night {
  price: number;
  isDeal: boolean;
}

export function RatesCalendar({ rates }: { rates: Record<string, Night> }) {
  const table = useMemo(() => new Map(Object.entries(rates)), [rates]);

  const dayMeta = useCallback(
    (date: PlainDate): DayMeta | null => {
      const night = table.get(toISODate(date));
      if (!night) return null;
      return {
        note: `$${night.price}`,
        badge: night.isDeal ? '%' : undefined,
        tooltip: night.isDeal ? `$${night.price} — deal night` : `$${night.price}`,
        className: night.isDeal ? 'rate-deal' : undefined,
      };
    },
    [table],
  );

  return (
    <DatePicker
      mode="range"
      size="lg"
      numberOfMonths={2}
      minNights={2}
      disablePast
      dayMeta={dayMeta}
      blockedRanges={[{ start: '2026-09-11', end: '2026-09-14' }]}
    />
  );
}
```

```css
/* `note` renders in .dpng-day__note; give the cell room and colour the deal nights. */
.dpng {
  --dpng-cell-size: 52px;
}
.dpng-day__note {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.rate-deal .dpng-day__note {
  color: #047857;
  font-weight: 600;
}
```

## 2. Flight search with a flexible-dates strip

A `single` picker for the outbound date, plus a ±3-day strip built from the same engine so both stay
in sync. `useDatePicker` gives you the state; the strip is just your own markup.

```tsx
import { useDatePicker } from 'datepicker-nextgen';
import { DatePickerProvider, Calendar, CalendarNav } from 'datepicker-nextgen';
import { addDays, toISODate } from 'datepicker-nextgen/core';

const OFFSETS = [-3, -2, -1, 0, 1, 2, 3];

export function FlexibleDates({ fares }: { fares: Record<string, number> }) {
  const picker = useDatePicker({ mode: 'single', disablePast: true });
  const selected = picker.snapshot.value.dates[0] ?? picker.snapshot.today;

  return (
    <DatePickerProvider picker={picker}>
      <CalendarNav />
      <Calendar />

      <ul className="fare-strip">
        {OFFSETS.map((offset) => {
          const date = addDays(selected, offset);
          const key = toISODate(date);
          const fare = fares[key];
          return (
            <li key={key}>
              <button
                type="button"
                aria-current={offset === 0 ? 'true' : undefined}
                onClick={() => picker.actions.select(date)}
              >
                <span>{date.day}</span>
                <strong>{fare != null ? `$${fare}` : '—'}</strong>
              </button>
            </li>
          );
        })}
      </ul>
    </DatePickerProvider>
  );
}
```

`actions.select` runs the same constraint pipeline as a click, so a fare button for a sold-out day
is rejected exactly like the cell would be.

## 3. Availability from an API, with a loading state

Two rules: while availability is loading, block **everything** with an empty allowlist rather than
letting the user pick something you will have to reject; and refetch when the month changes.

```tsx
import { useEffect, useState } from 'react';
import { DatePicker } from 'datepicker-nextgen';
import type { DateRangeInput, PlainDate } from 'datepicker-nextgen';

export function ApiAvailability({ listingId }: { listingId: string }) {
  const [month, setMonth] = useState<PlainDate | string>('2026-09-01');
  const [blocked, setBlocked] = useState<DateRangeInput[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBlocked(null);
    fetch(`/api/listings/${listingId}/availability?month=${monthKey(month)}`)
      .then((r) => r.json())
      .then((data: DateRangeInput[]) => {
        if (!cancelled) setBlocked(data);
      });
    return () => {
      cancelled = true;
    };
  }, [listingId, month]);

  const loading = blocked === null;

  return (
    <div aria-busy={loading}>
      <DatePicker
        mode="range"
        month={month}
        onMonthChange={setMonth}
        numberOfMonths={2}
        minNights={2}
        disablePast
        // An empty allowlist disables every day — the honest "not loaded yet" state.
        enabledDates={loading ? [] : undefined}
        blockedRanges={blocked ?? []}
        className={loading ? 'is-loading' : undefined}
      />
      {loading && <p role="status">Checking availability…</p>}
    </div>
  );
}

const monthKey = (m: PlainDate | string) =>
  typeof m === 'string' ? m.slice(0, 7) : `${m.year}-${String(m.month).padStart(2, '0')}`;
```

An **empty `disabledDates: []`** means "nothing is blocked". An **empty `enabledDates: []`** means
"nothing is allowed". That asymmetry is deliberate, and it is what makes the loading state work.

## 4. Business-days picker

```tsx
import { useMemo } from 'react';
import { DatePicker } from 'datepicker-nextgen';
import { toISODate } from 'datepicker-nextgen/core';
import type { PlainDate } from 'datepicker-nextgen';

const HOLIDAYS = new Set(['2026-01-01', '2026-07-03', '2026-11-26', '2026-12-25']);

export function DeliveryDate() {
  const disabledDates = useMemo(() => (date: PlainDate) => HOLIDAYS.has(toISODate(date)), []);

  return (
    <DatePicker
      mode="single"
      disableWeekends
      disablePast
      disabledDates={disabledDates}
      dayMeta={(date) => (HOLIDAYS.has(toISODate(date)) ? { holiday: 'Public holiday' } : null)}
      labels={{ title: 'Delivery date', singleLabel: 'Deliver on' }}
    />
  );
}
```

`disableWeekends` is shorthand for `disabledDaysOfWeek: [0, 6]`. For a Friday–Saturday weekend, pass
`disabledDaysOfWeek={[5, 6]}` instead — the _visual_ weekend shading always follows the locale.

## 5. Fiscal-quarter picker

Calendar quarters come free with `mode="quarter"`. A fiscal year that starts in a different month
needs presets — build them once, at module scope.

```tsx
import { DatePicker } from 'datepicker-nextgen';
import {
  addMonths,
  addYears,
  createPreset,
  endOfMonth,
  plainDate,
  startOfMonth,
} from 'datepicker-nextgen/core';

/** FY starts in February, so Q1 = Feb–Apr. */
function fiscalQuarter(index: 0 | 1 | 2 | 3, yearOffset = 0) {
  return createPreset({
    id: `fy-q${index + 1}${yearOffset ? `-${yearOffset}` : ''}`,
    label: `Q${index + 1}${yearOffset === -1 ? ' (last FY)' : ''}`,
    group: yearOffset === -1 ? 'Last fiscal year' : 'This fiscal year',
    getValue: (ctx) => {
      const fyStartYear = ctx.today.month >= 2 ? ctx.today.year : ctx.today.year - 1;
      const base = addYears(plainDate(fyStartYear, 2, 1), yearOffset);
      const start = startOfMonth(addMonths(base, index * 3));
      return ctx.clamp({ dates: [], range: { start, end: endOfMonth(addMonths(start, 2)) } });
    },
  });
}

const FISCAL = [
  fiscalQuarter(0),
  fiscalQuarter(1),
  fiscalQuarter(2),
  fiscalQuarter(3),
  fiscalQuarter(0, -1),
  fiscalQuarter(1, -1),
  fiscalQuarter(2, -1),
  fiscalQuarter(3, -1),
];

export const FiscalPicker = () => (
  <DatePicker mode="range" rangeSemantics="days" presets={FISCAL} disableFuture />
);
```

`ctx.clamp` returns `null` when the produced range cannot be made valid — a future quarter under
`disableFuture`, say — and the chip disables itself. Add `hideWhenInvalid: true` to remove it
entirely instead.

## 6. Birthday picker with a year dropdown

```tsx
import { DatePicker } from 'datepicker-nextgen';
import { addYears, today } from 'datepicker-nextgen/core';

const now = today();

export const BirthdayField = () => (
  <DatePicker
    mode="single"
    showNavSelects // month + year <select>s in the nav row
    minDate={addYears(now, -120)}
    maxDate={now}
    defaultMonth={addYears(now, -30)}
    presets={[]} // no chips on a birthday field
    showHeader={false}
    labels={{ singleLabel: 'Date of birth', selectDate: 'Select your date of birth' }}
  />
);
```

The year dropdown spans ±12 years around the visible month and is clamped to `minDate`/`maxDate`, so
`defaultMonth` is what puts the user in the right decade — set it to a plausible birth year rather
than today.

## 7. Appointment slots with time

```tsx
import { useState } from 'react';
import { DatePicker } from 'datepicker-nextgen';
import { toISODate } from 'datepicker-nextgen/core';
import type { PlainDate, PlainTime } from 'datepicker-nextgen';

const OPEN_SLOTS: Record<string, string[]> = {
  '2026-09-08': ['09:00', '09:30', '11:00', '14:30'],
  '2026-09-09': ['10:00', '15:00'],
};

export function Booking() {
  const [date, setDate] = useState<PlainDate | null>(null);
  const [time, setTime] = useState<PlainTime | null>(null);
  const slots = date ? (OPEN_SLOTS[toISODate(date)] ?? []) : [];

  return (
    <>
      <DatePicker
        mode="single"
        disablePast
        // Only days with an open slot are selectable.
        enabledDates={(d) => (OPEN_SLOTS[toISODate(d)]?.length ?? 0) > 0}
        dayMeta={(d) => {
          const count = OPEN_SLOTS[toISODate(d)]?.length ?? 0;
          return count > 0 ? { note: `${count} slots` } : null;
        }}
        onChange={(value) => {
          setDate(value.dates[0] ?? null);
          setTime(null);
        }}
      />

      <fieldset disabled={!date}>
        <legend>Time</legend>
        {slots.map((slot) => (
          <button
            key={slot}
            type="button"
            aria-pressed={format(time) === slot}
            onClick={() => setTime(parse(slot))}
          >
            {slot}
          </button>
        ))}
      </fieldset>
    </>
  );
}

const parse = (hhmm: string): PlainTime => {
  const [h = '0', m = '0'] = hhmm.split(':');
  return { hour: Number(h), minute: Number(m), second: 0 };
};
const format = (t: PlainTime | null) =>
  t ? `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}` : '';
```

If your slots are a regular grid rather than a list, use the built-in time row instead:

```tsx
<DatePicker
  mode="single"
  time={{
    enabled: true,
    minuteStep: 30,
    minTime: { hour: 9, minute: 0, second: 0 },
    maxTime: { hour: 17, minute: 30, second: 0 },
  }}
  onChange={(value) => setSlot({ date: value.dates[0], time: value.times?.start })}
/>
```

## 8. Responsive: two months on desktop, one on mobile

Switch the option, not the component — the engine keeps its state across the change.

```tsx
import { useSyncExternalStore } from 'react';
import { DatePicker } from 'datepicker-nextgen';

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false, // server snapshot: assume mobile, then hydrate
  );
}

export function ResponsivePicker() {
  const wide = useMediaQuery('(min-width: 768px)');

  return (
    <DatePicker
      mode="range"
      numberOfMonths={wide ? 2 : 1}
      variant={wide ? 'popover' : 'sheet'}
      size={wide ? 'md' : 'lg'}
      orientation={wide ? 'horizontal' : 'vertical'}
    />
  );
}
```

Bigger cells on touch are worth it: `size="lg"` takes the cell from 36px to 44px, which clears the
44×44 target-size guidance.

## 9. RTL: Arabic locale

```tsx
<DatePicker
  mode="range"
  locale="ar-EG"
  numberOfMonths={2}
  labels={{
    title: 'اختر التواريخ',
    startLabel: 'تاريخ الوصول',
    endLabel: 'تاريخ المغادرة',
    clear: 'مسح',
    emptyValue: 'أضف تاريخًا',
    chooseStart: 'أضف تاريخًا',
    chooseEnd: 'أضف تاريخًا',
  }}
/>
```

You do not set `dir` yourself: the engine derives `direction` from the locale and the root gets
`dir="rtl"`. The chevrons mirror, the months lay out right-to-left, and the arrow keys swap so
"left" always means _visually_ left. Numerals follow the locale's numbering system —
`locale="ar-EG"` gives Eastern Arabic numerals, `locale="ar-EG-u-nu-latn"` gives Latin ones.

Define the `labels` object at module scope (or in `useMemo`) — it is diffed by reference.

## 10. A preset that reads from your own state

`getValue` is a closure. It only ever gets `PresetContext`, so anything else has to come from
outside — which is fine, as long as you rebuild the preset when that outside data changes.

```tsx
import { useMemo } from 'react';
import { DatePicker } from 'datepicker-nextgen';
import { createPreset, toPlainDate, analyticsPresets } from 'datepicker-nextgen/core';

export function ReportRange({ lastExportedAt }: { lastExportedAt: string | null }) {
  const presets = useMemo(() => {
    const sinceExport = createPreset({
      id: 'since-export',
      label: 'Since last export',
      hideWhenInvalid: true, // no export yet → no chip
      getValue: (ctx) => {
        const start = toPlainDate(lastExportedAt);
        return start ? ctx.clamp({ dates: [], range: { start, end: ctx.today } }) : null;
      },
    });
    return [sinceExport, ...analyticsPresets];
  }, [lastExportedAt]);

  return <DatePicker mode="range" rangeSemantics="days" presets={presets} disableFuture />;
}
```

Give a preset a `shortcut` (`shortcut: 'e'`) and it gains a keyboard accelerator. Single-letter
shortcuts registered this way take priority over the built-in `t` (jump to today).

## 11. react-hook-form

```tsx
import { Controller, useForm } from 'react-hook-form';
import { DatePicker } from 'datepicker-nextgen';
import { isoStringAdapter, toExternalValue } from 'datepicker-nextgen/core';

interface StayForm {
  stay: { start: string | null; end: string | null };
}

export function StayForm() {
  const { control, handleSubmit, formState } = useForm<StayForm>({
    defaultValues: { stay: { start: null, end: null } },
  });

  return (
    <form onSubmit={handleSubmit((data) => book(data.stay))}>
      <Controller
        name="stay"
        control={control}
        rules={{ validate: (v) => (v.start && v.end) || 'Pick both dates' }}
        render={({ field, fieldState }) => (
          <>
            <DatePicker
              mode="range"
              minNights={2}
              disablePast
              value={field.value}
              valueAdapter={isoStringAdapter}
              onChange={(value) =>
                field.onChange(toExternalValue(value, 'range', isoStringAdapter))
              }
            />
            {fieldState.error && <p role="alert">{fieldState.error.message}</p>}
          </>
        )}
      />
      <button type="submit" disabled={formState.isSubmitting}>
        Book
      </button>
    </form>
  );
}
```

Because the picker is controlled by `field.value`, RHF's `reset()` and `setValue()` drive it as you
would expect. `isoStringAdapter` keeps `{ start: '2026-09-04', end: '2026-09-25' }` in the form
state — exactly the JSON you want to POST.

## 12. Formik

```tsx
import { Formik, Form, useField } from 'formik';
import { DatePicker } from 'datepicker-nextgen';
import { isoStringAdapter, toExternalValue } from 'datepicker-nextgen/core';

function DateRangeField({ name }: { name: string }) {
  const [field, meta, helpers] = useField<{ start: string | null; end: string | null }>(name);

  return (
    <>
      <DatePicker
        mode="range"
        value={field.value}
        valueAdapter={isoStringAdapter}
        onChange={(value) =>
          helpers.setValue(toExternalValue(value, 'range', isoStringAdapter) as typeof field.value)
        }
        onComplete={() => helpers.setTouched(true)}
      />
      {meta.touched && meta.error && <p role="alert">{String(meta.error)}</p>}
    </>
  );
}

export const Wrapped = () => (
  <Formik initialValues={{ stay: { start: null, end: null } }} onSubmit={book}>
    <Form>
      <DateRangeField name="stay" />
      <button type="submit">Book</button>
    </Form>
  </Formik>
);
```

Mark the field touched on `onComplete`, not `onChange` — otherwise "pick both dates" fires the
moment the user has picked only the first.

## 13. Next.js App Router

The picker is interactive, so it lives in a client component. The `core` entry is pure and safe to
import from a server component if you need to precompute constraints.

```tsx
// app/booking/date-picker.tsx
'use client';

import { DatePicker } from 'datepicker-nextgen';
import type { DateRangeInput } from 'datepicker-nextgen';

export function BookingPicker({
  blocked,
  timeZone,
}: {
  blocked: DateRangeInput[];
  timeZone: string;
}) {
  return (
    <DatePicker
      mode="range"
      minNights={2}
      disablePast
      timeZone={timeZone}
      blockedRanges={blocked}
      numberOfMonths={2}
    />
  );
}
```

```tsx
// app/booking/page.tsx  — a server component
import { BookingPicker } from './date-picker';
import 'datepicker-nextgen/styles.css';

export default async function Page() {
  const blocked = await getBlockedRanges();
  // Pin the zone the *listing* is in, so the server and the browser agree on "today".
  return <BookingPicker blocked={blocked} timeZone="America/New_York" />;
}
```

Import the stylesheet once, from a server component or from `app/layout.tsx`. The most common
hydration warning here is a month mismatch: the server's "today" is the server's timezone. Pass an
explicit `timeZone`, or an explicit `today`, and it disappears.

## 14. Testing with Testing Library

Freeze `today` and the whole picker becomes deterministic.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { DatePicker } from 'datepicker-nextgen';

const setup = (props = {}) => {
  const onComplete = vi.fn();
  render(
    <DatePicker
      mode="range"
      today="2026-09-04"
      defaultMonth="2026-09-01"
      minNights={2}
      onComplete={onComplete}
      {...props}
    />,
  );
  return { onComplete, user: userEvent.setup() };
};

test('picks a range that satisfies the minimum stay', async () => {
  const { onComplete, user } = setup();

  await user.click(screen.getByRole('gridcell', { name: /September 8, 2026/ }));
  await user.click(screen.getByRole('gridcell', { name: /September 12, 2026/ }));

  expect(onComplete).toHaveBeenCalledTimes(1);
  const [value] = onComplete.mock.calls[0]!;
  expect(value.range.start).toEqual({ year: 2026, month: 9, day: 8 });
  expect(value.range.end).toEqual({ year: 2026, month: 9, day: 12 });
});

test('a one-night stay is rejected, not selected', async () => {
  const onInvalidSelection = vi.fn();
  const { user } = setup({ onInvalidSelection });

  await user.click(screen.getByRole('gridcell', { name: /September 8, 2026/ }));
  await user.click(screen.getByRole('gridcell', { name: /September 9, 2026/ }));

  const [, evaluation] = onInvalidSelection.mock.calls[0]!;
  expect(evaluation.reason).toBe('min-nights');
});

test('the grid is keyboard navigable', async () => {
  const { user } = setup();
  await user.tab(); // lands on the roving-tabindex cell
  await user.keyboard('{ArrowRight}{ArrowDown}{Enter}');
  expect(screen.getByRole('gridcell', { selected: true })).toBeInTheDocument();
});
```

Query notes that save time:

- Day cells are `role="gridcell"` with a full localized `aria-label`
  (`"Friday, September 4, 2026"`), so `getByRole('gridcell', { name: /September 4, 2026/ })` is the
  stable query. Never match on the bare day number — it appears in two months at once.
- Unavailable days are **not** `disabled`; they carry `aria-disabled="true"`. Assert with
  `toHaveAttribute('aria-disabled', 'true')`, not `toBeDisabled()`.
- Prefer `today="2026-09-04"` over faking timers. It is the same option the engine uses for every
  derived date, and it does not slow your suite down.
- Testing the headless layer needs no DOM at all: `createDatePicker({ today: '2026-09-04' })`,
  `engine.select(…)`, `engine.getSnapshot()`.

## 15. Dashboard range synced to the URL

```tsx
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DatePicker } from 'datepicker-nextgen';
import { analyticsPresets, isoStringAdapter, toExternalValue } from 'datepicker-nextgen/core';
import type { SelectionValue } from 'datepicker-nextgen';

export function DashboardRange() {
  const [params, setParams] = useSearchParams();
  const value = { start: params.get('from'), end: params.get('to') };

  const onComplete = useCallback(
    (selection: SelectionValue) => {
      const iso = toExternalValue(selection, 'range', isoStringAdapter) as {
        start: string | null;
        end: string | null;
      };
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (iso.start) next.set('from', iso.start);
          else next.delete('from');
          if (iso.end) next.set('to', iso.end);
          else next.delete('to');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return (
    <DatePicker
      mode="range"
      rangeSemantics="days"
      value={value}
      presets={analyticsPresets}
      disableFuture
      variant="popover"
      onComplete={onComplete}
    />
  );
}
```

Commit on `onComplete`, not `onChange` — otherwise every half-picked range pushes a history entry.

## 16. Explaining rejections with a toast

Every rejection carries a typed reason and a ready-made message. Use the reason for your own copy
and the message as the fallback.

```tsx
import { DatePicker } from 'datepicker-nextgen';
import { getWeekday, toISODate } from 'datepicker-nextgen/core';
import type { DayEvaluation, PlainDate } from 'datepicker-nextgen';

const COPY: Partial<Record<NonNullable<DayEvaluation['reason']>, string>> = {
  'min-nights': 'This property has a two-night minimum.',
  'max-nights': 'Stays longer than 28 nights need to be booked by phone.',
  'crosses-blocked': 'Someone else is staying in the middle of those dates.',
  'blocked-range': 'That night is already booked.',
  'before-min': 'Pick a date from today onwards.',
};

export function Explained() {
  const onInvalidSelection = (date: PlainDate, evaluation: DayEvaluation) => {
    const reason = evaluation.reason;
    toast((reason && COPY[reason]) ?? evaluation.message ?? 'That date is not available.', {
      id: toISODate(date),
    });
  };

  return (
    <DatePicker
      mode="range"
      minNights={2}
      maxNights={28}
      disablePast
      blockedRanges={[{ start: '2026-09-11', end: '2026-09-14' }]}
      onInvalidSelection={onInvalidSelection}
      isDateUnavailable={(date, ctx) =>
        // No check-ins on a Sunday — but check-outs are fine.
        ctx.activeField === 'start' && getWeekday(date) === 0
          ? { selectable: false, reason: 'custom', message: 'No Sunday check-ins.' }
          : false
      }
    />
  );
}
```

The same reason reaches the cell as `data-disabled` plus `DayInfo.disabledReason`, and the cell's
`aria-label` gains a state suffix — so a screen-reader user hears it too, without your toast.

---

More: **[headless.md](./headless.md)** to build the UI yourself, **[theming.md](./theming.md)** to
restyle the bundled one, **[vanilla.md](./vanilla.md)** for pages without React.
