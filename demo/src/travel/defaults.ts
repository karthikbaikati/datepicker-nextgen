/**
 * The trip the page opens on.
 *
 * It lives in its own module rather than beside the hero because a non-component
 * export in a component file defeats React Fast Refresh — the whole hero would
 * remount on every edit, losing the very selection you were testing.
 *
 * Everything is anchored to `today()`, so the demo is never stale and never
 * opens on a date the picker's own `disablePast` would refuse.
 */

import { addDays, today } from 'datepicker-nextgen';
import type { DateRange } from 'datepicker-nextgen';

/** A week away, three and a half weeks out. */
export const INITIAL_TRIP: DateRange = {
  start: addDays(today(), 24),
  end: addDays(today(), 31),
};
