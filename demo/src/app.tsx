/**
 * The datepicker-nextgen showcase.
 *
 * The page has two halves and they answer two different questions.
 *
 * The first half is **Voyanta**, a trip planner that does not exist. Every
 * date-shaped moment in it — the hero search bar, the booking calendar, the
 * fare strip, the experience slots, the group poll, the season chooser — is a
 * real, live picker from this library. That half answers "would I want this in
 * my product?".
 *
 * The second half is **Built with datepicker-nextgen**: the playground, the
 * example gallery, the keyboard table and the install line. That half answers
 * "can I actually ship it?".
 *
 * Nothing on this page restyles the picker's internals. Section accents are
 * `--dpng-*` token blocks applied through the component's own `className`
 * prop; see `travel/scope.tsx`.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { DatePicker, defaultPresetsFor, keyboardShortcuts } from 'datepicker-nextgen';
import type { DatePreset, DateRange, FirstDayOfWeek, SelectionMode } from 'datepicker-nextgen';

import { CodeBlock, CopyButton } from './code-block';
import { TripDatesCard, galleryExamples } from './examples';
import {
  DoSection,
  FlySection,
  Hero,
  INITIAL_TRIP,
  SeasonSection,
  StaySection,
  THEME_OPTIONS,
  ThemeSection,
  TogetherSection,
  Topbar,
  TravelThemeProvider,
} from './travel';
import type { Appearance } from './travel';
import './travel.css';

/* -------------------------------------------------------------------------- */
/*                                   Config                                   */
/* -------------------------------------------------------------------------- */

const REPO_URL = 'https://github.com/karthikbaikati/datepicker-nextgen';
const NPM_URL = 'https://www.npmjs.com/package/datepicker-nextgen';
const DOCS_URL = `${REPO_URL}/tree/main/docs`;
const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

const INSTALL_COMMAND = 'npm install datepicker-nextgen';

const MODES: readonly { id: SelectionMode; label: string }[] = [
  { id: 'single', label: 'single' },
  { id: 'range', label: 'range' },
  { id: 'multiple', label: 'multiple' },
  { id: 'week', label: 'week' },
  { id: 'month', label: 'month' },
  { id: 'quarter', label: 'quarter' },
  { id: 'year', label: 'year' },
];

/**
 * English only, by request. The two variants still earn their place: en-US writes
 * MM/DD and starts the week on Sunday, en-GB writes DD/MM and starts on Monday,
 * so the locale plumbing stays visible. The library itself supports every locale
 * the runtime does, including RTL — see docs/recipes.md.
 */
const LOCALES: readonly { id: string; label: string }[] = [
  { id: 'en-US', label: 'English (US)' },
  { id: 'en-GB', label: 'English (UK)' },
];

const FIRST_DAYS: readonly { id: string; label: string }[] = [
  { id: 'locale', label: 'From locale' },
  { id: '0', label: 'Sunday' },
  { id: '1', label: 'Monday' },
  { id: '6', label: 'Saturday' },
];

const VARIANTS = ['inline', 'popover', 'modal', 'sheet'] as const;
const SIZES = ['sm', 'md', 'lg'] as const;
const ORIENTATIONS = ['horizontal', 'vertical'] as const;

/** Modes whose value is a span, and so respond to the nights controls. */
const RANGE_MODES: ReadonlySet<SelectionMode> = new Set([
  'range',
  'week',
  'month',
  'quarter',
  'year',
]);

const FEATURES: readonly { title: string; body: string }[] = [
  {
    title: 'Timezone-safe by construction',
    body: 'Every calculation runs on a plain year/month/day value. No Date, no offsets, no DST off-by-one — the class of bug that plagues every other picker simply cannot occur.',
  },
  {
    title: 'Headless underneath',
    body: 'The engine is a framework-free store. React gets a hook with eleven prop getters; vanilla JS and a web component render the identical DOM from the same core.',
  },
  {
    title: 'Accessible by default',
    body: 'The WAI-ARIA grid pattern, a roving tab index, live-region announcements on every change, and a rejection reason attached to every unselectable day.',
  },
  {
    title: 'Seven selection modes',
    body: 'single, range, multiple, week, month, quarter and year — one component, one keyboard model, one stylesheet.',
  },
  {
    title: 'Constraints that hold',
    body: 'Min and max nights, blocklists, allowlists, blocked spans a range may not cross, rolling multi-select caps, and an escape hatch that runs last.',
  },
  {
    title: 'Zero dependencies',
    body: 'Nothing in node_modules but the library. React is an optional peer, and the whole stylesheet is custom properties you can override one token at a time.',
  },
];

const STATS: readonly { value: string; label: string }[] = [
  { value: '0', label: 'runtime dependencies' },
  { value: '7', label: 'selection modes' },
  { value: '620', label: 'passing tests' },
  { value: 'MIT', label: 'licensed' },
];

/* -------------------------------------------------------------------------- */
/*                              Playground state                              */
/* -------------------------------------------------------------------------- */

interface PlaygroundConfig {
  mode: SelectionMode;
  numberOfMonths: number;
  size: (typeof SIZES)[number];
  locale: string;
  firstDayOfWeek: string;
  showWeekNumbers: boolean;
  usePresets: boolean;
  minNights: number;
  maxNights: number;
  disableWeekends: boolean;
  orientation: (typeof ORIENTATIONS)[number];
  variant: (typeof VARIANTS)[number];
}

const INITIAL_CONFIG: PlaygroundConfig = {
  mode: 'range',
  numberOfMonths: 2,
  size: 'md',
  locale: 'en-US',
  firstDayOfWeek: 'locale',
  showWeekNumbers: false,
  usePresets: true,
  minNights: 0,
  maxNights: 0,
  disableWeekends: false,
  orientation: 'horizontal',
  variant: 'inline',
};

/** `firstDayOfWeek` is a union of numbers plus the literal `'locale'`. */
function toFirstDayOfWeek(raw: string): FirstDayOfWeek {
  if (raw === 'locale') return 'locale';
  const parsed = Number(raw);
  return (parsed >= 0 && parsed <= 6 ? parsed : 'locale') as FirstDayOfWeek;
}

/**
 * Render the configuration as the JSX that would produce it.
 *
 * Only non-default props are printed: a snippet full of redundant defaults is
 * worse documentation than a short one, and copying it teaches the wrong API.
 */
function buildSnippet(config: PlaygroundConfig, theme: string): string {
  const props: string[] = [`mode="${config.mode}"`];

  if (config.variant !== 'inline') props.push(`variant="${config.variant}"`);
  if (config.size !== 'md') props.push(`size="${config.size}"`);
  if (theme !== 'default') props.push(`theme="${theme}"`);
  if (config.numberOfMonths !== 1) props.push(`numberOfMonths={${config.numberOfMonths}}`);
  if (config.orientation !== 'horizontal') props.push(`orientation="${config.orientation}"`);
  if (config.locale !== 'en-US') props.push(`locale="${config.locale}"`);
  if (config.firstDayOfWeek !== 'locale') props.push(`firstDayOfWeek={${config.firstDayOfWeek}}`);
  if (config.showWeekNumbers) props.push('showWeekNumbers');
  if (config.disableWeekends) props.push('disableWeekends');
  if (RANGE_MODES.has(config.mode) && config.minNights > 0)
    props.push(`minNights={${config.minNights}}`);
  if (RANGE_MODES.has(config.mode) && config.maxNights > 0)
    props.push(`maxNights={${config.maxNights}}`);
  props.push(config.usePresets ? `presets={defaultPresetsFor('${config.mode}')}` : 'presets={[]}');

  const attributes = props.map((prop) => `      ${prop}`).join('\n');

  const imports = config.usePresets
    ? `import { DatePicker, defaultPresetsFor } from 'datepicker-nextgen';`
    : `import { DatePicker } from 'datepicker-nextgen';`;

  return `${imports}
import 'datepicker-nextgen/styles.css';

export function BookingDates() {
  return (
    <DatePicker
${attributes}
      onChange={(value) => console.log(value.range)}
    />
  );
}`;
}

/* -------------------------------------------------------------------------- */
/*                               Control widgets                              */
/* -------------------------------------------------------------------------- */

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

function Field({ label, hint, children }: FieldProps): ReactNode {
  return (
    <div className="dx-field">
      <span className="dx-field__label">
        {label}
        {hint ? <em>{hint}</em> : null}
      </span>
      {children}
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: readonly { id: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

function SelectField({ label, value, options, onChange, disabled }: SelectFieldProps): ReactNode {
  return (
    <Field label={label}>
      <select
        className="dx-select"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

interface SegmentedProps {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}

function Segmented({ label, value, options, onChange }: SegmentedProps): ReactNode {
  return (
    <Field label={label}>
      <div className="dx-segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === value}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </Field>
  );
}

interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Switch({ label, checked, onChange }: SwitchProps): ReactNode {
  return (
    <label className="dx-switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="dx-switch__track" aria-hidden="true">
        <span className="dx-switch__thumb" />
      </span>
      <span className="dx-switch__label">{label}</span>
    </label>
  );
}

interface StepperProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}

function Stepper({
  label,
  hint,
  value,
  min,
  max,
  disabled,
  format,
  onChange,
}: StepperProps): ReactNode {
  const clamp = (next: number): number => Math.min(max, Math.max(min, next));
  return (
    <Field label={label} hint={hint}>
      <div className="dx-stepper" data-disabled={disabled ? 'true' : undefined}>
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          disabled={disabled || value <= min}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <output>{format ? format(value) : value}</output>
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          disabled={disabled || value >= max}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </Field>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Page                                    */
/* -------------------------------------------------------------------------- */

/** Read the visitor's OS preference once, for the initial paint only. */
function initialAppearance(): Appearance {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function App(): ReactNode {
  const [appearance, setAppearance] = useState<Appearance>(initialAppearance);
  const [theme, setTheme] = useState('default');
  const [config, setConfig] = useState<PlaygroundConfig>(INITIAL_CONFIG);

  /* The trip the whole travel half is planning. */
  const [destinationId, setDestinationId] = useState('kyoto');
  const [tripRange, setTripRange] = useState<DateRange>(INITIAL_TRIP);
  const [guests, setGuests] = useState(2);

  // `default` is not a stylesheet — it means "follow the page", so it resolves
  // to the built-in light or dark token set instead of a named theme file.
  const pickerTheme = theme === 'default' ? appearance : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset['appearance'] = appearance;
    root.dataset['theme'] = pickerTheme;
    root.style.colorScheme = appearance;
  }, [appearance, pickerTheme]);

  const update = <K extends keyof PlaygroundConfig>(key: K, value: PlaygroundConfig[K]): void =>
    setConfig((current) => ({ ...current, [key]: value }));

  // The engine compares option identities, so a fresh array every render would
  // resync it on every unrelated state change.
  const presets = useMemo<readonly DatePreset[]>(
    () => (config.usePresets ? defaultPresetsFor(config.mode) : []),
    [config.mode, config.usePresets],
  );

  const snippet = useMemo(() => buildSnippet(config, theme), [config, theme]);
  const rangeLike = RANGE_MODES.has(config.mode);

  return (
    <TravelThemeProvider theme={theme} appearance={appearance}>
      <a className="dx-skip" href="#main">
        Skip to content
      </a>

      <Topbar appearance={appearance} onAppearanceChange={setAppearance} repoUrl={REPO_URL} />

      <main id="main">
        {/* ======================= the travel experience ======================= */}

        <Hero
          destinationId={destinationId}
          onDestinationChange={setDestinationId}
          range={tripRange}
          onRangeChange={setTripRange}
          guests={guests}
          onGuestsChange={setGuests}
        />

        <StaySection />
        <FlySection destinationId={destinationId} />
        <DoSection guests={guests} />
        <TogetherSection />
        <SeasonSection destinationId={destinationId} />
        <ThemeSection
          theme={theme}
          onThemeChange={setTheme}
          appearance={appearance}
          onAppearanceChange={setAppearance}
        />

        {/* ====================== the developer material ======================= */}

        <section className="dx-section vy-built" id="built" aria-labelledby="built-heading">
          <div className="dx-container">
            <div className="vy-built__grid">
              <div className="vy-built__copy">
                <p className="dx-kicker">Built with datepicker-nextgen</p>
                <h2 id="built-heading">
                  Everything above is <em>this</em>.
                </h2>
                <p className="vy-built__lede">
                  Voyanta is invented. The picker is not. One package, no runtime dependencies, a
                  headless engine underneath, and the same component in every section you just
                  scrolled through.
                </p>

                <div className="dx-install">
                  <code>
                    <span className="dx-install__prompt" aria-hidden="true">
                      $
                    </span>
                    {INSTALL_COMMAND}
                  </code>
                  <CopyButton text={INSTALL_COMMAND} label="Copy the install command" />
                </div>

                <div className="dx-cta">
                  <a className="dx-button dx-button--primary" href="#playground">
                    Open the playground
                  </a>
                  <a className="dx-button" href={REPO_URL}>
                    View on GitHub
                  </a>
                </div>

                <dl className="dx-stats">
                  {STATS.map((stat) => (
                    <div key={stat.label}>
                      <dt>{stat.value}</dt>
                      <dd>{stat.label}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="vy-built__stage">
                <div className="dx-stage">
                  <TripDatesCard theme={pickerTheme} />
                </div>
                <p className="dx-note">
                  The card from the README, running: <code>minNights</code>, <code>maxNights</code>,{' '}
                  <code>blockedRanges</code>, <code>dayMeta</code> and a footer that totals the
                  stay.
                </p>
              </div>
            </div>

            <ul className="dx-features">
              {FEATURES.map((feature) => (
                <li key={feature.title}>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------- playground ---------------------------- */}
        <section className="dx-section" id="playground" aria-labelledby="playground-heading">
          <div className="dx-container">
            <header className="dx-sectionhead">
              <p className="dx-kicker">Playground</p>
              <h2 id="playground-heading">Every option, live</h2>
              <p>
                Change anything on the right. The picker re-configures in place — no remount, no
                lost selection — and the snippet below is exactly the JSX that produces what you
                see.
              </p>
            </header>

            <div className="dx-playground">
              <div className="dx-playground__stage">
                <div className="dx-stage">
                  <DatePicker
                    mode={config.mode}
                    theme={pickerTheme}
                    variant={config.variant}
                    size={config.size}
                    numberOfMonths={config.numberOfMonths}
                    orientation={config.orientation}
                    locale={config.locale}
                    firstDayOfWeek={toFirstDayOfWeek(config.firstDayOfWeek)}
                    showWeekNumbers={config.showWeekNumbers}
                    disableWeekends={config.disableWeekends}
                    minNights={rangeLike && config.minNights > 0 ? config.minNights : undefined}
                    maxNights={rangeLike && config.maxNights > 0 ? config.maxNights : undefined}
                    presets={presets}
                  />
                </div>
                {config.variant === 'inline' ? null : (
                  <p className="dx-note">
                    The <code>{config.variant}</code> variant renders a trigger here and portals the
                    panel out. Click it.
                  </p>
                )}
              </div>

              <aside className="dx-panel" aria-label="Picker options">
                <div className="dx-panel__group">
                  <SelectField
                    label="Mode"
                    value={config.mode}
                    options={MODES}
                    onChange={(value) => update('mode', value as SelectionMode)}
                  />
                  <Segmented
                    label="Variant"
                    value={config.variant}
                    options={VARIANTS}
                    onChange={(value) => update('variant', value as PlaygroundConfig['variant'])}
                  />
                  <Segmented
                    label="Size"
                    value={config.size}
                    options={SIZES}
                    onChange={(value) => update('size', value as PlaygroundConfig['size'])}
                  />
                  <Segmented
                    label="Orientation"
                    value={config.orientation}
                    options={ORIENTATIONS}
                    onChange={(value) =>
                      update('orientation', value as PlaygroundConfig['orientation'])
                    }
                  />
                  <Stepper
                    label="Months"
                    value={config.numberOfMonths}
                    min={1}
                    max={6}
                    onChange={(value) => update('numberOfMonths', value)}
                  />
                </div>

                <div className="dx-panel__group">
                  <SelectField
                    label="Theme"
                    value={theme}
                    options={THEME_OPTIONS}
                    onChange={setTheme}
                  />
                  <SelectField
                    label="Locale"
                    value={config.locale}
                    options={LOCALES}
                    onChange={(value) => update('locale', value)}
                  />
                  <SelectField
                    label="First day of week"
                    value={config.firstDayOfWeek}
                    options={FIRST_DAYS}
                    onChange={(value) => update('firstDayOfWeek', value)}
                  />
                </div>

                <div className="dx-panel__group">
                  <Stepper
                    label="Min nights"
                    hint={rangeLike ? undefined : 'range modes only'}
                    value={config.minNights}
                    min={0}
                    max={14}
                    disabled={!rangeLike}
                    format={(value) => (value === 0 ? 'off' : String(value))}
                    onChange={(value) => update('minNights', value)}
                  />
                  <Stepper
                    label="Max nights"
                    hint={rangeLike ? undefined : 'range modes only'}
                    value={config.maxNights}
                    min={0}
                    max={60}
                    disabled={!rangeLike}
                    format={(value) => (value === 0 ? 'off' : String(value))}
                    onChange={(value) => update('maxNights', value)}
                  />
                </div>

                <div className="dx-panel__group dx-panel__group--switches">
                  <Switch
                    label="Week numbers"
                    checked={config.showWeekNumbers}
                    onChange={(value) => update('showWeekNumbers', value)}
                  />
                  <Switch
                    label="Presets"
                    checked={config.usePresets}
                    onChange={(value) => update('usePresets', value)}
                  />
                  <Switch
                    label="Disable weekends"
                    checked={config.disableWeekends}
                    onChange={(value) => update('disableWeekends', value)}
                  />
                </div>

                <button
                  type="button"
                  className="dx-button dx-button--ghost dx-panel__reset"
                  onClick={() => setConfig(INITIAL_CONFIG)}
                >
                  Reset options
                </button>
              </aside>
            </div>

            <CodeBlock code={snippet} filename="BookingDates.tsx" className="dx-playground__code" />
          </div>
        </section>

        {/* ------------------------------ gallery ----------------------------- */}
        <section className="dx-section" id="gallery" aria-labelledby="gallery-heading">
          <div className="dx-container">
            <header className="dx-sectionhead">
              <p className="dx-kicker">Examples</p>
              <h2 id="gallery-heading">Ten pickers, one engine</h2>
              <p>
                Each card below is running. Open the drawer under any of them for the code that
                produces it — copy-pasteable, and correct against the shipped API.
              </p>
            </header>

            <div className="dx-gallery">
              {galleryExamples.map((example, index) => (
                <article className="dx-example" key={example.id} id={`example-${example.id}`}>
                  <header className="dx-example__head">
                    <p className="dx-example__index">{String(index + 1).padStart(2, '0')}</p>
                    <h3>{example.title}</h3>
                    <p>{example.caption}</p>
                  </header>
                  <div className="dx-stage dx-example__stage">{example.render(pickerTheme)}</div>
                  <details className="dx-drawer">
                    <summary>
                      <span>Show the code</span>
                    </summary>
                    <CodeBlock code={example.code} filename={`${example.id}.tsx`} />
                  </details>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------- keyboard ----------------------------- */}
        <section className="dx-section" id="keyboard" aria-labelledby="keyboard-heading">
          <div className="dx-container dx-container--narrow">
            <header className="dx-sectionhead">
              <p className="dx-kicker">Accessibility</p>
              <h2 id="keyboard-heading">The keyboard model</h2>
              <p>
                Exported as <code>keyboardShortcuts</code>, so your own help sheet stays in sync
                with the implementation. This table is rendered from that array.
              </p>
            </header>

            <div className="dx-tablewrap">
              <table className="dx-keys">
                <caption className="dx-sr">Keyboard shortcuts</caption>
                <thead>
                  <tr>
                    <th scope="col">Keys</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {keyboardShortcuts.map((shortcut) => (
                    <tr key={shortcut.keys}>
                      <th scope="row">
                        {keyParts(shortcut.keys).map((key, index) => (
                          <kbd key={`${shortcut.keys}-${index}`}>{key}</kbd>
                        ))}
                      </th>
                      <td>{shortcut.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="dx-note dx-note--centered">
              Arrow keys mirror automatically in right-to-left locales, and every change is
              announced through a polite live region.
            </p>
          </div>
        </section>
      </main>

      <footer className="dx-footer">
        <div className="dx-container dx-footer__inner">
          <div className="dx-footer__brand">
            <span className="dx-brand__mark" aria-hidden="true">
              <CalendarMark />
            </span>
            <div>
              <strong>datepicker-nextgen</strong>
              <p>
                Timezone-safe date selection for React and vanilla JS. Voyanta is a fictional brand
                invented for this page — the listings, prices and people on it are not real.
              </p>
            </div>
          </div>
          <nav className="dx-footer__links" aria-label="Project links">
            <a href={REPO_URL}>GitHub</a>
            <a href={NPM_URL}>npm</a>
            <a href={DOCS_URL}>Docs</a>
            <a href={LICENSE_URL}>MIT License</a>
          </nav>
        </div>
      </footer>
    </TravelThemeProvider>
  );
}

/**
 * Split a shortcut label into individual `<kbd>` chips.
 *
 * Alternatives are separated by a slash. A part is split further only when it
 * is a run of single-character keys ("← →"), which keeps multi-word keys like
 * "Page Up" and modifier chords like "Ctrl + Home" intact.
 */
function keyParts(keys: string): string[] {
  return keys
    .split(/\s*\/\s*/)
    .flatMap((part) => (/^\S(?: \S)+$/.test(part) ? part.split(' ') : [part]));
}

/** The library's glyph — a calendar page with the accent bar at the top. */
function CalendarMark(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="5" width="18" height="16" rx="4" fill="currentColor" opacity="0.16" />
      <rect x="3" y="5" width="18" height="16" rx="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="15.5" r="1.8" fill="currentColor" />
    </svg>
  );
}
