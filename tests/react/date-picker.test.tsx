/**
 * `<DatePicker />` — the flagship card, end to end.
 *
 * Everything is driven the way a user drives it (pointer and keyboard through
 * `userEvent`) and asserted through roles and accessible names, so these tests
 * double as a check on the ARIA wiring. Class selectors appear only where the
 * assertion is genuinely visual — the range band, the hover preview.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { ReactElement } from 'react';
// Registers the DOM matchers used below. `tests/setup.ts` loads them for the
// suite; importing here keeps the file typecheckable on its own.
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';

import { plainDate, toISODate } from '../../src/core/plain-date';
import { DatePicker } from '../../src/react/components/date-picker';
import type { DateRange, DayEvaluation, PlainDate, SelectionValue } from '../../src/core/types';

/** 2026-09-04 is a Friday; September 2026 starts on a Tuesday. */
const TODAY: PlainDate = plainDate(2026, 9, 4);

const sep = (day: number): PlainDate => plainDate(2026, 9, day);

/**
 * A day's accessible name is `"Friday, September 4, 2026"` plus a state suffix
 * ("Check-in", "Today", "Not available"), so days are matched on the date part.
 */
const named = (month: string, day: number, year = 2026): RegExp =>
  new RegExp(`${month} ${day}, ${year}(,|$)`);

/** The one element carrying the roving tab stop. */
function tabStop(): HTMLElement {
  const cells = document.querySelectorAll<HTMLElement>('.dpng-day[tabindex="0"]');
  expect(cells).toHaveLength(1);
  const cell = cells[0];
  if (!cell) throw new Error('no roving tab stop rendered');
  return cell;
}

/** Text of the nights/days pill, or `null` when the pill is not mounted. */
function badge(): string | null {
  return document.querySelector('.dpng-header__badge')?.textContent ?? null;
}

/** ISO dates of every cell currently carrying `className`, in DOM order. */
function datesWithClass(className: string): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`.dpng-day.${className}`)).map(
    (cell) => cell.dataset['date'] ?? '',
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Structure                                 */
/* -------------------------------------------------------------------------- */

describe('DatePicker: structure', () => {
  it('renders the flagship booking card', () => {
    const { container } = render(<DatePicker mode="range" today={TODAY} locale="en-US" />);

    const root = container.querySelector('.dpng');
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute('data-mode', 'range');
    expect(root).toHaveAttribute('data-variant', 'inline');
    expect(root).toHaveAttribute('data-size', 'md');
    expect(root).toHaveAttribute('data-months', '1');
    expect(root).toHaveAttribute('dir', 'ltr');
    expect(container.querySelector('.dpng-card')).not.toBeNull();

    // Header + fields.
    expect(screen.getByText('Select dates')).toHaveClass('dpng-header__title');
    expect(screen.getByRole('button', { name: 'Check-in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check-out' })).toBeInTheDocument();
    expect(screen.getAllByText('Add date')).toHaveLength(2);

    // Navigation + grid.
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'September 2026' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(6);
    expect(container.querySelectorAll('.dpng-weekday')).toHaveLength(7);

    // Preset chips + clear.
    const presets = screen.getByRole('group', { name: 'Quick options' });
    expect(
      within(presets)
        .getAllByRole('button')
        .map((chip) => chip.textContent),
    ).toEqual(['Weekend', '3 nights', '1 week', '2 weeks', 'Clear']);

    // Nothing is selected yet, so there is no nights badge.
    expect(badge()).toBeNull();
  });

  it('renders one grid per month for `numberOfMonths`', () => {
    render(<DatePicker mode="range" today={TODAY} locale="en-US" numberOfMonths={2} />);

    const grids = screen.getAllByRole('grid');
    expect(grids.map((grid) => grid.getAttribute('aria-label'))).toEqual([
      'September 2026',
      'October 2026',
    ]);
    expect(document.querySelector('.dpng')).toHaveAttribute('data-months', '2');
    expect(document.querySelectorAll('.dpng-month__caption')).toHaveLength(2);
  });

  it('drops the parts a consumer turns off', () => {
    const { container } = render(
      <DatePicker
        mode="single"
        today={TODAY}
        locale="en-US"
        showHeader={false}
        showFields={false}
        showNav={false}
        showPresets={false}
      />,
    );

    expect(container.querySelector('.dpng-header')).toBeNull();
    expect(container.querySelector('.dpng-fields')).toBeNull();
    expect(container.querySelector('.dpng-nav')).toBeNull();
    expect(container.querySelector('.dpng-presets')).toBeNull();
    expect(screen.getByRole('grid', { name: 'September 2026' })).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/*                                  Selection                                 */
/* -------------------------------------------------------------------------- */

describe('DatePicker: selection', () => {
  it('selects a single date on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(value: SelectionValue) => void>();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" onChange={onChange} />);

    await user.click(screen.getByRole('gridcell', { name: named('September', 10) }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0].dates.map(toISODate)).toEqual(['2026-09-10']);
    expect(screen.getByRole('gridcell', { name: named('September', 10) })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(datesWithClass('dpng-day--selected')).toEqual(['2026-09-10']);
  });

  it('builds a range from two clicks and counts the nights', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="range" today={TODAY} locale="en-US" />);

    await user.click(screen.getByRole('gridcell', { name: named('September', 4) }));
    expect(document.querySelector('.dpng')).toHaveAttribute('data-selecting', 'true');
    expect(screen.getByRole('button', { name: 'Check-out' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('gridcell', { name: named('September', 11) }));

    expect(document.querySelector('.dpng')).toHaveAttribute('data-selecting', 'false');
    expect(badge()).toBe('7 nights');
    expect(datesWithClass('dpng-day--range-start')).toEqual(['2026-09-04']);
    expect(datesWithClass('dpng-day--range-end')).toEqual(['2026-09-11']);
    expect(datesWithClass('dpng-day--in-range')).toEqual([
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
    ]);
    expect(screen.getByRole('button', { name: 'Check-in' })).toHaveTextContent('Sep 4');
    expect(screen.getByRole('button', { name: 'Check-out' })).toHaveTextContent('Sep 11');
  });

  it('counts days instead of nights under `days` semantics', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="range" today={TODAY} locale="en-US" rangeSemantics="days" />);

    await user.click(screen.getByRole('gridcell', { name: named('September', 4) }));
    await user.click(screen.getByRole('gridcell', { name: named('September', 11) }));

    expect(badge()).toBe('8 days');
  });

  it('previews the intervening cells while the end pick is pending', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="range" today={TODAY} locale="en-US" />);

    await user.click(screen.getByRole('gridcell', { name: named('September', 4) }));
    await user.hover(screen.getByRole('gridcell', { name: named('September', 8) }));

    expect(datesWithClass('dpng-day--preview')).toEqual([
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
    ]);
    expect(datesWithClass('dpng-day--preview-start')).toEqual(['2026-09-04']);
    expect(datesWithClass('dpng-day--preview-end')).toEqual(['2026-09-08']);
    // A preview must never read as a selection.
    expect(datesWithClass('dpng-day--in-range')).toEqual([]);

    await user.hover(screen.getByRole('gridcell', { name: named('September', 6) }));
    expect(datesWithClass('dpng-day--preview')).toEqual(['2026-09-04', '2026-09-05', '2026-09-06']);
  });

  it('applies a preset range and marks the chip active', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="range" today={TODAY} locale="en-US" />);

    await user.click(screen.getByRole('button', { name: '1 week' }));

    expect(badge()).toBe('7 nights');
    expect(datesWithClass('dpng-day--range-start')).toEqual(['2026-09-04']);
    expect(datesWithClass('dpng-day--range-end')).toEqual(['2026-09-11']);
    expect(screen.getByRole('button', { name: '1 week' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '3 nights' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.click(screen.getByRole('button', { name: '3 nights' }));

    expect(badge()).toBe('3 nights');
    expect(datesWithClass('dpng-day--range-end')).toEqual(['2026-09-07']);
  });

  it('empties the selection with Clear', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="range" today={TODAY} locale="en-US" />);

    const clear = screen.getByRole('button', { name: 'Clear' });
    expect(clear).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '1 week' }));
    expect(clear).toBeEnabled();

    await user.click(clear);

    expect(datesWithClass('dpng-day--selected')).toEqual([]);
    expect(datesWithClass('dpng-day--in-range')).toEqual([]);
    expect(badge()).toBeNull();
    expect(screen.getAllByText('Add date')).toHaveLength(2);
    expect(clear).toBeDisabled();
  });

  it('rejects a disabled day and reports why', async () => {
    const user = userEvent.setup();
    const onInvalidSelection = vi.fn<(date: PlainDate, evaluation: DayEvaluation) => void>();
    const onChange = vi.fn();
    render(
      <DatePicker
        mode="range"
        today={TODAY}
        locale="en-US"
        disabledDates={[sep(10)]}
        onChange={onChange}
        onInvalidSelection={onInvalidSelection}
      />,
    );

    const blocked = screen.getByRole('gridcell', { name: named('September', 10) });
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    expect(blocked).toHaveAccessibleName(/Not available/);

    await user.click(blocked);

    expect(onChange).not.toHaveBeenCalled();
    expect(datesWithClass('dpng-day--selected')).toEqual([]);
    expect(onInvalidSelection).toHaveBeenCalledTimes(1);
    const [date, evaluation] = onInvalidSelection.mock.calls[0] ?? [];
    expect(date && toISODate(date)).toBe('2026-09-10');
    expect(evaluation).toMatchObject({ selectable: false, reason: 'disabled-date' });
  });

  it('honours `minNights` on the end pick', async () => {
    const user = userEvent.setup();
    const onInvalidSelection = vi.fn<(date: PlainDate, evaluation: DayEvaluation) => void>();
    render(
      <DatePicker
        mode="range"
        today={TODAY}
        locale="en-US"
        minNights={3}
        onInvalidSelection={onInvalidSelection}
      />,
    );

    await user.click(screen.getByRole('gridcell', { name: named('September', 4) }));
    await user.click(screen.getByRole('gridcell', { name: named('September', 5) }));

    expect(onInvalidSelection).toHaveBeenCalledTimes(1);
    expect(onInvalidSelection.mock.calls[0]?.[1]).toMatchObject({ reason: 'min-nights' });
    expect(badge()).toBeNull();

    await user.click(screen.getByRole('gridcell', { name: named('September', 8) }));
    expect(badge()).toBe('4 nights');
  });
});

/* -------------------------------------------------------------------------- */
/*                               Controlled mode                              */
/* -------------------------------------------------------------------------- */

function ControlledPicker({ frozen = false }: { frozen?: boolean }): ReactElement {
  const [value, setValue] = useState<DateRange>({ start: sep(4), end: null });
  return (
    <DatePicker
      mode="range"
      today={TODAY}
      locale="en-US"
      value={value}
      onChange={(next: SelectionValue) => {
        if (!frozen) setValue({ start: next.range.start, end: next.range.end });
      }}
    />
  );
}

describe('DatePicker: controlled', () => {
  it('renders the value it is given and adopts what the parent sends back', async () => {
    const user = userEvent.setup();
    render(<ControlledPicker />);

    expect(screen.getByRole('button', { name: 'Check-in' })).toHaveTextContent('Sep 4');
    expect(screen.getByRole('button', { name: 'Check-out' })).toHaveTextContent('Add date');

    await user.click(screen.getByRole('gridcell', { name: named('September', 11) }));

    expect(screen.getByRole('button', { name: 'Check-out' })).toHaveTextContent('Sep 11');
    expect(badge()).toBe('7 nights');
  });

  it('ignores clicks entirely when the parent never updates the value', async () => {
    const user = userEvent.setup();
    render(<ControlledPicker frozen />);

    await user.click(screen.getByRole('gridcell', { name: named('September', 11) }));

    expect(screen.getByRole('button', { name: 'Check-out' })).toHaveTextContent('Add date');
    expect(datesWithClass('dpng-day--range-end')).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/*                                  Popover                                   */
/* -------------------------------------------------------------------------- */

describe('DatePicker: popover variant', () => {
  const renderPopover = (): void => {
    render(
      <div>
        <button type="button">outside</button>
        <DatePicker variant="popover" mode="range" today={TODAY} locale="en-US" />
      </div>,
    );
  };

  it('opens from the trigger and moves focus into the grid', async () => {
    const user = userEvent.setup();
    renderPopover();

    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Select date' }));

    const dialog = screen.getByRole('dialog', { name: 'Select dates' });
    expect(within(dialog).getByRole('grid', { name: 'September 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select date' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(document.activeElement).toBe(tabStop());
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderPopover();

    const trigger = screen.getByRole('button', { name: 'Select date' });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on an outside pointer', async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByRole('button', { name: 'Select date' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'outside' }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes once the range is complete', async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(screen.getByRole('button', { name: 'Select date' }));
    await user.click(screen.getByRole('gridcell', { name: named('September', 4) }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('gridcell', { name: named('September', 11) }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /Sep 4 – Sep 11, 2026/ })).toBeInTheDocument();
  });
});
