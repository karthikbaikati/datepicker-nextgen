/**
 * The calendar proper: month navigation plus the strip of month grids.
 *
 * Rendered on its own inside a provider it is a complete, usable calendar:
 *
 * ```tsx
 * <DatePickerProvider mode="range" numberOfMonths={2}>
 *   <Calendar />
 * </DatePickerProvider>
 * ```
 *
 * The layout adapts to the month count: one month puts its name in the nav bar,
 * several give every month its own caption. Vertical orientation always keeps
 * the per-month captions, because the stylesheet pins them to the top of the
 * scroll container.
 *
 * Above the `day` level the whole month strip is replaced by a single
 * {@link CalendarZoom} grid of months, years or decades.
 */

import { forwardRef } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

import type { DayInfo, MonthInfo } from '../../core/types';
import { useDatePickerContext } from '../context';
import type { DatePickerProps as DomProps } from '../use-date-picker';
import { CalendarNav } from './calendar-nav';
import { CalendarZoom } from './calendar-zoom';
import { MonthGrid } from './month-grid';

/** Props for {@link Calendar}. */
export interface CalendarProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Render the prev/next nav bar above the months. Defaults to `true`. */
  showNav?: boolean;
  /** `'dropdown'` swaps the nav caption for month + year selects. */
  monthCaptionLayout?: 'label' | 'dropdown';
  /**
   * Print a caption above each month. Defaults to `true` for multi-month and
   * vertical layouts, `false` for a single horizontal month (whose name is
   * already in the nav bar).
   */
  showMonthCaptions?: boolean;
  /** Vertical stacks every month in the sticky-caption scroll container. */
  orientation?: 'horizontal' | 'vertical';
  /** Render the ISO week-number column. Forwarded to every {@link MonthGrid}. */
  showWeekNumbers?: boolean;
  /** Show the weekday header strip above each grid. Defaults to `true`. */
  showWeekdays?: boolean;
  /** Weekday name length. */
  weekdayWidth?: 'short' | 'abbreviated' | 'long';
  /** Replace the whole day cell. */
  renderDay?: (day: DayInfo, props: DomProps) => ReactNode;
  /** Replace the contents of the day button. */
  renderDayContent?: (day: DayInfo) => ReactNode;
  /** Replace a month caption. */
  renderMonthCaption?: (month: MonthInfo) => ReactNode;
  /** Merged onto every day cell. */
  dayClassName?: string;
  /** Merged onto every day cell. */
  dayStyle?: CSSProperties;
}

/**
 * Month navigation + the `.dpng-months` grid.
 *
 * The forwarded ref lands on the months wrapper, and `className`/`style` are
 * merged onto it too — the nav bar sits above as a sibling.
 */
export const Calendar = forwardRef<HTMLDivElement, CalendarProps>(function Calendar(
  {
    showNav = true,
    monthCaptionLayout = 'label',
    showMonthCaptions,
    orientation = 'horizontal',
    showWeekNumbers,
    showWeekdays = true,
    weekdayWidth = 'short',
    renderDay,
    renderDayContent,
    renderMonthCaption,
    dayClassName,
    dayStyle,
    className,
    style,
    ...rest
  },
  ref,
) {
  const { snapshot, getCalendarProps } = useDatePickerContext();
  const multiMonth = snapshot.months.length > 1;
  const captions = showMonthCaptions ?? (multiMonth || orientation === 'vertical');
  const zoomed = snapshot.view !== 'day';
  const calendarProps = getCalendarProps({
    ...rest,
    className,
    style,
  }) as HTMLAttributes<HTMLDivElement>;

  return (
    <>
      {showNav ? (
        <CalendarNav
          layout={monthCaptionLayout}
          // Zoomed out there are no month captions to defer to, and the nav
          // caption is also the way back out, so it always shows.
          showLabel={zoomed || (!multiMonth && !captions)}
        />
      ) : null}
      <div {...calendarProps} ref={ref}>
        {zoomed ? (
          <CalendarZoom />
        ) : (
          snapshot.months.map((month) => (
            <MonthGrid
              key={month.key}
              month={month}
              showCaption={captions}
              showWeekdays={showWeekdays}
              showWeekNumbers={showWeekNumbers}
              weekdayWidth={weekdayWidth}
              renderDay={renderDay}
              renderDayContent={renderDayContent}
              renderMonthCaption={renderMonthCaption}
              dayClassName={dayClassName}
              dayStyle={dayStyle}
            />
          ))
        )}
      </div>
    </>
  );
});
