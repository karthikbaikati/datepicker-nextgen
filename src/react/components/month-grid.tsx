/**
 * One month: caption, weekday header and the `role="grid"` day table.
 *
 * The grid follows the WAI-ARIA grid pattern exactly — `grid` › `row` ›
 * `gridcell` — with a roving tabindex owned by the engine, so arrow keys move
 * focus while Tab leaves the calendar altogether.
 */

import { forwardRef } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

import type { DayInfo, MonthInfo, WeekInfo } from '../../core/types';
import { useDatePickerContext } from '../context';
import type { DatePickerProps as DomProps } from '../use-date-picker';
import { DayCell } from './day-cell';
import { WeekdayRow } from './weekday-row';

/** Props for {@link MonthGrid}. */
export interface MonthGridProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The month to render, from `snapshot.months`. */
  month: MonthInfo;
  /** Show `September 2026` above the grid. Defaults to `true`. */
  showCaption?: boolean;
  /** Show the weekday header strip. Defaults to `true`. */
  showWeekdays?: boolean;
  /**
   * Render the ISO week-number column. Defaults to whatever the core decided:
   * `weekNumberLabel` is only populated when `showWeekNumbers` is on.
   * Pair it with `data-week-numbers="true"` on the root so the CSS grid gains
   * its extra leading track.
   */
  showWeekNumbers?: boolean;
  /** Weekday name length. */
  weekdayWidth?: 'short' | 'abbreviated' | 'long';
  /** Replace the whole day cell. */
  renderDay?: (day: DayInfo, props: DomProps) => ReactNode;
  /** Replace the contents of the day button. */
  renderDayContent?: (day: DayInfo) => ReactNode;
  /** Replace the month caption. */
  renderMonthCaption?: (month: MonthInfo) => ReactNode;
  /** Merged onto every day cell. */
  dayClassName?: string;
  /** Merged onto every day cell. */
  dayStyle?: CSSProperties;
}

/** True when the core populated week-number labels for this month. */
function hasWeekNumbers(month: MonthInfo): boolean {
  const first: WeekInfo | undefined = month.weeks[0];
  return first !== undefined && first.weekNumberLabel !== '';
}

/** A single month grid, ready to drop into `.dpng-months`. */
export const MonthGrid = forwardRef<HTMLDivElement, MonthGridProps>(function MonthGrid(
  {
    month,
    showCaption = true,
    showWeekdays = true,
    showWeekNumbers,
    weekdayWidth = 'short',
    renderDay,
    renderDayContent,
    renderMonthCaption,
    dayClassName,
    dayStyle,
    className,
    ...rest
  },
  ref,
) {
  const { snapshot, getGridProps, getDayProps } = useDatePickerContext();
  const weekNumbers = showWeekNumbers ?? hasWeekNumbers(month);
  const gridProps = getGridProps(month) as HTMLAttributes<HTMLDivElement>;

  return (
    <div
      {...rest}
      ref={ref}
      className={className ? `dpng-month ${className}` : 'dpng-month'}
      data-month={month.key}
      data-month-index={month.index}
    >
      {showCaption ? (
        <div className="dpng-month__caption">
          {renderMonthCaption ? renderMonthCaption(month) : month.label}
        </div>
      ) : null}

      {showWeekdays ? (
        <WeekdayRow
          weekdays={month.weekdays.length > 0 ? month.weekdays : snapshot.weekdays}
          width={weekdayWidth}
          showWeekNumbers={weekNumbers}
        />
      ) : null}

      <div {...gridProps}>
        {month.weeks.map((week) => (
          <div key={week.key} className="dpng-week" role="row" data-week={week.isoWeek}>
            {weekNumbers ? (
              <div className="dpng-weeknumber" role="rowheader" aria-label={week.weekNumberLabel}>
                {week.weekNumberLabel}
              </div>
            ) : null}
            {week.days.map((day) => (
              <DayCell
                key={day.key}
                day={day}
                getDayProps={getDayProps}
                renderDay={renderDay}
                renderDayContent={renderDayContent}
                className={dayClassName}
                style={dayStyle}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});
