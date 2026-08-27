/**
 * Together — six people, one calendar.
 *
 * `mode="multiple"` with a cap, a rolling replacement so the seventh pick
 * evicts the first instead of being rejected, and the selection mirrored out
 * as removable chips. The chips write back through `value`, which is the whole
 * point: the calendar and the chips are two views of one selection.
 */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { DatePicker, addDays, isSameDay, toISODate, today } from 'datepicker-nextgen';
import type { Labels, PlainDate } from 'datepicker-nextgen';

import { availableCrew, bestCrewDates, crew, crewDayMeta } from '../sample-data';
import { weekdayDayMonth } from './format';
import { Reveal, useMediaQuery } from './motion';
import { usePickerScope } from './scope';
import { PropNote, TravelSection } from './section';

const POLL_LABELS: Partial<Labels> = {
  title: 'Propose some dates',
  multipleLabel: 'Dates on the poll',
  selectDate: 'Add a date',
};

const MAX_DATES = 6;

/** The four widest-overlap days in the next two months — the poll's opening bid. */
const POLL_DEFAULT: readonly PlainDate[] = bestCrewDates(addDays(today(), 6), 60, 4);

export function TogetherSection(): ReactNode {
  const scope = usePickerScope('sunset');
  const narrow = useMediaQuery('(max-width: 1120px)');
  const [dates, setDates] = useState<PlainDate[]>(() => [...POLL_DEFAULT]);

  const ranked = useMemo(() => {
    return [...dates]
      .map((date) => ({ date, free: availableCrew(date) }))
      .sort((a, b) => b.free.length - a.free.length);
  }, [dates]);

  const winner = ranked[0] ?? null;
  const sorted = useMemo(
    () => [...dates].sort((a, b) => toISODate(a).localeCompare(toISODate(b))),
    [dates],
  );

  const remove = (date: PlainDate): void =>
    setDates((current) => current.filter((entry) => !isSameDay(entry, date)));

  return (
    <TravelSection
      id="together"
      kicker="Together"
      title={
        <>
          Six calendars, <em>one</em> week by the water.
        </>
      }
      lede={
        <>
          Every day carries how many of the group are free, straight from <code>dayMeta</code>.
          Propose up to six dates; the seventh pick evicts the oldest instead of being refused,
          because <code>rollingSelection</code> is on.
        </>
      }
      tone="shell"
    >
      <Reveal className="vy-together">
        <div className="vy-pickerframe">
          <DatePicker
            mode="multiple"
            theme={scope.theme}
            className={scope.className}
            size="lg"
            numberOfMonths={narrow ? 1 : 2}
            maxSelections={MAX_DATES}
            rollingSelection
            disablePast
            value={dates}
            dayMeta={crewDayMeta}
            labels={POLL_LABELS}
            onChange={(value) => setDates([...value.dates])}
          />
        </div>

        <div className="vy-poll">
          <p className="vy-poll__head">
            On the poll
            <span className="vy-poll__count">
              {sorted.length} of {MAX_DATES}
            </span>
          </p>

          {sorted.length > 0 ? (
            <ul className="vy-poll__chips">
              {sorted.map((date) => {
                const free = availableCrew(date).length;
                return (
                  <li
                    key={toISODate(date)}
                    className="vy-chip"
                    data-strong={free >= 5 ? 'true' : undefined}
                  >
                    <span className="vy-chip__date">{weekdayDayMonth(date)}</span>
                    <span className="vy-chip__score">
                      {free}/{crew.length} free
                    </span>
                    <button
                      type="button"
                      className="vy-chip__remove"
                      onClick={() => remove(date)}
                      aria-label={`Remove ${weekdayDayMonth(date)} from the poll`}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="vy-poll__empty">
              The poll is empty. Pick some days on the calendar and they appear here.
            </p>
          )}

          <div className="vy-poll__winner" aria-live="polite">
            {winner ? (
              <>
                <p className="vy-poll__winnerhead">
                  Best so far · <strong>{weekdayDayMonth(winner.date)}</strong>
                </p>
                <ul className="vy-crew">
                  {crew.map((person) => {
                    const free = winner.free.some((entry) => entry.id === person.id);
                    return (
                      <li
                        key={person.id}
                        className="vy-crew__member"
                        data-free={free ? 'true' : 'false'}
                      >
                        <span className="vy-crew__avatar" aria-hidden="true">
                          {person.initials}
                        </span>
                        <span className="vy-crew__name">
                          {person.name}
                          <small>{free ? 'free' : 'busy'}</small>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="vy-poll__winnerhead">No dates yet.</p>
            )}
          </div>
        </div>
      </Reveal>

      <PropNote
        props={[
          'mode="multiple"',
          'maxSelections={6}',
          'rollingSelection',
          'disablePast',
          'value',
          'dayMeta',
        ]}
      >
        The chips remove dates by writing a shorter array back into <code>value</code>.
      </PropNote>
    </TravelSection>
  );
}
