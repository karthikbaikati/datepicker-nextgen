/**
 * Motion and viewport plumbing for the Voyanta page.
 *
 * Two rules hold everywhere in this file:
 *
 * 1. Nothing here is required for the page to be usable. Every reveal starts
 *    in its finished state in CSS; the hidden-then-risen variant only exists
 *    inside `@media (prefers-reduced-motion: no-preference)`, so a visitor who
 *    asked for less motion sees a plain, complete page even if this module
 *    never runs.
 * 2. Nothing measures layout during render. Scroll work is coalesced into one
 *    `requestAnimationFrame` and writes a single custom property.
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

/* -------------------------------------------------------------------------- */
/*                                   Queries                                  */
/* -------------------------------------------------------------------------- */

/**
 * Live `matchMedia` result, SSR-safe and cleaned up on unmount.
 *
 * The first value is read during the initial render rather than in the effect:
 * these queries pick the layout (one month or two, popover or sheet), and a
 * first paint at the wrong breakpoint is a visible jolt on a phone.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let list: MediaQueryList;
    try {
      list = window.matchMedia(query);
    } catch {
      return;
    }
    const sync = (): void => setMatches(list.matches);
    sync();
    list.addEventListener('change', sync);
    return () => list.removeEventListener('change', sync);
  }, [query]);

  return matches;
}

/** True only when the visitor has *not* asked for reduced motion. */
export function useMotionAllowed(): boolean {
  return useMediaQuery('(prefers-reduced-motion: no-preference)');
}

/* -------------------------------------------------------------------------- */
/*                                  Reveals                                   */
/* -------------------------------------------------------------------------- */

export interface RevealProps {
  className?: string;
  /** Stagger, in milliseconds. Read by CSS as `--vy-delay`. */
  delay?: number;
  id?: string;
  children: ReactNode;
}

/**
 * Fades and lifts its children the first time they enter the viewport.
 *
 * The observer disconnects after the first intersection: a reveal that
 * re-triggers on every scroll past is the kind of motion that makes a long
 * page tiring to read.
 */
export function Reveal({ className, delay = 0, id, children }: RevealProps): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || revealed) return;

    // No observer (very old browser, or a test environment) means no reveal —
    // show the content rather than hiding it forever.
    if (typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }

    // Already on screen when the page loaded: show it now. Content that is
    // visible before the visitor has done anything should not animate in, and
    // this also means the first screenful never depends on the observer at all.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setRevealed(true);
      return;
    }

    // An observer that never reports would leave the whole page at opacity 0.
    // It happens: a hidden or throttled tab, a print render, a screenshot
    // harness. The first callback — intersecting or not — proves the observer
    // is delivering; if none arrives, the content simply appears.
    let delivering = false;

    const observer = new IntersectionObserver(
      (entries) => {
        delivering = true;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
            return;
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.04 },
    );

    observer.observe(node);
    const failsafe = window.setTimeout(() => {
      if (!delivering) setRevealed(true);
    }, 1200);

    return () => {
      window.clearTimeout(failsafe);
      observer.disconnect();
    };
  }, [revealed]);

  const style = delay > 0 ? ({ '--vy-delay': `${delay}ms` } as CSSProperties) : undefined;

  return (
    <div
      ref={ref}
      id={id}
      className={className ? `vy-reveal ${className}` : 'vy-reveal'}
      data-revealed={revealed ? 'true' : 'false'}
      style={style}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Parallax                                  */
/* -------------------------------------------------------------------------- */

/**
 * Publishes how far the page has scrolled past the hero as `--vy-scroll`, a
 * unitless 0-1 progress that the stylesheet multiplies into a translation.
 *
 * The listener is only attached when motion is allowed, so a reduced-motion
 * visitor pays nothing at all — not even the scroll handler.
 */
export function useHeroParallax(enabled: boolean): (node: HTMLElement | null) => void {
  const nodeRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      nodeRef.current?.style.removeProperty('--vy-scroll');
      return;
    }

    const write = (): void => {
      frameRef.current = 0;
      const node = nodeRef.current;
      if (!node) return;
      const height = node.offsetHeight || 1;
      const progress = Math.min(1, Math.max(0, window.scrollY / height));
      node.style.setProperty('--vy-scroll', progress.toFixed(4));
    };

    const schedule = (): void => {
      if (frameRef.current !== 0) return;
      frameRef.current = window.requestAnimationFrame(write);
    };

    write();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frameRef.current !== 0) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [enabled]);

  return (node: HTMLElement | null) => {
    nodeRef.current = node;
  };
}

/* -------------------------------------------------------------------------- */
/*                              Scroll-spy for nav                            */
/* -------------------------------------------------------------------------- */

/**
 * The id of the section currently crossing the top third of the viewport, for
 * the sticky nav's current-page marker.
 */
export function useCurrentSection(ids: readonly string[]): string | null {
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const seen = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          seen.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        let best: string | null = null;
        let bestRatio = 0;
        for (const id of ids) {
          const ratio = seen.get(id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = id;
          }
        }
        setCurrent(best);
      },
      { rootMargin: '-15% 0px -55% 0px', threshold: [0, 0.15, 0.4, 0.75] },
    );

    for (const id of ids) {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [ids]);

  return current;
}
