/**
 * The Voyanta hero: a drawn coast, one headline, and a search bar whose middle
 * field is a real `datepicker-nextgen` in a popover.
 *
 * The dates field is the flagship moment of the whole page, so it is a plain
 * `<DatePicker variant="popover">` with a custom trigger — no composition
 * tricks, nothing the README does not already show you.
 */

import { useId, useState } from 'react';
import type { ReactNode } from 'react';

import { DatePicker, bookingPresets } from 'datepicker-nextgen';
import type { DateRange, Labels } from 'datepicker-nextgen';

import { destinationById, destinations } from '../sample-data';
import { INITIAL_TRIP } from './defaults';
import { countText, nightsText, rangeText, weekdayDayMonth } from './format';
import { useHeroParallax, useMediaQuery, useMotionAllowed } from './motion';
import { CoastScene } from './scenery';
import { usePickerScope } from './scope';

/** Labels for the hero card. Module scope: the engine compares them by identity. */
const TRIP_LABELS: Partial<Labels> = {
  title: 'When are you going?',
  startLabel: 'Arrive',
  endLabel: 'Leave',
  selectDate: 'Add dates',
};

export interface HeroProps {
  destinationId: string;
  onDestinationChange: (id: string) => void;
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  guests: number;
  onGuestsChange: (guests: number) => void;
}

export function Hero({
  destinationId,
  onDestinationChange,
  range,
  onRangeChange,
  guests,
  onGuestsChange,
}: HeroProps): ReactNode {
  const scope = usePickerScope('tide');
  const motionAllowed = useMotionAllowed();
  const attachScene = useHeroParallax(motionAllowed);
  const narrow = useMediaQuery('(max-width: 780px)');
  const whereId = useId();
  const guestsId = useId();

  // Resolved rather than trusted: the page can be handed an id that no longer
  // exists in the dataset, and a `<select>` whose value matches no option shows
  // the visitor a blank field. Feeding the resolved id back in fixes both.
  const destination = destinationById(destinationId);
  const nights = nightsText(range);

  const goToStay = (): void => {
    const target = document.getElementById('stay');
    if (!target) return;
    target.scrollIntoView({ behavior: motionAllowed ? 'smooth' : 'auto', block: 'start' });
  };

  return (
    <section className="vy-hero" id="top" aria-labelledby="vy-hero-title">
      <div className="vy-hero__scene" ref={attachScene} aria-hidden="true">
        <CoastScene />
      </div>

      <div className="vy-hero__inner">
        <p className="vy-hero__eyebrow">
          <span className="vy-hero__badge">Voyanta</span>
          <span>A trip planner that does not exist, built to prove a date picker that does.</span>
        </p>

        <h1 className="vy-hero__title" id="vy-hero-title">
          The sea keeps
          <br />
          its own <em>calendar</em>.
        </h1>

        <p className="vy-hero__lede">
          Warm water lags the warm air by six weeks, and the good months are the ones either side of
          the crowd. Pick those days first and the trip arranges itself around them. Every date
          field on this page — this one, the booking calendar, the fare strip, the group poll — is
          one live<code> datepicker-nextgen</code> instance. Nothing here is a screenshot.
        </p>

        <form
          className="vy-search"
          role="search"
          aria-label="Plan a trip"
          onSubmit={(event) => {
            event.preventDefault();
            goToStay();
          }}
        >
          <div className="vy-search__field">
            <label className="vy-search__label" htmlFor={whereId}>
              Where
            </label>
            <select
              className="vy-search__select"
              id={whereId}
              value={destination.id}
              onChange={(event) => onDestinationChange(event.target.value)}
            >
              {destinations.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.city}, {entry.country}
                </option>
              ))}
            </select>
          </div>

          <div className="vy-search__field vy-search__field--dates">
            {/* The grid display is what lets the picker's own trigger wrapper
                stretch to the column: the demo never styles `.dpng` itself. */}
            <div className="vy-search__control">
              <DatePicker
                mode="range"
                variant={narrow ? 'sheet' : 'popover'}
                theme={scope.theme}
                className={scope.className}
                size="lg"
                numberOfMonths={narrow ? 1 : 2}
                minNights={2}
                disablePast
                defaultValue={INITIAL_TRIP}
                presets={bookingPresets}
                labels={TRIP_LABELS}
                placement="bottom-start"
                onChange={(value) => onRangeChange(value.range)}
                trigger={
                  <button type="button" className="vy-search__trigger">
                    <span className="vy-search__label">Trip dates</span>
                    <span className="vy-search__value">{rangeText(range)}</span>
                  </button>
                }
              />
            </div>
          </div>

          <div className="vy-search__field">
            <span className="vy-search__label" id={guestsId}>
              Travellers
            </span>
            <div className="vy-stepper" role="group" aria-labelledby={guestsId}>
              <button
                type="button"
                onClick={() => onGuestsChange(Math.max(1, guests - 1))}
                disabled={guests <= 1}
                aria-label="One traveller fewer"
              >
                &minus;
              </button>
              <output>{guests}</output>
              <button
                type="button"
                onClick={() => onGuestsChange(Math.min(8, guests + 1))}
                disabled={guests >= 8}
                aria-label="One traveller more"
              >
                +
              </button>
            </div>
          </div>

          <button type="submit" className="vy-search__go">
            <span>Search</span>
          </button>
        </form>

        <p className="vy-hero__result" aria-live="polite">
          {range.start && range.end ? (
            <>
              <strong>
                {nights} in {destination.city}
              </strong>
              <span aria-hidden="true"> · </span>
              {weekdayDayMonth(range.start)} to {weekdayDayMonth(range.end)}
              <span aria-hidden="true"> · </span>
              {countText(guests, 'traveller', 'travellers')}
            </>
          ) : (
            <>Choose your dates and the rest of the coast follows them.</>
          )}
        </p>
      </div>

      <ScrollHint />
    </section>
  );
}

/** A quiet affordance telling the visitor the page keeps going. */
function ScrollHint(): ReactNode {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <a
      className="vy-hero__hint"
      href="#stay"
      onClick={() => setDismissed(true)}
      aria-label="Skip to the booking calendar"
    >
      <span aria-hidden="true">Walk on</span>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
        <path
          d="M6 9.5 12 15.5 18 9.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}
