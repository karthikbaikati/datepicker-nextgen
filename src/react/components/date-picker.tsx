/**
 * `<DatePicker />` — the batteries-included component.
 *
 * It owns an engine, publishes it on the context so every compound part below
 * it just works, and assembles the default "Trip Dates" card: header with the
 * nights badge, the check-in / check-out fields, month navigation, the grid,
 * the preset chips and `Clear`.
 *
 * ```tsx
 * <DatePicker mode="range" numberOfMonths={2} minNights={2} onChange={setValue} />
 * ```
 *
 * Every part is a prop away from disappearing (`showHeader`, `showFields`,
 * `showPresets`, `showFooter`, …) and every part has a render slot, so the
 * same component covers a booking card, an analytics range chip and a bare
 * admin-form calendar. When even that is not enough, drop to
 * `<DatePickerProvider>` and compose the exported parts yourself.
 */

import {
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, ForwardedRef, HTMLAttributes, ReactElement, ReactNode } from 'react';

import type {
  ChangeMeta,
  DayInfo,
  MonthInfo,
  ResolvedPreset,
  SelectionValue,
} from '../../core/types';
import { DatePickerContext } from '../context';
import { useDatePicker } from '../use-date-picker';
import type {
  DatePickerProps as DomProps,
  UseDatePickerOptions,
  UseDatePickerReturn,
} from '../use-date-picker';
import { Calendar } from './calendar';
import { DateFields } from './date-fields';
import { DurationBadge } from './duration-badge';
import { PickerFooter } from './picker-footer';
import { Popover } from './popover';
import type { PopoverPlacement } from './popover';
import { PresetList } from './preset-list';
import { TimePicker } from './time-picker';

/** How the picker is presented. Sets `data-variant` on the root. */
export type DatePickerVariant = 'inline' | 'popover' | 'modal' | 'sheet';

/** Density preset. Sets `data-size`, which scales `--dpng-cell-size` and `--dpng-font-size`. */
export type DatePickerSize = 'sm' | 'md' | 'lg';

/** Props for {@link DatePicker}: every engine option plus the presentation. */
export interface DatePickerProps extends UseDatePickerOptions {
  /** `inline` (default), `popover`, `modal`, or a mobile bottom `sheet`. */
  variant?: DatePickerVariant;
  /** Density. Sets `data-size` on the root. */
  size?: DatePickerSize;
  /** Theme name. Sets `data-theme`, which the theme stylesheets key off. */
  theme?: string;
  /** Title row with the duration badge. Defaults to on for range-like modes. */
  showHeader?: boolean;
  /** Header text. Defaults to `labels.title`. */
  title?: ReactNode;
  /** The check-in / check-out summary row. Defaults to on for range-like modes. */
  showFields?: boolean;
  /** The preset chip row. Defaults to on for `range`, or whenever `presets` is passed. */
  showPresets?: boolean;
  /** The footer with Apply / Cancel. Defaults to `!autoApply`. */
  showFooter?: boolean;
  /** The prev/next month bar. Defaults to `true`. */
  showNav?: boolean;
  /** The `21 nights` pill. Defaults to on for range-like and `multiple` modes. */
  showDurationBadge?: boolean;
  /** The `Clear` action. Defaults to `true`; it rides in the presets row when there is one. */
  showClear?: boolean;
  /** A `Today` button that jumps the view to the current month. */
  showTodayButton?: boolean;
  /** `'dropdown'` swaps the nav caption for month + year selects. */
  monthCaptionLayout?: 'label' | 'dropdown';
  /** `'vertical'` stacks the months in a scroll container with sticky captions. */
  orientation?: 'horizontal' | 'vertical';
  /** Commit every click straight away instead of showing Apply / Cancel. */
  autoApply?: boolean;
  /** Dismiss a non-inline picker once the selection is complete. */
  closeOnComplete?: boolean;
  /** Controlled open state for the non-inline variants. */
  open?: boolean;
  /** Uncontrolled initial open state. */
  defaultOpen?: boolean;
  /** Notified whenever the picker opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** The element that opens a non-inline picker. Defaults to a summary button. */
  trigger?: ReactNode;
  /** Preferred popover placement; flipped automatically when it does not fit. */
  placement?: PopoverPlacement;
  /** Portal destination for the non-inline variants. Defaults to `document.body`. */
  portalContainer?: Element | DocumentFragment | null;
  /** Merged onto the root `.dpng` element. */
  className?: string;
  /** Merged onto the root `.dpng` element. */
  style?: CSSProperties;
  /** Replace the whole day cell. Receives the fully-built DOM props to spread. */
  renderDay?: (day: DayInfo, props: DomProps) => ReactNode;
  /** Replace the contents of the day button, keeping its behaviour. */
  renderDayContent?: (day: DayInfo) => ReactNode;
  /** Replace the header row. */
  renderHeader?: (picker: UseDatePickerReturn) => ReactNode;
  /** Replace the footer row. */
  renderFooter?: (picker: UseDatePickerReturn) => ReactNode;
  /** Replace a preset chip. */
  renderPreset?: (preset: ResolvedPreset, props: DomProps) => ReactNode;
  /** Replace a month caption. */
  renderMonthCaption?: (month: MonthInfo) => ReactNode;
  /** Extra content for the footer's info region (left of the actions). */
  footerContent?: ReactNode;
  /** Rendered inside the card, after everything else. */
  children?: ReactNode;
}

/** Modes whose value is a range, and so want two fields and a duration. */
const RANGE_MODES: ReadonlySet<string> = new Set(['range', 'week', 'month', 'quarter', 'year']);

/** The trigger wrapper is a token scope, not a layout box; keep it out of the way. */
const TRIGGER_STYLE: CSSProperties = { display: 'inline-block' };

function CalendarGlyph(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 3v3M17 3v3M4 9h16" />
      <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
    </svg>
  );
}

/**
 * The screen-reader announcement channel. Kept mounted for the life of the
 * picker — a live region that appears at the same moment as its text is
 * usually missed by assistive tech.
 */
function LiveRegion({ text }: { text: string }): ReactElement {
  return (
    <div className="dpng-live" aria-live="polite" aria-atomic="true" role="status">
      {text}
    </div>
  );
}

/** Assign one node to both an internal setter and the consumer's forwarded ref. */
function assignRef(ref: ForwardedRef<HTMLDivElement>, node: HTMLDivElement | null): void {
  if (typeof ref === 'function') ref(node);
  else if (ref) ref.current = node;
}

/**
 * The all-in-one picker.
 *
 * The forwarded ref lands on the root `.dpng` element for an inline picker and
 * on the trigger wrapper for the floating variants — in both cases, the element
 * this component actually owns in the document flow. The floating panel itself
 * is reachable through {@link Popover}'s own ref when you compose one by hand.
 */
export const DatePicker = forwardRef<HTMLDivElement, DatePickerProps>(function DatePicker(
  props: DatePickerProps,
  forwardedRef: ForwardedRef<HTMLDivElement>,
): ReactNode {
  const {
    variant = 'inline',
    size = 'md',
    theme,
    showHeader,
    title,
    showFields,
    showPresets,
    showFooter,
    showNav = true,
    showDurationBadge,
    showClear = true,
    showTodayButton = false,
    monthCaptionLayout = 'label',
    orientation = 'horizontal',
    autoApply,
    closeOnComplete,
    open,
    defaultOpen = false,
    onOpenChange,
    trigger,
    placement = 'bottom-start',
    portalContainer,
    className,
    style,
    renderDay,
    renderDayContent,
    renderHeader,
    renderFooter,
    renderPreset,
    renderMonthCaption,
    footerContent,
    children,
    onComplete,
    ...engineOptions
  } = props;

  const mode = engineOptions.mode ?? 'single';
  const rangeLike = RANGE_MODES.has(mode);
  const isInline = variant === 'inline';

  const resolvedAutoApply = autoApply ?? (variant !== 'modal' && variant !== 'sheet');
  const resolvedCloseOnComplete = closeOnComplete ?? (resolvedAutoApply && !isInline);

  /* ------------------------------- open state ------------------------------ */

  const isOpenControlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = isInline || (isOpenControlled ? open === true : uncontrolledOpen);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isOpenControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isOpenControlled, onOpenChange],
  );

  /* --------------------------------- engine -------------------------------- */

  // `useDatePicker` reads its options during render, so a fresh wrapper each
  // pass is free — it never re-enters the engine.
  const handleComplete = (value: SelectionValue, meta: ChangeMeta): void => {
    onComplete?.(value, meta);
    if (resolvedCloseOnComplete && !isInline) setOpen(false);
  };

  const picker = useDatePicker({ ...engineOptions, onComplete: handleComplete });
  const { snapshot, getRootProps } = picker;

  /* ------------------------ apply / cancel bookkeeping --------------------- */

  const latestValueRef = useRef<SelectionValue>(snapshot.value);
  latestValueRef.current = snapshot.value;
  const valueAtOpenRef = useRef<SelectionValue | null>(null);

  useEffect(() => {
    // Captured after the opening render but before any interaction, so this is
    // the value Cancel has to restore.
    if (isOpen) valueAtOpenRef.current = latestValueRef.current;
  }, [isOpen]);

  const handleCancel = useCallback(() => {
    const restore = valueAtOpenRef.current;
    if (restore) picker.actions.setValue(restore, 'controlled');
    setOpen(false);
  }, [picker.actions, setOpen]);

  const handleApply = useCallback(() => setOpen(false), [setOpen]);

  /* ------------------------------- composition ----------------------------- */

  const withHeader = showHeader ?? (rangeLike || title !== undefined);
  const withFields = showFields ?? rangeLike;
  const withBadge = showDurationBadge ?? (rangeLike || mode === 'multiple');
  const withPresets = showPresets ?? (mode === 'range' || engineOptions.presets !== undefined);
  // `showTodayButton` has nowhere to live but the footer, so asking for it
  // mounts one even when auto-apply made the Apply/Cancel row unnecessary.
  const withFooter = showFooter ?? (showTodayButton || !resolvedAutoApply);
  const withTime = engineOptions.time?.enabled === true;

  // State, not a ref: the popover has to re-render once the anchor node
  // exists, otherwise the first open measures against `null`. The same node is
  // what the consumer's ref wants, so one callback feeds both.
  const [anchorElement, setAnchorElement] = useState<HTMLDivElement | null>(null);
  const attachAnchor = useCallback(
    (node: HTMLDivElement | null) => {
      setAnchorElement(node);
      assignRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  const rootAttributes = useMemo<DomProps>(
    () => ({
      'data-variant': variant,
      'data-size': size,
      'data-theme': theme,
      'data-orientation': orientation,
      'data-week-numbers': engineOptions.showWeekNumbers ? 'true' : undefined,
    }),
    [engineOptions.showWeekNumbers, orientation, size, theme, variant],
  );

  const card = (
    <div className="dpng-card">
      {withHeader ? (
        renderHeader ? (
          renderHeader(picker)
        ) : (
          <div className="dpng-header">
            <span className="dpng-header__title">{title ?? snapshot.labels.title}</span>
            {withBadge ? <DurationBadge /> : null}
          </div>
        )
      ) : null}

      {withFields ? <DateFields /> : null}

      <Calendar
        showNav={showNav}
        monthCaptionLayout={monthCaptionLayout}
        orientation={orientation}
        renderDay={renderDay}
        renderDayContent={renderDayContent}
        renderMonthCaption={renderMonthCaption}
      />

      {withTime ? <TimePicker time={engineOptions.time} /> : null}

      {withPresets ? <PresetList showClear={showClear} renderPreset={renderPreset} /> : null}

      {withFooter ? (
        renderFooter ? (
          renderFooter(picker)
        ) : (
          <PickerFooter
            info={footerContent}
            showToday={showTodayButton}
            showClear={showClear && !withPresets}
            showCancel={!resolvedAutoApply && !isInline}
            showApply={!resolvedAutoApply}
            onApply={handleApply}
            onCancel={handleCancel}
          />
        )
      ) : null}

      {children}
    </div>
  );

  /* --------------------------------- inline -------------------------------- */

  if (isInline) {
    const rootProps = getRootProps({
      ...rootAttributes,
      className,
      style,
    }) as HTMLAttributes<HTMLDivElement>;
    return (
      <DatePickerContext.Provider value={picker}>
        <div {...rootProps} ref={forwardedRef}>
          {card}
          <LiveRegion text={snapshot.announcement} />
        </div>
      </DatePickerContext.Provider>
    );
  }

  /* ------------------------- popover / modal / sheet ------------------------ */

  const triggerNode =
    trigger === undefined ? (
      <button
        type="button"
        className="dpng-button dpng-button--subtle"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        data-action="open"
      >
        <CalendarGlyph />
        <span>{snapshot.summary || snapshot.labels.selectDate}</span>
      </button>
    ) : isValidElement(trigger) ? (
      cloneElement(trigger as ReactElement<Record<string, unknown>>, {
        'aria-haspopup': 'dialog',
        'aria-expanded': isOpen,
      })
    ) : (
      trigger
    );

  return (
    <DatePickerContext.Provider value={picker}>
      <div
        ref={attachAnchor}
        className="dpng"
        // `data-variant` is deliberately absent: the modal and sheet variants
        // turn their root into a full-viewport layer, which is exactly wrong
        // for a trigger that lives in the document flow. `dir` and the token
        // attributes still belong here so the summary text and the button's
        // colours match the panel.
        dir={snapshot.direction}
        data-mode={snapshot.mode}
        data-size={size}
        data-theme={theme}
        style={TRIGGER_STYLE}
        onClick={() => setOpen(!isOpen)}
      >
        {triggerNode}
        <LiveRegion text={snapshot.announcement} />
      </div>
      <Popover
        open={isOpen}
        onClose={() => setOpen(false)}
        anchor={anchorElement}
        variant={variant}
        placement={placement}
        portalContainer={portalContainer}
        rootProps={rootAttributes}
        className={className}
        style={style}
      >
        {card}
      </Popover>
    </DatePickerContext.Provider>
  );
});

DatePicker.displayName = 'DatePicker';
