/**
 * The page's date wording, in one place.
 *
 * All of it goes through the library's `formatDate`, which is the same
 * `Intl.DateTimeFormat` path the picker itself uses — so the summary line
 * under the search bar can never disagree with the value inside the card.
 */

import { formatDate, rangeLength } from 'datepicker-nextgen';
import type { DateRange, PlainDate } from 'datepicker-nextgen';

const LOCALE = 'en-US';

/** `Sep 4` */
export function dayMonth(date: PlainDate): string {
  return formatDate(date, LOCALE, { month: 'short', day: 'numeric' });
}

/** `Fri, Sep 4` */
export function weekdayDayMonth(date: PlainDate): string {
  return formatDate(date, LOCALE, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** `Friday, September 4` */
export function longDate(date: PlainDate): string {
  return formatDate(date, LOCALE, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** `Sep` */
export function shortMonth(date: PlainDate): string {
  return formatDate(date, LOCALE, { month: 'short' });
}

/** `September 2026` */
export function monthYear(date: PlainDate): string {
  return formatDate(date, LOCALE, { month: 'long', year: 'numeric' });
}

/** `Sep 4 – Sep 11`, or a prompt when the range is not finished yet. */
export function rangeText(range: DateRange, empty = 'Add dates'): string {
  const { start, end } = range;
  if (!start) return empty;
  if (!end) return `${dayMonth(start)} – …`;
  return `${dayMonth(start)} – ${dayMonth(end)}`;
}

/** `7 nights`, `1 night`, or an empty string. */
export function nightsText(range: DateRange): string {
  const nights = rangeLength(range, 'nights');
  if (nights <= 0) return '';
  return `${nights} ${nights === 1 ? 'night' : 'nights'}`;
}

/** `2 travellers` */
export function countText(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
