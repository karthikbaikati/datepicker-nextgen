/**
 * `useDatePicker` — the React binding contract.
 *
 * These tests exercise the hook the way a consumer building custom markup would:
 * one engine for the life of the component, a snapshot that tracks it through
 * `useSyncExternalStore`, options pushed in from props, and prop getters whose
 * output can be overridden — including opting out of the default behaviour with
 * `preventDefault()`.
 */

import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MouseEvent as ReactMouseEvent, ReactElement } from 'react';
// Registers the DOM matchers used below. `tests/setup.ts` loads them for the
// suite; importing here keeps the file typecheckable on its own.
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

import { plainDate, toISODate } from '../../src/core/plain-date';
import { useDatePicker } from '../../src/react/use-date-picker';
import type { UseDatePickerOptions, UseDatePickerReturn } from '../../src/react/use-date-picker';
import type {
  CalendarSnapshot,
  ChangeMeta,
  DateRangeInput,
  DayInfo,
  PlainDate,
  SelectionValue,
} from '../../src/core/types';

/** 2026-09-04 is a Friday; September 2026 starts on a Tuesday. */
const TODAY: PlainDate = plainDate(2026, 9, 4);

const sep = (day: number): PlainDate => plainDate(2026, 9, day);

/** Base options every test shares, so nothing depends on the wall clock or the runtime locale. */
const base: UseDatePickerOptions = { today: TODAY, locale: 'en-US' };

/** Find a rendered day by ISO key, failing loudly rather than returning `undefined`. */
function dayOf(snapshot: CalendarSnapshot, key: string): DayInfo {
  for (const month of snapshot.months) {
    for (const day of month.days) {
      if (day.key === key) return day;
    }
  }
  throw new Error(`no day ${key} in the rendered calendar`);
}

/* -------------------------------------------------------------------------- */
/*                                   Harness                                  */
/* -------------------------------------------------------------------------- */

interface HarnessProps {
  options?: UseDatePickerOptions;
  /** Extra props merged into `getDayProps` for the 10 September cell. */
  dayProps?: Record<string, unknown>;
  /** Extra props merged into `getRootProps`. */
  rootProps?: Record<string, unknown>;
}

/**
 * A minimal "build your own UI" consumer: root + one day button, wired only
 * through the prop getters. Nothing here touches the shipped components, so a
 * failure points at the hook rather than at the card.
 */
function Harness({ options, dayProps, rootProps }: HarnessProps): ReactElement {
  const picker: UseDatePickerReturn = useDatePicker({ ...base, ...options });
  const day = dayOf(picker.snapshot, '2026-09-10');

  return (
    <div {...picker.getRootProps(rootProps ?? {})}>
      <button {...picker.getDayProps(day, dayProps)} />
      <span data-testid="summary">{picker.snapshot.summary}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Tests                                   */
/* -------------------------------------------------------------------------- */

describe('useDatePicker: snapshot', () => {
  it('re-renders with a fresh snapshot after a selection', () => {
    const { result } = renderHook(() => useDatePicker({ ...base, mode: 'single' }));
    const before = result.current.snapshot;

    expect(before.value.dates).toHaveLength(0);

    act(() => result.current.actions.select(sep(10)));

    const after = result.current.snapshot;
    expect(after).not.toBe(before);
    expect(after.value.dates.map(toISODate)).toEqual(['2026-09-10']);
    expect(after.summary).toBe('Sep 10, 2026');
  });

  it('keeps the same snapshot reference when nothing changes', () => {
    const { result, rerender } = renderHook(() => useDatePicker({ ...base, mode: 'range' }));
    const snapshot = result.current.snapshot;

    rerender();
    rerender();

    expect(result.current.snapshot).toBe(snapshot);
  });

  it('tracks the half-picked range through `isSelecting` and `anchor`', () => {
    const { result } = renderHook(() => useDatePicker({ ...base, mode: 'range' }));

    act(() => result.current.actions.select(sep(4)));

    const anchor = result.current.snapshot.anchor;
    expect(result.current.snapshot.isSelecting).toBe(true);
    expect(result.current.snapshot.activeField).toBe('end');
    expect(anchor && toISODate(anchor)).toBe('2026-09-04');

    act(() => result.current.actions.select(sep(11)));

    expect(result.current.snapshot.isSelecting).toBe(false);
    expect(result.current.snapshot.isComplete).toBe(true);
    expect(result.current.snapshot.duration).toBe(7);
    expect(result.current.snapshot.durationLabel).toBe('7 nights');
  });
});

describe('useDatePicker: engine lifetime', () => {
  it('creates exactly one engine and keeps it across re-renders', () => {
    const { result, rerender } = renderHook(
      (props: { numberOfMonths: number }) =>
        useDatePicker({ ...base, mode: 'range', numberOfMonths: props.numberOfMonths }),
      { initialProps: { numberOfMonths: 1 } },
    );

    const engine = result.current.engine;
    rerender({ numberOfMonths: 1 });
    rerender({ numberOfMonths: 1 });

    expect(result.current.engine).toBe(engine);
  });

  it('keeps the bound actions referentially stable', () => {
    const { result, rerender } = renderHook(() => useDatePicker({ ...base }));
    const actions = result.current.actions;

    rerender();

    expect(result.current.actions).toBe(actions);
  });

  it('pushes changed option props into the existing engine instead of remounting', () => {
    const { result, rerender } = renderHook(
      (props: { numberOfMonths: number }) =>
        useDatePicker({ ...base, mode: 'range', numberOfMonths: props.numberOfMonths }),
      { initialProps: { numberOfMonths: 1 } },
    );

    const engine = result.current.engine;
    expect(result.current.snapshot.months).toHaveLength(1);

    rerender({ numberOfMonths: 2 });

    expect(result.current.engine).toBe(engine);
    expect(result.current.snapshot.months.map((month) => month.label)).toEqual([
      'September 2026',
      'October 2026',
    ]);
  });

  it('re-resolves constraints when a constraint prop changes', () => {
    const initialProps: { minDate?: Date } = {};
    const { result, rerender } = renderHook(
      (props: { minDate?: Date }) => useDatePicker({ ...base, minDate: props.minDate }),
      { initialProps },
    );

    expect(dayOf(result.current.snapshot, '2026-09-01').isDisabled).toBe(false);

    rerender({ minDate: new Date(2026, 8, 10) });

    expect(dayOf(result.current.snapshot, '2026-09-01').isDisabled).toBe(true);
    expect(dayOf(result.current.snapshot, '2026-09-01').disabledReason).toBe('before-min');
    expect(dayOf(result.current.snapshot, '2026-09-10').isDisabled).toBe(false);
  });

  it('does not resync the engine when an inline callback identity changes', () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook(() =>
      useDatePicker({
        ...base,
        mode: 'single',
        onChange: (value, meta) => {
          onChange(value, meta);
        },
      }),
    );

    const snapshot = result.current.snapshot;
    rerender();
    expect(result.current.snapshot).toBe(snapshot);

    act(() => result.current.actions.select(sep(10)));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('useDatePicker: controlled value', () => {
  it('round-trips a controlled range without ever mutating it locally', () => {
    const onChange = vi.fn<(value: SelectionValue, meta: ChangeMeta) => void>();
    const initialProps: { value: DateRangeInput } = { value: { start: sep(4), end: sep(8) } };
    const { result, rerender } = renderHook(
      (props: { value: DateRangeInput }) =>
        useDatePicker({ ...base, mode: 'range', value: props.value, onChange }),
      { initialProps },
    );

    const shown = (): string => {
      const { start, end } = result.current.snapshot.value.range;
      return `${start ? toISODate(start) : ''}..${end ? toISODate(end) : ''}`;
    };

    expect(shown()).toBe('2026-09-04..2026-09-08');

    // A complete range restarts on the next pick; the engine reports it but must
    // not adopt it, because the parent owns the value.
    act(() => result.current.actions.select(sep(20)));

    expect(shown()).toBe('2026-09-04..2026-09-08');
    expect(onChange).toHaveBeenCalledTimes(1);

    const call = onChange.mock.calls[0];
    expect(call).toBeDefined();
    const nextValue = call?.[0];
    const meta = call?.[1];
    expect(nextValue?.range.start && toISODate(nextValue.range.start)).toBe('2026-09-20');
    expect(nextValue?.range.end).toBeNull();
    expect(meta?.reason).toBe('range-start');
    expect(meta?.mode).toBe('range');
    expect(meta?.isComplete).toBe(false);
    expect(meta?.date && toISODate(meta.date)).toBe('2026-09-20');

    rerender({ value: { start: sep(20), end: null } });
    expect(shown()).toBe('2026-09-20..');

    rerender({ value: { start: sep(20), end: sep(23) } });
    expect(shown()).toBe('2026-09-20..2026-09-23');
    expect(result.current.snapshot.durationLabel).toBe('3 nights');
  });

  it('reports the completed range through onChange and onComplete with the same payload', () => {
    const onChange = vi.fn<(value: SelectionValue, meta: ChangeMeta) => void>();
    const onComplete = vi.fn<(value: SelectionValue, meta: ChangeMeta) => void>();
    const { result } = renderHook(() =>
      useDatePicker({ ...base, mode: 'range', onChange, onComplete }),
    );

    act(() => result.current.actions.select(sep(4)));
    act(() => result.current.actions.select(sep(11)));

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledTimes(1);

    const value = onComplete.mock.calls[0]?.[0];
    const meta = onComplete.mock.calls[0]?.[1];
    expect(value?.range.start && toISODate(value.range.start)).toBe('2026-09-04');
    expect(value?.range.end && toISODate(value.range.end)).toBe('2026-09-11');
    expect(meta).toMatchObject({
      reason: 'range-end',
      mode: 'range',
      isComplete: true,
      duration: 7,
    });
    expect(onChange.mock.calls[1]?.[1]).toEqual(meta);
  });

  it('reports a preset application with the preset attached to the meta', () => {
    const onChange = vi.fn<(value: SelectionValue, meta: ChangeMeta) => void>();
    const { result } = renderHook(() => useDatePicker({ ...base, mode: 'range', onChange }));

    act(() => result.current.actions.applyPreset('1-week'));

    const value = onChange.mock.calls[0]?.[0];
    const meta = onChange.mock.calls[0]?.[1];
    expect(value?.range.start && toISODate(value.range.start)).toBe('2026-09-04');
    expect(value?.range.end && toISODate(value.range.end)).toBe('2026-09-11');
    expect(meta?.reason).toBe('preset');
    expect(meta?.preset?.id).toBe('1-week');
  });
});

describe('useDatePicker: prop getters', () => {
  it('merges the consumer class name and data attributes onto the root', () => {
    render(<Harness rootProps={{ className: 'my-root', 'data-testid': 'root', id: 'picker' }} />);

    const root = screen.getByTestId('root');
    expect(root).toHaveClass('dpng', 'my-root');
    expect(root).toHaveAttribute('id', 'picker');
    expect(root).toHaveAttribute('dir', 'ltr');
    expect(root).toHaveAttribute('data-mode', 'single');
    expect(root).toHaveAttribute('data-months', '1');
  });

  it('merges the consumer class name and style onto a day, keeping every state class', () => {
    render(
      <Harness
        options={{ mode: 'single', defaultValue: sep(10) }}
        dayProps={{ className: 'my-day', style: { opacity: 0.5 } }}
      />,
    );

    const day = screen.getByRole('gridcell');
    expect(day).toHaveClass('dpng-day', 'dpng-day--selected', 'my-day');
    expect(day).toHaveStyle({ opacity: '0.5' });
    expect(day).toHaveAttribute('data-selected', 'true');
    expect(day).toHaveAttribute('data-date', '2026-09-10');
  });

  it('chains a consumer handler ahead of the built-in one', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Harness options={{ mode: 'single' }} dayProps={{ onClick }} />);

    await user.click(screen.getByRole('gridcell'));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('summary')).toHaveTextContent('Sep 10, 2026');
  });

  it('lets a consumer handler `preventDefault()` out of the built-in behaviour', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn((event: ReactMouseEvent) => event.preventDefault());
    render(<Harness options={{ mode: 'single' }} dayProps={{ onClick }} />);

    await user.click(screen.getByRole('gridcell'));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('summary').textContent).toBe('');
    expect(screen.getByRole('gridcell')).not.toHaveAttribute('data-selected');
  });

  it('lets a consumer override a plain value outright', () => {
    render(<Harness dayProps={{ 'aria-label': 'my own label', tabIndex: 0 }} />);

    const day = screen.getByRole('gridcell', { name: 'my own label' });
    expect(day).toHaveAttribute('tabindex', '0');
  });

  it('builds nav, preset, clear and field props from the current snapshot', () => {
    const { result } = renderHook(() =>
      useDatePicker({ ...base, mode: 'range', minDate: plainDate(2026, 9, 1) }),
    );

    expect(result.current.getPreviousMonthProps()).toMatchObject({
      type: 'button',
      className: 'dpng-nav__button dpng-nav__button--prev',
      'aria-label': 'Previous month',
      disabled: true,
    });
    expect(result.current.getNextMonthProps()).toMatchObject({
      'aria-label': 'Next month',
      disabled: false,
    });
    expect(result.current.getClearProps()).toMatchObject({ 'aria-label': 'Clear', disabled: true });
    expect(result.current.getFieldProps('start')).toMatchObject({
      className: 'dpng-field dpng-field--active',
      'aria-label': 'Check-in',
      'aria-pressed': true,
    });
    expect(result.current.getFieldProps('end')).toMatchObject({
      className: 'dpng-field',
      'aria-label': 'Check-out',
      'aria-pressed': false,
    });

    const preset = result.current.snapshot.presets.find((item) => item.id === '1-week');
    expect(preset).toBeDefined();
    if (preset) {
      expect(result.current.getPresetProps(preset)).toMatchObject({
        type: 'button',
        'data-preset': '1-week',
        'aria-pressed': false,
      });
    }
  });

  it('reflects a completed selection in the clear and field props', () => {
    const { result } = renderHook(() => useDatePicker({ ...base, mode: 'range' }));

    act(() => result.current.actions.select(sep(4)));
    act(() => result.current.actions.select(sep(11)));

    expect(result.current.getClearProps()).toMatchObject({ disabled: false });
    expect(result.current.getFieldProps('start')).toMatchObject({
      className: 'dpng-field dpng-field--active dpng-field--filled',
      'data-filled': 'true',
    });

    act(() => result.current.actions.clear());

    expect(result.current.snapshot.isEmpty).toBe(true);
    expect(result.current.getClearProps()).toMatchObject({ disabled: true });
  });
});
