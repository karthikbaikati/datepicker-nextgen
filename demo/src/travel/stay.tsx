/**
 * Stay — the commercial proof.
 *
 * A listing beside an inline booking calendar that carries real inventory:
 * nightly rates rendered into the day cells through `dayMeta`, already-booked
 * spans handed to `blockedRanges`, a two-night floor, and a total that adds up
 * the nights you actually chose.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';

import {
  DatePicker,
  addDays,
  addMonths,
  bookingPresets,
  startOfMonth,
  today,
} from 'datepicker-nextgen';
import type { DateRange, Labels } from 'datepicker-nextgen';

import { bookedRanges, featuredStay, formatPrice, hotelDayMeta, stayQuote } from '../sample-data';
import { rangeText, weekdayDayMonth } from './format';
import { Reveal, useMediaQuery } from './motion';
import { StayArt } from './scenery';
import { usePickerScope } from './scope';
import { PropNote, TravelSection } from './section';

const STAY_LABELS: Partial<Labels> = {
  title: 'Your stay',
  startLabel: 'Check-in',
  endLabel: 'Check-out',
};

/** Open on next month: this month is half in the past behind `disablePast`. */
const NEXT_MONTH = startOfMonth(addMonths(today(), 1));

const STAY_DEFAULT: DateRange = {
  start: addDays(NEXT_MONTH, 8),
  end: addDays(NEXT_MONTH, 13),
};

export function StaySection(): ReactNode {
  const scope = usePickerScope('shallow');
  const narrow = useMediaQuery('(max-width: 1120px)');
  const [range, setRange] = useState<DateRange>(STAY_DEFAULT);
  const [reserved, setReserved] = useState(false);

  const quote = stayQuote(range);

  return (
    <TravelSection
      id="stay"
      kicker="Stay"
      title={
        <>
          Nights over the water have <em>prices</em>.
        </>
      }
      lede={
        <>
          The rates under each day come from <code>dayMeta</code>, the grey nights are already taken
          and arrive as <code>blockedRanges</code>, and a stay refuses to be dragged across them.
          Try to book a single night on the lagoon: the picker will not let you.
        </>
      }
    >
      <div className="vy-stay">
        <Reveal className="vy-listing">
          <div className="vy-listing__art">
            <StayArt />
            <p className="vy-listing__tag">{featuredStay.kind}</p>
          </div>
          <div className="vy-listing__body">
            <h3 className="vy-listing__name">{featuredStay.name}</h3>
            <p className="vy-listing__where">
              {featuredStay.neighbourhood}, {featuredStay.city} · {featuredStay.host}
            </p>
            <p className="vy-listing__rating">
              <span className="vy-star" aria-hidden="true">
                ★
              </span>
              <strong>{featuredStay.rating.toFixed(2)}</strong>
              <span className="vy-muted">({featuredStay.reviews} reviews)</span>
            </p>
            <p className="vy-listing__blurb">{featuredStay.blurb}</p>
            <ul className="vy-listing__facts">
              <li>{featuredStay.guests} guests</li>
              <li>{featuredStay.bedrooms} bedrooms</li>
              <li>{featuredStay.beds} beds</li>
              <li>{featuredStay.baths} baths</li>
            </ul>
            <ul className="vy-chiplist">
              {featuredStay.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal className="vy-stay__booking" delay={90}>
          <div className="vy-pickerframe">
            <DatePicker
              mode="range"
              theme={scope.theme}
              className={scope.className}
              /* `md` rather than `lg`: at `lg` a two-month card asks for 706px,
                 which is wider than this column, and the month grid would wrap
                 into a stack. */
              size="md"
              numberOfMonths={narrow ? 1 : 2}
              minNights={2}
              maxNights={21}
              disablePast
              defaultMonth={NEXT_MONTH}
              defaultValue={STAY_DEFAULT}
              blockedRanges={bookedRanges}
              dayMeta={hotelDayMeta}
              presets={bookingPresets}
              labels={STAY_LABELS}
              onChange={(value) => {
                setRange(value.range);
                setReserved(false);
              }}
              showFooter
              footerContent={
                quote
                  ? `${formatPrice(quote.nightly)} average · ${quote.nights} nights`
                  : 'Two nights minimum on the deck'
              }
            />
          </div>

          <div className="vy-quote">
            <p className="vy-quote__head">
              <span>{rangeText(range, 'Pick your nights')}</span>
              {range.start && range.end ? (
                <small>
                  {weekdayDayMonth(range.start)} → {weekdayDayMonth(range.end)}
                </small>
              ) : null}
            </p>

            {quote ? (
              <dl className="vy-quote__rows">
                <div>
                  <dt>
                    {formatPrice(quote.nightly)} average × {quote.nights} nights
                  </dt>
                  <dd>{formatPrice(quote.subtotal)}</dd>
                </div>
                <div>
                  <dt>Cleaning</dt>
                  <dd>{formatPrice(quote.cleaningFee)}</dd>
                </div>
                <div>
                  <dt>Service</dt>
                  <dd>{formatPrice(quote.serviceFee)}</dd>
                </div>
                <div className="vy-quote__total">
                  <dt>Total before taxes</dt>
                  <dd>{formatPrice(quote.total)}</dd>
                </div>
              </dl>
            ) : (
              <p className="vy-quote__empty">
                Choose a check-in and a check-out and the nights price themselves.
              </p>
            )}

            <button
              type="button"
              className="vy-button vy-button--primary"
              disabled={!quote}
              onClick={() => setReserved(true)}
            >
              Reserve these nights
            </button>
            <p className="vy-quote__note" aria-live="polite">
              {reserved
                ? 'Nothing was booked — Voyanta is a fiction wrapped around a real date picker.'
                : 'You will not be charged. There is nothing here to charge you for.'}
            </p>
          </div>
        </Reveal>
      </div>

      <PropNote
        props={[
          'mode="range"',
          'minNights={2}',
          'maxNights={21}',
          'disablePast',
          'blockedRanges',
          'dayMeta',
          'presets={bookingPresets}',
          'footerContent',
        ]}
      >
        Taken nights are struck through, and <code>preventCrossingBlocked</code> (on by default) is
        what stops a stay from spanning one.
      </PropNote>
    </TravelSection>
  );
}
