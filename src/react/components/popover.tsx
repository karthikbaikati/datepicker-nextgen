/**
 * The floating surface: popover, modal dialog or mobile bottom sheet.
 *
 * Dependency-free by design. Positioning is a single measure-flip-clamp pass
 * against the viewport, re-run on scroll, resize and whenever the panel or the
 * anchor changes size — which covers every case a full positioning engine
 * would, at a fraction of the bytes and with no `Date`, `ResizeObserver` or
 * `IntersectionObserver` requirement (the observer is used when present and
 * simply skipped when it is not).
 *
 * Accessibility, in full: `role="dialog"`, `aria-modal` for the modal-like
 * variants, an initial focus move into the panel, a Tab/Shift+Tab focus trap,
 * Escape to dismiss, outside-pointer dismissal, and focus restored to whatever
 * was focused before it opened.
 *
 * SSR-safe: nothing is rendered until the component has mounted in a browser,
 * so `document` is never touched during the server pass or during hydration.
 */

import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  CSSProperties,
  ForwardedRef,
  HTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';

import { useDatePickerContext } from '../context';
import type { DatePickerProps as DomProps } from '../use-date-picker';

/** Where the panel prefers to sit relative to its anchor. */
export type PopoverPlacement =
  'bottom-start' | 'bottom' | 'bottom-end' | 'top-start' | 'top' | 'top-end';

/** Props for {@link Popover}. */
export interface PopoverProps {
  /** Mounts the surface. Nothing is rendered while `false`. */
  open: boolean;
  /** Called for Escape, an outside pointer, and a backdrop click. */
  onClose?: () => void;
  /** The element the popover is measured against. Ignored by modal/sheet. */
  anchor?: HTMLElement | null;
  /** `'popover'` floats beside the anchor; `'modal'` centres; `'sheet'` rises from the bottom. */
  variant?: 'popover' | 'modal' | 'sheet';
  /** Preferred placement; flipped automatically when it does not fit. */
  placement?: PopoverPlacement;
  /** Gap in pixels between anchor and panel. Defaults to `8`. */
  offset?: number;
  /** Portal destination. Defaults to `document.body`. */
  portalContainer?: Element | DocumentFragment | null;
  /** Presentational props for the root — `data-size`, `data-theme`, `data-variant`, … */
  rootProps?: DomProps;
  /** Merged with `dpng` / `dpng-popover`. */
  className?: string;
  /** Merged over the computed placement. */
  style?: CSSProperties;
  /** Move focus into the panel when it opens. Defaults to `true`. */
  autoFocus?: boolean;
  /** Return focus to the previously focused element on close. Defaults to `true`. */
  restoreFocus?: boolean;
  /** Accessible name for the dialog. Defaults to `labels.title`. */
  'aria-label'?: string;
  children?: ReactNode;
}

/** Keeps the panel this far from every viewport edge. */
const VIEWPORT_MARGIN = 8;

const FOCUSABLE_SELECTOR =
  'a[href],area[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

/**
 * `useLayoutEffect` warns when it runs during a server render. The component
 * already renders `null` before mount, so the effect never actually fires on
 * the server — but React cannot know that, and swapping the hook keeps the
 * console clean.
 */
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

interface Position {
  top: number;
  left: number;
}

function isVisible(element: HTMLElement): boolean {
  return element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0;
}

function focusableWithin(panel: HTMLElement): HTMLElement[] {
  const found = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const out: HTMLElement[] = [];
  found.forEach((element) => {
    if (isVisible(element)) out.push(element);
  });
  return out;
}

/**
 * Measure, flip if the preferred side does not fit, then clamp inside the
 * viewport. Coordinates are returned in the portal container's own coordinate
 * space, because `.dpng-popover` is `position: absolute`.
 */
function computePosition(
  anchor: HTMLElement,
  panel: HTMLElement,
  container: Element | DocumentFragment,
  placement: PopoverPlacement,
  offset: number,
  rtl: boolean,
): Position {
  const a = anchor.getBoundingClientRect();
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;

  const wantsTop = placement.startsWith('top');
  const fitsBelow = a.bottom + offset + height <= viewportHeight - VIEWPORT_MARGIN;
  const fitsAbove = a.top - offset - height >= VIEWPORT_MARGIN;
  const onTop = wantsTop ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove;

  let top = onTop ? a.top - offset - height : a.bottom + offset;

  // `start`/`end` are writing-mode relative, so they swap in RTL.
  const align = placement.endsWith('-start')
    ? 'start'
    : placement.endsWith('-end')
      ? 'end'
      : 'center';
  const leadingEdge = rtl ? a.right - width : a.left;
  const trailingEdge = rtl ? a.left : a.right - width;

  let left =
    align === 'start'
      ? leadingEdge
      : align === 'end'
        ? trailingEdge
        : a.left + (a.width - width) / 2;

  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
  left = Math.min(Math.max(left, VIEWPORT_MARGIN), maxLeft);
  const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN);
  top = Math.min(Math.max(top, VIEWPORT_MARGIN), maxTop);

  // Viewport → container space. A portal target that establishes its own
  // containing block needs its box (and its scroll offset) subtracted; the
  // document body does not, so the page scroll is added instead.
  if (
    container instanceof Element &&
    container !== document.body &&
    container !== document.documentElement
  ) {
    const box = container.getBoundingClientRect();
    return {
      top: top - box.top + container.scrollTop,
      left: left - box.left + container.scrollLeft,
    };
  }
  return { top: top + window.scrollY, left: left + window.scrollX };
}

/**
 * A portalled floating surface for the picker.
 *
 * ```tsx
 * <Popover open={open} onClose={close} anchor={button} variant="popover">
 *   <div className="dpng-card">…</div>
 * </Popover>
 * ```
 */
export const Popover = forwardRef<HTMLDivElement, PopoverProps>(function Popover(
  props: PopoverProps,
  ref: ForwardedRef<HTMLDivElement>,
): ReactNode {
  const {
    open,
    onClose,
    anchor,
    variant = 'popover',
    placement = 'bottom-start',
    offset = 8,
    portalContainer,
    rootProps,
    className,
    style,
    autoFocus = true,
    restoreFocus = true,
    children,
  } = props;

  const { snapshot, getRootProps } = useDatePickerContext();
  // The panel lives in state rather than a ref: the surface only exists from
  // the second render onwards (nothing is rendered before mount, for SSR), so
  // an effect keyed on a ref would run once against `null` and never again.
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  const isFloating = variant === 'popover';
  const isModalLike = variant === 'modal' || variant === 'sheet';

  // The panel node feeds both internal state and the consumer's ref, so the two
  // are assigned from one callback rather than fighting over the `ref` slot.
  const attachPanel = useCallback(
    (node: HTMLDivElement | null) => {
      setPanel(node);
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const container: Element | DocumentFragment | null = mounted
    ? (portalContainer ?? document.body)
    : null;

  const reposition = useCallback(() => {
    if (!isFloating || !panel || !anchor || !container) return;
    setPosition(
      computePosition(anchor, panel, container, placement, offset, snapshot.direction === 'rtl'),
    );
  }, [anchor, container, isFloating, offset, panel, placement, snapshot.direction]);

  useIsomorphicLayoutEffect(() => {
    if (!open || !isFloating) {
      setPosition(null);
      return;
    }
    reposition();
  }, [open, isFloating, reposition]);

  // Anything that can move the anchor: page scroll (captured, so scrolling
  // containers count too), viewport resize, and either box changing size.
  useEffect(() => {
    if (!open || !isFloating) return;

    const handle = (): void => reposition();
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(handle);
      if (panel) observer.observe(panel);
      if (anchor) observer.observe(anchor);
    }

    return () => {
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
      observer?.disconnect();
    };
  }, [anchor, isFloating, open, panel, reposition]);

  // Initial focus + restore. Both ends live in one effect so the element to
  // restore to is captured before focus moves anywhere.
  useEffect(() => {
    if (!open || !panel) return;

    const previous = document.activeElement;
    // Do not overwrite a restore target captured on an earlier pass — the panel
    // may already own focus by the time this effect re-runs.
    if (!restoreRef.current && previous instanceof HTMLElement && !panel.contains(previous)) {
      restoreRef.current = previous;
    }

    if (autoFocus) {
      // The roving-tabindex day is the natural landing spot: the user opened a
      // calendar, so the arrow keys should work immediately.
      const day = panel.querySelector<HTMLElement>('.dpng-day[tabindex="0"]');
      (day ?? focusableWithin(panel)[0] ?? panel).focus({ preventScroll: true });
    }

    return () => {
      const target = restoreRef.current;
      restoreRef.current = null;
      if (restoreFocus && target && target.isConnected) target.focus({ preventScroll: true });
    };
  }, [autoFocus, open, panel, restoreFocus]);

  // Outside pointer. `pointerdown` rather than `click` so a drag that starts
  // outside and ends inside still dismisses, matching native menu behaviour.
  useEffect(() => {
    if (!open || !onClose) return;

    const handle = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onClose();
    };

    document.addEventListener('pointerdown', handle, true);
    return () => document.removeEventListener('pointerdown', handle, true);
  }, [anchor, onClose, open, panel]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;

      const items = focusableWithin(panel);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        // Nothing focusable inside: keep focus on the panel rather than
        // letting Tab escape a modal surface.
        if (isModalLike) event.preventDefault();
        return;
      }

      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [isModalLike, onClose, panel],
  );

  if (!open || !mounted || !container) return null;

  /**
   * A measured panel is hidden for the single frame between mount and measure
   * so it never flashes at the wrong coordinates. With no anchor there is
   * nothing to measure against — placement then belongs to the stylesheet and
   * to the consumer's own `style`, and hiding the panel would hide it forever.
   */
  const placementStyle: CSSProperties =
    !isFloating || !anchor
      ? {}
      : position
        ? { top: `${position.top}px`, left: `${position.left}px` }
        : { top: 0, left: 0, visibility: 'hidden' };

  const variantClass = isFloating ? 'dpng-popover' : undefined;
  const merged = getRootProps({
    ...rootProps,
    className: className ? `${variantClass ?? ''} ${className}`.trim() : variantClass,
    style: { ...placementStyle, ...style },
    'data-variant': variant,
    role: 'dialog',
    'aria-modal': isModalLike ? true : undefined,
    'aria-label': props['aria-label'] ?? snapshot.labels.title ?? snapshot.labels.selectDate,
    tabIndex: -1,
    onKeyDown: handleKeyDown,
  }) as HTMLAttributes<HTMLDivElement>;

  const surface = variant === 'sheet' ? <div className="dpng-sheet">{children}</div> : children;

  return createPortal(
    <>
      {isModalLike ? (
        // The backdrop carries `dpng` itself so it can read `--dpng-backdrop`
        // while living outside the dialog's subtree.
        <div
          className="dpng dpng-backdrop"
          data-theme={rootProps?.['data-theme'] as string | undefined}
          aria-hidden="true"
          onClick={onClose}
        />
      ) : null}
      <div {...merged} ref={attachPanel}>
        {surface}
      </div>
    </>,
    container,
  );
});

Popover.displayName = 'Popover';
