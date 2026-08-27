/**
 * The `M T W T F S S` header above a month grid.
 *
 * It sits *outside* `role="grid"` — the stylesheet needs it as a sibling of
 * `.dpng-grid` so both can share the same 7-track layout — which means it must
 * not claim `role="row"`. Every day button already carries the weekday in its
 * `aria-label`, so the row is hidden from assistive tech instead of duplicating
 * that information.
 */

import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

import type { WeekdayInfo } from '../../core/types';
import { useDatePickerContext } from '../context';

/** Props for {@link WeekdayRow}. */
export interface WeekdayRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Defaults to `snapshot.weekdays`, already rotated to `firstDayOfWeek`. */
  weekdays?: readonly WeekdayInfo[];
  /** Which name length to print. `'short'` is the single-letter narrow form. */
  width?: 'short' | 'abbreviated' | 'long';
  /**
   * Renders a leading spacer cell so the header lines up with the week-number
   * column. Mirrors the root's `data-week-numbers` attribute.
   */
  showWeekNumbers?: boolean;
  /** Content of that spacer cell. Defaults to `labels.weekNumberHeader`. */
  weekNumberHeader?: ReactNode;
}

function weekdayText(info: WeekdayInfo, width: 'short' | 'abbreviated' | 'long'): string {
  if (width === 'long') return info.long;
  if (width === 'abbreviated') return info.abbreviated;
  return info.short;
}

/** The weekday header strip for one month. */
export const WeekdayRow = forwardRef<HTMLDivElement, WeekdayRowProps>(function WeekdayRow(
  { weekdays, width = 'short', showWeekNumbers = false, weekNumberHeader, className, ...rest },
  ref,
) {
  const { snapshot } = useDatePickerContext();
  const items = weekdays ?? snapshot.weekdays;

  return (
    <div
      {...rest}
      ref={ref}
      className={className ? `dpng-weekdays ${className}` : 'dpng-weekdays'}
      aria-hidden="true"
    >
      {showWeekNumbers ? (
        <span className="dpng-weeknumber">
          {weekNumberHeader ?? snapshot.labels.weekNumberHeader}
        </span>
      ) : null}
      {items.map((info) => (
        <span
          key={info.weekday}
          className={info.isWeekend ? 'dpng-weekday dpng-weekday--weekend' : 'dpng-weekday'}
          data-weekday={info.weekday}
          data-weekend={info.isWeekend ? 'true' : undefined}
          title={info.long}
        >
          {weekdayText(info, width)}
        </span>
      ))}
    </div>
  );
});
