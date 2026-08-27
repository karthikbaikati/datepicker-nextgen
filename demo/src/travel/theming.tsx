/**
 * Make it yours — the theme gallery.
 *
 * Seven live pickers, one per bundled theme, and a radio that applies the
 * chosen one to every picker on the page. Each card is the same component with
 * a different `theme` prop; the themes themselves are token blocks and nothing
 * else, which is why the switch is instant and total.
 */

import { useId } from 'react';
import type { ReactNode } from 'react';

import { DatePicker, addDays, addMonths, startOfMonth, today } from 'datepicker-nextgen';
import type { DateRange, Labels } from 'datepicker-nextgen';

import { Reveal } from './motion';
import { TravelSection } from './section';
import type { Appearance } from './scope';

export interface ThemeOption {
  readonly id: string;
  readonly label: string;
  readonly note: string;
}

/** The bundled themes, in the order their stylesheets are imported. */
export const THEME_OPTIONS: readonly ThemeOption[] = [
  { id: 'default', label: 'Coast', note: 'The built-in tokens, following the page' },
  { id: 'midnight', label: 'Midnight', note: 'Deep indigo, always dark' },
  { id: 'emerald', label: 'Emerald', note: 'Emerald on warm stone' },
  { id: 'rose', label: 'Rose', note: 'A softer, warmer accent' },
  { id: 'mono', label: 'Mono', note: 'No hue at all' },
  { id: 'glass', label: 'Glass', note: 'Frosted, for photographic backdrops' },
  { id: 'high-contrast', label: 'High contrast', note: 'Heavier borders, maximum legibility' },
];

const SAMPLE_LABELS: Partial<Labels> = {
  title: 'Trip dates',
  startLabel: 'Depart',
  endLabel: 'Return',
};

const NEXT_MONTH = startOfMonth(addMonths(today(), 1));

const SAMPLE_RANGE: DateRange = {
  start: addDays(NEXT_MONTH, 9),
  end: addDays(NEXT_MONTH, 14),
};

const TOKEN_SNIPPET = `/* The whole picker, retuned from outside. */
.voyanta-dates {
  --dpng-accent: #b14828;
  --dpng-accent-soft: #faeae1;
  --dpng-range-bg: #f6e7dc;
  --dpng-radius-card: 18px;
  --dpng-cell-size: 40px;
}`;

export interface ThemeSectionProps {
  theme: string;
  onThemeChange: (theme: string) => void;
  appearance: Appearance;
  onAppearanceChange: (appearance: Appearance) => void;
}

export function ThemeSection({
  theme,
  onThemeChange,
  appearance,
  onAppearanceChange,
}: ThemeSectionProps): ReactNode {
  const groupName = useId();

  return (
    <TravelSection
      id="themes"
      kicker="Make it yours"
      title={
        <>
          Seven themes. <em>Zero</em> overrides.
        </>
      }
      lede={
        <>
          Every card below is the same component with a different <code>theme</code> prop. Choose
          one and it takes over every picker on this page — the hero, the booking calendar, the
          poll, all of it.
        </>
      }
      tone="dusk"
    >
      <Reveal className="vy-themebar">
        <div className="vy-segmented" role="group" aria-label="Light or dark">
          <button
            type="button"
            aria-pressed={appearance === 'light'}
            onClick={() => onAppearanceChange('light')}
          >
            Light
          </button>
          <button
            type="button"
            aria-pressed={appearance === 'dark'}
            onClick={() => onAppearanceChange('dark')}
          >
            Dark
          </button>
        </div>
        <p className="vy-themebar__note">
          Dark is a token block too — the library ships one for the OS preference and one for an
          explicit <code>data-theme=&quot;dark&quot;</code>.
        </p>
      </Reveal>

      <Reveal delay={80}>
        <fieldset className="vy-themegrid">
          <legend className="vy-sr">Pick a theme for the whole page</legend>
          {THEME_OPTIONS.map((option) => {
            const inputId = `${groupName}-${option.id}`;
            const active = option.id === theme;
            return (
              <div
                className="vy-themecard"
                key={option.id}
                data-active={active ? 'true' : undefined}
              >
                <div className="vy-themecard__head">
                  <input
                    type="radio"
                    id={inputId}
                    name={groupName}
                    value={option.id}
                    checked={active}
                    onChange={() => onThemeChange(option.id)}
                  />
                  <label htmlFor={inputId}>{option.label}</label>
                  <p>{option.note}</p>
                </div>
                <div className="vy-themecard__stage">
                  <DatePicker
                    mode="range"
                    theme={option.id === 'default' ? appearance : option.id}
                    className="vy-scope"
                    size="sm"
                    numberOfMonths={1}
                    disablePast
                    defaultMonth={NEXT_MONTH}
                    defaultValue={SAMPLE_RANGE}
                    presets={[]}
                    labels={SAMPLE_LABELS}
                  />
                </div>
              </div>
            );
          })}
        </fieldset>
      </Reveal>

      <Reveal className="vy-tokens" delay={140}>
        <div className="vy-tokens__copy">
          <h3>Or skip the themes entirely.</h3>
          <p>
            Every colour, radius, cell size and easing in the picker resolves through a{' '}
            <code>--dpng-*</code> custom property. Set them on any ancestor of a picker — or on the
            picker itself — and nothing else has to change. This page does exactly that: the tide on
            the hero, the shallow teal on the lagoon calendar and the deep sea on the fares are
            token blocks, not overrides.
          </p>
          <p className="vy-tokens__rule">
            There is not one <code>.dpng-day</code> selector in this demo&rsquo;s stylesheet. If
            there were, it would be hiding bugs in the library&rsquo;s own CSS.
          </p>
        </div>
        <pre className="vy-code" tabIndex={0}>
          <code>{TOKEN_SNIPPET}</code>
        </pre>
      </Reveal>
    </TravelSection>
  );
}
