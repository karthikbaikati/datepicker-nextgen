/**
 * Month navigation: the caption plus the two chevrons.
 *
 * The caption doubles as the zoom-out control: while `snapshot.zoom.canZoomOut`
 * it is a `<button>` that steps `day → month → year → decade`, which is how a
 * user reaches 1955 in four clicks instead of seventy-one chevron presses.
 *
 * With `layout="dropdown"` the caption becomes a pair of native `<select>`
 * elements built from `snapshot.monthOptions` and `snapshot.years`. Native
 * selects are deliberate — they are keyboard- and screen-reader-complete on
 * every platform, and on mobile they open the OS picker. They belong to the
 * `day` level; above it the zoom caption takes over.
 */

import { forwardRef } from 'react';
import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  HTMLAttributes,
  ReactElement,
  ReactNode,
} from 'react';

import { plainDate } from '../../core/plain-date';
import type { CalendarView } from '../../core/types';
import { useDatePickerContext } from '../context';

/** Props for {@link CalendarNav}. */
export interface CalendarNavProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** `'label'` prints `September 2026`; `'dropdown'` renders month + year selects. */
  layout?: 'label' | 'dropdown';
  /**
   * Show the caption at all. Turn it off when each month prints its own
   * `.dpng-month__caption` instead — i.e. whenever more than one month is
   * visible. Ignored by `layout="dropdown"`, which always needs its selects.
   */
  showLabel?: boolean;
  /** Replace the caption entirely. */
  label?: ReactNode;
  /**
   * Accessible name for the caption while it is a zoom-out button. Defaults to
   * `"September 2026, zoom out to pick a month"`; override it to translate the
   * hint, which is the one string the picker cannot take from `labels`.
   */
  zoomOutLabel?: (caption: string, view: CalendarView) => string;
}

/**
 * `.dpng-nav__label` carries `margin-inline-end: auto` in the stylesheet, which
 * is what pins the chevrons to the trailing edge. The dropdown layout replaces
 * that element, so it has to take the auto margin with it.
 */
const SELECTS_STYLE = { marginInlineEnd: 'auto' } as const;

/** What one step out reaches from each level. `decade` is the outermost screen. */
const ZOOM_OUT_HINT: Record<CalendarView, string> = {
  day: 'zoom out to pick a month',
  month: 'zoom out to pick a year',
  year: 'zoom out to pick a decade',
  decade: '',
};

function defaultZoomOutLabel(caption: string, view: CalendarView): string {
  const hint = ZOOM_OUT_HINT[view];
  if (hint === '') return caption;
  return caption === '' ? hint : `${caption}, ${hint}`;
}

function ChevronLeft(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

function ChevronRight(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

/** Prev / next chevrons with either a caption label or month+year dropdowns. */
export const CalendarNav = forwardRef<HTMLDivElement, CalendarNavProps>(function CalendarNav(
  { layout = 'label', showLabel = true, label, zoomOutLabel, className, ...rest },
  ref,
) {
  const { snapshot, engine, actions, getPreviousMonthProps, getNextMonthProps } =
    useDatePickerContext();
  const visible = snapshot.months[0];
  const previousProps = getPreviousMonthProps() as ButtonHTMLAttributes<HTMLButtonElement>;
  const nextProps = getNextMonthProps() as ButtonHTMLAttributes<HTMLButtonElement>;

  const zoomed = snapshot.view !== 'day';
  // The selects pick a month of a year — nothing they can express exists above
  // the day level, where the zoom grid is already that control.
  const selects = layout === 'dropdown' && !zoomed && visible !== undefined;
  const caption = zoomed ? snapshot.zoom.label : (visible?.label ?? '');
  const content = label ?? caption;
  // An empty caption still renders, as the plain span that owns the auto margin;
  // it must never become a focusable button with no accessible name.
  const hasCaption = label !== undefined ? label !== null : caption !== '';
  const zoomOut = !selects && showLabel && hasCaption && snapshot.zoom.canZoomOut;

  const handleMonth = (event: ChangeEvent<HTMLSelectElement>): void => {
    if (!visible) return;
    actions.goToMonth(plainDate(visible.year, Number(event.target.value), 1));
  };

  const handleYear = (event: ChangeEvent<HTMLSelectElement>): void => {
    if (!visible) return;
    actions.goToMonth(plainDate(Number(event.target.value), visible.month, 1));
  };

  return (
    <div {...rest} ref={ref} className={className ? `dpng-nav ${className}` : 'dpng-nav'}>
      {selects && visible ? (
        <div className="dpng-nav__selects" style={SELECTS_STYLE}>
          <select
            className="dpng-nav__select"
            aria-label={snapshot.labels.monthSelectLabel}
            value={visible.month}
            onChange={handleMonth}
          >
            {snapshot.monthOptions.map((option) => (
              <option key={option.month} value={option.month} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="dpng-nav__select"
            aria-label={snapshot.labels.yearSelectLabel}
            value={visible.year}
            onChange={handleYear}
          >
            {snapshot.years.map((option) => (
              <option key={option.year} value={option.year} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {zoomOut ? (
        <button
          type="button"
          className="dpng-nav__label dpng-nav__label--button"
          // Named in full, not `aria-hidden` like the span below: this one is a
          // control, and its name has to say where pressing it lands.
          aria-label={(zoomOutLabel ?? defaultZoomOutLabel)(caption, snapshot.view)}
          onClick={() => engine.zoomOut()}
        >
          {content}
        </button>
      ) : null}

      {!selects && !zoomOut ? (
        // Always rendered, even when empty: this element owns the
        // `margin-inline-end: auto` that pushes the chevrons to the trailing
        // edge. `aria-hidden` because each grid already publishes the same
        // month name as its accessible name, and the live region announces
        // navigation.
        <span className="dpng-nav__label" aria-hidden="true">
          {showLabel ? content : null}
        </span>
      ) : null}

      <button {...previousProps}>
        <ChevronLeft />
      </button>
      <button {...nextProps}>
        <ChevronRight />
      </button>
    </div>
  );
});
