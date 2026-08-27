/**
 * The footer strip: a summary on one side, actions on the other.
 *
 * Used by the popover / modal / sheet presentations, where a selection is not
 * committed until the user says so. Inline pickers usually skip it — the
 * engine already applied every click.
 */

import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

import { useDatePickerContext } from '../context';

/** Props for {@link PickerFooter}. */
export interface PickerFooterProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Left-hand text. Defaults to `snapshot.summary`. */
  info?: ReactNode;
  /** Extra nodes appended to the actions cluster, before the built-in buttons. */
  children?: ReactNode;
  /** Jump the calendar to the current month. */
  showToday?: boolean;
  /** Reset the selection. */
  showClear?: boolean;
  /** Dismiss without committing; wire it to your own "revert" logic. */
  showCancel?: boolean;
  /** Commit and dismiss. Rendered disabled until the selection is complete. */
  showApply?: boolean;
  /** Called by the apply button. */
  onApply?: () => void;
  /** Called by the cancel button. */
  onCancel?: () => void;
  /** Force the apply button's disabled state; defaults to `!snapshot.isComplete`. */
  applyDisabled?: boolean;
}

/** The `.dpng-footer` row. */
export const PickerFooter = forwardRef<HTMLDivElement, PickerFooterProps>(function PickerFooter(
  {
    info,
    children,
    showToday = false,
    showClear = false,
    showCancel = false,
    showApply = false,
    onApply,
    onCancel,
    applyDisabled,
    className,
    ...rest
  },
  ref,
) {
  const { snapshot, actions, getClearProps } = useDatePickerContext();
  const labels = snapshot.labels;

  return (
    <div {...rest} ref={ref} className={className ? `dpng-footer ${className}` : 'dpng-footer'}>
      <div className="dpng-footer__info">{info ?? snapshot.summary}</div>
      <div className="dpng-footer__actions">
        {children}
        {showToday ? (
          <button
            type="button"
            className="dpng-button dpng-button--ghost"
            data-action="today"
            onClick={() => actions.goToToday()}
          >
            {labels.today}
          </button>
        ) : null}
        {showClear ? <button {...getClearProps()}>{labels.clear}</button> : null}
        {showCancel ? (
          <button
            type="button"
            className="dpng-button dpng-button--subtle"
            data-action="cancel"
            onClick={onCancel}
          >
            {labels.cancel}
          </button>
        ) : null}
        {showApply ? (
          <button
            type="button"
            className="dpng-button dpng-button--primary"
            data-action="apply"
            disabled={applyDisabled ?? !snapshot.isComplete}
            onClick={onApply}
          >
            {labels.apply}
          </button>
        ) : null}
      </div>
    </div>
  );
});
