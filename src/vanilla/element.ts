/**
 * `<nextgen-date-picker>` — the picker as a custom element, for pages that have
 * no build step at all (Rails, Django, Laravel, a CDN `<script type="module">`).
 *
 * Attributes cover the flat, serializable options; properties cover the rich
 * ones (functions, arrays of ranges, formatters). The element renders into its
 * own light DOM on purpose: the stylesheet the rest of the library ships is a
 * plain global sheet, and a shadow root would lock it out.
 */

import { normalizePresets } from '../core/presets';
import { toPlainDate } from '../core/plain-date';
import type {
  DateRangeInput,
  DatePreset,
  EngineOptions,
  SelectionMode,
  SelectionValue,
  ValueInput,
} from '../core/types';
import {
  attachDatePicker,
  createDatePicker,
  type DatePickerInstance,
  type VanillaOptions,
} from './mount';

/* -------------------------------------------------------------------------- */
/*                             Attribute decoding                             */
/* -------------------------------------------------------------------------- */

/** Every attribute the element reflects into options, in `observedAttributes` order. */
const OBSERVED = [
  'mode',
  'value',
  'min',
  'max',
  'locale',
  'months',
  'theme',
  'size',
  'variant',
  'orientation',
  'title',
  'presets',
  'first-day-of-week',
  'week-numbers',
  'fixed-weeks',
  'outside-days',
  'select-outside-days',
  'restrict-navigation',
  'disabled-dates',
  'enabled-dates',
  'disabled-days-of-week',
  'blocked-ranges',
  'disable-past',
  'disable-future',
  'disable-weekends',
  'min-nights',
  'max-nights',
  'min-selections',
  'max-selections',
  'rolling-selection',
  'range-semantics',
  'allow-reverse-range',
  'toggle-on-reselect',
  'reset-on-complete',
  'auto-advance',
  'time-zone',
  'today',
  'month',
  'default-month',
  'show-header',
  'show-duration-badge',
  'show-fields',
  'show-nav',
  'show-nav-selects',
  'show-month-captions',
  'show-weekdays',
  'show-presets',
  'show-clear',
  'show-footer',
  'show-time',
] as const;

const RANGE_MODES = new Set<SelectionMode>(['range', 'week', 'month', 'quarter', 'year']);
const MODES = new Set<string>(['single', 'range', 'multiple', 'week', 'month', 'quarter', 'year']);

/** HTML booleans: present means true; `="false"` / `="0"` opts back out. */
function toBool(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  const text = value.trim().toLowerCase();
  if (text === '' || text === 'true' || text === 'yes' || text === '1') return true;
  if (text === 'false' || text === 'no' || text === '0') return false;
  return true;
}

function toNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Accepts a JSON array or a comma-separated list — both are common in templates. */
function toList(value: string | null): unknown[] | undefined {
  if (value === null) return undefined;
  const text = value.trim();
  if (text === '') return [];
  if (text.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(text);
      // `Array.isArray` narrows `unknown` to `any[]`; widening to `unknown[]`
      // keeps the entries intact — they may be ISO strings *or* `{start, end}`
      // range objects, and coercing them would destroy the latter.
      if (Array.isArray(parsed)) return parsed as unknown[];
    } catch {
      /* fall through to the comma list */
    }
  }
  return text
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

function toDateList(value: string | null): string[] | undefined {
  const list = toList(value);
  return list?.map((entry) => String(entry));
}

function toRangeList(value: string | null): DateRangeInput[] | undefined {
  const list = toList(value);
  if (!list) return undefined;
  const out: DateRangeInput[] = [];
  for (const entry of list) {
    if (typeof entry === 'string') {
      const [start, end] = entry.split(RANGE_SPLIT);
      if (start && end) out.push({ start: start.trim(), end: end.trim() });
      continue;
    }
    if (entry && typeof entry === 'object' && 'start' in entry && 'end' in entry) {
      const range = entry;
      out.push({ start: range.start as string, end: range.end as string });
    }
  }
  return out;
}

const RANGE_SPLIT = /\s*(?:\.\.|\/|–|—|(?:^|\s)to(?:\s|$))\s*/;

/**
 * Decode the `value` attribute for the current mode: `"2026-09-04"`,
 * `"2026-09-04..2026-09-25"` (also `/`, `–`, `to`) or a comma-separated list.
 */
export function parseValueAttribute(text: string | null, mode: SelectionMode): ValueInput {
  if (text === null) return undefined;
  const trimmed = text.trim();
  if (trimmed === '') return null;

  if (RANGE_MODES.has(mode)) {
    const parts = trimmed.split(RANGE_SPLIT).filter((part) => part.trim() !== '');
    const start = toPlainDate(parts[0] ?? null);
    const end = toPlainDate(parts[1] ?? null);
    if (!start) return null;
    return { start, end };
  }

  if (mode === 'multiple') {
    return trimmed
      .split(',')
      .map((part) => toPlainDate(part.trim()))
      .filter((date): date is NonNullable<typeof date> => date !== null);
  }

  return toPlainDate(trimmed);
}

function firstDayOfWeekAttr(value: string | null): EngineOptions['firstDayOfWeek'] {
  if (value === null) return undefined;
  if (value.trim().toLowerCase() === 'locale') return 'locale';
  const day = Number(value);
  if (!Number.isFinite(day)) return undefined;
  const normalized = ((Math.trunc(day) % 7) + 7) % 7;
  return normalized as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

/** Map one attribute to its option patch. Unknown names produce nothing. */
function optionsForAttribute(
  name: string,
  value: string | null,
  mode: SelectionMode,
): Partial<VanillaOptions> {
  switch (name) {
    case 'mode':
      return MODES.has(value ?? '') ? { mode: value as SelectionMode } : { mode: 'single' };
    case 'value':
      /* The attribute is the *initial* value, exactly as `<input value>` is:
         passing it as `value` would put the engine into controlled mode and make
         `el.value = …` a silent no-op. Live updates go through `setValue`. */
      return { defaultValue: parseValueAttribute(value, mode) };
    case 'min':
      return { minDate: value };
    case 'max':
      return { maxDate: value };
    case 'locale':
      return { locale: value ?? 'auto' };
    case 'months':
      return { numberOfMonths: toNumber(value) ?? 1 };
    case 'theme':
      return { theme: value ?? undefined };
    case 'size':
      return { size: (value as VanillaOptions['size']) ?? undefined };
    case 'variant':
      return { variant: (value as VanillaOptions['variant']) ?? undefined };
    case 'orientation':
      return { orientation: (value as VanillaOptions['orientation']) ?? undefined };
    case 'title':
      return { title: value ?? undefined };
    case 'presets':
      return { presets: normalizePresets(toDateList(value)) };
    case 'first-day-of-week':
      return { firstDayOfWeek: firstDayOfWeekAttr(value) };
    case 'week-numbers':
      return { showWeekNumbers: toBool(value) };
    case 'fixed-weeks':
      return { fixedWeeks: toBool(value) };
    case 'outside-days':
      return { showOutsideDays: toBool(value) };
    case 'select-outside-days':
      return { selectOutsideDays: toBool(value) };
    case 'restrict-navigation':
      return { restrictNavigation: toBool(value) };
    case 'disabled-dates':
      return { disabledDates: toDateList(value) };
    case 'enabled-dates':
      return { enabledDates: toDateList(value) };
    case 'disabled-days-of-week':
      return {
        disabledDaysOfWeek: toDateList(value)
          ?.map((entry) => Number(entry))
          .filter((day) => Number.isFinite(day)),
      };
    case 'blocked-ranges':
      return { blockedRanges: toRangeList(value) };
    case 'disable-past':
      return { disablePast: toBool(value) };
    case 'disable-future':
      return { disableFuture: toBool(value) };
    case 'disable-weekends':
      return { disableWeekends: toBool(value) };
    case 'min-nights':
      return { minNights: toNumber(value) };
    case 'max-nights':
      return { maxNights: toNumber(value) };
    case 'min-selections':
      return { minSelections: toNumber(value) };
    case 'max-selections':
      return { maxSelections: toNumber(value) };
    case 'rolling-selection':
      return { rollingSelection: toBool(value) };
    case 'range-semantics':
      return { rangeSemantics: value === 'days' ? 'days' : 'nights' };
    case 'allow-reverse-range':
      return { allowReverseRange: toBool(value) };
    case 'toggle-on-reselect':
      return { toggleOnReselect: toBool(value) };
    case 'reset-on-complete':
      return { resetOnComplete: toBool(value) };
    case 'auto-advance':
      return { autoAdvance: toBool(value) };
    case 'time-zone':
      return { timeZone: value ?? undefined };
    case 'today':
      return { today: value };
    case 'month':
      return { month: value };
    case 'default-month':
      return { defaultMonth: value };
    case 'show-header':
      return { showHeader: toBool(value) };
    case 'show-duration-badge':
      return { showDurationBadge: toBool(value) };
    case 'show-fields':
      return { showFields: toBool(value) };
    case 'show-nav':
      return { showNav: toBool(value) };
    case 'show-nav-selects':
      return { showNavSelects: toBool(value) };
    case 'show-month-captions':
      return { showMonthCaptions: toBool(value) };
    case 'show-weekdays':
      return { showWeekdays: toBool(value) };
    case 'show-presets':
      return { showPresets: toBool(value) };
    case 'show-clear':
      return { showClear: toBool(value) };
    case 'show-footer':
      return { showFooter: toBool(value) };
    case 'show-time':
      return { showTime: toBool(value) };
    default:
      return {};
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Element                                   */
/* -------------------------------------------------------------------------- */

/** The instance API plus the property setters, for consumers typing a `querySelector`. */
export interface DatePickerElement extends HTMLElement {
  /** The value in the configured adapter's shape. Setting it selects. */
  value: unknown;
  /** The internal, timezone-free selection. Read-only. */
  readonly selection: SelectionValue;
  /** The live instance, or `null` before the element is connected. */
  readonly picker: DatePickerInstance | null;
  /** Merge arbitrary options — the escape hatch for anything an attribute cannot carry. */
  options: Partial<VanillaOptions>;
  presets: readonly (DatePreset | string)[];
  disabledDates: EngineOptions['disabledDates'];
  enabledDates: EngineOptions['enabledDates'];
  blockedRanges: EngineOptions['blockedRanges'];
  dayMeta: EngineOptions['dayMeta'];
  formatters: EngineOptions['formatters'];
  labels: EngineOptions['labels'];
}

/**
 * Register the element. Safe to call from module scope: it returns immediately
 * during SSR, and re-registering the same tag is a no-op rather than a throw.
 */
export function defineDatePickerElement(tagName = 'nextgen-date-picker'): void {
  if (typeof window === 'undefined' || typeof window.customElements === 'undefined') return;
  if (window.customElements.get(tagName)) return;

  class NextgenDatePickerElement extends HTMLElement {
    static get observedAttributes(): readonly string[] {
      return OBSERVED;
    }

    /** Options set through properties; they win over attributes on (re)connect. */
    private overrides: Partial<VanillaOptions> = {};
    private instance: DatePickerInstance | null = null;
    private unsubscribes: (() => void)[] = [];

    connectedCallback(): void {
      if (this.instance) return;
      const options = { ...this.readAttributes(), ...this.overrides };
      const target = this.getAttribute('for');
      const input = target
        ? (this.ownerDocument.getElementById(target) as HTMLInputElement | null)
        : null;

      this.instance =
        input && input.tagName === 'INPUT'
          ? attachDatePicker(input, options)
          : createDatePicker(this, options);

      this.unsubscribes = [
        this.instance.on('change', (detail) => this.forward('change', detail)),
        this.instance.on('complete', (detail) => this.forward('complete', detail)),
        this.instance.on('clear', (detail) => this.forward('clear', detail)),
        this.instance.on('monthchange', (detail) => this.forward('monthchange', detail)),
        this.instance.on('open', () => this.forward('open', undefined)),
        this.instance.on('close', () => this.forward('close', undefined)),
      ];
    }

    disconnectedCallback(): void {
      for (const off of this.unsubscribes) off();
      this.unsubscribes = [];
      this.instance?.destroy();
      this.instance = null;
      this.textContent = '';
    }

    attributeChangedCallback(name: string, previous: string | null, next: string | null): void {
      if (previous === next || !this.instance) return;
      // Before connection the attribute is read again by `connectedCallback`,
      // so there is nothing to patch and nothing to remember.
      if (name === 'value') {
        this.instance.setValue(parseValueAttribute(next, this.currentMode()) ?? null);
        return;
      }
      this.instance.update(optionsForAttribute(name, next, this.currentMode()));
    }

    private currentMode(): SelectionMode {
      const attribute = this.getAttribute('mode');
      if (attribute && MODES.has(attribute)) return attribute as SelectionMode;
      const fromOverride = this.overrides.mode;
      return fromOverride ?? 'single';
    }

    private readAttributes(): Partial<VanillaOptions> {
      const mode = this.currentMode();
      let options: Partial<VanillaOptions> = {};
      for (const name of OBSERVED) {
        if (!this.hasAttribute(name)) continue;
        options = { ...options, ...optionsForAttribute(name, this.getAttribute(name), mode) };
      }
      return options;
    }

    private forward(type: string, detail: unknown): void {
      this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
    }

    /** Apply an option patch now when live, and remember it for the next connect. */
    private patch(options: Partial<VanillaOptions>): void {
      this.overrides = { ...this.overrides, ...options };
      this.instance?.update(options);
    }

    get picker(): DatePickerInstance | null {
      return this.instance;
    }

    get selection(): SelectionValue {
      return (
        this.instance?.engine.getSnapshot().value ?? {
          dates: [],
          range: { start: null, end: null },
        }
      );
    }

    get value(): unknown {
      return this.instance ? this.instance.getValue() : (this.overrides.defaultValue ?? null);
    }

    set value(next: unknown) {
      this.overrides = { ...this.overrides, defaultValue: next as ValueInput };
      this.instance?.setValue(next as ValueInput);
    }

    get options(): Partial<VanillaOptions> {
      return { ...this.overrides };
    }

    set options(next: Partial<VanillaOptions>) {
      if (next) this.patch(next);
    }

    get presets(): readonly (DatePreset | string)[] {
      return this.overrides.presets ?? [];
    }

    set presets(next: readonly (DatePreset | string)[]) {
      this.patch({ presets: normalizePresets(next) });
    }

    get disabledDates(): EngineOptions['disabledDates'] {
      return this.overrides.disabledDates;
    }

    set disabledDates(next: EngineOptions['disabledDates']) {
      this.patch({ disabledDates: next });
    }

    get enabledDates(): EngineOptions['enabledDates'] {
      return this.overrides.enabledDates;
    }

    set enabledDates(next: EngineOptions['enabledDates']) {
      this.patch({ enabledDates: next });
    }

    get blockedRanges(): EngineOptions['blockedRanges'] {
      return this.overrides.blockedRanges;
    }

    set blockedRanges(next: EngineOptions['blockedRanges']) {
      this.patch({ blockedRanges: next });
    }

    get dayMeta(): EngineOptions['dayMeta'] {
      return this.overrides.dayMeta;
    }

    set dayMeta(next: EngineOptions['dayMeta']) {
      this.patch({ dayMeta: next });
    }

    get formatters(): EngineOptions['formatters'] {
      return this.overrides.formatters;
    }

    set formatters(next: EngineOptions['formatters']) {
      this.patch({ formatters: next });
    }

    get labels(): EngineOptions['labels'] {
      return this.overrides.labels;
    }

    set labels(next: EngineOptions['labels']) {
      this.patch({ labels: next });
    }
  }

  window.customElements.define(tagName, NextgenDatePickerElement);
}
