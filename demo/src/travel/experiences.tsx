/**
 * Do — one day, one session.
 *
 * A single-date picker with the past switched off, seats-left decorations
 * under every day, and a slot row driven by the same deterministic dataset.
 * Switching the experience swaps the `dayMeta` provider, which is the cheapest
 * possible demonstration that decorations are data, not markup.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';

import { DatePicker, addDays, schedulingPresets, today } from 'datepicker-nextgen';
import type { Labels, PlainDate } from 'datepicker-nextgen';

import {
  experienceById,
  experienceDayMeta,
  experiences,
  formatPrice,
  seatsLeft,
} from '../sample-data';
import { longDate } from './format';
import { Reveal } from './motion';
import { ExperienceArt } from './scenery';
import { usePickerScope } from './scope';
import { PropNote, TravelSection } from './section';

const EXPERIENCE_LABELS: Partial<Labels> = {
  title: 'Pick a day',
  singleLabel: 'Session date',
  selectDate: 'Choose a day',
};

/** Far enough out that the default day is never in the past. */
const DEFAULT_DAY: PlainDate = addDays(today(), 11);

export interface DoSectionProps {
  guests: number;
}

export function DoSection({ guests }: DoSectionProps): ReactNode {
  const scope = usePickerScope('shallow');
  const [experienceId, setExperienceId] = useState(experiences[0]?.id ?? 'sunrise-snorkel');
  const [date, setDate] = useState<PlainDate | null>(DEFAULT_DAY);
  const [slotId, setSlotId] = useState<string | null>(null);

  const experience = experienceById(experienceId);
  const slots = experience.slots.map((slot) => ({
    ...slot,
    seats: date ? seatsLeft(experience.id, date, slot.id) : 0,
  }));
  const chosen = slots.find((slot) => slot.id === slotId && slot.seats > 0) ?? null;
  const total = chosen ? experience.price * guests : null;

  return (
    <TravelSection
      id="do"
      kicker="Do"
      title={
        <>
          One day. One <em>session</em>. Never yesterday.
        </>
      }
      lede={
        <>
          <code>mode=&quot;single&quot;</code> with <code>disablePast</code>, seats-left counts
          arriving through <code>dayMeta</code>, and the weekends tinted and dotted — the boat fills
          on those first. The slot row below reads the same dataset the calendar does.
        </>
      }
    >
      <Reveal className="vy-do">
        <div className="vy-do__list" role="radiogroup" aria-label="Choose an experience">
          {experiences.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="radio"
              aria-checked={entry.id === experienceId}
              className="vy-expcard"
              onClick={() => {
                setExperienceId(entry.id);
                setSlotId(null);
              }}
            >
              <ExperienceArt kind={entry.art} />
              <span className="vy-expcard__body">
                <span className="vy-expcard__title">{entry.title}</span>
                <span className="vy-expcard__meta">
                  {entry.duration} · {formatPrice(entry.price)} per person
                </span>
                <span className="vy-expcard__blurb">{entry.blurb}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="vy-do__booking">
          <div className="vy-pickerframe">
            <DatePicker
              mode="single"
              theme={scope.theme}
              className={scope.className}
              size="lg"
              disablePast
              showTodayButton
              defaultValue={DEFAULT_DAY}
              dayMeta={experienceDayMeta(experienceId)}
              presets={schedulingPresets}
              labels={EXPERIENCE_LABELS}
              onChange={(value) => {
                setDate(value.dates[0] ?? null);
                setSlotId(null);
              }}
            />
          </div>

          <div className="vy-slots">
            <p className="vy-slots__head" id="vy-slots-head">
              {date ? longDate(date) : 'Choose a day first'}
            </p>
            <div className="vy-slots__row" role="group" aria-labelledby="vy-slots-head">
              {slots.map((slot) => (
                <button
                  key={slot.id}
                  type="button"
                  className="vy-slot"
                  disabled={!date || slot.seats === 0}
                  aria-pressed={chosen?.id === slot.id}
                  onClick={() => setSlotId(slot.id)}
                >
                  <span className="vy-slot__time">{slot.label}</span>
                  <span className="vy-slot__seats">
                    {slot.seats === 0 ? 'sold out' : `${slot.seats} seats`}
                  </span>
                </button>
              ))}
            </div>

            <p className="vy-slots__summary" aria-live="polite">
              {chosen && date ? (
                <>
                  <strong>{experience.title}</strong> · {longDate(date)} at {chosen.label} ·{' '}
                  {guests} × {formatPrice(experience.price)} ={' '}
                  <strong>{formatPrice(total ?? 0)}</strong>
                </>
              ) : (
                <>Pick a day, then a session. Sold-out slots stay visible, and stay unclickable.</>
              )}
            </p>
          </div>
        </div>
      </Reveal>

      <PropNote
        props={[
          'mode="single"',
          'disablePast',
          'showTodayButton',
          'dayMeta',
          'presets={schedulingPresets}',
          '--dpng-weekend-color',
        ]}
      >
        The picker re-reads <code>dayMeta</code> when you switch experience — same engine, new data.
        The tinted weekends are one CSS custom property, not a selector.
      </PropNote>
    </TravelSection>
  );
}
