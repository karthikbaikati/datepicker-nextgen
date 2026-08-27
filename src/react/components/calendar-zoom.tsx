/**
 * The zoomed-out calendar: twelve months, twelve years or twelve decades.
 *
 * One 3 × 4 grid serves every level above `day`, because the core hands every
 * level the same twelve {@link ZoomCell}s. The component is a pure reader of
 * `snapshot.zoom` — clicking a cell zooms one level in, and the caption in
 * {@link CalendarNav} zooms back out.
 *
 * It follows the same ARIA grid pattern as the day grid (`grid` › `row` ›
 * `gridcell`, roving tabindex owned by the engine), so the keyboard model is
 * identical at every zoom level.
 */

import { forwardRef, memo, useCallback, useEffect, useRef } from 'react';
import type { ForwardedRef, HTMLAttributes, KeyboardEvent, ReactNode } from 'react';

import type { ZoomCell } from '../../core/types';
import { useDatePickerContext } from '../context';

/** Props for {@link CalendarZoom}. */
export interface CalendarZoomProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /**
   * Accessible name for the grid. Defaults to the level's own caption —
   * `"2026"` at the month level, `"2020 – 2031"` at the year level.
   */
  label?: string;
}

/** The grid is three cells wide at every level; four rows of them make twelve. */
const COLUMNS = 3;

function flag(on: boolean): 'true' | undefined {
  return on ? 'true' : undefined;
}

function cellClassName(cell: ZoomCell): string {
  let className = 'dpng-zoom__cell';
  if (cell.isCurrent) className += ' dpng-zoom__cell--current';
  if (cell.isSelected) className += ' dpng-zoom__cell--selected';
  if (cell.disabled) className += ' dpng-zoom__cell--disabled';
  return className;
}

interface ZoomCellButtonProps {
  cell: ZoomCell;
  /** Referentially stable for the life of the picker, so the memo below bites. */
  onSelect: (cell: ZoomCell) => void;
}

function ZoomCellButtonImpl({ cell, onSelect }: ZoomCellButtonProps): ReactNode {
  return (
    <button
      type="button"
      role="gridcell"
      className={cellClassName(cell)}
      tabIndex={cell.tabIndex}
      // Deliberately not `disabled`, exactly as the day cell is not: an
      // unreachable cell must stay in the roving tabindex, which is what the
      // ARIA grid pattern requires.
      aria-disabled={cell.disabled}
      aria-selected={cell.isSelected}
      aria-current={cell.isCurrent ? 'date' : undefined}
      aria-label={cell.ariaLabel}
      data-zoom={cell.key}
      data-current={flag(cell.isCurrent)}
      data-selected={flag(cell.isSelected)}
      data-disabled={flag(cell.disabled)}
      onClick={() => onSelect(cell)}
    >
      {cell.label}
    </button>
  );
}

/**
 * `date` is absent on purpose: it is derived from the cell's span, so a cell
 * whose key is unchanged is pointing at the same month, year or decade.
 */
function propsEqual(previous: ZoomCellButtonProps, next: ZoomCellButtonProps): boolean {
  const a = previous.cell;
  const b = next.cell;
  return (
    previous.onSelect === next.onSelect &&
    a.key === b.key &&
    a.label === b.label &&
    a.tabIndex === b.tabIndex &&
    a.isCurrent === b.isCurrent &&
    a.isSelected === b.isSelected &&
    a.disabled === b.disabled &&
    a.ariaLabel === b.ariaLabel
  );
}

const ZoomCellButton = memo(ZoomCellButtonImpl, propsEqual);

ZoomCellButton.displayName = 'ZoomCellButton';

interface ZoomRow {
  readonly key: string;
  readonly cells: readonly ZoomCell[];
}

function toRows(cells: readonly ZoomCell[]): ZoomRow[] {
  const rows: ZoomRow[] = [];
  for (let index = 0; index < cells.length; index += COLUMNS) {
    const slice = cells.slice(index, index + COLUMNS);
    const first = slice[0];
    if (!first) continue;
    rows.push({ key: `row-${first.key}`, cells: slice });
  }
  return rows;
}

/**
 * The `.dpng-zoom` grid for the current level. Renders nothing at the `day`
 * level, where the month grids are the content.
 */
export const CalendarZoom = forwardRef<HTMLDivElement, CalendarZoomProps>(function CalendarZoom(
  { label, className, onKeyDown, ...rest },
  ref: ForwardedRef<HTMLDivElement>,
) {
  const { snapshot, engine } = useDatePickerContext();
  const zoom = snapshot.zoom;
  const gridRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef(false);

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      gridRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  const handleSelect = useCallback(
    (cell: ZoomCell) => {
      if (cell.disabled) return;
      engine.zoomIn(cell.date);
    },
    [engine],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const grid = gridRef.current;
      restoreFocusRef.current =
        grid !== null && typeof document !== 'undefined' && grid.contains(document.activeElement);
      onKeyDown?.(event);
    },
    [onKeyDown],
  );

  // Arrow keys move the engine's roving tabindex — which at this level is
  // `viewMonth` — while the browser leaves focus on the cell that had it, and a
  // key that pages to the next screen unmounts that cell outright. Either way
  // focus has to be re-homed, or Enter would zoom into a stale cell.
  useEffect(() => {
    if (!restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    const grid = gridRef.current;
    if (!grid || typeof document === 'undefined') return;
    const active = document.activeElement;
    // Focus left the grid deliberately (Tab, a click elsewhere): leave it be.
    // A detached cell drops focus to `body`, which is the case worth chasing.
    if (active !== null && active !== document.body && !grid.contains(active)) return;
    const tabStop = grid.querySelector<HTMLElement>('.dpng-zoom__cell[tabindex="0"]');
    if (tabStop && tabStop !== active) tabStop.focus({ preventScroll: true });
  });

  if (zoom.cells.length === 0) return null;

  return (
    <div
      {...rest}
      ref={setRefs}
      className={className ? `dpng-zoom ${className}` : 'dpng-zoom'}
      role="grid"
      aria-label={label ?? zoom.label}
      onKeyDown={handleKeyDown}
    >
      {toRows(zoom.cells).map((row) => (
        <div key={row.key} className="dpng-zoom__row" role="row">
          {row.cells.map((cell) => (
            <ZoomCellButton key={cell.key} cell={cell} onSelect={handleSelect} />
          ))}
        </div>
      ))}
    </div>
  );
});
