/**
 * The context that binds the compound components together.
 *
 * `<DatePickerProvider>` either creates a picker from the options you give it or
 * adopts one you already created with {@link useDatePicker} — the latter is how
 * you lift the picker's state into your own component and still render the
 * built-in parts underneath it.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { ValueInput } from '../core/types';
import { useDatePicker } from './use-date-picker';
import type { UseDatePickerOptions, UseDatePickerReturn } from './use-date-picker';

/**
 * Exposed for advanced composition (custom providers, test harnesses).
 * Prefer {@link useDatePickerContext} — it fails loudly instead of handing back `null`.
 */
export const DatePickerContext = createContext<UseDatePickerReturn | null>(null);

DatePickerContext.displayName = 'DatePickerContext';

export interface DatePickerProviderProps extends Omit<UseDatePickerOptions, 'value'> {
  /**
   * Either the controlled selection — identical to `useDatePicker({ value })` —
   * or an existing `useDatePicker()` result to adopt. The two are told apart by
   * shape, so both spellings work.
   */
  value?: ValueInput | UseDatePickerReturn;
  /** An existing picker to adopt. Unambiguous, and it wins over `value`. */
  picker?: UseDatePickerReturn;
  children?: ReactNode;
}

/** Nothing to configure — used when the provider adopts a picker instead of creating one. */
const NO_OPTIONS: UseDatePickerOptions = {};

/** Structural test: a picker result always carries an engine, a snapshot and prop getters. */
function isPickerInstance(candidate: unknown): candidate is UseDatePickerReturn {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const value = candidate as Partial<UseDatePickerReturn>;
  return (
    typeof value.getDayProps === 'function' &&
    typeof value.engine === 'object' &&
    value.engine !== null &&
    typeof value.snapshot === 'object' &&
    value.snapshot !== null
  );
}

/**
 * Provides a picker to every `useDatePickerContext()` below it.
 *
 * ```tsx
 * <DatePickerProvider mode="range" minNights={2}>
 *   <Calendar />
 * </DatePickerProvider>
 * ```
 */
export function DatePickerProvider(props: DatePickerProviderProps): ReactNode {
  const { picker, value, children, ...rest } = props;
  const adopted = picker ?? (isPickerInstance(value) ? value : undefined);

  // Hooks cannot be skipped, so adopting still costs one engine. It is never
  // read or subscribed to, so it stays inert; passing the shared `NO_OPTIONS`
  // constant keeps the hook's option diff from doing any work either.
  // A fresh options object on the create path is fine: `useDatePicker` diffs
  // option identities key by key, not the container.
  const created = useDatePicker(
    adopted ? NO_OPTIONS : { ...rest, value: value as ValueInput | undefined },
  );

  return (
    <DatePickerContext.Provider value={adopted ?? created}>{children}</DatePickerContext.Provider>
  );
}

DatePickerProvider.displayName = 'DatePickerProvider';

/**
 * Read the picker from the nearest provider.
 *
 * @throws when no provider is above it — returning `null` would only resurface
 * later as an unreadable "cannot read properties of null" inside a child.
 */
export function useDatePickerContext(): UseDatePickerReturn {
  const context = useContext(DatePickerContext);
  if (context === null) {
    throw new Error(
      '[datepicker-nextgen] useDatePickerContext() was called outside of a provider. ' +
        'Render this component inside <DatePicker …>, wrap it in ' +
        '<DatePickerProvider {...options}>…</DatePickerProvider>, or hand an existing ' +
        'picker down with <DatePickerProvider picker={useDatePicker(options)}>.',
    );
  }
  return context;
}
