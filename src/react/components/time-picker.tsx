/**
 * Hour / minute (/ meridiem) selects for one or both ends of the selection.
 *
 * Times live beside the dates in `SelectionValue.times` and never touch the
 * calendar math — a `PlainTime` is wall-clock only, exactly like a `PlainDate`
 * is a wall-calendar day. Everything here funnels into `engine.setTime`, which
 * clamps against `TimeOptions.minTime` / `maxTime`.
 */

import { forwardRef, useMemo } from 'react';
import type { ChangeEvent, HTMLAttributes, ReactNode } from 'react';

import { localeUses12Hour } from '../../core/intl';
import { plainDate, plainTime, timeToMinutes, toDate } from '../../core/plain-date';
import type { ActiveField, PlainTime, TimeOptions } from '../../core/types';
import { useDatePickerContext } from '../context';

/** Props for {@link TimePicker}. */
export interface TimePickerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The same object you passed to the engine's `time` option. */
  time?: TimeOptions;
  /**
   * Which ends to offer. Defaults to both for range-like modes and only
   * `'start'` for `single` / `multiple`.
   */
  fields?: readonly ActiveField[];
  /** Caption beside a field. Defaults to the check-in / check-out labels. */
  renderLabel?: (field: ActiveField) => ReactNode;
  /** Accessible-name suffix for the hour select. Translate alongside `labels`. */
  hourLabel?: string;
  /** Accessible-name suffix for the minute select. */
  minuteLabel?: string;
  /** Accessible-name suffix for the AM/PM select. */
  meridiemLabel?: string;
}

const RANGE_MODES: ReadonlySet<string> = new Set(['range', 'week', 'month', 'quarter', 'year']);
const BOTH: readonly ActiveField[] = ['start', 'end'];
const START_ONLY: readonly ActiveField[] = ['start'];

const DAY_END_MINUTE = 24 * 60 - 1;

/** `''` is the "no time chosen" option value; every other one is a number. */
const UNSET = '';

/** Digits (in any script), time separators and bidi marks — everything that is not the day period. */
const NOT_DAY_PERIOD = /[\p{Nd}:.‎‏\s]/gu;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * The locale's own AM/PM words, recovered by formatting two reference times and
 * stripping everything that is a digit or a separator. Cheaper and better
 * supported than `formatToParts`, and it degrades to English rather than
 * throwing on an exotic locale.
 */
function meridiemWords(locale: string): readonly [string, string] {
  try {
    const format = (hour: number): string =>
      new Intl.DateTimeFormat(locale, { hour: 'numeric', hour12: true })
        .format(toDate(plainDate(2024, 1, 1), plainTime(hour, 0)))
        .replace(NOT_DAY_PERIOD, '');
    const am = format(9);
    const pm = format(21);
    if (am && pm && am !== pm) return [am, pm];
  } catch {
    /* fall through to the English default */
  }
  return ['AM', 'PM'];
}

/** Minute marks for the configured step, plus the current value if it is off-grid. */
function minuteOptions(step: number, current: number | null): number[] {
  const safe = Number.isFinite(step) && step > 0 && step <= 60 ? Math.floor(step) : 30;
  const out: number[] = [];
  for (let minute = 0; minute < 60; minute += safe) out.push(minute);
  if (current !== null && !out.includes(current)) {
    out.push(current);
    out.sort((a, b) => a - b);
  }
  return out;
}

/** A whole hour is unreachable when none of its minutes fall inside the bounds. */
function hourDisabled(hour: number, min: number, max: number): boolean {
  return hour * 60 + 59 < min || hour * 60 > max;
}

/** Hour/minute selects bound to `engine.setTime`. Styled by `.dpng-time`. */
export const TimePicker = forwardRef<HTMLDivElement, TimePickerProps>(function TimePicker(
  {
    time,
    fields,
    renderLabel,
    hourLabel = 'hour',
    minuteLabel = 'minute',
    meridiemLabel = 'AM/PM',
    className,
    ...rest
  },
  ref,
) {
  const { snapshot, actions } = useDatePickerContext();
  const labels = snapshot.labels;

  const use12Hours =
    time?.use12Hours === undefined || time.use12Hours === 'locale'
      ? localeUses12Hour(snapshot.locale)
      : time.use12Hours;

  const minMinute = time?.minTime ? timeToMinutes(time.minTime) : 0;
  const maxMinute = time?.maxTime ? timeToMinutes(time.maxTime) : DAY_END_MINUTE;

  const meridiem = useMemo(() => meridiemWords(snapshot.locale), [snapshot.locale]);

  const isRange = RANGE_MODES.has(snapshot.mode);
  const shown = fields ?? (isRange ? BOTH : START_ONLY);
  const times = snapshot.value.times;

  const hourValues = useMemo(() => {
    const out: number[] = [];
    if (use12Hours) {
      out.push(12);
      for (let h = 1; h <= 11; h += 1) out.push(h);
    } else {
      for (let h = 0; h < 24; h += 1) out.push(h);
    }
    return out;
  }, [use12Hours]);

  return (
    <div {...rest} ref={ref} className={className ? `dpng-time ${className}` : 'dpng-time'}>
      {shown.map((field) => {
        const current: PlainTime | null = (field === 'start' ? times?.start : times?.end) ?? null;
        const hour = current ? current.hour : null;
        const minute = current ? current.minute : null;

        const caption = renderLabel
          ? renderLabel(field)
          : isRange
            ? field === 'start'
              ? labels.startLabel
              : labels.endLabel
            : labels.singleLabel;
        const captionText = typeof caption === 'string' ? caption : field;

        const commit = (nextHour: number | null, nextMinute: number | null): void => {
          if (nextHour === null) {
            actions.setTime(field, null);
            return;
          }
          actions.setTime(field, plainTime(nextHour, nextMinute ?? 0, 0));
        };

        const isPm = hour !== null && hour >= 12;
        const displayHour =
          hour === null ? null : use12Hours ? (hour % 12 === 0 ? 12 : hour % 12) : hour;
        const toHour24 = (display: number): number =>
          use12Hours ? (display % 12) + (isPm ? 12 : 0) : display;

        const onHour = (event: ChangeEvent<HTMLSelectElement>): void => {
          if (event.target.value === UNSET) commit(null, null);
          else commit(toHour24(Number(event.target.value)), minute);
        };

        const onMinute = (event: ChangeEvent<HTMLSelectElement>): void => {
          if (event.target.value === UNSET) commit(null, null);
          else commit(hour ?? toHour24(12), Number(event.target.value));
        };

        const onMeridiem = (event: ChangeEvent<HTMLSelectElement>): void => {
          const pm = event.target.value === 'pm';
          // No hour picked yet: 9 is a neutral working-hours default that keeps
          // the control meaningful instead of silently doing nothing.
          const base = (hour ?? 9) % 12;
          commit(base + (pm ? 12 : 0), minute);
        };

        return (
          <div key={field} className="dpng-time__field" data-field={field}>
            <span>{caption}</span>
            <select
              className="dpng-time__select"
              aria-label={`${captionText} ${hourLabel}`}
              data-part="hour"
              value={displayHour === null ? UNSET : String(displayHour)}
              onChange={onHour}
            >
              <option value={UNSET}>{labels.emptyValue}</option>
              {hourValues.map((value) => (
                <option
                  key={value}
                  value={value}
                  disabled={hourDisabled(toHour24(value), minMinute, maxMinute)}
                >
                  {use12Hours ? String(value) : pad2(value)}
                </option>
              ))}
            </select>
            <select
              className="dpng-time__select"
              aria-label={`${captionText} ${minuteLabel}`}
              data-part="minute"
              value={minute === null ? UNSET : String(minute)}
              onChange={onMinute}
            >
              <option value={UNSET}>{labels.emptyValue}</option>
              {minuteOptions(time?.minuteStep ?? 30, minute).map((value) => {
                const absolute = (hour ?? 0) * 60 + value;
                return (
                  <option
                    key={value}
                    value={value}
                    disabled={hour !== null && (absolute < minMinute || absolute > maxMinute)}
                  >
                    {pad2(value)}
                  </option>
                );
              })}
            </select>
            {use12Hours ? (
              <select
                className="dpng-time__select"
                aria-label={`${captionText} ${meridiemLabel}`}
                data-part="meridiem"
                value={isPm ? 'pm' : 'am'}
                onChange={onMeridiem}
              >
                <option value="am">{meridiem[0]}</option>
                <option value="pm">{meridiem[1]}</option>
              </select>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});
