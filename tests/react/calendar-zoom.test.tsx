/**
 * Century navigation in the React binding.
 *
 * The zoomed-out grids are `<CalendarZoom>`, the way back out is the caption in
 * `<CalendarNav>`, and both are driven entirely by `snapshot.zoom`. Everything
 * here is asserted through the surface a user actually touches — roles,
 * accessible names, real clicks and real key presses — against a fixed `today`
 * of 2026-09-04.
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

/** The caption separator `buildZoom` puts between the first and last cell — an en dash. */
const DASH = ' – ';

type User = ReturnType<typeof userEvent.setup>;

const zoomGrid = (): HTMLElement | null => document.querySelector<HTMLElement>('.dpng-zoom');

/** Accessible name of the grid currently on screen — the zoom grid, or the month. */
const gridLabel = (): string => screen.getByRole('grid').getAttribute('aria-label') ?? '';

const cellLabels = (): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>('.dpng-zoom__cell')).map(
    (cell) => cell.textContent ?? '',
  );

/** The single cell carrying the roving tab stop, asserting its uniqueness on the way. */
function zoomTabStop(): HTMLElement {
  const cells = Array.from(
    document.querySelectorAll<HTMLElement>('.dpng-zoom__cell[tabindex="0"]'),
  );
  expect(cells).toHaveLength(1);
  const cell = cells[0];
  if (!cell) throw new Error('no roving tab stop in the zoom grid');
  return cell;
}

/** Which cell the zoom grid thinks focus is on, by its stable key. */
const focusedCell = (): string => zoomTabStop().dataset['zoom'] ?? '';

/** The nav caption, whether it is currently a zoom-out button or a plain span. */
function caption(): HTMLElement {
  const node = document.querySelector<HTMLElement>('.dpng-nav__label');
  if (!node) throw new Error('no nav caption rendered');
  return node;
}

/** Click the caption to step out one level. */
async function zoomOut(user: User): Promise<void> {
  await user.click(screen.getByRole('button', { name: /zoom out/ }));
}

/** Send a key press from inside the zoom grid, re-anchoring focus on the tab stop first. */
async function press(user: User, keys: string): Promise<void> {
  zoomTabStop().focus();
  await user.keyboard(keys);
}

/** Walk out to the decade screen — three caption presses from a day grid. */
async function toDecade(user: User): Promise<void> {
  await zoomOut(user);
  await zoomOut(user);
  await zoomOut(user);
}

/* -------------------------------------------------------------------------- */
/*                            Zooming out and in                              */
/* -------------------------------------------------------------------------- */

describe('calendar zoom: stepping through the levels', () => {
  it('shows the month grid and no zoom grid at the day level', () => {
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    expect(zoomGrid()).toBeNull();
    expect(gridLabel()).toBe('September 2026');
    expect(caption()).toHaveAccessibleName('September 2026, zoom out to pick a month');
  });

  it('zooms out one level per caption click', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await zoomOut(user);
    expect(gridLabel()).toBe('2026');
    expect(cellLabels()).toEqual([
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]);
    expect(document.querySelector('.dpng-month')).toBeNull();
    expect(caption()).toHaveAccessibleName('2026, zoom out to pick a year');

    await zoomOut(user);
    expect(gridLabel()).toBe(`2016${DASH}2027`);
    expect(cellLabels()[0]).toBe('2016');
    expect(caption()).toHaveAccessibleName(`2016${DASH}2027, zoom out to pick a decade`);

    await zoomOut(user);
    expect(gridLabel()).toBe(`1920s${DASH}2030s`);
    expect(cellLabels()).toEqual([
      '1920s',
      '1930s',
      '1940s',
      '1950s',
      '1960s',
      '1970s',
      '1980s',
      '1990s',
      '2000s',
      '2010s',
      '2020s',
      '2030s',
    ]);
  });

  it('stops at the decade, where the caption is no longer a control', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await toDecade(user);

    expect(screen.queryAllByRole('button', { name: /zoom out/ })).toHaveLength(0);
    expect(caption().tagName).toBe('SPAN');
    // The grid already publishes the same span as its own accessible name.
    expect(caption()).toHaveAttribute('aria-hidden', 'true');
    expect(caption()).toHaveTextContent(`1920s${DASH}2030s`);
  });

  it('zooms one level in per cell click, moving the view with it', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await toDecade(user);

    await user.click(screen.getByRole('gridcell', { name: '1950 to 1959' }));
    expect(gridLabel()).toBe(`1944${DASH}1955`);

    await user.click(screen.getByRole('gridcell', { name: '1955' }));
    expect(gridLabel()).toBe('1955');

    await user.click(screen.getByRole('gridcell', { name: 'March 1955' }));
    expect(zoomGrid()).toBeNull();
    expect(gridLabel()).toBe('March 1955');
    expect(caption()).toHaveAccessibleName('March 1955, zoom out to pick a month');
  });

  /**
   * The headline claim: from the decade screen every date in the century is
   * four clicks away — decade, year, month, day.
   */
  it('reaches a day in 1955 in four clicks from the decade screen, and comes back', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await toDecade(user);

    await user.click(screen.getByRole('gridcell', { name: '1950 to 1959' }));
    await user.click(screen.getByRole('gridcell', { name: '1955' }));
    await user.click(screen.getByRole('gridcell', { name: 'March 1955' }));
    await user.click(screen.getByRole('gridcell', { name: /March 17, 1955/ }));

    expect(document.querySelector('.dpng-day--selected')).toHaveAttribute(
      'data-date',
      '1955-03-17',
    );

    // …and the same four clicks bring September 2026 back.
    await toDecade(user);
    expect(gridLabel()).toBe(`1920s${DASH}2030s`);
    await user.click(screen.getByRole('gridcell', { name: '2020 to 2029' }));
    await user.click(screen.getByRole('gridcell', { name: '2026' }));
    await user.click(screen.getByRole('gridcell', { name: 'September 2026' }));

    expect(gridLabel()).toBe('September 2026');
    expect(document.querySelector('.dpng-day--selected')).toBeNull();
    // The trip did not disturb the pick — it is simply not on screen.
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/*                                Grid semantics                              */
/* -------------------------------------------------------------------------- */

describe('calendar zoom: grid semantics', () => {
  it('exposes an ARIA grid of four rows and twelve gridcells', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await zoomOut(user);

    const grid = screen.getByRole('grid', { name: '2026' });
    expect(grid).toHaveClass('dpng-zoom');
    expect(within(grid).getAllByRole('row')).toHaveLength(4);
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(12);
    for (const row of within(grid).getAllByRole('row')) {
      expect(within(row).getAllByRole('gridcell')).toHaveLength(3);
      expect(row).toHaveClass('dpng-zoom__row');
    }
  });

  it('names every cell in full for assistive tech at every level', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await zoomOut(user);
    expect(screen.getByRole('gridcell', { name: 'September 2026' })).toHaveTextContent('September');

    await zoomOut(user);
    expect(screen.getByRole('gridcell', { name: '2026' })).toHaveTextContent('2026');

    await zoomOut(user);
    // A decade's name has no Intl pattern, so it is spelled out.
    expect(screen.getByRole('gridcell', { name: '2020 to 2029' })).toHaveTextContent('2020s');
  });

  it('carries exactly one focusable cell, on the visible month', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await zoomOut(user);
    expect(focusedCell()).toBe('2026-09');

    await zoomOut(user);
    expect(focusedCell()).toBe('2026');

    await zoomOut(user);
    expect(focusedCell()).toBe('2020s');

    const cells = Array.from(document.querySelectorAll<HTMLElement>('.dpng-zoom__cell'));
    expect(cells.every((cell) => cell.getAttribute('tabindex') !== null)).toBe(true);
  });

  it('marks the cell holding today, and only that one', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await zoomOut(user);

    const current = document.querySelectorAll('.dpng-zoom__cell[aria-current="date"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('data-zoom', '2026-09');
    expect(current[0]).toHaveClass('dpng-zoom__cell--current');
    expect(current[0]).toHaveAttribute('data-current', 'true');
  });

  it('marks every cell the selection touches', async () => {
    const user = userEvent.setup();
    render(
      <DatePicker
        mode="range"
        today={TODAY}
        locale="en-US"
        defaultValue={{ start: plainDate(2026, 3, 31), end: plainDate(2026, 5, 1) }}
      />,
    );

    await zoomOut(user);

    const selected = Array.from(
      document.querySelectorAll<HTMLElement>('.dpng-zoom__cell[aria-selected="true"]'),
    ).map((cell) => cell.dataset['zoom']);
    expect(selected).toEqual(['2026-03', '2026-04', '2026-05']);
    expect(screen.getByRole('gridcell', { name: 'March 2026' })).toHaveClass(
      'dpng-zoom__cell--selected',
    );
    expect(screen.getByRole('gridcell', { name: 'June 2026' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('keeps unreachable cells in the grid but marks them aria-disabled', async () => {
    const user = userEvent.setup();
    render(
      <DatePicker mode="single" today={TODAY} locale="en-US" minDate={plainDate(2026, 9, 20)} />,
    );

    await zoomOut(user);

    const august = screen.getByRole('gridcell', { name: 'August 2026' });
    expect(august).toHaveAttribute('aria-disabled', 'true');
    expect(august).toHaveClass('dpng-zoom__cell--disabled');
    expect(august).toHaveAttribute('data-disabled', 'true');
    // Real `disabled` would drop the cell out of the grid's focus order.
    expect(august).not.toBeDisabled();

    // September is only partly reachable, so it stays live.
    expect(screen.getByRole('gridcell', { name: 'September 2026' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  it('ignores a click on an unreachable cell', async () => {
    const user = userEvent.setup();
    render(
      <DatePicker mode="single" today={TODAY} locale="en-US" minDate={plainDate(2026, 9, 20)} />,
    );

    await zoomOut(user);
    await user.click(screen.getByRole('gridcell', { name: 'January 2026' }));

    expect(gridLabel()).toBe('2026');
    expect(zoomGrid()).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*                            Chevrons follow the level                       */
/* -------------------------------------------------------------------------- */

describe('calendar zoom: chevrons', () => {
  it('pages one whole screen at the level on show', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    const next = (): Promise<void> =>
      user.click(screen.getByRole('button', { name: 'Next month' }));
    const previous = (): Promise<void> =>
      user.click(screen.getByRole('button', { name: 'Previous month' }));

    await next();
    expect(gridLabel()).toBe('October 2026');
    await previous();

    await zoomOut(user);
    await next();
    expect(gridLabel()).toBe('2027');
    await previous();
    expect(gridLabel()).toBe('2026');

    await zoomOut(user);
    await next();
    expect(gridLabel()).toBe(`2028${DASH}2039`);
    await previous();
    expect(gridLabel()).toBe(`2016${DASH}2027`);

    await zoomOut(user);
    await next();
    expect(gridLabel()).toBe(`2040s${DASH}2150s`);
    await previous();
    expect(gridLabel()).toBe(`1920s${DASH}2030s`);
  });

  it('greys the chevrons out when the whole reachable span fits on one screen', async () => {
    const user = userEvent.setup();
    render(
      <DatePicker
        mode="single"
        today={TODAY}
        locale="en-US"
        minDate={plainDate(2020, 1, 1)}
        maxDate={plainDate(2030, 12, 31)}
      />,
    );

    // A month either side of September 2026 is plainly reachable.
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();

    await zoomOut(user);
    await zoomOut(user);
    // The year screen is 2016–2027: 2030 is a press away, 2020 is not.
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();

    await zoomOut(user);
    // 2020–2030 all sit inside the single decade screen 1920s–2030s.
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  });
});

/* -------------------------------------------------------------------------- */
/*                                  Keyboard                                  */
/* -------------------------------------------------------------------------- */

describe('calendar zoom: keyboard', () => {
  it('walks one cell with the horizontal arrows and three with the vertical', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await zoomOut(user);
    expect(focusedCell()).toBe('2026-09');

    await press(user, '{ArrowRight}');
    expect(focusedCell()).toBe('2026-10');

    await press(user, '{ArrowLeft}{ArrowLeft}');
    expect(focusedCell()).toBe('2026-08');

    await press(user, '{ArrowUp}');
    expect(focusedCell()).toBe('2026-05');

    await press(user, '{ArrowDown}{ArrowDown}');
    expect(focusedCell()).toBe('2026-11');
  });

  it('steps off the edge onto the next aligned screen', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await zoomOut(user);
    await zoomOut(user);
    expect(gridLabel()).toBe(`2016${DASH}2027`);

    await press(user, '{ArrowRight}{ArrowRight}');
    expect(gridLabel()).toBe(`2028${DASH}2039`);
    expect(focusedCell()).toBe('2028');
  });

  it('mirrors the horizontal arrows in an RTL locale', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="he-IL" />);

    expect(document.querySelector('.dpng')).toHaveAttribute('dir', 'rtl');
    await user.click(caption());

    await press(user, '{ArrowRight}');
    expect(focusedCell()).toBe('2026-08');

    await press(user, '{ArrowLeft}{ArrowLeft}');
    expect(focusedCell()).toBe('2026-10');

    // Vertical movement is not mirrored: down is still forwards in time.
    await press(user, '{ArrowDown}');
    expect(focusedCell()).toBe('2027-01');
  });

  it('zooms in with Enter and back out with Escape', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await zoomOut(user);
    await zoomOut(user);
    expect(gridLabel()).toBe(`2016${DASH}2027`);

    await press(user, '{Escape}');
    expect(gridLabel()).toBe(`1920s${DASH}2030s`);
    expect(focusedCell()).toBe('2020s');

    // Enter opens the focused *cell*, exactly as clicking it would, so it lands
    // on the first month of that cell's span — the 2020s open on 2020, not back
    // on the 2026 the walk out started from.
    await press(user, '{Enter}');
    expect(gridLabel()).toBe(`2016${DASH}2027`);
    expect(focusedCell()).toBe('2020');

    await press(user, '{Enter}');
    expect(gridLabel()).toBe('2020');
    expect(focusedCell()).toBe('2020-01');

    await press(user, '{Enter}');
    expect(zoomGrid()).toBeNull();
    expect(gridLabel()).toBe('January 2020');
  });

  it('leaves the day level alone on Escape', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    const day = screen.getByRole('gridcell', { name: /September 4, 2026/ });
    day.focus();
    await user.keyboard('{Escape}');

    // An inline picker has nothing to close, and Escape must not zoom here.
    expect(zoomGrid()).toBeNull();
    expect(gridLabel()).toBe('September 2026');
  });

  it('keeps focus inside the card when the level changes', async () => {
    const user = userEvent.setup();
    const { container } = render(<DatePicker mode="single" today={TODAY} locale="en-US" />);
    const card = container.querySelector('.dpng-card');

    // Clicking the caption leaves focus on the caption, which survives the swap.
    await zoomOut(user);
    expect(document.activeElement).toBe(caption());
    expect(card?.contains(document.activeElement)).toBe(true);

    // An arrow that pages the grid unmounts the focused cell; focus is re-homed.
    await press(user, '{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(focusedCell()).toBe('2025-12');
    expect(document.activeElement).toBe(zoomTabStop());

    // So does a level change driven from the keyboard, in both directions.
    await press(user, '{Escape}');
    expect(document.activeElement).toBe(zoomTabStop());
    await press(user, '{Enter}');
    expect(document.activeElement).toBe(zoomTabStop());
    expect(card?.contains(document.activeElement)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/*                     Zooming never touches the selection                    */
/* -------------------------------------------------------------------------- */

describe('calendar zoom: the selection', () => {
  it('survives a full zoom-out-and-back cycle untouched', async () => {
    const user = userEvent.setup();
    render(
      <DatePicker
        mode="range"
        today={TODAY}
        locale="en-US"
        defaultValue={{ start: plainDate(2026, 9, 4), end: plainDate(2026, 9, 25) }}
      />,
    );

    const summary = (): string =>
      Array.from(document.querySelectorAll<HTMLElement>('.dpng-field__value'))
        .map((node) => node.textContent ?? '')
        .join(' → ');
    const before = summary();
    expect(before).toContain('Sep 4');
    expect(before).toContain('Sep 25');

    await toDecade(user);
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await user.click(screen.getByRole('gridcell', { name: '2020 to 2029' }));
    await user.click(screen.getByRole('gridcell', { name: '2026' }));
    await user.click(screen.getByRole('gridcell', { name: 'September 2026' }));

    expect(summary()).toBe(before);
    expect(
      Array.from(document.querySelectorAll<HTMLElement>('.dpng-day[aria-selected="true"]')),
    ).toHaveLength(22);
  });

  it('does not select anything when a zoom cell is clicked', async () => {
    const user = userEvent.setup();
    render(<DatePicker mode="single" today={TODAY} locale="en-US" />);

    await zoomOut(user);
    await user.click(screen.getByRole('gridcell', { name: 'March 2026' }));

    expect(gridLabel()).toBe('March 2026');
    expect(document.querySelector('.dpng-day--selected')).toBeNull();
    expect(document.querySelectorAll('.dpng-day[aria-selected="true"]')).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/*                                 yearRange                                  */
/* -------------------------------------------------------------------------- */

describe('calendar zoom: yearRange', () => {
  const yearSelect = (): HTMLSelectElement => {
    const select = screen.getByRole('combobox', { name: 'Year' });
    if (!(select instanceof HTMLSelectElement)) throw new Error('the year control is not a select');
    return select;
  };

  it('offers a hundred years either side by default', () => {
    render(<DatePicker mode="single" today={TODAY} locale="en-US" monthCaptionLayout="dropdown" />);

    const options = Array.from(yearSelect().options).map((option) => Number(option.value));
    expect(options).toHaveLength(201);
    expect(options[0]).toBe(1926);
    expect(options[options.length - 1]).toBe(2126);
    expect(yearSelect().value).toBe('2026');
  });

  it('narrows and widens with a custom yearRange', () => {
    const { unmount } = render(
      <DatePicker
        mode="single"
        today={TODAY}
        locale="en-US"
        monthCaptionLayout="dropdown"
        yearRange={5}
      />,
    );
    expect(Array.from(yearSelect().options).map((option) => Number(option.value))).toEqual([
      2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031,
    ]);
    unmount();

    render(
      <DatePicker
        mode="single"
        today={TODAY}
        locale="en-US"
        monthCaptionLayout="dropdown"
        yearRange={{ past: 200, future: 0 }}
      />,
    );
    const wide = Array.from(yearSelect().options).map((option) => Number(option.value));
    expect(wide).toHaveLength(201);
    expect(wide[0]).toBe(1826);
    expect(wide[wide.length - 1]).toBe(2026);
  });

  it('is navigation reach only — every visible day stays selectable', async () => {
    const user = userEvent.setup();
    render(
      <DatePicker
        mode="single"
        today={TODAY}
        locale="en-US"
        monthCaptionLayout="dropdown"
        yearRange={1}
      />,
    );

    expect(yearSelect().options).toHaveLength(3);

    await user.selectOptions(yearSelect(), '2027');
    expect(gridLabel()).toBe('September 2027');

    await user.click(screen.getByRole('gridcell', { name: /September 17, 2027/ }));
    expect(document.querySelector('.dpng-day--selected')).toHaveAttribute(
      'data-date',
      '2027-09-17',
    );
  });

  it('hands the caption to the dropdowns at the day level', () => {
    render(<DatePicker mode="single" today={TODAY} locale="en-US" monthCaptionLayout="dropdown" />);

    // The selects already are the month/year control, so no zoom-out caption.
    expect(screen.queryAllByRole('button', { name: /zoom out/ })).toHaveLength(0);
    expect(screen.getByRole('combobox', { name: 'Month' })).toBeInTheDocument();
  });
});
