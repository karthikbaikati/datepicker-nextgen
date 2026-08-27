/**
 * Fly — two months at once, and a flexible-dates strip that moves the range.
 *
 * This is the section that proves the picker is *controlled* as happily as it
 * is uncontrolled: the fare strip below the calendar writes a new range into
 * the `value` prop, and the calendar follows it — selection, preview, focus,
 * announcement and all — without the strip knowing anything about the grid.
 */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  DatePicker,
  addDays,
  addMonths,
  compareDates,
  startOfMonth,
  today,
} from 'datepicker-nextgen';
import type { DateRange, Labels, PlainDate } from 'datepicker-nextgen';

import { destinationById, fareDayMeta, formatPrice, legFare, roundTripFare } from '../sample-data';
import { dayMonth, weekdayDayMonth } from './format';
import { Reveal, useMediaQuery } from './motion';
import { PlaneGlyph } from './scenery';
import { usePickerScope } from './scope';
import { PropNote, TravelSection } from './section';

const FLIGHT_LABELS: Partial<Labels> = {
  title: 'Outbound and back',
  startLabel: 'Depart',
  endLabel: 'Return',
};

const NEXT_MONTH = startOfMonth(addMonths(today(), 1));

const FLY_DEFAULT: DateRange = {
  start: addDays(NEXT_MONTH, 12),
  end: addDays(NEXT_MONTH, 19),
};

/** Your invented home airport. */
const ORIGIN = { city: 'Los Angeles', code: 'LAX' };

/** The window the flexible strip looks across, in days either side. */
const FLEX = 3;

interface FlexOption {
  readonly offset: number;
  readonly depart: PlainDate;
  readonly back: PlainDate;
  readonly total: number;
  readonly disabled: boolean;
}

export interface FlySectionProps {
  destinationId: string;
}

export function FlySection({ destinationId }: FlySectionProps): ReactNode {
  const scope = usePickerScope('sea');
  const narrow = useMediaQuery('(max-width: 1120px)');
  const [range, setRange] = useState<DateRange>(FLY_DEFAULT);

  const destination = destinationById(destinationId);
  const dayMeta = fareDayMeta(destinationId);

  const options = useMemo<readonly FlexOption[]>(() => {
    const { start, end } = range;
    if (!start || !end) return [];
    const floor = today();
    const built: FlexOption[] = [];
    for (let offset = -FLEX; offset <= FLEX; offset += 1) {
      const depart = addDays(start, offset);
      const back = addDays(end, offset);
      built.push({
        offset,
        depart,
        back,
        total: roundTripFare(destinationId, depart, back),
        disabled: compareDates(depart, floor) < 0,
      });
    }
    return built;
  }, [destinationId, range]);

  const cheapest = useMemo(() => {
    let best: FlexOption | null = null;
    for (const option of options) {
      if (option.disabled) continue;
      if (!best || option.total < best.total) best = option;
    }
    return best;
  }, [options]);

  const current = options.find((option) => option.offset === 0) ?? null;
  const saving = current && cheapest ? current.total - cheapest.total : 0;

  return (
    <TravelSection
      id="fly"
      kicker="Fly"
      title={
        <>
          Two months, seven fares, <em>one</em> decision.
        </>
      }
      lede={
        <>
          The calendar is a single picker with <code>numberOfMonths={'{2}'}</code>. The strip
          underneath is ordinary markup that writes a new range into the picker&rsquo;s{' '}
          <code>value</code> prop — slide the whole trip three days either way and watch the grid
          keep up.
        </>
      }
      tone="shell"
    >
      <Reveal className="vy-fly">
        <header className="vy-route">
          <div className="vy-route__ends">
            <span className="vy-route__code">{ORIGIN.code}</span>
            <span className="vy-route__line" aria-hidden="true">
              <span className="vy-route__plane">
                <PlaneGlyph />
              </span>
            </span>
            <span className="vy-route__code">{destination.airport}</span>
          </div>
          <p className="vy-route__detail">
            {ORIGIN.city} to {destination.city} · {destination.flightHours} h · one stop · economy
          </p>
        </header>

        <div className="vy-fly__grid">
          <div className="vy-pickerframe">
            <DatePicker
              mode="range"
              theme={scope.theme}
              className={scope.className}
              numberOfMonths={narrow ? 1 : 2}
              size={narrow ? 'md' : 'lg'}
              disablePast
              maxNights={45}
              defaultMonth={NEXT_MONTH}
              value={range}
              dayMeta={dayMeta}
              labels={FLIGHT_LABELS}
              presets={[]}
              onChange={(value) => setRange(value.range)}
            />
          </div>

          <div className="vy-fly__side">
            <div className="vy-fare">
              <p className="vy-fare__label">Round trip, both travellers</p>
              <p className="vy-fare__total">
                {current ? formatPrice(current.total) : '—'}
                <span>per person</span>
              </p>
              {range.start && range.end ? (
                <ul className="vy-fare__legs">
                  <li>
                    <span>Out · {weekdayDayMonth(range.start)}</span>
                    <strong>{formatPrice(legFare(destinationId, range.start))}</strong>
                  </li>
                  <li>
                    <span>Back · {weekdayDayMonth(range.end)}</span>
                    <strong>{formatPrice(legFare(destinationId, range.end))}</strong>
                  </li>
                </ul>
              ) : (
                <p className="vy-fare__empty">Pick a departure and a return.</p>
              )}
              {saving > 0 && cheapest ? (
                <p className="vy-fare__hint">
                  Leaving{' '}
                  {`${Math.abs(cheapest.offset)} day${Math.abs(cheapest.offset) === 1 ? '' : 's'} ${
                    cheapest.offset > 0 ? 'later' : 'earlier'
                  }`}{' '}
                  saves <strong>{formatPrice(saving)}</strong>.
                </p>
              ) : (
                <p className="vy-fare__hint">These are the cheapest days in the window.</p>
              )}
            </div>
          </div>
        </div>

        <div className="vy-flex">
          <p className="vy-flex__head" id="vy-flex-head">
            Flexible by three days
          </p>
          {options.length > 0 ? (
            <div className="vy-flex__strip" role="group" aria-labelledby="vy-flex-head">
              {options.map((option) => (
                <button
                  key={option.offset}
                  type="button"
                  className="vy-flex__cell"
                  disabled={option.disabled}
                  aria-pressed={option.offset === 0}
                  data-best={cheapest && option.offset === cheapest.offset ? 'true' : undefined}
                  onClick={() => setRange({ start: option.depart, end: option.back })}
                >
                  <span className="vy-flex__shift">
                    {option.offset === 0
                      ? 'Your dates'
                      : `${option.offset > 0 ? '+' : '−'}${Math.abs(option.offset)} d`}
                  </span>
                  <span className="vy-flex__dates">
                    {dayMonth(option.depart)} – {dayMonth(option.back)}
                  </span>
                  <span className="vy-flex__price">{formatPrice(option.total)}</span>
                  {current && option.total !== current.total ? (
                    <span
                      className="vy-flex__delta"
                      data-down={option.total < current.total ? 'true' : undefined}
                    >
                      {option.total < current.total ? '−' : '+'}
                      {formatPrice(Math.abs(option.total - current.total))}
                    </span>
                  ) : (
                    <span className="vy-flex__delta vy-flex__delta--flat">even</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="vy-flex__empty">
              Choose both ends of the trip and the flexible fares appear here.
            </p>
          )}
        </div>
      </Reveal>

      <PropNote
        props={[
          'mode="range"',
          'numberOfMonths={2}',
          'value',
          'onChange',
          'disablePast',
          'dayMeta',
        ]}
      >
        A controlled picker: the strip owns the range, the calendar renders it.
      </PropNote>
    </TravelSection>
  );
}
