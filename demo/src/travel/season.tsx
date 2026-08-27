/**
 * When to go — the coarse-grained modes, next to the data that justifies them.
 *
 * `mode="month"` and `mode="quarter"` turn any click into the whole unit, so
 * the calendar answers "which month?" without ever pretending to be a date
 * field. The chart beside it is ordinary markup reading the same seeded
 * dataset, and its bars write months back into the picker's `value`.
 */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { DatePicker, endOfMonth, plainDate, startOfMonth, today } from 'datepicker-nextgen';
import type { DateRange, Labels, SelectionMode } from 'datepicker-nextgen';

import { destinationById, formatPrice, seasonalityFor } from '../sample-data';
import type { SeasonMonth } from '../sample-data';
import { monthYear } from './format';
import { Reveal, useMediaQuery } from './motion';
import { CompassGlyph } from './scenery';
import { usePickerScope } from './scope';
import { PropNote, TravelSection } from './section';

const SEASON_LABELS: Partial<Labels> = {
  title: 'Which part of the year?',
  startLabel: 'From',
  endLabel: 'Until',
};

type Metric = 'sea' | 'dry' | 'crowd';

/** What a beach traveller actually plans around, in the order they weigh it. */
const METRICS: readonly { id: Metric; label: string }[] = [
  { id: 'sea', label: 'Sea temp' },
  { id: 'dry', label: 'Dry days' },
  { id: 'crowd', label: 'Crowds' },
];

/** The charted value for a month under the current metric. */
function metricValue(month: SeasonMonth, metric: Metric): number {
  if (metric === 'sea') return month.sea;
  if (metric === 'dry') return month.dry;
  return month.crowd;
}

const UNITS: readonly { id: SelectionMode; label: string }[] = [
  { id: 'month', label: 'By month' },
  { id: 'quarter', label: 'By quarter' },
];

/** Next occurrence of a month: this year if it is still ahead, otherwise next. */
function yearFor(month: number): number {
  const now = today();
  return month >= now.month ? now.year : now.year + 1;
}

function monthRange(month: number): DateRange {
  const first = plainDate(yearFor(month), month, 1);
  return { start: startOfMonth(first), end: endOfMonth(first) };
}

const INITIAL_RANGE: DateRange = monthRange(((today().month + 2) % 12) + 1);

export interface SeasonSectionProps {
  destinationId: string;
}

export function SeasonSection({ destinationId }: SeasonSectionProps): ReactNode {
  const scope = usePickerScope('indigo');
  const narrow = useMediaQuery('(max-width: 1180px)');
  const [unit, setUnit] = useState<SelectionMode>('month');
  const [metric, setMetric] = useState<Metric>('sea');
  const [range, setRange] = useState<DateRange>(INITIAL_RANGE);

  const destination = destinationById(destinationId);
  const months = seasonalityFor(destinationId);

  /** Which calendar months the current selection covers. */
  const selected = useMemo(() => {
    const picked = new Set<number>();
    const { start, end } = range;
    if (!start || !end) return picked;
    let cursor = start.year * 12 + start.month;
    const last = end.year * 12 + end.month;
    while (cursor <= last) {
      picked.add(((cursor - 1) % 12) + 1);
      cursor += 1;
    }
    return picked;
  }, [range]);

  /*
   * Bars are scaled between the year's own low and high, not from zero. Sea
   * temperature only swings from about 19°C to 28°C, and a zero-based bar makes
   * every month look identical — which is the opposite of what the chart is for.
   */
  const scale = useMemo(() => {
    let low = Number.POSITIVE_INFINITY;
    let high = Number.NEGATIVE_INFINITY;
    for (const month of months) {
      const value = metricValue(month, metric);
      if (value < low) low = value;
      if (value > high) high = value;
    }
    const span = high - low;
    return (value: number): number =>
      span > 0 ? 12 + Math.round(((value - low) / span) * 88) : 60;
  }, [metric, months]);

  const chosen = months.filter((month) => selected.has(month.month));
  const average = (pick: (month: SeasonMonth) => number): number | null =>
    chosen.length
      ? Math.round((chosen.reduce((sum, month) => sum + pick(month), 0) / chosen.length) * 10) / 10
      : null;

  const averageFare = average((month) => month.fare);
  const averageSea = average((month) => month.sea);
  const averageDry = average((month) => month.dry);
  const averageHigh = average((month) => month.high);
  const first = chosen[0];
  const last = chosen[chosen.length - 1];

  return (
    <TravelSection
      id="season"
      kicker="When to go"
      title={
        <>
          Some questions are <em>months</em>, not dates.
        </>
      }
      lede={
        <>
          The same component in <code>mode=&quot;month&quot;</code> and{' '}
          <code>mode=&quot;quarter&quot;</code>: one click takes the whole unit, and the value is
          still an ordinary range. The chart beside it is reading the same seeded dataset the fares
          came from — sea temperature, rainless days, and how many other people had the idea.
        </>
      }
    >
      <Reveal className="vy-season">
        <div className="vy-season__picker">
          <div className="vy-segmented" role="group" aria-label="Selection unit">
            {UNITS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-pressed={unit === entry.id}
                onClick={() => setUnit(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="vy-pickerframe">
            <DatePicker
              mode={unit}
              theme={scope.theme}
              className={scope.className}
              size="md"
              numberOfMonths={narrow ? 1 : 2}
              monthCaptionLayout="dropdown"
              rangeSemantics="days"
              value={range}
              labels={SEASON_LABELS}
              presets={[]}
              onChange={(value) => setRange(value.range)}
            />
          </div>
        </div>

        <div className="vy-season__chart">
          <header className="vy-chart__head">
            <div>
              <p className="vy-chart__title">
                <span className="vy-chart__glyph" aria-hidden="true">
                  <CompassGlyph />
                </span>
                {destination.city} through the year
              </p>
              <p className="vy-chart__sub">{destination.tagline}</p>
            </div>
            <div
              className="vy-segmented vy-segmented--compact"
              role="group"
              aria-label="Chart metric"
            >
              {METRICS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={metric === entry.id}
                  onClick={() => setMetric(entry.id)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </header>

          <ul className="vy-bars">
            {months.map((month) => {
              const height = scale(metricValue(month, metric));
              const isSelected = selected.has(month.month);
              return (
                <li key={month.month} className="vy-bars__item">
                  <button
                    type="button"
                    className="vy-bars__button"
                    aria-pressed={isSelected}
                    data-verdict={month.verdict}
                    onClick={() => {
                      setUnit('month');
                      setRange(monthRange(month.month));
                    }}
                  >
                    <span className="vy-bars__track" aria-hidden="true">
                      <span className="vy-bars__fill" style={{ height: `${height}%` }} />
                    </span>
                    <span className="vy-bars__label" aria-hidden="true">
                      {month.label}
                    </span>
                    <span className="vy-sr">
                      {month.label}: {month.sea}°C sea, {month.dry} dry days in thirty,{' '}
                      {month.crowd}% busy, {formatPrice(month.fare)} typical fare, {month.verdict}.
                      Select this month.
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="vy-season__readout" aria-live="polite">
            {chosen.length > 0 &&
            averageFare !== null &&
            averageSea !== null &&
            averageDry !== null &&
            averageHigh !== null ? (
              <>
                <p className="vy-season__verdict" data-verdict={first?.verdict}>
                  {first && last
                    ? chosen.length === 1
                      ? `${first.label} is ${first.verdict}`
                      : `${first.label}–${last.label} is mostly ${first.verdict}`
                    : null}
                </p>
                <dl className="vy-season__stats">
                  <div>
                    <dt>Sea temp</dt>
                    <dd>{averageSea}°C</dd>
                  </div>
                  <div>
                    <dt>Dry days</dt>
                    <dd>{Math.round(averageDry)}/30</dd>
                  </div>
                  <div>
                    <dt>Daytime high</dt>
                    <dd>{Math.round(averageHigh)}°C</dd>
                  </div>
                  <div>
                    <dt>Typical fare</dt>
                    <dd>{formatPrice(Math.round(averageFare))}</dd>
                  </div>
                </dl>
                <p className="vy-season__window">
                  Selected window: {range.start ? monthYear(range.start) : ''}
                  {range.end && range.start && range.end.month !== range.start.month
                    ? ` – ${monthYear(range.end)}`
                    : ''}
                </p>
              </>
            ) : (
              <p className="vy-season__window">Pick a month on either side to compare.</p>
            )}
          </div>
        </div>
      </Reveal>

      <PropNote
        props={[
          'mode="month"',
          'mode="quarter"',
          'monthCaptionLayout="dropdown"',
          'rangeSemantics="days"',
          'value',
        ]}
      >
        Seven modes ship; these two answer the questions a date field cannot.
      </PropNote>
    </TravelSection>
  );
}
