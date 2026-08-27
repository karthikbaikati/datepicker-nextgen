import { describe, expect, it } from 'vitest';
import { applyFocusStep, keyboardShortcuts, resolveKeyboardIntent } from '../src/core/keyboard';
import { plainDate, toISODate } from '../src/core/plain-date';
import type { KeyboardIntent } from '../src/core/keyboard';
import type { FocusStep, KeyboardLike, PlainDate } from '../src/core/types';

/** 2026-09-04 is a Friday. */
const FRIDAY = plainDate(2026, 9, 4);

const ltr = (event: KeyboardLike): KeyboardIntent => resolveKeyboardIntent(event, { rtl: false });
const rtl = (event: KeyboardLike): KeyboardIntent => resolveKeyboardIntent(event, { rtl: true });

const step = (intent: KeyboardIntent): FocusStep | null =>
  intent && intent.type === 'move' ? intent.step : null;

const stepped = (from: PlainDate, focusStep: FocusStep, firstDayOfWeek = 0): string =>
  toISODate(applyFocusStep(from, focusStep, firstDayOfWeek));

const MODIFIERS: readonly (keyof KeyboardLike)[] = ['ctrlKey', 'metaKey', 'altKey'];

describe('keyboard: arrow keys', () => {
  it('maps the horizontal arrows to single days in LTR', () => {
    expect(ltr({ key: 'ArrowLeft' })).toEqual({ type: 'move', step: 'day-previous' });
    expect(ltr({ key: 'ArrowRight' })).toEqual({ type: 'move', step: 'day-next' });
  });

  it('mirrors the horizontal arrows in RTL so "left" stays visually left', () => {
    expect(rtl({ key: 'ArrowLeft' })).toEqual({ type: 'move', step: 'day-next' });
    expect(rtl({ key: 'ArrowRight' })).toEqual({ type: 'move', step: 'day-previous' });
  });

  it('never mirrors the vertical arrows', () => {
    expect(ltr({ key: 'ArrowUp' })).toEqual({ type: 'move', step: 'week-previous' });
    expect(ltr({ key: 'ArrowDown' })).toEqual({ type: 'move', step: 'week-next' });
    expect(rtl({ key: 'ArrowUp' })).toEqual({ type: 'move', step: 'week-previous' });
    expect(rtl({ key: 'ArrowDown' })).toEqual({ type: 'move', step: 'week-next' });
  });

  it('tolerates Shift on the arrows', () => {
    expect(step(ltr({ key: 'ArrowRight', shiftKey: true }))).toBe('day-next');
    expect(step(ltr({ key: 'ArrowDown', shiftKey: true }))).toBe('week-next');
  });
});

describe('keyboard: Home and End', () => {
  it('moves to the week edges on their own', () => {
    expect(ltr({ key: 'Home' })).toEqual({ type: 'move', step: 'week-start' });
    expect(ltr({ key: 'End' })).toEqual({ type: 'move', step: 'week-end' });
  });

  it('moves to the month edges with Ctrl or Meta — the one honoured chord', () => {
    expect(ltr({ key: 'Home', ctrlKey: true })).toEqual({ type: 'move', step: 'month-start' });
    expect(ltr({ key: 'End', ctrlKey: true })).toEqual({ type: 'move', step: 'month-end' });
    expect(ltr({ key: 'Home', metaKey: true })).toEqual({ type: 'move', step: 'month-start' });
    expect(ltr({ key: 'End', metaKey: true })).toEqual({ type: 'move', step: 'month-end' });
  });

  it('is not mirrored in RTL — the week edges are logical, not visual', () => {
    expect(step(rtl({ key: 'Home' }))).toBe('week-start');
    expect(step(rtl({ key: 'End' }))).toBe('week-end');
  });
});

describe('keyboard: paging', () => {
  it('pages by month unmodified', () => {
    expect(ltr({ key: 'PageUp' })).toEqual({ type: 'move', step: 'month-previous' });
    expect(ltr({ key: 'PageDown' })).toEqual({ type: 'move', step: 'month-next' });
  });

  it('pages by year with Shift', () => {
    expect(ltr({ key: 'PageUp', shiftKey: true })).toEqual({ type: 'move', step: 'year-previous' });
    expect(ltr({ key: 'PageDown', shiftKey: true })).toEqual({ type: 'move', step: 'year-next' });
  });

  it('is not mirrored in RTL', () => {
    expect(step(rtl({ key: 'PageDown' }))).toBe('month-next');
    expect(step(rtl({ key: 'PageUp', shiftKey: true }))).toBe('year-previous');
  });
});

describe('keyboard: action keys', () => {
  it('selects on Enter, Space and the legacy Spacebar name', () => {
    expect(ltr({ key: 'Enter' })).toEqual({ type: 'select' });
    expect(ltr({ key: ' ' })).toEqual({ type: 'select' });
    expect(ltr({ key: 'Spacebar' })).toEqual({ type: 'select' });
  });

  it('closes on Escape, including the legacy Esc name, even when chorded', () => {
    expect(ltr({ key: 'Escape' })).toEqual({ type: 'close' });
    expect(ltr({ key: 'Esc' })).toEqual({ type: 'close' });
    expect(ltr({ key: 'Escape', ctrlKey: true })).toEqual({ type: 'close' });
  });

  it('clears on Backspace and Delete', () => {
    expect(ltr({ key: 'Backspace' })).toEqual({ type: 'clear' });
    expect(ltr({ key: 'Delete' })).toEqual({ type: 'clear' });
  });

  it('jumps to today on "t", in either case', () => {
    expect(ltr({ key: 't' })).toEqual({ type: 'today' });
    expect(ltr({ key: 'T' })).toEqual({ type: 'today' });
    expect(ltr({ key: 'T', shiftKey: true })).toEqual({ type: 'today' });
  });
});

describe('keyboard: modifier combinations are not hijacked', () => {
  it('lets Ctrl/Meta/Alt + arrows through to the browser', () => {
    for (const modifier of MODIFIERS) {
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
        expect(ltr({ key, [modifier]: true })).toBeNull();
        expect(rtl({ key, [modifier]: true })).toBeNull();
      }
    }
  });

  it('lets Ctrl/Meta/Alt + PageUp/PageDown through — those are tab switching', () => {
    for (const modifier of MODIFIERS) {
      expect(ltr({ key: 'PageUp', [modifier]: true })).toBeNull();
      expect(ltr({ key: 'PageDown', [modifier]: true })).toBeNull();
    }
  });

  it('lets Ctrl/Meta/Alt + Enter, Space, Backspace and Delete through', () => {
    for (const modifier of MODIFIERS) {
      for (const key of ['Enter', ' ', 'Spacebar', 'Backspace', 'Delete']) {
        expect(ltr({ key, [modifier]: true })).toBeNull();
      }
    }
  });

  it('lets every browser text shortcut through', () => {
    for (const key of ['a', 'c', 'v', 'x', 'z', 'f', 'r', 'p', 's', 't']) {
      expect(ltr({ key, ctrlKey: true })).toBeNull();
      expect(ltr({ key, metaKey: true })).toBeNull();
      expect(ltr({ key, altKey: true })).toBeNull();
    }
  });

  it('treats any of the three modifiers on Home/End as the month-edge chord', () => {
    expect(step(ltr({ key: 'Home', altKey: true }))).toBe('month-start');
    expect(step(ltr({ key: 'End', altKey: true }))).toBe('month-end');
  });
});

describe('keyboard: unhandled keys bubble', () => {
  it('returns null for keys the picker has no binding for', () => {
    for (const key of ['Tab', 'Shift', 'Control', 'F5', 'Insert', 'q', '1', '/', 'Dead']) {
      expect(ltr({ key })).toBeNull();
    }
  });

  it('returns null for an empty or missing key', () => {
    expect(ltr({ key: '' })).toBeNull();
    expect(
      resolveKeyboardIntent({ key: undefined as unknown as string }, { rtl: false }),
    ).toBeNull();
  });

  it('returns null for a multi-character key with no binding', () => {
    expect(ltr({ key: 'MediaPlayPause' })).toBeNull();
    expect(ltr({ key: 'AudioVolumeUp' })).toBeNull();
  });
});

describe('keyboard: preset shortcuts', () => {
  const withShortcuts = (event: KeyboardLike, presetShortcuts: readonly string[]): KeyboardIntent =>
    resolveKeyboardIntent(event, { rtl: false, presetShortcuts });

  it('routes a registered single character to its preset', () => {
    expect(withShortcuts({ key: 'w' }, ['w'])).toEqual({ type: 'preset', shortcut: 'w' });
  });

  it('matches case-insensitively but returns the shortcut as registered', () => {
    expect(withShortcuts({ key: 'W' }, ['w'])).toEqual({ type: 'preset', shortcut: 'w' });
    expect(withShortcuts({ key: 'w' }, ['W'])).toEqual({ type: 'preset', shortcut: 'W' });
    expect(withShortcuts({ key: 'W', shiftKey: true }, ['w'])).toEqual({
      type: 'preset',
      shortcut: 'w',
    });
  });

  it('lets a preset claim "t" away from the today shortcut', () => {
    expect(withShortcuts({ key: 't' }, ['t'])).toEqual({ type: 'preset', shortcut: 't' });
    expect(withShortcuts({ key: 't' }, ['w'])).toEqual({ type: 'today' });
  });

  it('never lets a shortcut override a reserved key', () => {
    expect(withShortcuts({ key: 'Enter' }, ['Enter'])).toEqual({ type: 'select' });
    expect(withShortcuts({ key: 'Escape' }, ['Escape'])).toEqual({ type: 'close' });
    expect(step(withShortcuts({ key: 'Home' }, ['Home']))).toBe('week-start');
  });

  it('ignores a chorded shortcut press', () => {
    expect(withShortcuts({ key: 'w', ctrlKey: true }, ['w'])).toBeNull();
    expect(withShortcuts({ key: 'w', metaKey: true }, ['w'])).toBeNull();
    expect(withShortcuts({ key: 'w', altKey: true }, ['w'])).toBeNull();
  });

  it('ignores an unregistered character and an empty shortcut list', () => {
    expect(withShortcuts({ key: 'z' }, ['w'])).toBeNull();
    expect(withShortcuts({ key: 'w' }, [])).toBeNull();
    expect(ltr({ key: 'w' })).toBeNull();
  });
});

describe('keyboard: applyFocusStep', () => {
  it('steps by day and by week', () => {
    expect(stepped(FRIDAY, 'day-next')).toBe('2026-09-05');
    expect(stepped(FRIDAY, 'day-previous')).toBe('2026-09-03');
    expect(stepped(FRIDAY, 'week-next')).toBe('2026-09-11');
    expect(stepped(FRIDAY, 'week-previous')).toBe('2026-08-28');
  });

  it('steps to the week edges for every firstDayOfWeek', () => {
    const edges: readonly (readonly [string, string])[] = [
      ['2026-08-30', '2026-09-05'],
      ['2026-08-31', '2026-09-06'],
      ['2026-09-01', '2026-09-07'],
      ['2026-09-02', '2026-09-08'],
      ['2026-09-03', '2026-09-09'],
      ['2026-09-04', '2026-09-10'],
      ['2026-08-29', '2026-09-04'],
    ];
    edges.forEach(([start, end], firstDayOfWeek) => {
      expect(stepped(FRIDAY, 'week-start', firstDayOfWeek)).toBe(start);
      expect(stepped(FRIDAY, 'week-end', firstDayOfWeek)).toBe(end);
    });
  });

  it('ends the week exactly six days after it starts', () => {
    for (let firstDayOfWeek = 0; firstDayOfWeek < 7; firstDayOfWeek += 1) {
      const start = applyFocusStep(FRIDAY, 'week-start', firstDayOfWeek);
      const end = applyFocusStep(FRIDAY, 'week-end', firstDayOfWeek);
      expect(toISODate(end)).toBe(toISODate(plainDate(start.year, start.month, start.day + 6)));
    }
  });

  it('steps to the month edges', () => {
    expect(stepped(FRIDAY, 'month-start')).toBe('2026-09-01');
    expect(stepped(FRIDAY, 'month-end')).toBe('2026-09-30');
    expect(stepped(plainDate(2024, 2, 10), 'month-end')).toBe('2024-02-29');
    expect(stepped(plainDate(2025, 2, 10), 'month-end')).toBe('2025-02-28');
  });

  it('steps by month with end-of-month clamping', () => {
    expect(stepped(FRIDAY, 'month-next')).toBe('2026-10-04');
    expect(stepped(FRIDAY, 'month-previous')).toBe('2026-08-04');
    expect(stepped(plainDate(2026, 1, 31), 'month-next')).toBe('2026-02-28');
    expect(stepped(plainDate(2024, 1, 31), 'month-next')).toBe('2024-02-29');
    expect(stepped(plainDate(2026, 3, 31), 'month-previous')).toBe('2026-02-28');
  });

  it('steps by year with leap-day clamping', () => {
    expect(stepped(FRIDAY, 'year-next')).toBe('2027-09-04');
    expect(stepped(FRIDAY, 'year-previous')).toBe('2025-09-04');
    expect(stepped(plainDate(2024, 2, 29), 'year-next')).toBe('2025-02-28');
    expect(stepped(plainDate(2024, 2, 29), 'year-previous')).toBe('2023-02-28');
  });

  it('crosses month and year boundaries a day at a time', () => {
    expect(stepped(plainDate(2026, 12, 31), 'day-next')).toBe('2027-01-01');
    expect(stepped(plainDate(2027, 1, 1), 'day-previous')).toBe('2026-12-31');
    expect(stepped(plainDate(2024, 2, 28), 'day-next')).toBe('2024-02-29');
    expect(stepped(plainDate(2025, 2, 28), 'day-next')).toBe('2025-03-01');
  });

  it('never mutates the date it is given', () => {
    const input = plainDate(2026, 9, 4);
    for (const focusStep of [
      'day-next',
      'week-next',
      'month-next',
      'year-next',
      'week-start',
      'month-end',
    ] as FocusStep[]) {
      applyFocusStep(input, focusStep, 0);
    }
    expect(toISODate(input)).toBe('2026-09-04');
  });

  it('returns the date unchanged for an unknown step', () => {
    expect(stepped(FRIDAY, 'nonsense' as FocusStep)).toBe('2026-09-04');
  });
});

describe('keyboard: the documented shortcut table', () => {
  it('lists every binding the resolver implements', () => {
    expect(keyboardShortcuts.map((entry) => entry.keys)).toEqual([
      '← →',
      '↑ ↓',
      'Home / End',
      'Ctrl + Home / End',
      'Page Up / Page Down',
      'Shift + Page Up / Page Down',
      'Enter / Space',
      'Backspace / Delete',
      'T',
      'Esc',
    ]);
  });

  it('gives every entry a non-empty description', () => {
    for (const entry of keyboardShortcuts) {
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it('documents nothing the resolver ignores', () => {
    const probes: readonly (readonly [string, KeyboardLike])[] = [
      ['← →', { key: 'ArrowLeft' }],
      ['↑ ↓', { key: 'ArrowUp' }],
      ['Home / End', { key: 'Home' }],
      ['Ctrl + Home / End', { key: 'Home', ctrlKey: true }],
      ['Page Up / Page Down', { key: 'PageUp' }],
      ['Shift + Page Up / Page Down', { key: 'PageUp', shiftKey: true }],
      ['Enter / Space', { key: 'Enter' }],
      ['Backspace / Delete', { key: 'Backspace' }],
      ['T', { key: 't' }],
      ['Esc', { key: 'Escape' }],
    ];
    for (const [keys, event] of probes) {
      expect(keyboardShortcuts.some((entry) => entry.keys === keys)).toBe(true);
      expect(ltr(event), `${keys} should resolve to an intent`).not.toBeNull();
    }
  });
});
