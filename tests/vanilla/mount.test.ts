/**
 * The framework-free binding: `createDatePicker`, the instance API and the
 * `<nextgen-date-picker>` custom element.
 *
 * The vanilla renderer must emit exactly the DOM the React components emit — one
 * stylesheet serves both — so these tests assert on the shared class names and on
 * the same roles and accessible names the React suites use.
 */

import { within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
// Registers the DOM matchers used below. `tests/setup.ts` loads them for the
// suite; importing here keeps the file typecheckable on its own.
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { plainDate, toISODate } from '../../src/core/plain-date';
import { createDatePicker, defineDatePickerElement } from '../../src/vanilla';
import type { DatePickerChangeDetail, DatePickerInstance } from '../../src/vanilla/mount';
import type { DatePickerElement } from '../../src/vanilla/element';
import type { PlainDate, SelectionValue, VanillaOptions } from '../../src/vanilla';

/** 2026-09-04 is a Friday; September 2026 starts on a Tuesday. */
const TODAY: PlainDate = plainDate(2026, 9, 4);

const sep = (day: number): PlainDate => plainDate(2026, 9, day);

/** External range shape produced by the default plain-date adapter. */
interface RangeValue {
  start: PlainDate | null;
  end: PlainDate | null;
}

const mounted: { instance?: DatePickerInstance; host: HTMLElement }[] = [];

/** Mount an inline picker into a fresh container attached to the document. */
function mount(options: VanillaOptions = {}): { instance: DatePickerInstance; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const instance = createDatePicker(host, {
    today: TODAY,
    locale: 'en-US',
    ...options,
  });
  const entry = { instance, host };
  mounted.push(entry);
  return entry;
}

afterEach(() => {
  while (mounted.length > 0) {
    const entry = mounted.pop();
    if (!entry) continue;
    try {
      entry.instance?.destroy();
    } catch {
      /* already destroyed by the test itself */
    }
    entry.host.remove();
  }
  document.body.textContent = '';
});

/** The day button for an ISO date inside `root`. */
function day(root: HTMLElement, iso: string): HTMLButtonElement {
  const node = root.querySelector<HTMLButtonElement>(`.dpng-day[data-date="${iso}"]`);
  if (!node) throw new Error(`no day cell for ${iso}`);
  return node;
}

const range = (value: unknown): string => {
  const { start, end } = value as RangeValue;
  return `${start ? toISODate(start) : ''}..${end ? toISODate(end) : ''}`;
};

/* -------------------------------------------------------------------------- */
/*                                  Mounting                                  */
/* -------------------------------------------------------------------------- */

describe('createDatePicker: mounting', () => {
  it('renders the shared class names into the target element', () => {
    const { instance, host } = mount({ mode: 'range' });

    const root = host.firstElementChild as HTMLElement | null;
    expect(root).toBe(instance.element);
    expect(root).toHaveClass('dpng');
    expect(root).toHaveAttribute('data-mode', 'range');
    expect(root).toHaveAttribute('data-variant', 'inline');
    expect(root).toHaveAttribute('data-months', '1');
    expect(root).toHaveAttribute('dir', 'ltr');

    for (const selector of [
      '.dpng-card',
      '.dpng-header',
      '.dpng-header__title',
      '.dpng-fields',
      '.dpng-field',
      '.dpng-nav',
      '.dpng-nav__button--prev',
      '.dpng-nav__button--next',
      '.dpng-months',
      '.dpng-month',
      '.dpng-weekdays',
      '.dpng-weekday',
      '.dpng-grid',
      '.dpng-week',
      '.dpng-day',
      '.dpng-day__number',
      '.dpng-presets',
      '.dpng-preset',
      '.dpng-live',
    ]) {
      expect(host.querySelector(selector), selector).not.toBeNull();
    }

    expect(host.querySelectorAll('.dpng-week')).toHaveLength(6);
    expect(host.querySelectorAll('.dpng-day')).toHaveLength(42);
    expect(day(host, '2026-09-04')).toHaveAttribute('aria-current', 'date');
    expect(day(host, '2026-09-04')).toHaveAttribute('tabindex', '0');
    expect(host.querySelectorAll('.dpng-day[tabindex="0"]')).toHaveLength(1);
  });

  it('publishes the same roles and accessible names as the React binding', () => {
    const { host } = mount({ mode: 'range' });

    const grid = within(host).getByRole('grid');
    expect(grid).toHaveAttribute('aria-label', 'September 2026');
    expect(within(grid).getAllByRole('row')).toHaveLength(6);
    expect(
      within(grid).getByRole('gridcell', { name: 'Friday, September 4, 2026, Today' }),
    ).toBeInTheDocument();
    expect(within(host).getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
    expect(within(host).getByRole('group', { name: 'Quick options' })).toBeInTheDocument();
    expect(within(host).getByRole('status')).toHaveClass('dpng-live');
  });

  it('accepts a CSS selector as the mount target', () => {
    const host = document.createElement('div');
    host.id = 'picker-host';
    document.body.appendChild(host);

    const instance = createDatePicker('#picker-host', { today: TODAY, locale: 'en-US' });
    mounted.push({ instance, host });

    expect(host.querySelector('.dpng')).toBe(instance.element);
  });

  it('throws a helpful error when the selector matches nothing', () => {
    expect(() => createDatePicker('#nope', { today: TODAY })).toThrow(/no element matches/);
  });
});

/* -------------------------------------------------------------------------- */
/*                                Interaction                                 */
/* -------------------------------------------------------------------------- */

describe('createDatePicker: interaction', () => {
  it('selects on click, updates the value and emits `change`', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(detail: unknown) => void>();
    const { instance, host } = mount({ mode: 'range' });
    instance.on('change', onChange);

    await user.click(day(host, '2026-09-04'));

    expect(range(instance.getValue())).toBe('2026-09-04..');
    expect(onChange).toHaveBeenCalledTimes(1);
    const first = onChange.mock.calls[0]?.[0] as DatePickerChangeDetail | undefined;
    expect(first?.meta).toMatchObject({ reason: 'range-start', mode: 'range', isComplete: false });
    expect(range(first?.value)).toBe('2026-09-04..');

    await user.click(day(host, '2026-09-11'));

    expect(range(instance.getValue())).toBe('2026-09-04..2026-09-11');
    expect(onChange).toHaveBeenCalledTimes(2);
    const second = onChange.mock.calls[1]?.[0] as DatePickerChangeDetail | undefined;
    expect(second?.meta).toMatchObject({ reason: 'range-end', isComplete: true, duration: 7 });

    expect(day(host, '2026-09-04')).toHaveClass('dpng-day--range-start');
    expect(day(host, '2026-09-11')).toHaveClass('dpng-day--range-end');
    expect(day(host, '2026-09-07')).toHaveClass('dpng-day--in-range');
    expect(host.querySelector('.dpng-header__badge')).toHaveTextContent('7 nights');
  });

  it('emits `complete` and `clear` alongside `change`', async () => {
    const user = userEvent.setup();
    const complete = vi.fn();
    const clear = vi.fn();
    const { instance, host } = mount({ mode: 'range' });
    instance.on('complete', complete);
    instance.on('clear', clear);

    await user.click(day(host, '2026-09-04'));
    expect(complete).not.toHaveBeenCalled();

    await user.click(day(host, '2026-09-06'));
    expect(complete).toHaveBeenCalledTimes(1);

    const clearButton = host.querySelector<HTMLButtonElement>('[data-action="clear"]');
    expect(clearButton).not.toBeNull();
    if (clearButton) await user.click(clearButton);

    expect(clear).toHaveBeenCalledTimes(1);
    expect(range(instance.getValue())).toBe('..');
  });

  it('stops notifying an unsubscribed handler', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { instance, host } = mount({ mode: 'single' });
    const off = instance.on('change', onChange);

    await user.click(day(host, '2026-09-08'));
    expect(onChange).toHaveBeenCalledTimes(1);

    off();
    await user.click(day(host, '2026-09-09'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('applies a preset chip and navigates months', async () => {
    const user = userEvent.setup();
    const onMonthChange = vi.fn();
    const { instance, host } = mount({ mode: 'range' });
    instance.on('monthchange', onMonthChange);

    const chip = host.querySelector<HTMLButtonElement>('[data-preset="1-week"]');
    expect(chip).not.toBeNull();
    if (chip) await user.click(chip);

    expect(range(instance.getValue())).toBe('2026-09-04..2026-09-11');
    expect(chip).toHaveClass('dpng-preset--active');

    const next = host.querySelector<HTMLButtonElement>('[data-action="next"]');
    if (next) await user.click(next);

    expect(within(host).getByRole('grid')).toHaveAttribute('aria-label', 'October 2026');
    expect(onMonthChange).toHaveBeenCalledTimes(1);
  });

  it('previews the pending range while the pointer moves over the grid', async () => {
    const user = userEvent.setup();
    const { host } = mount({ mode: 'range' });

    await user.click(day(host, '2026-09-04'));
    await user.hover(day(host, '2026-09-07'));

    expect(
      Array.from(host.querySelectorAll<HTMLElement>('.dpng-day--preview')).map(
        (cell) => cell.dataset['date'],
      ),
    ).toEqual(['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07']);
  });

  /**
   * Regression: `renderDay` used to set the native `disabled` attribute on an
   * unavailable day. That drops the cell out of the grid's roving focus order
   * and out of most screen readers' grid navigation, and it swallows the click
   * that fires `onInvalidSelection` — the very callback that exists to explain
   * a rejected pick. Unavailable days now carry `aria-disabled="true"` and stay
   * focusable; only a cell hidden from the grid entirely is natively disabled.
   */
  it('keeps unavailable days focusable, announced and rejected out loud', async () => {
    const user = userEvent.setup();
    const onInvalid = vi.fn();
    const { host } = mount({
      mode: 'range',
      disabledDates: [sep(10)],
      onInvalidSelection: onInvalid,
    });

    const blocked = day(host, '2026-09-10');
    expect(blocked).toHaveClass('dpng-day--disabled');
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    expect(blocked).not.toBeDisabled();

    await user.click(blocked);
    expect(onInvalid).toHaveBeenCalledTimes(1);
  });

  it('moves the roving focus with the keyboard', async () => {
    const user = userEvent.setup();
    const { host } = mount({ mode: 'single' });

    day(host, '2026-09-04').focus();
    await user.keyboard('{ArrowRight}');

    expect(document.activeElement).toBe(day(host, '2026-09-05'));
    expect(day(host, '2026-09-05')).toHaveAttribute('tabindex', '0');
    expect(host.querySelectorAll('.dpng-day[tabindex="0"]')).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/*                               Instance API                                 */
/* -------------------------------------------------------------------------- */

describe('createDatePicker: instance API', () => {
  it('round-trips a value through setValue / getValue', () => {
    const { instance, host } = mount({ mode: 'range' });

    expect(range(instance.getValue())).toBe('..');

    instance.setValue({ start: sep(9), end: sep(16) });

    expect(range(instance.getValue())).toBe('2026-09-09..2026-09-16');
    expect(day(host, '2026-09-09')).toHaveClass('dpng-day--range-start');
    expect(day(host, '2026-09-16')).toHaveClass('dpng-day--range-end');
    expect(host.querySelector('.dpng-header__badge')).toHaveTextContent('7 nights');

    instance.setValue(null);

    expect(range(instance.getValue())).toBe('..');
    expect(host.querySelectorAll('.dpng-day--range-start')).toHaveLength(0);
  });

  it('reads the internal selection through the engine snapshot', () => {
    const { instance } = mount({ mode: 'multiple', defaultValue: [sep(2), sep(5)] });

    const value = instance.getValue<PlainDate[]>();
    expect(value.map(toISODate)).toEqual(['2026-09-02', '2026-09-05']);

    const selection: SelectionValue = instance.engine.getSnapshot().value;
    expect(selection.dates.map(toISODate)).toEqual(['2026-09-02', '2026-09-05']);
  });

  it('re-configures both engine and presentation through update()', () => {
    const { instance, host } = mount({ mode: 'range' });

    expect(within(host).getAllByRole('grid')).toHaveLength(1);

    instance.update({ numberOfMonths: 2, theme: 'midnight', size: 'lg' });

    expect(
      within(host)
        .getAllByRole('grid')
        .map((grid) => grid.getAttribute('aria-label')),
    ).toEqual(['September 2026', 'October 2026']);
    expect(instance.element).toHaveAttribute('data-theme', 'midnight');
    expect(instance.element).toHaveAttribute('data-size', 'lg');
    expect(instance.element).toHaveAttribute('data-months', '2');

    // A constraint added after mount is re-resolved and repainted immediately.
    instance.update({ minDate: sep(10) });

    expect(day(host, '2026-09-04')).toHaveClass('dpng-day--disabled');
    expect(day(host, '2026-09-04')).toHaveAttribute('data-disabled', 'true');
    expect(day(host, '2026-09-11')).not.toHaveClass('dpng-day--disabled');
  });

  it('keeps registered handlers when update() is called', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { instance, host } = mount({ mode: 'single' });
    instance.on('change', onChange);

    instance.update({ numberOfMonths: 2 });
    await user.click(day(host, '2026-09-15'));

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/*                                  Teardown                                  */
/* -------------------------------------------------------------------------- */

describe('createDatePicker: destroy', () => {
  it('empties the container and detaches every listener', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { instance, host } = mount({ mode: 'range' });
    instance.on('change', onChange);

    const cell = day(host, '2026-09-12');
    const root = instance.element;

    instance.destroy();

    expect(host).toBeEmptyDOMElement();
    expect(root.isConnected).toBe(false);
    expect(root.childElementCount).toBe(0);

    // Whatever the page still holds a reference to must be inert, not explosive.
    await expect(user.click(cell)).resolves.toBeUndefined();
    expect(() => cell.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
    expect(() => root.dispatchEvent(new MouseEvent('click', { bubbles: true }))).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is idempotent and leaves the rest of the instance API harmless', () => {
    const { instance } = mount({ mode: 'range' });

    instance.destroy();

    expect(() => instance.destroy()).not.toThrow();
    expect(() => instance.update({ numberOfMonths: 2 })).not.toThrow();
    expect(() => instance.setValue({ start: sep(4), end: sep(6) })).not.toThrow();
    expect(range(instance.getValue())).toBe('..');
  });
});

/* -------------------------------------------------------------------------- */
/*                               Custom element                               */
/* -------------------------------------------------------------------------- */

describe('defineDatePickerElement', () => {
  const define = (): CustomElementConstructor | undefined => {
    defineDatePickerElement();
    return window.customElements.get('nextgen-date-picker');
  };

  /** Attach a configured element and hand back its typed reference. */
  function element(attributes: Record<string, string>): DatePickerElement {
    define();
    const node = document.createElement('nextgen-date-picker') as DatePickerElement;
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    document.body.appendChild(node);
    return node;
  }

  it('registers the tag once and ignores a second call', () => {
    const first = define();
    expect(first).toBeTypeOf('function');
    expect(() => defineDatePickerElement()).not.toThrow();
    expect(window.customElements.get('nextgen-date-picker')).toBe(first);
  });

  it('renders from its attributes on connect', () => {
    const node = element({
      mode: 'range',
      today: '2026-09-04',
      locale: 'en-US',
      months: '2',
      theme: 'emerald',
    });

    const root = node.querySelector<HTMLElement>('.dpng');
    expect(root).not.toBeNull();
    expect(root).toHaveAttribute('data-mode', 'range');
    expect(root).toHaveAttribute('data-theme', 'emerald');
    expect(
      within(node)
        .getAllByRole('grid')
        .map((grid) => grid.getAttribute('aria-label')),
    ).toEqual(['September 2026', 'October 2026']);
  });

  it('reflects attribute changes into the live picker', () => {
    const node = element({ mode: 'range', today: '2026-09-04', locale: 'en-US' });

    node.setAttribute('months', '2');
    expect(within(node).getAllByRole('grid')).toHaveLength(2);

    node.setAttribute('value', '2026-09-04..2026-09-11');
    expect(range(node.value)).toBe('2026-09-04..2026-09-11');
    expect(node.selection.range.start && toISODate(node.selection.range.start)).toBe('2026-09-04');
    expect(node.querySelector('.dpng-header__badge')).toHaveTextContent('7 nights');

    node.setAttribute('min-nights', '3');
    node.setAttribute('months', '1');
    expect(within(node).getAllByRole('grid')).toHaveLength(1);
    expect(node.picker?.engine.getOptions().minNights).toBe(3);
  });

  it('forwards instance events as DOM CustomEvents', async () => {
    const user = userEvent.setup();
    const node = element({ mode: 'single', today: '2026-09-04', locale: 'en-US' });
    const listener = vi.fn();
    node.addEventListener('change', listener);

    const cell = node.querySelector<HTMLButtonElement>('.dpng-day[data-date="2026-09-18"]');
    expect(cell).not.toBeNull();
    if (cell) await user.click(cell);

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0] as CustomEvent<DatePickerChangeDetail> | undefined;
    expect(event?.detail.selection.dates.map(toISODate)).toEqual(['2026-09-18']);
  });

  it('accepts rich options through properties', () => {
    const node = element({ mode: 'range', today: '2026-09-04', locale: 'en-US' });

    node.disabledDates = [sep(10)];

    const blocked = node.querySelector('.dpng-day[data-date="2026-09-10"]');
    expect(blocked).toHaveClass('dpng-day--disabled');
    expect(blocked).toHaveAttribute('data-disabled', 'true');
    expect(node.querySelector('.dpng-day[data-date="2026-09-11"]')).not.toHaveClass(
      'dpng-day--disabled',
    );
  });

  it('tears itself down when disconnected', () => {
    const node = element({ mode: 'single', today: '2026-09-04', locale: 'en-US' });
    expect(node.picker).not.toBeNull();

    node.remove();

    expect(node).toBeEmptyDOMElement();
    expect(node.picker).toBeNull();
  });
});
