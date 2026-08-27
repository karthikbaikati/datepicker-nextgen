/**
 * The check-in / check-out summary row.
 *
 * Each field is a button that switches which half of the range the next click
 * fills; the active one grows the accent underline defined by
 * `.dpng-field--active .dpng-field__value::after`.
 */

import { Fragment, forwardRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

import type { ActiveField } from '../../core/types';
import { useDatePickerContext } from '../context';

/** Props for {@link DateFields}. */
export interface DateFieldsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /**
   * Which halves to show. Defaults to both for range-like modes and only
   * `'start'` for `single` / `multiple`.
   */
  fields?: readonly ActiveField[];
  /** Override the small uppercase caption above a value. */
  renderLabel?: (field: ActiveField) => ReactNode;
  /** Override the large value line. */
  renderValue?: (field: ActiveField) => ReactNode;
}

/** Modes whose selection is a range, and so deserve two fields. */
const RANGE_MODES: ReadonlySet<string> = new Set(['range', 'week', 'month', 'quarter', 'year']);

const BOTH: readonly ActiveField[] = ['start', 'end'];
const START_ONLY: readonly ActiveField[] = ['start'];

/** The two-column value summary above the calendar. */
export const DateFields = forwardRef<HTMLDivElement, DateFieldsProps>(function DateFields(
  { fields, renderLabel, renderValue, className, ...rest },
  ref,
) {
  const { snapshot, getFieldProps } = useDatePickerContext();
  const isRange = RANGE_MODES.has(snapshot.mode);
  const shown = fields ?? (isRange ? BOTH : START_ONLY);
  const labels = snapshot.labels;

  const labelFor = (field: ActiveField): ReactNode => {
    if (renderLabel) return renderLabel(field);
    if (isRange) return field === 'start' ? labels.startLabel : labels.endLabel;
    return snapshot.mode === 'multiple' ? labels.multipleLabel : labels.singleLabel;
  };

  const valueFor = (field: ActiveField): ReactNode => {
    if (renderValue) return renderValue(field);
    if (snapshot.mode === 'multiple') return snapshot.summary || labels.emptyValue;
    const text = field === 'start' ? snapshot.startLabel : snapshot.endLabel;
    return text || labels.emptyValue;
  };

  return (
    <div {...rest} ref={ref} className={className ? `dpng-fields ${className}` : 'dpng-fields'}>
      {shown.map((field, index) => (
        <Fragment key={field}>
          {index > 0 ? <div className="dpng-fields__divider" aria-hidden="true" /> : null}
          <button {...(getFieldProps(field) as ButtonHTMLAttributes<HTMLButtonElement>)}>
            <span className="dpng-field__label">{labelFor(field)}</span>
            <span className="dpng-field__value">{valueFor(field)}</span>
          </button>
        </Fragment>
      ))}
    </div>
  );
});
