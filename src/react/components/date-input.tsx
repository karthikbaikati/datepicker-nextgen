/**
 * A free-text date field bound to one half of the selection.
 *
 * All of the behaviour lives in `getInputProps`: it holds the uncommitted
 * draft, formats the committed value for the locale, parses on blur/Enter
 * (ISO, locale-numeric, `Sep 4`, `next friday`, `+2w` …) and flips
 * `aria-invalid` when parsing fails, which is what turns the border red.
 */

import { forwardRef } from 'react';
import type { CSSProperties, HTMLAttributes, InputHTMLAttributes, ReactElement } from 'react';

import type { ActiveField } from '../../core/types';
import { useDatePickerContext } from '../context';

/** Props for {@link DateInput}. */
export interface DateInputProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'onChange'
> {
  /** Which half of the selection this input edits. Defaults to `'start'`. */
  field?: ActiveField;
  /** Show the trailing calendar glyph. Defaults to `true`. */
  showIcon?: boolean;
  /**
   * Makes the trailing glyph a button — use it to open a popover. Without it
   * the icon stays decorative and `pointer-events: none`, so clicks fall
   * through to the field.
   */
  onIconClick?: () => void;
  /** Swap the glyph for a clear button once the field has a value. */
  showClear?: boolean;
  /** Placeholder override; defaults to the locale mask (`MM/DD/YYYY`). */
  placeholder?: string;
  /** Disable the field. */
  disabled?: boolean;
  /** Merged onto the `<input>` rather than the wrapper. */
  inputClassName?: string;
  /** Merged onto the `<input>` rather than the wrapper. */
  inputStyle?: CSSProperties;
}

/**
 * `.dpng-input__icon` is `pointer-events: none` so a decorative glyph never
 * swallows a click on the field. An interactive trailing control has to opt
 * back in.
 */
const INTERACTIVE_ICON: CSSProperties = { pointerEvents: 'auto', cursor: 'pointer' };

function CalendarGlyph(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 3v3M17 3v3M4 9h16" />
      <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
    </svg>
  );
}

function ClearGlyph(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** A single text field with a trailing calendar / clear affordance. */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  {
    field = 'start',
    showIcon = true,
    onIconClick,
    showClear = false,
    placeholder,
    disabled,
    inputClassName,
    inputStyle,
    className,
    ...rest
  },
  ref,
) {
  const { snapshot, actions, getInputProps } = useDatePickerContext();

  const inputProps = getInputProps(field, {
    className: inputClassName,
    style: inputStyle,
    disabled,
    ...(placeholder === undefined ? {} : { placeholder }),
  }) as InputHTMLAttributes<HTMLInputElement>;

  const hasValue = typeof inputProps.value === 'string' && inputProps.value !== '';
  const clearable = showClear && hasValue && !disabled;

  return (
    <div {...rest} className={className ? `dpng-input ${className}` : 'dpng-input'}>
      <input {...inputProps} ref={ref} />
      {clearable ? (
        <button
          type="button"
          className="dpng-input__icon"
          style={INTERACTIVE_ICON}
          aria-label={snapshot.labels.clear}
          data-action="clear"
          onClick={() => actions.clear()}
        >
          <ClearGlyph />
        </button>
      ) : showIcon && onIconClick ? (
        <button
          type="button"
          className="dpng-input__icon"
          style={INTERACTIVE_ICON}
          aria-label={snapshot.labels.selectDate}
          aria-haspopup="dialog"
          data-action="open"
          onClick={onIconClick}
        >
          <CalendarGlyph />
        </button>
      ) : showIcon ? (
        <span className="dpng-input__icon" aria-hidden="true">
          <CalendarGlyph />
        </span>
      ) : null}
    </div>
  );
});
