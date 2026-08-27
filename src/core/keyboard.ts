/**
 * Keyboard intent resolution.
 *
 * The core never touches the DOM, so bindings are resolved from a structural
 * {@link KeyboardLike} into a declarative {@link KeyboardIntent}; the binding
 * layer decides what to do with it (and owns `preventDefault`). Keeping the
 * mapping pure means the whole keyboard surface is testable without a browser
 * and stays identical across React, vanilla and the web component.
 */
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  subDays,
} from './plain-date';
import type { FocusStep, KeyboardLike, PlainDate } from './types';

export type KeyboardIntent =
  | { type: 'move'; step: FocusStep }
  | { type: 'select' }
  | { type: 'clear' }
  | { type: 'close' }
  | { type: 'today' }
  | { type: 'preset'; shortcut: string }
  | null;

/**
 * Map one key press to an intent, or `null` when the picker should not handle it
 * (let it bubble — swallowing unknown keys breaks type-ahead and browser shortcuts).
 * Horizontal arrows are mirrored under `rtl` so "left" always means "visually left".
 */
export function resolveKeyboardIntent(
  event: KeyboardLike,
  opts: { rtl: boolean; presetShortcuts?: readonly string[] },
): KeyboardIntent {
  const key = event.key;
  if (!key) return null;

  const shift = event.shiftKey === true;
  // Ctrl/Meta/Alt combos belong to the OS and the browser — except Ctrl/Meta+Home/End,
  // the conventional "jump to the edge of the month" chord in a date grid.
  const chorded = event.ctrlKey === true || event.metaKey === true || event.altKey === true;

  switch (key) {
    case 'ArrowLeft':
      return chorded ? null : move(opts.rtl ? 'day-next' : 'day-previous');
    case 'ArrowRight':
      return chorded ? null : move(opts.rtl ? 'day-previous' : 'day-next');
    case 'ArrowUp':
      return chorded ? null : move('week-previous');
    case 'ArrowDown':
      return chorded ? null : move('week-next');
    case 'Home':
      return move(chorded ? 'month-start' : 'week-start');
    case 'End':
      return move(chorded ? 'month-end' : 'week-end');
    case 'PageUp':
      return chorded ? null : move(shift ? 'year-previous' : 'month-previous');
    case 'PageDown':
      return chorded ? null : move(shift ? 'year-next' : 'month-next');
    case 'Enter':
    case ' ':
    case 'Spacebar':
      return chorded ? null : { type: 'select' };
    case 'Escape':
    case 'Esc':
      return { type: 'close' };
    case 'Backspace':
    case 'Delete':
      return chorded ? null : { type: 'clear' };
    default:
      break;
  }

  // Single-character accelerators. Shift is tolerated because it is inherent to
  // typing a capital letter; any other modifier disqualifies the press.
  if (chorded || key.length !== 1) return null;
  const shortcut = matchPresetShortcut(key, opts.presetShortcuts);
  // `t` jumps to today unless the host has claimed it for a preset.
  if (!shortcut && key.toLowerCase() === 't') return { type: 'today' };
  return shortcut ? { type: 'preset', shortcut } : null;
}

function move(step: FocusStep): KeyboardIntent {
  return { type: 'move', step };
}

/** Case-insensitive lookup that returns the shortcut *as registered*, so preset ids stay matchable. */
function matchPresetShortcut(key: string, shortcuts: readonly string[] | undefined): string | null {
  if (!shortcuts || shortcuts.length === 0) return null;
  const lower = key.toLowerCase();
  for (const shortcut of shortcuts) {
    if (shortcut.toLowerCase() === lower) return shortcut;
  }
  return null;
}

/** Pure date math for roving focus. The engine clamps the result to the constraints afterwards. */
export function applyFocusStep(
  date: PlainDate,
  step: FocusStep,
  firstDayOfWeek: number,
): PlainDate {
  switch (step) {
    case 'day-next':
      return addDays(date, 1);
    case 'day-previous':
      return subDays(date, 1);
    case 'week-next':
      return addWeeks(date, 1);
    case 'week-previous':
      return addWeeks(date, -1);
    case 'week-start':
      return startOfWeek(date, firstDayOfWeek);
    case 'week-end':
      return endOfWeek(date, firstDayOfWeek);
    case 'month-next':
      return addMonths(date, 1);
    case 'month-previous':
      return addMonths(date, -1);
    case 'month-start':
      return startOfMonth(date);
    case 'month-end':
      return endOfMonth(date);
    case 'year-next':
      return addYears(date, 1);
    case 'year-previous':
      return addYears(date, -1);
    default:
      return date;
  }
}

/**
 * The canonical binding table — the single source of truth for the docs and for
 * the demo's help sheet, so what ships can never drift from what is implemented.
 */
export const keyboardShortcuts: readonly { keys: string; description: string }[] = [
  { keys: '← →', description: 'Previous / next day' },
  { keys: '↑ ↓', description: 'Previous / next week' },
  { keys: 'Home / End', description: 'First / last day of the week' },
  { keys: 'Ctrl + Home / End', description: 'First / last day of the month' },
  { keys: 'Page Up / Page Down', description: 'Previous / next month' },
  { keys: 'Shift + Page Up / Page Down', description: 'Previous / next year' },
  { keys: 'Enter / Space', description: 'Select the focused date' },
  { keys: 'Backspace / Delete', description: 'Clear the selection' },
  { keys: 'T', description: 'Jump to today' },
  { keys: 'Esc', description: 'Close the picker' },
];
