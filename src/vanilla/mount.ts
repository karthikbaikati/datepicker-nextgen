/**
 * Mounting + interaction for the framework-free binding.
 *
 * `createDatePicker` renders an inline calendar into any element; `attachDatePicker`
 * wires one to an `<input>` as a popover. Both return the same instance API, and
 * both install exactly one delegated listener per event type on the picker root —
 * a 42-cell calendar costs four listeners, not two hundred.
 */

import { createDatePicker as createEngine } from '../core/engine';
import { resolveFormatters, resolveLocale } from '../core/intl';
import { formatForInput } from '../core/parse';
import { fromISODate, plainTime, toISODate } from '../core/plain-date';
import type {
  CalendarSnapshot,
  ChangeMeta,
  DatePickerEngineApi,
  EngineOptions,
  PlainDate,
  SelectionValue,
  ValueInput,
} from '../core/types';
import { createRenderer, dayKeyOf, type PresentationOptions, type RenderConfig } from './renderer';

/* -------------------------------------------------------------------------- */
/*                                   Options                                  */
/* -------------------------------------------------------------------------- */

export interface VanillaOptions extends EngineOptions, PresentationOptions {
  /** Text written back into an attached input. Defaults to a round-trippable form. */
  formatValue?: (value: SelectionValue, snapshot: CalendarSnapshot) => string;
  /** Popover: open when the input is focused or clicked. Default `true`. */
  openOnFocus?: boolean;
  /** Popover, modal and sheet: close once the selection is complete. Default `true`. */
  closeOnComplete?: boolean;
  /** Popover: move focus into the calendar when it opens. Default `true`. */
  autoFocus?: boolean;
  /** Popover: gap in pixels between the input and the panel. Default `8`. */
  offset?: number;
  /** Popover: where the panel is appended. Default `document.body`. */
  container?: HTMLElement;
}

export type DatePickerEventName =
  'change' | 'complete' | 'open' | 'close' | 'clear' | 'monthchange';

/** Payload of `change`, `complete` and `clear`. */
export interface DatePickerChangeDetail {
  /** The value in the shape the configured `valueAdapter` produces. */
  readonly value: unknown;
  /** The internal, timezone-free selection. */
  readonly selection: SelectionValue;
  readonly meta: ChangeMeta;
}

export interface DatePickerInstance {
  readonly engine: DatePickerEngineApi;
  /** The `.dpng` root element. */
  readonly element: HTMLElement;
  update(options: Partial<VanillaOptions>): void;
  getValue<T = SelectionValue>(): T;
  setValue(value: ValueInput): void;
  open(): void;
  close(): void;
  toggle(): void;
  /** Subscribe to an instance event. Returns an unsubscribe function. */
  on(event: DatePickerEventName, handler: (detail: unknown) => void): () => void;
  destroy(): void;
}

/* -------------------------------------------------------------------------- */
/*                                  Internals                                 */
/* -------------------------------------------------------------------------- */

const PRESENTATION_ONLY = new Set<string>([
  'className',
  'theme',
  'size',
  'variant',
  'orientation',
  'title',
  'showHeader',
  'showDurationBadge',
  'showFields',
  'showNav',
  'showMonthCaptions',
  'showNavSelects',
  'showWeekdays',
  'showPresets',
  'showClear',
  'showFooter',
  'showTodayButton',
  'showApplyButton',
  'showCancelButton',
  'showTime',
  'showLiveRegion',
  'formatValue',
  'openOnFocus',
  'closeOnComplete',
  'autoFocus',
  'offset',
  'container',
]);

/* The three callbacks the instance wraps. They must never reach the engine from
   a user patch, or `update({ onChange })` would silently unhook the emitter. */
const INTERCEPTED = new Set<string>(['onChange', 'onComplete', 'onMonthChange']);

interface Host {
  /** Where the root lives while visible. */
  readonly container: HTMLElement;
  /** The input a popover hangs off, when there is one. */
  readonly input: HTMLInputElement | null;
  readonly floating: boolean;
}

type Emitter = Map<DatePickerEventName, Set<(detail: unknown) => void>>;

function splitEngineOptions(options: Partial<VanillaOptions>): Partial<EngineOptions> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (!PRESENTATION_ONLY.has(key) && !INTERCEPTED.has(key)) out[key] = value;
  }
  return out;
}

function toRenderConfig(
  options: VanillaOptions,
  fallbackVariant: RenderConfig['variant'],
): RenderConfig {
  return {
    className: options.className,
    theme: options.theme,
    size: options.size,
    variant: options.variant ?? fallbackVariant,
    orientation: options.orientation,
    title: options.title,
    showHeader: options.showHeader,
    showDurationBadge: options.showDurationBadge,
    showFields: options.showFields,
    showNav: options.showNav,
    showMonthCaptions: options.showMonthCaptions,
    showNavSelects: options.showNavSelects,
    showWeekdays: options.showWeekdays,
    showPresets: options.showPresets,
    showClear: options.showClear,
    showFooter: options.showFooter,
    showTodayButton: options.showTodayButton,
    showApplyButton: options.showApplyButton,
    showCancelButton: options.showCancelButton,
    showTime: options.showTime,
    showLiveRegion: options.showLiveRegion,
    formatters: resolveFormatters(options.formatters),
    time: options.time,
    rangeSemantics: options.rangeSemantics,
  };
}

/** Round-trippable text for an attached input: whatever `parseInput` reads back. */
function defaultInputText(snapshot: CalendarSnapshot, locale: string): string {
  const { range, dates } = snapshot.value;
  if (range.start || range.end) {
    const start = range.start ? formatForInput(range.start, locale) : '';
    const end = range.end ? formatForInput(range.end, locale) : '';
    if (start && end) return `${start} – ${end}`;
    return start || end;
  }
  if (dates.length === 0) return '';
  return dates.map((date) => formatForInput(date, locale)).join(', ');
}

/* -------------------------------------------------------------------------- */
/*                                   Factory                                  */
/* -------------------------------------------------------------------------- */

function createInstance(
  doc: Document,
  initialOptions: VanillaOptions,
  host: Host,
): DatePickerInstance {
  let options: VanillaOptions = { ...initialOptions };
  let destroyed = false;
  let isOpen = !host.floating;
  let rendering = false;
  let hoveredKey: string | null = null;
  /** Snapshot of the value when a popover opened, so `Cancel` can restore it. */
  let valueOnOpen: SelectionValue | null = null;

  const emitter: Emitter = new Map();
  const cleanups: (() => void)[] = [];
  const win = doc.defaultView;

  const engine = createEngine({
    ...splitEngineOptions(options),
    onChange: handleChange,
    onComplete: handleComplete,
    onMonthChange: handleMonthChange,
  });

  /* Rebuilt only when options change: `render` runs on every engine notification
     and must not allocate a formatter table each time. */
  let renderConfig = toRenderConfig(options, host.floating ? 'popover' : 'inline');
  const renderer = createRenderer(doc, renderConfig);
  const root = renderer.root;

  /* --------------------------------- events -------------------------------- */

  function emit(event: DatePickerEventName, detail: unknown): void {
    const handlers = emitter.get(event);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      try {
        handler(detail);
      } catch {
        /* A listener must never break the picker's own bookkeeping. */
      }
    }
  }

  function detailFor(value: SelectionValue, meta: ChangeMeta): DatePickerChangeDetail {
    return { value: engine.getValue(), selection: value, meta };
  }

  function handleChange(value: SelectionValue, meta: ChangeMeta): void {
    options.onChange?.(value, meta);
    const detail = detailFor(value, meta);
    if (meta.reason === 'clear') emit('clear', detail);
    emit('change', detail);
    syncInput();
  }

  function handleComplete(value: SelectionValue, meta: ChangeMeta): void {
    options.onComplete?.(value, meta);
    emit('complete', detailFor(value, meta));
    if (isOpen && dismissible() && options.closeOnComplete !== false) close();
  }

  function handleMonthChange(month: PlainDate): void {
    options.onMonthChange?.(month);
    emit('monthchange', { month });
  }

  /* --------------------------------- render -------------------------------- */

  function render(): void {
    if (destroyed || rendering) return;
    rendering = true;
    try {
      const snapshot = engine.getSnapshot();
      renderer.render(snapshot, renderConfig);
      restoreDayFocus(snapshot);
    } finally {
      rendering = false;
    }
  }

  /**
   * Roving tabindex only works if DOM focus follows it. When the previously
   * focused cell is the active element and the engine has moved on (arrow keys,
   * `t`, a preset), focus has to be handed to the new cell — but never stolen
   * from a nav button, a select or the page at large.
   */
  function restoreDayFocus(snapshot: CalendarSnapshot): void {
    const active = doc.activeElement;
    if (!active || !root.contains(active)) return;
    const activeKey = dayKeyOf(active);
    if (activeKey === null) return;
    const wanted = toISODate(snapshot.focusedDate);
    if (activeKey !== wanted) renderer.focusDay(wanted);
  }

  function syncInput(): void {
    const input = host.input;
    if (!input) return;
    const snapshot = engine.getSnapshot();
    const text = options.formatValue
      ? options.formatValue(snapshot.value, snapshot)
      : defaultInputText(snapshot, resolveLocale(options.locale));
    if (input.value !== text) input.value = text;
  }

  /* ------------------------------- delegation ------------------------------- */

  function listen<T extends Event>(
    target: EventTarget,
    type: string,
    handler: (event: T) => void,
    passive?: boolean,
  ): void {
    const listener = handler as EventListener;
    const opts: AddEventListenerOptions | undefined =
      passive === undefined ? undefined : { passive };
    target.addEventListener(type, listener, opts);
    cleanups.push(() => target.removeEventListener(type, listener, opts));
  }

  function onClick(event: MouseEvent): void {
    const target = event.target as Element | null;
    const actionable = target?.closest<HTMLElement>('[data-action]');
    if (!actionable || !root.contains(actionable)) return;
    const action = actionable.dataset['action'];

    switch (action) {
      case 'day': {
        const date = fromISODate(actionable.dataset['date'] ?? '');
        if (date) engine.select(date);
        break;
      }
      case 'prev':
        engine.previousMonth();
        break;
      case 'next':
        engine.nextMonth();
        break;
      case 'preset': {
        const id = actionable.dataset['preset'];
        if (id) engine.applyPreset(id);
        break;
      }
      case 'clear':
        engine.clear();
        break;
      case 'today':
        engine.goToToday();
        break;
      case 'field': {
        const field = actionable.dataset['field'];
        if (field === 'start' || field === 'end') engine.setActiveField(field);
        break;
      }
      case 'apply':
        if (dismissible()) close();
        break;
      case 'cancel':
        if (valueOnOpen) engine.setValue(valueOnOpen);
        if (dismissible()) close();
        break;
      case 'backdrop':
        if (dismissible()) close();
        break;
      default:
        break;
    }
  }

  function onPointerOver(event: Event): void {
    const key = dayKeyOf(event.target as Element | null);
    if (key === hoveredKey) return;
    hoveredKey = key;
    engine.hover(key ? fromISODate(key) : null);
  }

  function onPointerLeave(): void {
    if (hoveredKey === null) return;
    hoveredKey = null;
    engine.hover(null);
  }

  function onChangeEvent(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    const action = target?.dataset['action'];
    if (!target || !action) return;
    const view = engine.getSnapshot().months[0]?.date;

    if (action === 'month-select' && view) {
      const month = Number(target.value);
      if (Number.isFinite(month)) engine.goToMonth({ year: view.year, month, day: 1 });
      return;
    }
    if (action === 'year-select' && view) {
      const year = Number(target.value);
      if (Number.isFinite(year)) engine.goToMonth({ year, month: view.month, day: 1 });
      return;
    }
    if (action === 'time') {
      const field = target.dataset['field'] === 'end' ? 'end' : 'start';
      const [hour, minute] = target.value.split(':');
      engine.setTime(
        field,
        hour === undefined || minute === undefined ? null : plainTime(Number(hour), Number(minute)),
      );
    }
  }

  /** Popovers, modals and sheets can be dismissed; an inline calendar cannot. */
  function dismissible(): boolean {
    return host.floating || (options.variant !== undefined && options.variant !== 'inline');
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && isOpen && dismissible()) {
      event.preventDefault();
      close();
      host.input?.focus();
      return;
    }
    if (event.key === 'Tab' && isOpen && dismissible()) {
      trapFocus(event);
      return;
    }
    const target = event.target as Element | null;
    if (!target || dayKeyOf(target) === null) return;
    if (engine.handleKeyDown(event)) {
      renderer.focusDay(toISODate(engine.getSnapshot().focusedDate));
    }
  }

  /** Keeps Tab inside the floating panel; the input itself counts as inside. */
  function trapFocus(event: KeyboardEvent): void {
    const items = renderer.focusables();
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = doc.activeElement;
    if (event.shiftKey && (active === first || !root.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  listen<MouseEvent>(root, 'click', onClick);
  listen(root, 'mouseover', onPointerOver);
  listen(root, 'mouseleave', onPointerLeave);
  listen(root, 'change', onChangeEvent);
  listen<KeyboardEvent>(root, 'keydown', onKeyDown);

  /* -------------------------------- popover -------------------------------- */

  /**
   * Dependency-free placement: sit under the anchor, flip above when the space
   * below cannot hold the panel, and clamp horizontally so the panel never
   * leaves the viewport.
   */
  function position(): void {
    const anchor = host.input;
    if (!anchor || !win) return;
    const rect = anchor.getBoundingClientRect();
    const gap = options.offset ?? 8;
    const margin = 8;

    root.style.position = 'absolute';
    const width = root.offsetWidth || rect.width;
    const height = root.offsetHeight;
    const viewportWidth = doc.documentElement.clientWidth || win.innerWidth;
    const viewportHeight = doc.documentElement.clientHeight || win.innerHeight;

    const spaceBelow = viewportHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const below = height <= spaceBelow || spaceBelow >= spaceAbove;
    const top = below ? rect.bottom + gap : rect.top - gap - height;

    let left = rect.left;
    if (left + width > viewportWidth - margin) left = viewportWidth - margin - width;
    if (left < margin) left = margin;

    // Coordinates are viewport-relative; translate them into the container's
    // own coordinate space so the panel works in `body` and in a scrolled div.
    let originX = win.scrollX;
    let originY = win.scrollY;
    if (host.container !== doc.body && host.container !== doc.documentElement) {
      const parent = host.container.getBoundingClientRect();
      originX = host.container.scrollLeft - parent.left;
      originY = host.container.scrollTop - parent.top;
    }

    root.style.top = `${Math.round(top + originY)}px`;
    root.style.left = `${Math.round(left + originX)}px`;
    root.dataset['placement'] = below ? 'bottom' : 'top';
  }

  const floatingCleanups: (() => void)[] = [];

  function bindFloating(): void {
    if (!win) return;
    const reposition = (): void => position();
    const onDocumentPointerDown = (event: Event): void => {
      const target = event.target as Node | null;
      if (!target) return;
      if (root.contains(target) || host.input?.contains(target) || target === host.input) return;
      close();
    };

    win.addEventListener('scroll', reposition, { passive: true, capture: true });
    win.addEventListener('resize', reposition, { passive: true });
    doc.addEventListener('mousedown', onDocumentPointerDown, true);
    doc.addEventListener('touchstart', onDocumentPointerDown, { capture: true, passive: true });

    floatingCleanups.push(() => {
      win.removeEventListener('scroll', reposition, true);
      win.removeEventListener('resize', reposition);
      doc.removeEventListener('mousedown', onDocumentPointerDown, true);
      doc.removeEventListener('touchstart', onDocumentPointerDown, true);
    });
  }

  function unbindFloating(): void {
    while (floatingCleanups.length > 0) floatingCleanups.pop()?.();
  }

  function open(): void {
    if (destroyed || isOpen) return;
    isOpen = true;
    valueOnOpen = engine.getSnapshot().value;
    if (!root.isConnected) host.container.appendChild(root);
    root.style.display = '';
    render();
    if (host.floating) {
      position();
      bindFloating();
      host.input?.setAttribute('aria-expanded', 'true');
      if (options.autoFocus !== false) {
        renderer.focusDay(toISODate(engine.getSnapshot().focusedDate));
      }
    }
    emit('open', undefined);
  }

  function close(): void {
    if (destroyed || !isOpen) return;
    isOpen = false;
    unbindFloating();
    if (host.floating) {
      root.remove();
      host.input?.setAttribute('aria-expanded', 'false');
    } else {
      root.style.display = 'none';
    }
    hoveredKey = null;
    engine.hover(null);
    emit('close', undefined);
  }

  /* -------------------------------- lifecycle ------------------------------- */

  const unsubscribe = engine.subscribe(() => {
    if (isOpen) render();
  });

  if (host.input) bindInput(host.input);

  if (!host.floating) {
    host.container.appendChild(root);
    render();
  }

  /** Opens on focus, parses what is typed, and restores the input on destroy. */
  function bindInput(input: HTMLInputElement): void {
    const previousAutocomplete = input.getAttribute('autocomplete');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-haspopup', 'dialog');
    input.setAttribute('aria-expanded', 'false');
    cleanups.push(() => {
      if (previousAutocomplete === null) input.removeAttribute('autocomplete');
      else input.setAttribute('autocomplete', previousAutocomplete);
      input.removeAttribute('aria-haspopup');
      input.removeAttribute('aria-expanded');
    });

    const requestOpen = (): void => {
      if (options.openOnFocus !== false) open();
    };
    listen(input, 'focus', requestOpen);
    listen(input, 'click', requestOpen);
    listen<KeyboardEvent>(input, 'keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        open();
      } else if (event.key === 'Escape') {
        close();
      } else if (event.key === 'Enter' && engine.parseInput(input.value)) {
        event.preventDefault();
      }
    });
    listen(input, 'change', () => {
      engine.parseInput(input.value);
      syncInput();
    });

    syncInput();
  }

  return {
    engine,
    element: root,
    update(next: Partial<VanillaOptions>): void {
      if (destroyed || !next) return;
      options = { ...options, ...next };
      renderConfig = toRenderConfig(options, host.floating ? 'popover' : 'inline');
      engine.setOptions(splitEngineOptions(next));
      render();
    },
    getValue<T = SelectionValue>(): T {
      return engine.getValue<T>();
    },
    setValue(value: ValueInput): void {
      engine.setValue(value);
    },
    open,
    close,
    toggle(): void {
      if (isOpen) close();
      else open();
    },
    on(event: DatePickerEventName, handler: (detail: unknown) => void): () => void {
      if (typeof handler !== 'function') return () => undefined;
      let handlers = emitter.get(event);
      if (!handlers) {
        handlers = new Set();
        emitter.set(event, handlers);
      }
      handlers.add(handler);
      return () => {
        emitter.get(event)?.delete(handler);
      };
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      unbindFloating();
      while (cleanups.length > 0) cleanups.pop()?.();
      unsubscribe();
      emitter.clear();
      renderer.destroy();
      engine.destroy();
    },
  };
}

/* -------------------------------------------------------------------------- */
/*                                Public mounts                               */
/* -------------------------------------------------------------------------- */

function resolveTarget(target: HTMLElement | string): HTMLElement {
  if (typeof target !== 'string') return target;
  if (typeof document === 'undefined') {
    throw new Error('datepicker-nextgen: a selector target needs a DOM; pass an element instead.');
  }
  const found = document.querySelector<HTMLElement>(target);
  if (!found) throw new Error(`datepicker-nextgen: no element matches "${target}".`);
  return found;
}

/**
 * Render an inline calendar into `target`. The instance owns everything it adds
 * to the DOM, so `destroy()` leaves the page exactly as it found it.
 */
export function createDatePicker(
  target: HTMLElement | string,
  options: VanillaOptions = {},
): DatePickerInstance {
  const container = resolveTarget(target);
  const doc = container.ownerDocument;
  return createInstance(doc, options, { container, input: null, floating: false });
}

/**
 * Attach a popover calendar to an `<input>`: it opens on focus, writes the
 * formatted value back, parses what the user types, and closes on Escape, on an
 * outside click or once the selection is complete.
 */
export function attachDatePicker(
  input: HTMLInputElement,
  options: VanillaOptions = {},
): DatePickerInstance {
  const doc = input.ownerDocument;
  return createInstance(
    doc,
    { variant: 'popover', ...options },
    {
      container: options.container ?? doc.body,
      input,
      floating: true,
    },
  );
}
