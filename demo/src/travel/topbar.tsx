/**
 * The sticky Voyanta bar.
 *
 * Translucent over the hero, then it earns a hairline border once the page has
 * moved. The section links use `aria-current` driven by an IntersectionObserver
 * rather than by `:target`, so the marker follows a wheel scroll too.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { useCurrentSection } from './motion';
import { VoyantaMark } from './scenery';
import type { Appearance } from './scope';

export interface NavLink {
  readonly id: string;
  readonly label: string;
}

const LINKS: readonly NavLink[] = [
  { id: 'stay', label: 'Stay' },
  { id: 'fly', label: 'Fly' },
  { id: 'do', label: 'Do' },
  { id: 'together', label: 'Together' },
  { id: 'season', label: 'When to go' },
  { id: 'themes', label: 'Themes' },
];

const SECTION_IDS: readonly string[] = [...LINKS.map((link) => link.id), 'built'];

export interface TopbarProps {
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
  repoUrl: string;
}

export function Topbar({ appearance, onAppearanceChange, repoUrl }: TopbarProps): ReactNode {
  const [lifted, setLifted] = useState(false);
  const current = useCurrentSection(SECTION_IDS);

  useEffect(() => {
    const sync = (): void => setLifted(window.scrollY > 24);
    sync();
    window.addEventListener('scroll', sync, { passive: true });
    return () => window.removeEventListener('scroll', sync);
  }, []);

  return (
    <header className="vy-topbar" data-lifted={lifted ? 'true' : 'false'}>
      <div className="vy-topbar__inner">
        <a className="vy-brand" href="#top">
          <span className="vy-brand__mark" aria-hidden="true">
            <VoyantaMark />
          </span>
          <span className="vy-brand__text">
            <span className="vy-brand__name">Voyanta</span>
            <span className="vy-brand__sub">a fictional trip planner</span>
          </span>
        </a>

        <nav className="vy-topbar__nav" aria-label="Sections">
          {LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              aria-current={current === link.id ? 'true' : undefined}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="vy-topbar__tools">
          <a
            className="vy-topbar__built"
            href="#built"
            aria-current={current === 'built' ? 'true' : undefined}
          >
            Built with <strong>datepicker&#8209;nextgen</strong>
          </a>
          <a className="vy-topbar__repo" href={repoUrl} aria-label="The library on GitHub">
            <svg viewBox="0 0 16 16" width="17" height="17" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.34c-2.23.49-2.7-1.07-2.7-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.83-2.15-.09-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.52.56.83 1.28.83 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.19c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"
              />
            </svg>
          </a>
          <button
            type="button"
            className="vy-topbar__toggle"
            onClick={() => onAppearanceChange(appearance === 'dark' ? 'light' : 'dark')}
            aria-pressed={appearance === 'dark'}
            aria-label={appearance === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={appearance === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            <span aria-hidden="true">{appearance === 'dark' ? '☾' : '☀'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
