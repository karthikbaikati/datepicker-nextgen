/**
 * The `21 nights` pill in the card header.
 *
 * The text comes from `snapshot.durationLabel`, which the engine formats with
 * `Intl.PluralRules` and the configured range semantics — nights for bookings,
 * days for analytics.
 */

import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

import { useDatePickerContext } from '../context';

/** Props for {@link DurationBadge}. */
export interface DurationBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Replace the badge text. Rendered even when the selection is empty. */
  children?: ReactNode;
  /** Keep the pill mounted (empty) while nothing is selected. Defaults to `false`. */
  showWhenEmpty?: boolean;
}

/** The accent-tinted nights/days pill. Styled by `.dpng-header__badge`. */
export const DurationBadge = forwardRef<HTMLSpanElement, DurationBadgeProps>(function DurationBadge(
  { children, showWhenEmpty = false, className, ...rest },
  ref,
) {
  const { snapshot } = useDatePickerContext();
  const text = children ?? snapshot.durationLabel;

  if (!showWhenEmpty && (text === '' || text === undefined || text === null)) return null;

  return (
    <span
      {...rest}
      ref={ref}
      // "21 nights" leads with a number; in an RTL calendar the bidi algorithm
      // would otherwise reorder it to "nights 21".
      dir="auto"
      className={className ? `dpng-header__badge ${className}` : 'dpng-header__badge'}
      data-duration={snapshot.duration}
    >
      {text}
    </span>
  );
});
