/**
 * `useDatePicker` — the React binding for the headless engine.
 *
 * The hook owns exactly one {@link DatePickerEngineApi} for the lifetime of the
 * component, mirrors it into React through `useSyncExternalStore`, and exposes
 * prop getters so a consumer can build any markup they like without
 * re-deriving ARIA, class names or event wiring.
 *
 * Nothing here touches `window` or `document` during render, so the hook is
 * safe to run on the server.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type {
  ChangeEvent as ReactChangeEvent,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { createDatePicker } from '../core/engine';
import { formatForInput, localeDatePlaceholder } from '../core/parse';
import type {
  ActiveField,
  CalendarSnapshot,
  CalendarView,
  ChangeReason,
  DateInput,
  DatePickerEngineApi,
  DayInfo,
  EngineOptions,
  MonthInfo,
  PlainDate,
  PlainTime,
  PresetContext,
  RangeSemantics,
  ResolvedPreset,
  SelectionValue,
  ValueInput,
} from '../core/types';

/* -------------------------------------------------------------------------- */
/*                                Public types                                */
/* -------------------------------------------------------------------------- */

/** Everything {@link createDatePicker} accepts; the hook adds no options of its own. */
export type UseDatePickerOptions = EngineOptions;

/** A loose bag of DOM props — spread it straight onto a JSX element. */
export type DatePickerProps = Record<string, unknown>;

/** The engine's imperative surface, pre-bound and referentially stable. */
export interface DatePickerActions {
  select(date: DateInput, opts?: { field?: ActiveField }): void;
  clear(): void;
  applyPreset(presetId: string): void;
  goToMonth(date: DateInput): void;
  nextMonth(count?: number): void;
  previousMonth(count?: number): void;
  goToToday(): void;
  setActiveField(field: ActiveField): void;
  setView(view: CalendarView): void;
  focusDate(date: DateInput, opts?: { scrollIntoView?: boolean }): void;
  hover(date: DateInput | null): void;
  setValue(value: ValueInput, reason?: ChangeReason): void;
  setTime(field: ActiveField, time: PlainTime | null): void;
  parseInput(text: string, field?: ActiveField): boolean;
}

export interface UseDatePickerReturn {
  engine: DatePickerEngineApi;
  snapshot: CalendarSnapshot;
  actions: DatePickerActions;
  /** Root element props: `dpng` class, `dir`, state data-attributes, keyboard handling. */
  getRootProps<T extends DatePickerProps>(props?: T): T & DatePickerProps;
  /** The months wrapper — labelled group that drops the hover preview on exit. */
  getCalendarProps(props?: DatePickerProps): DatePickerProps;
  /** `role="grid"` props for one rendered month. */
  getGridProps(month: MonthInfo, props?: DatePickerProps): DatePickerProps;
  /** Props for a day `<button type="button">`, including every state class and flag. */
  getDayProps(day: DayInfo, props?: DatePickerProps): DatePickerProps;
  getPreviousMonthProps(props?: DatePickerProps): DatePickerProps;
  getNextMonthProps(props?: DatePickerProps): DatePickerProps;
  getPresetProps(preset: ResolvedPreset, props?: DatePickerProps): DatePickerProps;
  getClearProps(props?: DatePickerProps): DatePickerProps;
  /** Props for the check-in / check-out summary button. */
  getFieldProps(field: ActiveField, props?: DatePickerProps): DatePickerProps;
  /** Props for a free-text date input bound to one half of the selection. */
  getInputProps(field: ActiveField, props?: DatePickerProps): DatePickerProps;
}

/* -------------------------------------------------------------------------- */
/*                                  Internals                                 */
/* -------------------------------------------------------------------------- */

const EMPTY_OPTIONS: UseDatePickerOptions = {};

/**
 * Options pushed into the engine when their identity changes. Callbacks are
 * absent on purpose: they are installed once as stable forwarders, so a
 * consumer's inline arrow function never triggers a resync.
 */
const SYNCED_OPTION_KEYS: readonly (keyof EngineOptions)[] = [
  'mode',
  'value',
  'locale',
  'firstDayOfWeek',
  'timeZone',
  'today',
  'rangeSemantics',
  'numberOfMonths',
  'fixedWeeks',
  'showOutsideDays',
  'selectOutsideDays',
  'showWeekNumbers',
  'month',
  'restrictNavigation',
  'allowReverseRange',
  'toggleOnReselect',
  'resetOnComplete',
  'autoAdvance',
  'presets',
  'dayMeta',
  'formatters',
  'labels',
  'time',
  'valueAdapter',
  'minDate',
  'maxDate',
  'disabledDates',
  'enabledDates',
  'disabledDaysOfWeek',
  'blockedRanges',
  'disablePast',
  'disableFuture',
  'disableWeekends',
  'minNights',
  'maxNights',
  'minSelections',
  'maxSelections',
  'rollingSelection',
  'preventCrossingBlocked',
  'isDateUnavailable',
];

/** Modes whose value lives in `value.range` rather than `value.dates`. */
const RANGE_MODES: ReadonlySet<string> = new Set(['range', 'week', 'month', 'quarter', 'year']);

type LooseHandler = (...args: unknown[]) => unknown;

function isDefaultPrevented(event: unknown): boolean {
  return (
    typeof event === 'object' &&
    event !== null &&
    (event as { defaultPrevented?: unknown }).defaultPrevented === true
  );
}

/**
 * The consumer's handler runs first and owns the event: calling
 * `preventDefault()` opts the element out of the built-in behaviour entirely.
 */
function chainHandlers(user: LooseHandler, base: LooseHandler): LooseHandler {
  return (...args: unknown[]) => {
    user(...args);
    if (isDefaultPrevented(args[0])) return;
    base(...args);
  };
}

function joinClassNames(a: unknown, b: unknown): string | undefined {
  const first = typeof a === 'string' ? a.trim() : '';
  const second = typeof b === 'string' ? b.trim() : '';
  if (first && second) return `${first} ${second}`;
  return first || second || undefined;
}

function asStyle(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Class names concatenate, styles shallow-merge, handlers chain, everything else wins. */
function mergeProps(base: DatePickerProps, extra?: DatePickerProps): DatePickerProps {
  if (!extra) return base;

  const merged: DatePickerProps = { ...base };
  for (const key of Object.keys(extra)) {
    const userValue = extra[key];
    const baseValue = merged[key];

    if (key === 'className') {
      merged.className = joinClassNames(baseValue, userValue);
    } else if (key === 'style') {
      merged.style = { ...asStyle(baseValue), ...asStyle(userValue) };
    } else if (
      key.length > 2 &&
      key.startsWith('on') &&
      typeof userValue === 'function' &&
      typeof baseValue === 'function'
    ) {
      merged[key] = chainHandlers(
        userValue as unknown as LooseHandler,
        baseValue as unknown as LooseHandler,
      );
    } else {
      merged[key] = userValue;
    }
  }
  return merged;
}

/** `undefined` removes the attribute; `"true"` is what Tailwind's `data-[x=true]:` matches. */
function flag(on: boolean): 'true' | undefined {
  return on ? 'true' : undefined;
}

function dayClassName(day: DayInfo): string {
  let className = 'dpng-day';
  if (day.isToday) className += ' dpng-day--today';
  if (day.isSelected) className += ' dpng-day--selected';
  if (day.isRangeStart) className += ' dpng-day--range-start';
  if (day.isRangeEnd) className += ' dpng-day--range-end';
  if (day.isInRange) className += ' dpng-day--in-range';
  if (day.isPreview) className += ' dpng-day--preview';
  if (day.isPreviewStart) className += ' dpng-day--preview-start';
  if (day.isPreviewEnd) className += ' dpng-day--preview-end';
  if (day.isDisabled) className += ' dpng-day--disabled';
  if (day.isBlocked) className += ' dpng-day--blocked';
  if (!day.inCurrentMonth) className += ' dpng-day--outside';
  if (day.isWeekend) className += ' dpng-day--weekend';
  if (day.isHoliday) className += ' dpng-day--holiday';
  if (day.isHovered) className += ' dpng-day--hovered';
  if (day.isFocused) className += ' dpng-day--focused';

  const extra = day.meta?.className;
  return typeof extra === 'string' && extra.trim() ? `${className} ${extra.trim()}` : className;
}

/** The date shown by one half of the picker, whatever the mode calls it. */
function selectedDateFor(snapshot: CalendarSnapshot, field: ActiveField): PlainDate | null {
  const value: SelectionValue = snapshot.value;
  if (RANGE_MODES.has(snapshot.mode)) {
    return field === 'start' ? value.range.start : value.range.end;
  }
  if (field === 'start') return value.dates[0] ?? null;
  return value.dates.length > 1 ? (value.dates[value.dates.length - 1] ?? null) : null;
}

/**
 * Keyboard events bubble to the root, so the engine must not claim keys that
 * belong to whatever is actually focused: `t` typed into a text field is a
 * letter, and Enter on the Clear button is a click, not a date selection.
 * Anything inside a day cell always reaches the engine — that is the grid.
 */
function shouldEngineHandleKey(event: ReactKeyboardEvent): boolean {
  const target: unknown = event.target;
  if (typeof target !== 'object' || target === null) return true;
  const closest = (target as { closest?: unknown }).closest;
  if (typeof closest !== 'function') return true;

  const matches = (selector: string): boolean =>
    (closest as (s: string) => unknown).call(target, selector) != null;

  if (matches('.dpng-day')) return true;
  if (matches('input, textarea, select, [contenteditable="true"]')) return false;
  const isActivation = event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar';
  return !(isActivation && matches('button, a[href]'));
}

interface InputDraft {
  /** What the user has typed but not yet committed. */
  readonly text: string;
  readonly invalid: boolean;
}

type InputDrafts = Partial<Record<ActiveField, InputDraft>>;

const NO_DRAFTS: InputDrafts = {};

/* -------------------------------------------------------------------------- */
/*                                  The hook                                  */
/* -------------------------------------------------------------------------- */

/**
 * Create (once) and subscribe to a date-picker engine.
 *
 * ```tsx
 * const picker = useDatePicker({ mode: 'range', minNights: 2 });
 * return <div {...picker.getRootProps()}>…</div>;
 * ```
 */
export function useDatePicker(options: UseDatePickerOptions = EMPTY_OPTIONS): UseDatePickerReturn {
  const optionsRef = useRef(options);
  // Read during render on purpose: prop getters built this pass must see this
  // pass's callbacks, and an effect would leave them one render behind.
  optionsRef.current = options;

  // Installed once so an inline `onChange={() => …}` never re-enters the engine.
  const forwarders = useMemo<EngineOptions>(
    () => ({
      onChange: (value, meta) => optionsRef.current.onChange?.(value, meta),
      onComplete: (value, meta) => optionsRef.current.onComplete?.(value, meta),
      onMonthChange: (month) => optionsRef.current.onMonthChange?.(month),
      onFocusChange: (date) => optionsRef.current.onFocusChange?.(date),
      onHoverChange: (date) => optionsRef.current.onHoverChange?.(date),
      onPresetApply: (preset, value) => optionsRef.current.onPresetApply?.(preset, value),
      onInvalidSelection: (date, evaluation) =>
        optionsRef.current.onInvalidSelection?.(date, evaluation),
    }),
    [],
  );

  const engineRef = useRef<DatePickerEngineApi | null>(null);
  if (engineRef.current === null) {
    engineRef.current = createDatePicker({ ...optionsRef.current, ...forwarders });
  }
  // Never `engine.destroy()` on unmount: StrictMode's mount → unmount → remount
  // reuses this very ref, and a destroyed engine is permanently inert. The
  // engine owns no timers or DOM listeners, and `useSyncExternalStore` removes
  // its subscriber for us, so unmounting simply leaves it to the collector.
  const engine = engineRef.current;

  // The engine's methods are prototype methods, so they are bound here rather
  // than handed to React unbound.
  const store = useMemo(
    () => ({
      subscribe: (listener: () => void) => engine.subscribe(listener),
      getSnapshot: () => engine.getSnapshot(),
    }),
    [engine],
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  // Push option changes in from an effect, comparing identity key by key so a
  // parent re-render with the same props is a no-op and cannot loop.
  const syncedRef = useRef<UseDatePickerOptions | null>(null);
  useEffect(() => {
    const previous = syncedRef.current;
    const next = optionsRef.current;
    syncedRef.current = next;
    if (previous === null || previous === next) return;

    const patch: Record<string, unknown> = {};
    let changed = false;
    for (const key of SYNCED_OPTION_KEYS) {
      if (!Object.is(previous[key], next[key])) {
        patch[key] = next[key];
        changed = true;
      }
    }
    if (changed) engine.setOptions(patch);
  });

  const actions = useMemo<DatePickerActions>(
    () => ({
      select: (date, opts) => engine.select(date, opts),
      clear: () => engine.clear(),
      applyPreset: (presetId) => engine.applyPreset(presetId),
      goToMonth: (date) => engine.goToMonth(date),
      nextMonth: (count) => engine.nextMonth(count),
      previousMonth: (count) => engine.previousMonth(count),
      goToToday: () => engine.goToToday(),
      setActiveField: (field) => engine.setActiveField(field),
      setView: (view) => engine.setView(view),
      focusDate: (date, opts) => engine.focusDate(date, opts),
      hover: (date) => engine.hover(date),
      setValue: (value, reason) => engine.setValue(value, reason),
      setTime: (field, time) => engine.setTime(field, time),
      parseInput: (text, field) => engine.parseInput(text, field),
    }),
    [engine],
  );

  /* ------------------------------ input drafts ----------------------------- */

  const [drafts, setDrafts] = useState<InputDrafts>(NO_DRAFTS);

  // Any change to the selection (a click, a preset, a controlled update) makes a
  // half-typed input stale, so the draft is dropped and the formatted value wins.
  const lastValueRef = useRef(snapshot.value);
  useEffect(() => {
    if (lastValueRef.current === snapshot.value) return;
    lastValueRef.current = snapshot.value;
    setDrafts((current) => (current === NO_DRAFTS ? current : NO_DRAFTS));
  }, [snapshot.value]);

  /* ---------------------------- focus restoration --------------------------- */

  /**
   * Keep DOM focus on the roving tab stop.
   *
   * The grid pattern moves a *virtual* focus (`tabindex="0"`) as the user
   * arrows around, but assistive tech follows real DOM focus, so the two have
   * to be kept together. It matters even more when a key press changes the
   * visible month: React re-keys every cell, the previously focused node is
   * unmounted, and focus falls back to `<body>` — after which no further key
   * press reaches the picker at all.
   *
   * Focus is only chased when it was already inside the picker, so a
   * programmatic `focusDate()` from host code never steals it from elsewhere
   * on the page.
   */
  const rootElementRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(false);

  // Deliberately runs after every render rather than keying off `focusedDate`:
  // a key press that does not move the date must still clear the request, and
  // the guard below makes the no-op case free.
  useEffect(() => {
    if (!restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    const root = rootElementRef.current;
    if (!root || typeof document === 'undefined') return;
    const tabStop = root.querySelector<HTMLElement>('.dpng-day[tabindex="0"]');
    if (tabStop && tabStop !== document.activeElement) tabStop.focus({ preventScroll: true });
  });

  const commitInput = useCallback(
    (field: ActiveField, text: string) => {
      if (text.trim() === '') {
        setDrafts((current) => dropDraft(current, field));
        return;
      }
      if (engine.parseInput(text, field)) {
        setDrafts((current) => dropDraft(current, field));
        return;
      }
      setDrafts((current) => ({ ...current, [field]: { text, invalid: true } }));
    },
    [engine],
  );

  /* ------------------------------ prop getters ----------------------------- */

  const instanceId = useId();

  const getRootProps = useCallback(
    <T extends DatePickerProps>(props?: T): T & DatePickerProps =>
      mergeProps(
        {
          className: 'dpng',
          dir: snapshot.direction,
          'data-mode': snapshot.mode,
          'data-months': String(snapshot.months.length),
          'data-selecting': snapshot.isSelecting ? 'true' : 'false',
          onKeyDown: (event: ReactKeyboardEvent) => {
            if (!shouldEngineHandleKey(event)) return;
            const root = event.currentTarget as HTMLElement | null;
            rootElementRef.current = root;
            // Only chase focus if it was already inside the picker.
            restoreFocusRef.current = !!root && root.contains(document.activeElement);
            engine.handleKeyDown(event);
          },
        },
        props,
      ) as T & DatePickerProps,
    [engine, snapshot],
  );

  const getCalendarProps = useCallback(
    (props?: DatePickerProps): DatePickerProps =>
      mergeProps(
        {
          className: 'dpng-months',
          // A labelled group, never role="application": the grid pattern inside
          // must keep its native screen-reader table navigation.
          role: 'group',
          'aria-label': snapshot.labels.title || snapshot.labels.selectDate,
          'data-months': String(snapshot.months.length),
          onMouseLeave: () => engine.hover(null),
        },
        props,
      ),
    [engine, snapshot],
  );

  const getGridProps = useCallback(
    (month: MonthInfo, props?: DatePickerProps): DatePickerProps =>
      mergeProps(
        {
          className: 'dpng-grid',
          role: 'grid',
          'aria-label': month.label,
          'aria-multiselectable': snapshot.mode === 'multiple' ? true : undefined,
          'data-month': month.key,
          id: `${instanceId}grid-${month.key}`,
        },
        props,
      ),
    [instanceId, snapshot],
  );

  const getDayProps = useCallback(
    (day: DayInfo, props?: DatePickerProps): DatePickerProps =>
      mergeProps(
        {
          type: 'button',
          role: 'gridcell',
          id: `${instanceId}day-${day.key}`,
          className: dayClassName(day),
          tabIndex: day.tabIndex,
          // Deliberately not `disabled`: an unavailable day must stay reachable
          // by the roving tabindex, exactly as the ARIA grid pattern requires.
          'aria-disabled': day.ariaDisabled,
          'aria-selected': day.ariaSelected,
          'aria-current': day.ariaCurrent,
          'aria-label': day.ariaLabel,
          title: day.meta?.tooltip,
          style: day.meta?.style,
          'data-date': day.key,
          'data-today': flag(day.isToday),
          'data-selected': flag(day.isSelected),
          'data-range-start': flag(day.isRangeStart),
          'data-range-end': flag(day.isRangeEnd),
          'data-in-range': flag(day.isInRange),
          'data-preview': flag(day.isPreview),
          'data-preview-start': flag(day.isPreviewStart),
          'data-preview-end': flag(day.isPreviewEnd),
          'data-disabled': flag(day.isDisabled),
          'data-blocked': flag(day.isBlocked),
          'data-outside': flag(!day.inCurrentMonth),
          'data-weekend': flag(day.isWeekend),
          'data-holiday': flag(day.isHoliday),
          'data-hovered': flag(day.isHovered),
          'data-focused': flag(day.isFocused),
          onClick: () => engine.select(day.date),
          onMouseEnter: () => engine.hover(day.date),
          // `scrollIntoView: false` — the browser moved focus here already, so
          // pulling the view would fight the user mid-tab.
          onFocus: () => engine.focusDate(day.date, { scrollIntoView: false }),
        },
        props,
      ),
    [engine, instanceId],
  );

  const getPreviousMonthProps = useCallback(
    (props?: DatePickerProps): DatePickerProps =>
      mergeProps(
        {
          type: 'button',
          className: 'dpng-nav__button dpng-nav__button--prev',
          'aria-label': snapshot.labels.previousMonth,
          disabled: !snapshot.canGoPrevious,
          'data-direction': 'previous',
          onClick: () => engine.previousMonth(),
        },
        props,
      ),
    [engine, snapshot],
  );

  const getNextMonthProps = useCallback(
    (props?: DatePickerProps): DatePickerProps =>
      mergeProps(
        {
          type: 'button',
          className: 'dpng-nav__button dpng-nav__button--next',
          'aria-label': snapshot.labels.nextMonth,
          disabled: !snapshot.canGoNext,
          'data-direction': 'next',
          onClick: () => engine.nextMonth(),
        },
        props,
      ),
    [engine, snapshot],
  );

  const rangeSemantics: RangeSemantics = options.rangeSemantics === 'days' ? 'days' : 'nights';

  /**
   * `ResolvedPreset.isActive` wants the context it was resolved against, which
   * lives inside the engine. Rebuilding it from the snapshot is enough for the
   * default equality test and for every built-in preset; `clamp` is the
   * identity here because a chip's active state is read from the value that was
   * already accepted, never from a candidate that still needs clamping.
   */
  const presetContext = useMemo<PresetContext>(
    () => ({
      today: snapshot.today,
      mode: snapshot.mode,
      value: snapshot.value,
      anchor: snapshot.anchor,
      focusedDate: snapshot.focusedDate,
      firstDayOfWeek: snapshot.weekdays[0]?.weekday ?? 0,
      rangeSemantics,
      clamp: (value) => value,
    }),
    [rangeSemantics, snapshot],
  );

  const getPresetProps = useCallback(
    (preset: ResolvedPreset, props?: DatePickerProps): DatePickerProps => {
      let active = false;
      try {
        active = preset.isActive(snapshot.value, presetContext);
      } catch {
        // A custom preset that throws must not take the calendar down with it.
        active = false;
      }
      let className = 'dpng-preset';
      if (active) className += ' dpng-preset--active';
      if (preset.disabled) className += ' dpng-preset--disabled';

      return mergeProps(
        {
          type: 'button',
          className,
          // Preset labels are short runs of their own language sitting inside a
          // calendar that may be RTL. Without `dir="auto"` the bidi algorithm
          // folds a leading number into the surrounding paragraph and "3 nights"
          // renders as "nights 3" in an Arabic or Hebrew picker.
          dir: 'auto',
          'aria-pressed': active,
          disabled: preset.disabled,
          title: preset.resolvedHint ?? preset.hint,
          'data-preset': preset.id,
          'data-active': flag(active),
          'data-disabled': flag(preset.disabled),
          onClick: () => engine.applyPreset(preset.id),
        },
        props,
      );
    },
    [engine, presetContext, snapshot],
  );

  const getClearProps = useCallback(
    (props?: DatePickerProps): DatePickerProps =>
      mergeProps(
        {
          type: 'button',
          className: 'dpng-button dpng-button--ghost',
          'aria-label': snapshot.labels.clear,
          disabled: !snapshot.canClear,
          'data-action': 'clear',
          onClick: () => engine.clear(),
        },
        props,
      ),
    [engine, snapshot],
  );

  const getFieldProps = useCallback(
    (field: ActiveField, props?: DatePickerProps): DatePickerProps => {
      const isActive = snapshot.activeField === field;
      const filled = selectedDateFor(snapshot, field) !== null;
      // Range validation (min/max nights, crossing a blocked date) is always a
      // verdict on the end pick, so only that field is flagged.
      const invalid = !snapshot.validation.valid && field === 'end';

      let className = 'dpng-field';
      if (isActive) className += ' dpng-field--active';
      if (filled) className += ' dpng-field--filled';
      if (invalid) className += ' dpng-field--invalid';

      return mergeProps(
        {
          type: 'button',
          className,
          'aria-pressed': isActive,
          'aria-label': field === 'start' ? snapshot.labels.startLabel : snapshot.labels.endLabel,
          'data-field': field,
          'data-active': flag(isActive),
          'data-filled': flag(filled),
          'data-invalid': flag(invalid),
          onClick: () => engine.setActiveField(field),
        },
        props,
      );
    },
    [engine, snapshot],
  );

  const getInputProps = useCallback(
    (field: ActiveField, props?: DatePickerProps): DatePickerProps => {
      const draft = drafts[field];
      const selected = selectedDateFor(snapshot, field);
      const value = draft ? draft.text : selected ? formatForInput(selected, snapshot.locale) : '';
      const invalid = draft?.invalid ?? false;

      return mergeProps(
        {
          type: 'text',
          className: 'dpng-input__field',
          value,
          placeholder: localeDatePlaceholder(snapshot.locale),
          inputMode: 'numeric',
          autoComplete: 'off',
          autoCorrect: 'off',
          spellCheck: false,
          'aria-label': field === 'start' ? snapshot.labels.startLabel : snapshot.labels.endLabel,
          'aria-invalid': invalid,
          'data-field': field,
          'data-invalid': flag(invalid),
          onChange: (event: ReactChangeEvent<HTMLInputElement>) => {
            const text = event.target.value;
            setDrafts((current) => ({ ...current, [field]: { text, invalid: false } }));
          },
          onBlur: (event: ReactFocusEvent<HTMLInputElement>) => {
            commitInput(field, event.target.value);
          },
          onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => {
            // The calendar's key bindings ("t" for today, arrows, Backspace)
            // would otherwise eat the user's typing on the way up to the root.
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.preventDefault();
              commitInput(field, event.currentTarget.value);
            } else if (event.key === 'Escape') {
              setDrafts((current) => dropDraft(current, field));
            }
          },
        },
        props,
      );
    },
    [commitInput, drafts, snapshot],
  );

  return useMemo<UseDatePickerReturn>(
    () => ({
      engine,
      snapshot,
      actions,
      getRootProps,
      getCalendarProps,
      getGridProps,
      getDayProps,
      getPreviousMonthProps,
      getNextMonthProps,
      getPresetProps,
      getClearProps,
      getFieldProps,
      getInputProps,
    }),
    [
      actions,
      engine,
      getCalendarProps,
      getClearProps,
      getDayProps,
      getFieldProps,
      getGridProps,
      getInputProps,
      getNextMonthProps,
      getPresetProps,
      getPreviousMonthProps,
      getRootProps,
      snapshot,
    ],
  );
}

function dropDraft(current: InputDrafts, field: ActiveField): InputDrafts {
  if (current[field] === undefined) return current;
  const next: InputDrafts = { ...current };
  delete next[field];
  return Object.keys(next).length === 0 ? NO_DRAFTS : next;
}
