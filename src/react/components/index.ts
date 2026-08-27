/**
 * Every React part of the picker, exported individually.
 *
 * `<DatePicker>` is the batteries-included component; everything else is a pure
 * consumer of the picker context, so you can lay the card out however you like:
 *
 * ```tsx
 * <DatePickerProvider mode="range" numberOfMonths={2}>
 *   <div className="dpng" data-variant="inline">
 *     <div className="dpng-card">
 *       <DateFields />
 *       <Calendar />
 *       <PresetList />
 *     </div>
 *   </div>
 * </DatePickerProvider>
 * ```
 */

export { Calendar } from './calendar';
export type { CalendarProps } from './calendar';

export { CalendarNav } from './calendar-nav';
export type { CalendarNavProps } from './calendar-nav';

export { CalendarZoom } from './calendar-zoom';
export type { CalendarZoomProps } from './calendar-zoom';

export { DateFields } from './date-fields';
export type { DateFieldsProps } from './date-fields';

export { DateInput } from './date-input';
export type { DateInputProps } from './date-input';

export { DatePicker } from './date-picker';
export type { DatePickerProps, DatePickerSize, DatePickerVariant } from './date-picker';

export { DayCell } from './day-cell';
export type { DayCellProps } from './day-cell';

export { DurationBadge } from './duration-badge';
export type { DurationBadgeProps } from './duration-badge';

export { MonthGrid } from './month-grid';
export type { MonthGridProps } from './month-grid';

export { PickerFooter } from './picker-footer';
export type { PickerFooterProps } from './picker-footer';

export { Popover } from './popover';
export type { PopoverPlacement, PopoverProps } from './popover';

export { PresetList } from './preset-list';
export type { PresetListProps } from './preset-list';

export { TimePicker } from './time-picker';
export type { TimePickerProps } from './time-picker';

export { WeekdayRow } from './weekday-row';
export type { WeekdayRowProps } from './weekday-row';
