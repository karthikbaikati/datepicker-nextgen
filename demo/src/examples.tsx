/**
 * The live examples on the showcase page.
 *
 * Every entry pairs a *running* picker with the snippet that produces it, so
 * the code on screen is the code that built the thing next to it. Anything the
 * engine reads by identity — presets, `dayMeta`, `labels`, `time` — is declared
 * at module scope: a fresh object on each render would make the hook resync the
 * engine on every keystroke elsewhere on the page.
 */

import { useMemo, useState } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

import {
  Calendar,
  DateFields,
  DatePicker,
  DatePickerProvider,
  DurationBadge,
  addDays,
  addMonths,
  analyticsPresets,
  bookingPresets,
  diffInDays,
  schedulingPresets,
  today,
  useDatePicker,
  useDatePickerContext,
} from 'datepicker-nextgen';
import type { DatePreset, DateRange, Labels, SelectionMode, TimeOptions } from 'datepicker-nextgen';

import {
  analyticsDayMeta,
  availabilityDayMeta,
  bookedRanges,
  formatPrice,
  holidayDayMeta,
  hotelDayMeta,
  nightInfo,
} from './sample-data';

/* -------------------------------------------------------------------------- */
/*                              Shared constants                              */
/* -------------------------------------------------------------------------- */

const HOTEL_LABELS: Partial<Labels> = {
  title: 'Your stay',
  startLabel: 'Check-in',
  endLabel: 'Check-out',
};

const MULTIPLE_LABELS: Partial<Labels> = { title: 'Shift days', multipleLabel: 'Days selected' };

const APPOINTMENT_LABELS: Partial<Labels> = {
  title: 'Book a slot',
  singleLabel: 'Appointment',
  selectDate: 'Choose an appointment date',
};

const AVAILABILITY_LABELS: Partial<Labels> = {
  title: 'Availability',
  startLabel: 'Arrive',
  endLabel: 'Depart',
};

const APPOINTMENT_TIME: TimeOptions = {
  enabled: true,
  minuteStep: 15,
  minTime: { hour: 9, minute: 0, second: 0 },
  maxTime: { hour: 17, minute: 45, second: 0 },
  defaultStartTime: { hour: 10, minute: 0, second: 0 },
};

const NO_PRESETS: readonly DatePreset[] = [];

const TRIP_DEFAULT = { start: addDays(today(), 9), end: addDays(today(), 16) };

/**
 * The inventory examples open on next month. This month is half in the past,
 * and a grid that is mostly struck through demonstrates nothing but `disablePast`.
 */
const NEXT_MONTH = addMonths(today(), 1);

/* -------------------------------------------------------------------------- */
/*                            The flagship hero card                          */
/* -------------------------------------------------------------------------- */

export interface ThemedProps {
  /** `data-theme` handed to the picker root. */
  theme: string;
}

/**
 * The "Trip Dates" booking card from the visual spec: one month at the card's
 * natural width, booking presets, a nights badge, real nightly rates and real
 * blocked spans, with the stay total summed in the footer.
 */
export function TripDatesCard({ theme }: ThemedProps): ReactNode {
  const [range, setRange] = useState<DateRange>(TRIP_DEFAULT);
  const total = stayTotal(range);

  return (
    <DatePicker
      mode="range"
      theme={theme}
      numberOfMonths={1}
      minNights={2}
      maxNights={30}
      disablePast
      defaultValue={TRIP_DEFAULT}
      presets={bookingPresets}
      blockedRanges={bookedRanges}
      dayMeta={hotelDayMeta}
      labels={HOTEL_LABELS}
      size="lg"
      onChange={(value) => setRange(value.range)}
      showFooter
      footerContent={
        total === null ? 'Pick your nights' : `${formatPrice(total)} total before taxes`
      }
    />
  );
}

/**
 * Sum the nightly rates across a stay. Checkout night is excluded — the range
 * is measured in nights, so the last day is not charged.
 */
function stayTotal(range: DateRange): number | null {
  const { start, end } = range;
  if (!start || !end) return null;
  const nights = diffInDays(start, end);
  if (nights <= 0) return null;
  let total = 0;
  for (let offset = 0; offset < nights; offset += 1) {
    total += nightInfo(addDays(start, offset))?.price ?? 0;
  }
  return total;
}

/* -------------------------------------------------------------------------- */
/*                         Example 2 — analytics sidebar                      */
/* -------------------------------------------------------------------------- */

/** Preset column beside the calendar, composed from the exported parts. */
function AnalyticsRange({ theme }: ThemedProps): ReactNode {
  return (
    <DatePickerProvider
      mode="range"
      rangeSemantics="days"
      numberOfMonths={2}
      disableFuture
      presets={analyticsPresets}
      dayMeta={analyticsDayMeta}
    >
      <AnalyticsShell theme={theme} />
    </DatePickerProvider>
  );
}

function AnalyticsShell({ theme }: ThemedProps): ReactNode {
  const { snapshot, getRootProps, getPresetProps } = useDatePickerContext();
  const rootProps = getRootProps({
    className: 'dx-analytics',
    'data-theme': theme,
    'data-size': 'sm',
  }) as HTMLAttributes<HTMLDivElement>;

  return (
    <div {...rootProps}>
      <div className="dx-analytics__body">
        <nav className="dx-analytics__rail" aria-label="Date range presets">
          {snapshot.presets.map((preset) => (
            <button
              key={preset.id}
              {...(getPresetProps(preset, {
                className: 'dx-rail__item',
              }) as ButtonHTMLAttributes<HTMLButtonElement>)}
            >
              <span>{preset.label}</span>
              {preset.resolvedHint ? <small>{preset.resolvedHint}</small> : null}
            </button>
          ))}
        </nav>
        <div className="dpng-card dx-analytics__card">
          <div className="dpng-header">
            <span className="dpng-header__title">Reporting period</span>
            <DurationBadge />
          </div>
          <DateFields />
          <Calendar />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                       Example 5 — month / quarter toggle                   */
/* -------------------------------------------------------------------------- */

const UNIT_MODES: readonly { id: SelectionMode; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
];

/** One picker, three unit modes — switching keeps the engine and its state. */
function UnitPicker({ theme }: ThemedProps): ReactNode {
  const [mode, setMode] = useState<SelectionMode>('quarter');

  return (
    <div className="dx-unit">
      <div className="dx-segmented" role="group" aria-label="Selection unit">
        {UNIT_MODES.map((unit) => (
          <button
            key={unit.id}
            type="button"
            aria-pressed={mode === unit.id}
            onClick={() => setMode(unit.id)}
          >
            {unit.label}
          </button>
        ))}
      </div>
      <div className="dx-unit__picker">
        <DatePicker
          mode={mode}
          theme={theme}
          numberOfMonths={mode === 'year' ? 1 : 2}
          monthCaptionLayout="dropdown"
          rangeSemantics="days"
          presets={NO_PRESETS}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                       Example 10 — fully headless UI                       */
/* -------------------------------------------------------------------------- */

/**
 * No card, no grid — the month rendered as a horizontal availability strip.
 *
 * Everything that makes the strip accessible (roving tab index, ARIA state,
 * keyboard handling, hover preview, constraint rejection) comes out of the
 * prop getters, not out of this component.
 */
function HeadlessStrip({ theme }: ThemedProps): ReactNode {
  const {
    snapshot,
    getRootProps,
    getDayProps,
    getFieldProps,
    getPreviousMonthProps,
    getNextMonthProps,
    getClearProps,
  } = useDatePicker({
    mode: 'range',
    minNights: 2,
    disablePast: true,
    blockedRanges: bookedRanges,
    dayMeta: hotelDayMeta,
  });

  const days = useMemo(
    () => snapshot.months.flatMap((month) => month.days.filter((day) => day.inCurrentMonth)),
    [snapshot.months],
  );

  const weekdayNames = useMemo(
    () => new Map(snapshot.weekdays.map((weekday) => [weekday.weekday, weekday.short])),
    [snapshot.weekdays],
  );

  const rootProps = getRootProps({
    className: 'dx-strip',
    'data-theme': theme,
  }) as HTMLAttributes<HTMLDivElement>;

  return (
    <div {...rootProps}>
      <header className="dx-strip__head">
        <div className="dx-strip__fields">
          <button
            {...getFieldProps('start', {
              className: 'dx-strip__field',
            })}
          >
            <small>Check-in</small>
            <strong>{snapshot.startLabel}</strong>
          </button>
          <button
            {...getFieldProps('end', {
              className: 'dx-strip__field',
            })}
          >
            <small>Check-out</small>
            <strong>{snapshot.endLabel}</strong>
          </button>
        </div>
        <div className="dx-strip__actions">
          <span className="dx-strip__duration">{snapshot.durationLabel || 'Pick two dates'}</span>
          <button
            {...getPreviousMonthProps({
              className: 'dx-strip__nav',
            })}
          >
            ‹
          </button>
          <button
            {...getNextMonthProps({
              className: 'dx-strip__nav',
            })}
          >
            ›
          </button>
          <button
            {...getClearProps({
              className: 'dx-strip__clear',
            })}
          >
            Clear
          </button>
        </div>
      </header>

      <ol className="dx-strip__rail">
        {days.map((day) => {
          const night = nightInfo(day.date);
          return (
            <li key={day.key}>
              <button
                {...getDayProps(day, {
                  className: 'dx-strip__day',
                })}
              >
                <em>{weekdayNames.get(day.weekday) ?? ''}</em>
                <span>{day.label}</span>
                <small>{night && !night.soldOut ? formatPrice(night.price) : '—'}</small>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="dx-strip__caption">
        {snapshot.summary || 'Scroll the strip, or use the arrow keys.'}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Registry                                  */
/* -------------------------------------------------------------------------- */

export interface GalleryExample {
  readonly id: string;
  readonly title: string;
  readonly caption: string;
  /** The snippet shown in the collapsible drawer under the card. */
  readonly code: string;
  readonly render: (theme: string) => ReactNode;
}

export const galleryExamples: readonly GalleryExample[] = [
  {
    id: 'hotel',
    title: 'Hotel booking',
    caption:
      'Per-night rates arrive through dayMeta, already-booked spans through blockedRanges. A range cannot be dragged across a booked night, and two nights is the floor.',
    code: `
<DatePicker
  mode="range"
  size="lg"
  numberOfMonths={2}
  minNights={2}
  disablePast
  dayMeta={hotelDayMeta}
  blockedRanges={bookedRanges}
  labels={{ title: 'Your stay', startLabel: 'Check-in', endLabel: 'Check-out' }}
/>
`,
    render: (theme) => (
      <DatePicker
        mode="range"
        theme={theme}
        size="lg"
        numberOfMonths={2}
        minNights={2}
        disablePast
        defaultMonth={NEXT_MONTH}
        dayMeta={hotelDayMeta}
        blockedRanges={bookedRanges}
        labels={HOTEL_LABELS}
      />
    ),
  },
  {
    id: 'analytics',
    title: 'Analytics range',
    caption:
      'A preset rail instead of a chip row: DatePickerProvider owns the engine, getPresetProps wires the buttons, and the bundled parts fill the card.',
    code: `
<DatePickerProvider
  mode="range"
  rangeSemantics="days"
  numberOfMonths={2}
  disableFuture
  presets={analyticsPresets}
  dayMeta={analyticsDayMeta}
>
  <nav aria-label="Date range presets">
    {snapshot.presets.map((preset) => (
      <button key={preset.id} {...getPresetProps(preset)}>
        {preset.label}
        <small>{preset.resolvedHint}</small>
      </button>
    ))}
  </nav>
  <DateFields />
  <Calendar />
</DatePickerProvider>
`,
    render: (theme) => <AnalyticsRange theme={theme} />,
  },
  {
    id: 'multiple',
    title: 'Multiple dates',
    caption:
      'Up to five individual dates. rollingSelection evicts the oldest pick instead of rejecting the sixth, so the picker never dead-ends.',
    code: `
<DatePicker
  mode="multiple"
  numberOfMonths={2}
  maxSelections={5}
  rollingSelection
  disablePast
  dayMeta={holidayDayMeta}
  labels={{ title: 'Shift days' }}
/>
`,
    render: (theme) => (
      <DatePicker
        mode="multiple"
        theme={theme}
        numberOfMonths={2}
        maxSelections={5}
        rollingSelection
        disablePast
        dayMeta={holidayDayMeta}
        labels={MULTIPLE_LABELS}
      />
    ),
  },
  {
    id: 'week',
    title: 'Week picker',
    caption:
      'mode="week" turns any click into the whole ISO week. The week-number column comes free, and firstDayOfWeek moves the boundary with the locale.',
    code: `
<DatePicker
  mode="week"
  showWeekNumbers
  firstDayOfWeek={1}
  numberOfMonths={2}
  rangeSemantics="days"
/>
`,
    render: (theme) => (
      <DatePicker
        mode="week"
        theme={theme}
        showWeekNumbers
        firstDayOfWeek={1}
        numberOfMonths={2}
        rangeSemantics="days"
      />
    ),
  },
  {
    id: 'unit',
    title: 'Month, quarter, year',
    caption:
      'Three coarse-grained modes over one engine. Switching the mode prop keeps the current view and focus — nothing is remounted.',
    code: `
const [mode, setMode] = useState('quarter');

<DatePicker
  mode={mode}
  numberOfMonths={2}
  monthCaptionLayout="dropdown"
  rangeSemantics="days"
/>
`,
    render: (theme) => <UnitPicker theme={theme} />,
  },
  {
    id: 'time',
    title: 'Date and time',
    caption:
      'An appointment slot: business hours only, quarter-hour steps, and a 12- or 24-hour clock chosen by the locale rather than by a prop.',
    code: `
<DatePicker
  mode="single"
  disablePast
  disableWeekends
  showTodayButton
  time={{
    enabled: true,
    minuteStep: 15,
    minTime: { hour: 9, minute: 0, second: 0 },
    maxTime: { hour: 17, minute: 45, second: 0 },
  }}
/>
`,
    render: (theme) => (
      <DatePicker
        mode="single"
        theme={theme}
        disablePast
        disableWeekends
        showTodayButton
        presets={schedulingPresets}
        time={APPOINTMENT_TIME}
        labels={APPOINTMENT_LABELS}
      />
    ),
  },
  {
    id: 'availability',
    title: 'Availability',
    caption:
      'Booked spans are unselectable and struck through, and preventCrossingBlocked stops a range from spanning one. Remaining inventory rides along in dayMeta.',
    code: `
<DatePicker
  mode="range"
  size="lg"
  numberOfMonths={2}
  disablePast
  preventCrossingBlocked
  blockedRanges={bookedRanges}
  dayMeta={availabilityDayMeta}
  onInvalidSelection={(date, evaluation) => toast(evaluation.message)}
/>
`,
    render: (theme) => (
      <DatePicker
        mode="range"
        theme={theme}
        size="lg"
        numberOfMonths={2}
        disablePast
        defaultMonth={NEXT_MONTH}
        preventCrossingBlocked
        blockedRanges={bookedRanges}
        dayMeta={availabilityDayMeta}
        presets={NO_PRESETS}
        labels={AVAILABILITY_LABELS}
      />
    ),
  },
  {
    id: 'vertical',
    title: 'Vertical scroll',
    caption:
      'The mobile pattern: months stacked in one scroller with sticky captions. Same engine, same keyboard model, no separate component.',
    code: `
<DatePicker
  mode="range"
  orientation="vertical"
  numberOfMonths={5}
  size="lg"
  disablePast
  blockedRanges={bookedRanges}
/>
`,
    render: (theme) => (
      <DatePicker
        mode="range"
        theme={theme}
        orientation="vertical"
        numberOfMonths={5}
        size="lg"
        disablePast
        defaultMonth={NEXT_MONTH}
        blockedRanges={bookedRanges}
        presets={NO_PRESETS}
      />
    ),
  },
  {
    id: 'headless',
    title: 'Headless strip',
    caption:
      'The same engine with none of the bundled markup: a horizontal rail of days built only from getRootProps, getDayProps and getFieldProps. Arrow keys, ARIA and the range preview still work.',
    code: `
const { snapshot, getRootProps, getDayProps, getFieldProps } = useDatePicker({
  mode: 'range',
  minNights: 2,
  disablePast: true,
});

<div {...getRootProps({ className: 'strip' })}>
  <button {...getFieldProps('start')}>{snapshot.startLabel}</button>
  <button {...getFieldProps('end')}>{snapshot.endLabel}</button>

  <ol className="strip__rail">
    {snapshot.months
      .flatMap((month) => month.days)
      .filter((day) => day.inCurrentMonth)
      .map((day) => (
        <li key={day.key}>
          <button {...getDayProps(day, { className: 'strip__day' })}>
            <span>{day.label}</span>
            <small>{day.meta?.note}</small>
          </button>
        </li>
      ))}
  </ol>
</div>
`,
    render: (theme) => <HeadlessStrip theme={theme} />,
  },
];
