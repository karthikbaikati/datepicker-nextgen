/**
 * One day in the calendar grid.
 *
 * This is the hottest component in the library: a three-month range picker
 * paints 126 of these, and every pointer move over the grid produces a new
 * snapshot. `DayCell` is therefore memoized with an explicit comparison of the
 * {@link DayInfo} fields that can change its output — and it deliberately does
 * **not** read the picker context, because a context consumer re-renders on
 * every context change no matter what `React.memo` says. `getDayProps` is
 * handed down from {@link MonthGrid} instead; the hook keeps that function
 * referentially stable for the life of the picker.
 */

import { memo } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, ReactElement, ReactNode } from 'react';

import type { DayInfo } from '../../core/types';
import type { DatePickerProps as DomProps } from '../use-date-picker';

/** Props for {@link DayCell}. */
export interface DayCellProps {
  /** The day to paint, straight out of `snapshot.months[i].weeks[j].days[k]`. */
  day: DayInfo;
  /**
   * `getDayProps` from `useDatePickerContext()`. Required rather than read from
   * context so the memo comparison actually prevents re-renders.
   */
  getDayProps: (day: DayInfo, props?: DomProps) => DomProps;
  /** Replace the whole cell. Receives the fully-built DOM props to spread. */
  renderDay?: (day: DayInfo, props: DomProps) => ReactNode;
  /** Replace only what sits inside the day button (number, note, dots, badge). */
  renderDayContent?: (day: DayInfo) => ReactNode;
  /** Merged with the library's `dpng-day--*` state classes. */
  className?: string;
  /** Merged over `day.meta.style`. */
  style?: CSSProperties;
}

/**
 * A day borrowed from a neighbouring month while `showOutsideDays` is off.
 * The core still emits it so the 7-column geometry (and the band-cap
 * `nth-child` rules in the stylesheet) stay intact, but with an empty label.
 */
function isPlaceholder(day: DayInfo): boolean {
  return !day.inCurrentMonth && day.label === '';
}

function dotColor(dot: string | { color: string; label?: string }): string {
  return typeof dot === 'string' ? dot : dot.color;
}

function dotLabel(dot: string | { color: string; label?: string }): string | undefined {
  return typeof dot === 'string' ? undefined : dot.label;
}

function DayContent({ day }: { day: DayInfo }): ReactElement {
  const meta = day.meta;
  const dots = meta?.dots;
  return (
    <>
      <span className="dpng-day__bg" aria-hidden="true" />
      <span className="dpng-day__number">{day.label}</span>
      {meta?.note ? <span className="dpng-day__note">{meta.note}</span> : null}
      {dots && dots.length > 0 ? (
        <span className="dpng-day__dots">
          {dots.slice(0, 3).map((dot, index) => (
            <span
              key={`${day.key}-dot-${index}`}
              className="dpng-day__dot"
              style={{ backgroundColor: dotColor(dot) }}
              title={dotLabel(dot)}
            />
          ))}
        </span>
      ) : null}
      {meta?.badge !== undefined && meta.badge !== null ? (
        <span className="dpng-day__badge">{meta.badge}</span>
      ) : null}
    </>
  );
}

function DayCellImpl(props: DayCellProps): ReactNode {
  const { day, getDayProps, renderDay, renderDayContent, className, style } = props;

  if (isPlaceholder(day)) {
    // Not a button: a hidden outside day must not be clickable, focusable or
    // announced, but it still has to occupy its column.
    return (
      <div
        className={
          className ? `dpng-day dpng-day--outside ${className}` : 'dpng-day dpng-day--outside'
        }
        role="gridcell"
        aria-disabled={true}
        data-outside="true"
        style={style}
      />
    );
  }

  const domProps = getDayProps(day, { className, style });
  if (renderDay) return renderDay(day, domProps);

  const buttonProps = domProps as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button {...buttonProps}>
      {renderDayContent ? renderDayContent(day) : <DayContent day={day} />}
    </button>
  );
}

/**
 * Every field below feeds either a class, a data attribute, an ARIA attribute
 * or the visible content. Anything not listed here cannot change the output,
 * so a snapshot that leaves them all alone skips the re-render entirely.
 */
function dayEquals(a: DayInfo, b: DayInfo): boolean {
  return (
    a.key === b.key &&
    a.label === b.label &&
    a.tabIndex === b.tabIndex &&
    a.inCurrentMonth === b.inCurrentMonth &&
    a.isToday === b.isToday &&
    a.isWeekend === b.isWeekend &&
    a.isSelected === b.isSelected &&
    a.isRangeStart === b.isRangeStart &&
    a.isRangeEnd === b.isRangeEnd &&
    a.isInRange === b.isInRange &&
    a.isPreview === b.isPreview &&
    a.isPreviewStart === b.isPreviewStart &&
    a.isPreviewEnd === b.isPreviewEnd &&
    a.isDisabled === b.isDisabled &&
    a.isBlocked === b.isBlocked &&
    a.isOutsideBounds === b.isOutsideBounds &&
    a.isFocused === b.isFocused &&
    a.isHovered === b.isHovered &&
    a.isHoliday === b.isHoliday &&
    a.ariaLabel === b.ariaLabel &&
    a.ariaSelected === b.ariaSelected &&
    a.ariaDisabled === b.ariaDisabled &&
    a.ariaCurrent === b.ariaCurrent &&
    a.disabledReason === b.disabledReason &&
    // `dayMeta` is called once per day per snapshot; consumers are told to
    // memoize it, and an unmemoized one simply costs a re-render.
    a.meta === b.meta
  );
}

function propsEqual(previous: DayCellProps, next: DayCellProps): boolean {
  return (
    previous.getDayProps === next.getDayProps &&
    previous.renderDay === next.renderDay &&
    previous.renderDayContent === next.renderDayContent &&
    previous.className === next.className &&
    previous.style === next.style &&
    dayEquals(previous.day, next.day)
  );
}

/** A single, memoized day button. */
export const DayCell = memo(DayCellImpl, propsEqual);

DayCell.displayName = 'DayCell';
