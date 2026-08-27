/**
 * The WAI-ARIA grid contract for the React binding.
 *
 * The picker claims a full keyboard surface, a roving tabindex, live-region
 * announcements and meaningful day labels; every one of those claims is asserted
 * here through the same API a screen-reader user drives — roles, accessible
 * names, and real key presses.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// Registers the DOM matchers used below. `tests/setup.ts` loads them for the
// suite; importing here keeps the file typecheckable on its own.
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';

import { plainDate } from '../../src/core/plain-date';
import { DatePicker } from '../../src/react/components/date-picker';
import type { PlainDate } from '../../src/core/types';

/** 2026-09-04 is a Friday; September 2026 starts on a Tuesday. */
const TODAY: PlainDate = plainDate(2026, 9, 4);

const sep = (day: number): PlainDate => plainDate(2026, 9, day);

type User = ReturnType<typeof userEvent.setup>;

/** The single element carrying the roving tab stop, asserting its uniqueness on the way. */
function tabStop(): HTMLElement {
  const cells = Array.from(document.querySelectorAll<HTMLElement>('.dpng-day[tabindex="0"]'));
  expect(cells).toHaveLength(1);
  const cell = cells[0];
  if (!cell) throw new Error('no roving tab stop rendered');
  return cell;
}

/** ISO date of the roving tab stop — i.e. where the grid thinks focus is. */
function focusedDate(): string {
  return tabStop().dataset['date'] ?? '';
}

/** Accessible name of the month grid the tab stop lives in. */
function visibleMonths(): string[] {
  return screen.getAllByRole('grid').map((grid) => grid.getAttribute('aria-label') ?? '');
}

/**
 * Send a key press from inside the grid.
 *
 * Focus is re-anchored on the tab stop first: React re-keys every cell when the
 * visible month changes, which detaches whatever node the browser was focusing,
 * and a key press from `document.body` would never reach the picker.
 */
async function press(user: User, keys: string): Promise<void> {
  tabStop().focus();
  await user.keyboard(keys);
}

/* -------------------------------------------------------------------------- */
/*                               Roving tabindex                              */
/* -------------------------------------------------------------------------- */

describe('accessibility: roving tabindex', () => {
  it('exposes exactly one focusable day across every rendered month', () => {
    render(<DatePicker mode="range" today={TODAY} locale="en-US" numberOfMonths={2} />);

    const cells = Array.from(document.querySelectorAll<HTMLElement>('.dpng-day'));
    const focusable = cells.filter((cell) => cell.getAttribute('tabindex') === '0');

    expect(cells.length).toBeGreaterThan(60);
    expect(focusable).toHaveLength(1);
    expect(focusable[0]?.dataset['date']).toBe('2026-09-04');
    expect(cells.every((cell) => cell.getAttribute('tabindex') !== null)).toBe(true);
  });

  it('starts on the selected date rather than today when there is one', () => {
    render(<DatePicker mode="single" today={TODAY} locale="en-US" defaultValue={sep(19)} />);

    expect(focusedDate()).toBe('2026-09-19');
  });

  it('hands the tab stop to the day the user clicks', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await user.click(screen.getByRole('gridcell', { name: /September 17, 2026/ }));

    expect(focusedDate()).toBe('2026-09-17');
  });

  /**
   * Regression: the roving tab stop used to move without DOM focus following it,
   * leaving focus on a cell that had just become `tabindex="-1"`. When the key
   * press also changed the visible month, React re-keyed every cell, the focused
   * node was unmounted and focus fell back to `<body>` — after which no further
   * key press reached the picker at all. `useDatePicker` now restores focus to
   * the new tab stop, but only when focus was already inside the picker.
   */
  it('moves DOM focus along with the roving tab stop', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    tabStop().focus();
    expect(document.activeElement).toBe(tabStop());

    await user.keyboard('{ArrowRight}');
    expect(focusedDate()).toBe('2026-09-05');
    expect((document.activeElement as HTMLElement | null)?.dataset['date']).toBe('2026-09-05');

    // Crossing into another month must not drop focus on the floor.
    await user.keyboard('{PageDown}');
    expect(focusedDate()).toBe('2026-10-05');
    expect((document.activeElement as HTMLElement | null)?.dataset['date']).toBe('2026-10-05');
  });
});

/* -------------------------------------------------------------------------- */
/*                                  Keyboard                                  */
/* -------------------------------------------------------------------------- */

describe('accessibility: keyboard navigation', () => {
  it('walks a day at a time with the horizontal arrows', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await press(user, '{ArrowRight}');
    expect(focusedDate()).toBe('2026-09-05');

    await press(user, '{ArrowRight}');
    expect(focusedDate()).toBe('2026-09-06');

    await press(user, '{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(focusedDate()).toBe('2026-09-03');
  });

  it('walks a week at a time with the vertical arrows', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await press(user, '{ArrowDown}');
    expect(focusedDate()).toBe('2026-09-11');

    await press(user, '{ArrowDown}');
    expect(focusedDate()).toBe('2026-09-18');

    await press(user, '{ArrowUp}');
    expect(focusedDate()).toBe('2026-09-11');
  });

  it('crosses the month boundary and pulls the view with it', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    expect(visibleMonths()).toEqual(['September 2026']);

    // Backwards out of the first week of September.
    await press(user, '{ArrowUp}');
    expect(focusedDate()).toBe('2026-08-28');
    expect(visibleMonths()).toEqual(['August 2026']);

    // …and forwards again, which brings September back.
    await press(user, '{ArrowDown}');
    expect(focusedDate()).toBe('2026-09-04');
    expect(visibleMonths()).toEqual(['September 2026']);

    // Off the end of the month, one day at a time.
    await press(user, '{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(focusedDate()).toBe('2026-10-02');
    expect(visibleMonths()).toEqual(['October 2026']);
  });

  it('jumps to the ends of the week with Home and End', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" defaultValue={sep(10)} />);

    await press(user, '{Home}');
    expect(focusedDate()).toBe('2026-09-06');

    await press(user, '{End}');
    expect(focusedDate()).toBe('2026-09-12');
  });

  it('jumps to the ends of the month with Ctrl+Home and Ctrl+End', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" defaultValue={sep(10)} />);

    await press(user, '{Control>}{Home}{/Control}');
    expect(focusedDate()).toBe('2026-09-01');

    await press(user, '{Control>}{End}{/Control}');
    expect(focusedDate()).toBe('2026-09-30');
  });

  it('pages by month and, with Shift, by year', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await press(user, '{PageDown}');
    expect(focusedDate()).toBe('2026-10-04');
    expect(visibleMonths()).toEqual(['October 2026']);

    await press(user, '{PageUp}');
    expect(focusedDate()).toBe('2026-09-04');
    expect(visibleMonths()).toEqual(['September 2026']);

    await press(user, '{Shift>}{PageUp}{/Shift}');
    expect(focusedDate()).toBe('2025-09-04');
    expect(visibleMonths()).toEqual(['September 2025']);

    await press(user, '{Shift>}{PageDown}{/Shift}');
    expect(focusedDate()).toBe('2026-09-04');
  });

  it('selects the focused day with Enter', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await press(user, '{ArrowRight}{ArrowRight}');
    await press(user, '{Enter}');

    expect(screen.getByRole('gridcell', { name: /September 6, 2026/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('selects the focused day with Space', async () => {
    const user = userEvent.setup();
    // `toggleOnReselect` is off so the assertion holds even under user-event's
    // keyup emulation, which also fires the button's click for the same key.
    render(<DatePicker mode="single" today={TODAY} locale="en-US" toggleOnReselect={false} />);

    await press(user, '{ArrowDown}');
    await press(user, ' ');

    expect(screen.getByRole('gridcell', { name: /September 11, 2026/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('clears with Backspace and jumps to today with "t"', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" defaultValue={sep(19)} />);

    await press(user, '{Backspace}');
    expect(document.querySelectorAll('.dpng-day--selected')).toHaveLength(0);

    await press(user, '{PageDown}');
    expect(visibleMonths()).toEqual(['October 2026']);

    await press(user, 't');
    expect(focusedDate()).toBe('2026-09-04');
    expect(visibleMonths()).toEqual(['September 2026']);
  });
});

/* -------------------------------------------------------------------------- */
/*                                    ARIA                                    */
/* -------------------------------------------------------------------------- */

describe('accessibility: ARIA state', () => {
  it('names every grid after the month it shows', () => {
    render(<DatePicker mode="range" today={TODAY} locale="en-US" numberOfMonths={2} />);

    expect(screen.getByRole('grid', { name: 'September 2026' })).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'October 2026' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Select dates' })).toBeInTheDocument();
  });

  it('gives every day a full, human-readable name', () => {
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    const grid = screen.getByRole('grid', { name: 'September 2026' });
    expect(
      within(grid).getByRole('gridcell', { name: 'Tuesday, September 1, 2026' }),
    ).toBeVisible();
    // The current date says so, on top of its date.
    expect(
      within(grid).getByRole('gridcell', { name: 'Friday, September 4, 2026, Today' }),
    ).toBeVisible();
  });

  it('marks only today with aria-current="date"', () => {
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    const current = document.querySelectorAll('.dpng-day[aria-current="date"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('data-date', '2026-09-04');
  });

  it('marks the whole selected range with aria-selected', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="range" today={TODAY} locale="en-US" />);

    await user.click(screen.getByRole('gridcell', { name: /September 4, 2026/ }));
    await user.click(screen.getByRole('gridcell', { name: /September 8, 2026/ }));

    const selected = Array.from(
      document.querySelectorAll<HTMLElement>('.dpng-day[aria-selected="true"]'),
    ).map((cell) => cell.dataset['date']);

    expect(selected).toEqual([
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
    ]);
    expect(screen.getByRole('gridcell', { name: /September 9, 2026/ })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('keeps unavailable days focusable but marks them aria-disabled', () => {
    render(
      <DatePicker
        mode="range"
        today={TODAY}
        locale="en-US"
        disabledDates={[sep(10)]}
        minDate={sep(2)}
      />,
    );

    const blocked = screen.getByRole('gridcell', { name: /September 10, 2026/ });
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    // Real `disabled` would drop the cell out of the grid's focus order.
    expect(blocked).not.toHaveAttribute('disabled');
    expect(blocked).toHaveAccessibleName(/Not available/);

    expect(screen.getByRole('gridcell', { name: /September 1, 2026/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('gridcell', { name: /September 9, 2026/ })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  it('hides the weekday strip from assistive tech, since every day names its own', () => {
    const { container } = render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    expect(container.querySelector('.dpng-weekdays')).toHaveAttribute('aria-hidden', 'true');
  });
});

/* -------------------------------------------------------------------------- */
/*                                 Live region                                */
/* -------------------------------------------------------------------------- */

describe('accessibility: live region', () => {
  it('is mounted from the start and empty until something happens', () => {
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    const live = screen.getByRole('status');
    expect(live).toHaveClass('dpng-live');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveAttribute('aria-atomic', 'true');
    expect(live.textContent).toBe('');
  });

  it('announces a selection, a clear and a month change', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" showPresets />);

    const live = screen.getByRole('status');

    await user.click(screen.getByRole('gridcell', { name: /September 10, 2026/ }));
    expect(live).toHaveTextContent('Selected Sep 10, 2026');

    await user.click(screen.getByRole('button', { name: 'Next month' }));
    expect(live).toHaveTextContent('Showing October 2026');

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(live).toHaveTextContent('Selection cleared');
  });

  it('announces the completed range with its duration', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="range" today={TODAY} locale="en-US" />);

    await user.click(screen.getByRole('gridcell', { name: /September 4, 2026/ }));
    expect(screen.getByRole('status')).toHaveTextContent('Selected Sep 4, 2026');

    await user.click(screen.getByRole('gridcell', { name: /September 11, 2026/ }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Selected Sep 4 – Sep 11, 2026 · 7 nights',
    );
  });
});
