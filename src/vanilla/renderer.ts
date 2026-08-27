/**
 * The framework-free DOM renderer.
 *
 * It emits exactly the structure, class names and data attributes of the React
 * components so a single stylesheet serves both bindings, and it is written as a
 * patcher rather than a re-renderer: the tree is built once, then every snapshot
 * only writes the properties that actually changed. Day cells are reused by
 * position and keyed by ISO date; the grid itself is rebuilt only when the month
 * count, the row count or the week-number column changes. The zoomed-out grid is
 * built once and patched the same way — every level hands over the same twelve
 * cells — and the month strip is detached rather than destroyed while it shows.
 *
 * The renderer attaches no listeners at all — it tags actionable elements with
 * `data-action` (plus `data-date`, `data-zoom`, `data-preset`, `data-field`) and
 * leaves event delegation to {@link ../vanilla/mount}, so there is one listener
 * per picker instead of one per cell.
 */

import { defaultFormatters } from '../core/intl';
import { toISODate } from '../core/plain-date';
import type {
  CalendarSnapshot,
  CalendarView,
  DayInfo,
  DayMeta,
  Formatters,
  MonthInfo,
  PlainTime,
  PresetContext,
  RangeSemantics,
  ResolvedPreset,
  TimeOptions,
  WeekInfo,
  ZoomCell,
} from '../core/types';

/* -------------------------------------------------------------------------- */
/*                                   Config                                   */
/* -------------------------------------------------------------------------- */

export type PickerVariant = 'inline' | 'popover' | 'modal' | 'sheet';
export type PickerSize = 'sm' | 'md' | 'lg';
export type PickerOrientation = 'horizontal' | 'vertical';

/** Everything about the picker that is presentation rather than date logic. */
export interface PresentationOptions {
  /** Extra class names merged onto the root element. */
  className?: string;
  /** Sets `data-theme`; pairs with the theme files in `src/styles/themes`. */
  theme?: string;
  /** Sets `data-size`, scaling the cell size and font. Default `'md'`. */
  size?: PickerSize;
  /** Sets `data-variant`. Default `'inline'` (`attachDatePicker` uses `'popover'`). */
  variant?: PickerVariant;
  /** Sets `data-orientation`. Vertical stacks months into one scrolling column. */
  orientation?: PickerOrientation;
  /** Header title. Defaults to `labels.title`. */
  title?: string;
  /** Header row with the title and the duration badge. Default `true`. */
  showHeader?: boolean;
  /** The `21 nights` pill. Default `true`. */
  showDurationBadge?: boolean;
  /** Check-in / check-out summary fields. Default `true`. */
  showFields?: boolean;
  /** Month navigation row. Default `true`. */
  showNav?: boolean;
  /** Per-month captions. Default `true` when more than one month is rendered. */
  showMonthCaptions?: boolean;
  /** Month + year `<select>`s in the nav row. Default `false`. */
  showNavSelects?: boolean;
  /** Weekday header row. Default `true`. */
  showWeekdays?: boolean;
  /** Preset chip row. Default `true` when presets resolve. */
  showPresets?: boolean;
  /** The trailing `Clear` action in the preset row. Default `true`. */
  showClear?: boolean;
  /** Footer row. Default `false`. */
  showFooter?: boolean;
  /** `Today` action in the footer. Default `true` when the footer shows. */
  showTodayButton?: boolean;
  /** `Apply` action in the footer. Default `true` for non-inline variants. */
  showApplyButton?: boolean;
  /** `Cancel` action in the footer. Default `true` for non-inline variants. */
  showCancelButton?: boolean;
  /** Time selects. Default `true` when `time.enabled` is set. */
  showTime?: boolean;
  /** The visually hidden `aria-live` region. Default `true`. */
  showLiveRegion?: boolean;
}

/** What {@link DatePickerRenderer.render} needs beyond the snapshot. */
export interface RenderConfig extends PresentationOptions {
  /** Resolved formatters — used by the time row and the duration badge. */
  formatters?: Formatters;
  /** Mirrors `EngineOptions.time`, which the snapshot does not carry. */
  time?: TimeOptions;
  /** Mirrors `EngineOptions.rangeSemantics`; needed to re-test preset activity. */
  rangeSemantics?: RangeSemantics;
}

export interface DatePickerRenderer {
  /** The `.dpng` root. Always present, even before the first render. */
  readonly root: HTMLElement;
  /** Patch the tree to match `snapshot`. Cheap enough to call on every change. */
  render(snapshot: CalendarSnapshot, config?: RenderConfig): void;
  /** Move DOM focus to a day cell by ISO key, or to the roving-tabindex cell. */
  focusDay(key?: string): boolean;
  /** Every keyboard-reachable element inside the picker, in DOM order. */
  focusables(): HTMLElement[];
  /** Drop every cached node reference and empty the root. */
  destroy(): void;
}

/* -------------------------------------------------------------------------- */
/*                                DOM helpers                                 */
/* -------------------------------------------------------------------------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  parent?: Element,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

function button(
  doc: Document,
  className: string,
  action: string,
  parent?: Element,
): HTMLButtonElement {
  const node = el(doc, 'button', className, parent);
  node.type = 'button';
  node.dataset['action'] = action;
  return node;
}

/** Inline chevron, always drawn pointing left/right for LTR; CSS mirrors it in RTL. */
function chevron(doc: Document, direction: 'prev' | 'next'): SVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute(
    'd',
    direction === 'prev' ? 'M14.5 5.5 8 12l6.5 6.5' : 'M9.5 5.5 16 12l-6.5 6.5',
  );
  svg.appendChild(path);
  return svg;
}

function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/**
 * Writing `textContent` replaces the child text node; writing `data` mutates it.
 * On a month change that is 42 fewer node removals and insertions per calendar,
 * so the hot text — day numbers, week numbers — goes through here.
 */
function setData(node: Text, text: string): void {
  if (node.data !== text) node.data = text;
}

function setClass(node: Element, className: string): void {
  if (node.className !== className) node.className = className;
}

/** Boolean data attributes are present-or-absent, so `[data-x]` and `[data-x="true"]` both work. */
function setFlag(node: HTMLElement, name: string, on: boolean): void {
  if (on) {
    if (node.getAttribute(name) !== 'true') node.setAttribute(name, 'true');
  } else if (node.hasAttribute(name)) {
    node.removeAttribute(name);
  }
}

function setAttr(node: Element, name: string, value: string | null): void {
  if (value === null) {
    if (node.hasAttribute(name)) node.removeAttribute(name);
  } else if (node.getAttribute(name) !== value) {
    node.setAttribute(name, value);
  }
}

function show(node: HTMLElement, visible: boolean): void {
  const value = visible ? '' : 'none';
  if (node.style.display !== value) node.style.display = value;
}

function flag(value: boolean | undefined, fallback: boolean): boolean {
  return value === undefined ? fallback : value;
}

let idCounter = 0;
const nextId = (): string => `dpng-${(idCounter += 1).toString(36)}`;

/* -------------------------------------------------------------------------- */
/*                              Cached view nodes                             */
/* -------------------------------------------------------------------------- */

/* Day state is folded into a bitmask so one integer compare decides whether the
   class list and the data attributes need rewriting at all. */
const F_TODAY = 1 << 0;
const F_SELECTED = 1 << 1;
const F_RANGE_START = 1 << 2;
const F_RANGE_END = 1 << 3;
const F_IN_RANGE = 1 << 4;
const F_PREVIEW = 1 << 5;
const F_PREVIEW_START = 1 << 6;
const F_PREVIEW_END = 1 << 7;
const F_DISABLED = 1 << 8;
const F_BLOCKED = 1 << 9;
const F_OUTSIDE = 1 << 10;
const F_WEEKEND = 1 << 11;
const F_HOLIDAY = 1 << 12;
const F_HOVERED = 1 << 13;
const F_FOCUSED = 1 << 14;
const F_HIDDEN = 1 << 15;

function dayMask(day: DayInfo, hidden: boolean): number {
  return (
    (day.isToday ? F_TODAY : 0) |
    (day.isSelected ? F_SELECTED : 0) |
    (day.isRangeStart ? F_RANGE_START : 0) |
    (day.isRangeEnd ? F_RANGE_END : 0) |
    (day.isInRange ? F_IN_RANGE : 0) |
    (day.isPreview ? F_PREVIEW : 0) |
    (day.isPreviewStart ? F_PREVIEW_START : 0) |
    (day.isPreviewEnd ? F_PREVIEW_END : 0) |
    (day.isDisabled ? F_DISABLED : 0) |
    (day.isBlocked ? F_BLOCKED : 0) |
    (!day.inCurrentMonth ? F_OUTSIDE : 0) |
    (day.isWeekend ? F_WEEKEND : 0) |
    (day.isHoliday ? F_HOLIDAY : 0) |
    (day.isHovered ? F_HOVERED : 0) |
    (day.isFocused ? F_FOCUSED : 0) |
    (hidden ? F_HIDDEN : 0)
  );
}

function dayClassName(mask: number, extra: string): string {
  let out = 'dpng-day';
  if (mask & F_TODAY) out += ' dpng-day--today';
  if (mask & F_SELECTED) out += ' dpng-day--selected';
  if (mask & F_RANGE_START) out += ' dpng-day--range-start';
  if (mask & F_RANGE_END) out += ' dpng-day--range-end';
  if (mask & F_IN_RANGE) out += ' dpng-day--in-range';
  if (mask & F_PREVIEW) out += ' dpng-day--preview';
  if (mask & F_PREVIEW_START) out += ' dpng-day--preview-start';
  if (mask & F_PREVIEW_END) out += ' dpng-day--preview-end';
  if (mask & F_DISABLED) out += ' dpng-day--disabled';
  if (mask & F_BLOCKED) out += ' dpng-day--blocked';
  if (mask & F_OUTSIDE) out += ' dpng-day--outside';
  if (mask & F_WEEKEND) out += ' dpng-day--weekend';
  if (mask & F_HOLIDAY) out += ' dpng-day--holiday';
  if (mask & F_HOVERED) out += ' dpng-day--hovered';
  if (mask & F_FOCUSED) out += ' dpng-day--focused';
  return extra ? `${out} ${extra}` : out;
}

function applyDayFlags(node: HTMLElement, mask: number): void {
  setFlag(node, 'data-today', (mask & F_TODAY) !== 0);
  setFlag(node, 'data-selected', (mask & F_SELECTED) !== 0);
  setFlag(node, 'data-range-start', (mask & F_RANGE_START) !== 0);
  setFlag(node, 'data-range-end', (mask & F_RANGE_END) !== 0);
  setFlag(node, 'data-in-range', (mask & F_IN_RANGE) !== 0);
  setFlag(node, 'data-preview', (mask & F_PREVIEW) !== 0);
  setFlag(node, 'data-preview-start', (mask & F_PREVIEW_START) !== 0);
  setFlag(node, 'data-preview-end', (mask & F_PREVIEW_END) !== 0);
  setFlag(node, 'data-disabled', (mask & F_DISABLED) !== 0);
  setFlag(node, 'data-blocked', (mask & F_BLOCKED) !== 0);
  setFlag(node, 'data-outside', (mask & F_OUTSIDE) !== 0);
  setFlag(node, 'data-weekend', (mask & F_WEEKEND) !== 0);
  setFlag(node, 'data-holiday', (mask & F_HOLIDAY) !== 0);
  setFlag(node, 'data-hovered', (mask & F_HOVERED) !== 0);
  setFlag(node, 'data-focused', (mask & F_FOCUSED) !== 0);
}

/** Cheap change detector for the optional decoration layer. */
function metaSignature(meta: DayMeta | undefined): string {
  if (!meta) return '';
  const dots = meta.dots
    ? meta.dots.map((dot) => (typeof dot === 'string' ? dot : dot.color)).join('|')
    : '';
  return `${meta.note ?? ''} ${meta.badge ?? ''} ${dots} ${meta.tooltip ?? ''} ${meta.className ?? ''}`;
}

interface DayCell {
  readonly node: HTMLButtonElement;
  readonly bg: HTMLElement;
  readonly number: Text;
  note: HTMLElement | null;
  dots: HTMLElement | null;
  badge: HTMLElement | null;
  key: string;
  mask: number;
  label: string;
  aria: string;
  meta: string;
  extra: string;
  styled: boolean;
}

interface WeekRow {
  readonly node: HTMLElement;
  weekNumber: Text | null;
  readonly cells: DayCell[];
}

interface MonthView {
  readonly node: HTMLElement;
  readonly caption: HTMLElement;
  readonly weekdays: HTMLElement;
  readonly grid: HTMLElement;
  readonly captionId: string;
  rows: WeekRow[];
  weekdaySignature: string;
  weekNumbers: boolean;
}

/* Zoom cells carry three states, folded into a mask for the same reason day
   cells are: one integer compare gates every attribute write. */
const Z_CURRENT = 1 << 0;
const Z_SELECTED = 1 << 1;
const Z_DISABLED = 1 << 2;

function zoomClassName(mask: number): string {
  let out = 'dpng-zoom__cell';
  if (mask & Z_CURRENT) out += ' dpng-zoom__cell--current';
  if (mask & Z_SELECTED) out += ' dpng-zoom__cell--selected';
  if (mask & Z_DISABLED) out += ' dpng-zoom__cell--disabled';
  return out;
}

/** The zoomed-out grid is three cells wide at every level; four rows make twelve. */
const ZOOM_COLUMNS = 3;

/**
 * What one press of the caption reveals, per level. `decade` is the outermost
 * screen, so its caption is never a button.
 */
const ZOOM_OUT_TARGET: Readonly<Record<CalendarView, string>> = {
  day: 'month',
  month: 'year',
  year: 'decade',
  decade: '',
};

interface ZoomCellNode {
  readonly node: HTMLButtonElement;
  readonly text: Text;
  key: string;
  date: string;
  label: string;
  aria: string;
  mask: number;
  tabIndex: string;
}

interface ZoomGrid {
  readonly node: HTMLElement;
  readonly rows: HTMLElement[];
  readonly cells: ZoomCellNode[];
}

interface PresetChip {
  readonly node: HTMLButtonElement;
  readonly label: HTMLElement;
  hint: HTMLElement | null;
  id: string;
  state: string;
}

/* -------------------------------------------------------------------------- */
/*                                  Renderer                                  */
/* -------------------------------------------------------------------------- */

/**
 * Build the picker's DOM once and return a patcher for it. The root is detached;
 * the caller decides where it lives.
 */
export function createRenderer(doc: Document, config: RenderConfig = {}): DatePickerRenderer {
  const root = el(doc, 'div', 'dpng');
  const card = el(doc, 'div', 'dpng-card', root);

  /* header */
  const header = el(doc, 'div', 'dpng-header', card);
  const headerTitle = el(doc, 'div', 'dpng-header__title', header);
  const headerBadge = el(doc, 'span', 'dpng-header__badge', header);
  headerBadge.setAttribute('dir', 'auto');

  /* fields */
  const fields = el(doc, 'div', 'dpng-fields', card);
  const startField = button(doc, 'dpng-field', 'field', fields);
  startField.dataset['field'] = 'start';
  const startFieldLabel = el(doc, 'span', 'dpng-field__label', startField);
  const startFieldValue = el(doc, 'span', 'dpng-field__value', startField);
  const fieldsDivider = el(doc, 'span', 'dpng-fields__divider', fields);
  fieldsDivider.setAttribute('aria-hidden', 'true');
  const endField = button(doc, 'dpng-field', 'field', fields);
  endField.dataset['field'] = 'end';
  const endFieldLabel = el(doc, 'span', 'dpng-field__label', endField);
  const endFieldValue = el(doc, 'span', 'dpng-field__value', endField);

  /* nav */
  const nav = el(doc, 'div', 'dpng-nav', card);
  /* Hidden from assistive tech because every grid already publishes the same
     caption as its accessible name. The zoom-out button that replaces it is
     interactive, so it takes an `aria-label` instead. */
  const navLabel = el(doc, 'span', 'dpng-nav__label', nav);
  navLabel.setAttribute('aria-hidden', 'true');
  const navSelects = el(doc, 'div', 'dpng-nav__selects', nav);
  const monthSelect = el(doc, 'select', 'dpng-nav__select', navSelects);
  monthSelect.dataset['action'] = 'month-select';
  const yearSelect = el(doc, 'select', 'dpng-nav__select', navSelects);
  yearSelect.dataset['action'] = 'year-select';
  const prevButton = button(doc, 'dpng-nav__button dpng-nav__button--prev', 'prev', nav);
  prevButton.appendChild(chevron(doc, 'prev'));
  const nextButton = button(doc, 'dpng-nav__button dpng-nav__button--next', 'next', nav);
  nextButton.appendChild(chevron(doc, 'next'));

  /* months */
  const months = el(doc, 'div', 'dpng-months', card);

  /* time */
  const time = el(doc, 'div', 'dpng-time', card);
  const startTimeField = el(doc, 'label', 'dpng-time__field', time);
  const startTimeText = doc.createTextNode('');
  startTimeField.appendChild(startTimeText);
  const startTimeSelect = el(doc, 'select', 'dpng-time__select', startTimeField);
  startTimeSelect.dataset['action'] = 'time';
  startTimeSelect.dataset['field'] = 'start';
  const endTimeField = el(doc, 'label', 'dpng-time__field', time);
  const endTimeText = doc.createTextNode('');
  endTimeField.appendChild(endTimeText);
  const endTimeSelect = el(doc, 'select', 'dpng-time__select', endTimeField);
  endTimeSelect.dataset['action'] = 'time';
  endTimeSelect.dataset['field'] = 'end';

  /* presets */
  const presets = el(doc, 'div', 'dpng-presets', card);
  const clearButton = button(doc, 'dpng-button dpng-button--ghost', 'clear', presets);

  /* footer */
  const footer = el(doc, 'div', 'dpng-footer', card);
  const footerInfo = el(doc, 'div', 'dpng-footer__info', footer);
  const footerActions = el(doc, 'div', 'dpng-footer__actions', footer);
  const todayButton = button(doc, 'dpng-button dpng-button--ghost', 'today', footerActions);
  const cancelButton = button(doc, 'dpng-button dpng-button--subtle', 'cancel', footerActions);
  const applyButton = button(doc, 'dpng-button dpng-button--primary', 'apply', footerActions);

  /* live region */
  const live = el(doc, 'div', 'dpng-live', card);
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');

  const monthViews: MonthView[] = [];
  const chips: PresetChip[] = [];
  const dayByKey = new Map<string, DayCell>();

  let current: RenderConfig = config;
  let backdrop: HTMLElement | null = null;
  let sheet: HTMLElement | null = null;
  let variantApplied: PickerVariant | null = null;
  let monthOptionsSignature = '';
  let yearOptionsSignature = '';
  let timeOptionsSignature = '';
  let destroyed = false;

  /* Both built lazily: a picker that never leaves the month grid pays nothing
     for the zoom levels, and one that never leaves them pays nothing to keep
     the month strip alive — its views are detached, not destroyed. */
  let zoomGrid: ZoomGrid | null = null;
  let navLabelButton: HTMLButtonElement | null = null;
  let zoomed = false;
  let monthsDetached = false;

  /* ------------------------------- sub-renders ------------------------------ */

  /**
   * `modal` and `sheet` are not just class names: the stylesheet expects a
   * dimming `.dpng-backdrop` and, for a sheet, a `.dpng-sheet` panel wrapping the
   * card. The card is re-parented rather than rebuilt, so switching variants at
   * runtime keeps every cached cell.
   */
  function applyVariantStructure(variant: PickerVariant): void {
    if (variant === variantApplied) return;
    variantApplied = variant;
    const overlay = variant === 'modal' || variant === 'sheet';

    if (overlay) {
      if (!backdrop) {
        backdrop = el(doc, 'div', 'dpng-backdrop');
        backdrop.dataset['action'] = 'backdrop';
      }
      if (backdrop.parentElement !== root) root.insertBefore(backdrop, root.firstChild);
    } else if (backdrop) {
      backdrop.remove();
    }

    if (variant === 'sheet') {
      if (!sheet) sheet = el(doc, 'div', 'dpng-sheet');
      if (sheet.parentElement !== root) root.appendChild(sheet);
      if (card.parentElement !== sheet) sheet.appendChild(card);
    } else {
      if (sheet) sheet.remove();
      if (card.parentElement !== root) root.appendChild(card);
    }
  }

  function renderRoot(snapshot: CalendarSnapshot, cfg: RenderConfig, weekNumbers: boolean): void {
    const variant = cfg.variant ?? 'inline';
    applyVariantStructure(variant);
    let className = 'dpng';
    // The stylesheet supports the popover layer on the root itself; `modal` and
    // `sheet` instead need real backdrop / panel elements, built above.
    if (variant === 'popover') className += ' dpng-popover';
    if (cfg.className) className += ` ${cfg.className}`;
    setClass(root, className);

    setAttr(root, 'data-mode', snapshot.mode);
    setAttr(root, 'data-size', cfg.size ?? 'md');
    setAttr(root, 'data-variant', variant);
    setAttr(root, 'data-orientation', cfg.orientation ?? 'horizontal');
    setAttr(root, 'data-theme', cfg.theme ?? null);
    setAttr(root, 'data-months', String(snapshot.months.length));
    setAttr(root, 'data-view', snapshot.view);
    setAttr(root, 'dir', snapshot.direction);
    setFlag(root, 'data-selecting', snapshot.isSelecting);
    setFlag(root, 'data-week-numbers', weekNumbers);
    setAttr(root, 'role', variant === 'inline' ? 'group' : 'dialog');
    setAttr(root, 'aria-label', cfg.title ?? snapshot.labels.title);
  }

  function renderHeader(snapshot: CalendarSnapshot, cfg: RenderConfig): void {
    const visible = flag(cfg.showHeader, true);
    show(header, visible);
    if (!visible) return;
    setText(headerTitle, cfg.title ?? snapshot.labels.title);
    const badge = flag(cfg.showDurationBadge, true) ? snapshot.durationLabel : '';
    show(headerBadge, badge !== '');
    setText(headerBadge, badge);
  }

  function renderField(
    node: HTMLButtonElement,
    labelNode: HTMLElement,
    valueNode: HTMLElement,
    label: string,
    value: string,
    active: boolean,
    filled: boolean,
    invalid: boolean,
  ): void {
    let className = 'dpng-field';
    if (active) className += ' dpng-field--active';
    if (filled) className += ' dpng-field--filled';
    if (invalid) className += ' dpng-field--invalid';
    setClass(node, className);
    setFlag(node, 'data-active', active);
    setFlag(node, 'data-filled', filled);
    setFlag(node, 'data-invalid', invalid);
    setAttr(node, 'aria-pressed', active ? 'true' : 'false');
    setText(labelNode, label);
    setText(valueNode, value);
  }

  function renderFields(snapshot: CalendarSnapshot, cfg: RenderConfig): void {
    const visible = flag(cfg.showFields, true);
    show(fields, visible);
    if (!visible) return;

    const labels = snapshot.labels;
    const paired = snapshot.endLabel !== '';
    const invalid = !snapshot.validation.valid;
    const startFilled = !snapshot.isEmpty;
    const startText =
      snapshot.mode === 'multiple' && startFilled ? snapshot.summary : snapshot.startLabel;
    const startTitle =
      snapshot.mode === 'single'
        ? labels.singleLabel
        : snapshot.mode === 'multiple'
          ? labels.multipleLabel
          : labels.startLabel;

    renderField(
      startField,
      startFieldLabel,
      startFieldValue,
      startTitle,
      startText,
      snapshot.activeField === 'start',
      startFilled,
      false,
    );
    show(fieldsDivider, paired);
    show(endField, paired);
    if (!paired) return;
    renderField(
      endField,
      endFieldLabel,
      endFieldValue,
      labels.endLabel,
      snapshot.endLabel,
      snapshot.activeField === 'end',
      snapshot.endLabel !== labels.emptyValue,
      invalid,
    );
  }

  /**
   * Swap the caption between its plain `<span>` and the zoom-out `<button>`.
   * They are two elements rather than one retagged node, so each keeps exactly
   * the semantics it needs: the span stays `aria-hidden`, the button never is.
   */
  function useCaption(wantButton: boolean): HTMLElement {
    const attached = navLabelButton?.parentElement === nav ? navLabelButton : navLabel;
    if (!wantButton) {
      if (attached !== navLabel) {
        nav.insertBefore(navLabel, attached);
        attached.remove();
      }
      return navLabel;
    }
    if (!navLabelButton) {
      navLabelButton = button(doc, 'dpng-nav__label dpng-nav__label--button', 'zoom-out');
    }
    if (attached !== navLabelButton) {
      nav.insertBefore(navLabelButton, attached);
      attached.remove();
    }
    return navLabelButton;
  }

  function renderNav(snapshot: CalendarSnapshot, cfg: RenderConfig, captions: boolean): void {
    const visible = flag(cfg.showNav, true);
    show(nav, visible);
    if (!visible) return;

    const labels = snapshot.labels;
    const first = snapshot.months[0];

    /* Above the day level there are no month captions to defer to and the nav
       caption is also the way back out, so it always shows — and the selects,
       which can only express a month of a year, have nothing left to say. */
    const showLabel = zoomed || !captions;
    const selects = flag(cfg.showNavSelects, false) && !zoomed && first !== undefined;
    const caption = zoomed ? snapshot.zoom.label : (first?.label ?? '');
    const asButton = !selects && showLabel && snapshot.zoom.canZoomOut && caption !== '';

    const captionNode = useCaption(asButton);
    setText(captionNode, showLabel ? caption : '');
    if (asButton) {
      const hint = ZOOM_OUT_TARGET[snapshot.view];
      setAttr(
        captionNode,
        'aria-label',
        hint === '' ? caption : `${caption}, zoom out to pick a ${hint}`,
      );
    }

    setAttr(prevButton, 'aria-label', labels.previousMonth);
    setAttr(nextButton, 'aria-label', labels.nextMonth);
    prevButton.disabled = !snapshot.canGoPrevious;
    nextButton.disabled = !snapshot.canGoNext;

    show(navSelects, selects);
    if (!selects) return;

    setAttr(monthSelect, 'aria-label', labels.monthSelectLabel);
    setAttr(yearSelect, 'aria-label', labels.yearSelectLabel);

    const monthSig = snapshot.monthOptions
      .map((option) => `${option.month}:${option.label}:${option.disabled ? 1 : 0}`)
      .join(',');
    if (monthSig !== monthOptionsSignature) {
      monthOptionsSignature = monthSig;
      monthSelect.textContent = '';
      for (const option of snapshot.monthOptions) {
        const node = el(doc, 'option', undefined, monthSelect);
        node.value = String(option.month);
        node.textContent = option.label;
        node.disabled = option.disabled;
      }
    }
    const yearSig = snapshot.years
      .map((option) => `${option.year}:${option.label}:${option.disabled ? 1 : 0}`)
      .join(',');
    if (yearSig !== yearOptionsSignature) {
      yearOptionsSignature = yearSig;
      yearSelect.textContent = '';
      for (const option of snapshot.years) {
        const node = el(doc, 'option', undefined, yearSelect);
        node.value = String(option.year);
        node.textContent = option.label;
        node.disabled = option.disabled;
      }
    }

    const view = first?.date;
    if (view) {
      const month = String(view.month);
      const year = String(view.year);
      if (monthSelect.value !== month) monthSelect.value = month;
      if (yearSelect.value !== year) yearSelect.value = year;
    }
  }

  /* --------------------------------- months -------------------------------- */

  function createMonthView(): MonthView {
    const node = el(doc, 'div', 'dpng-month', months);
    const caption = el(doc, 'div', 'dpng-month__caption', node);
    const captionId = nextId();
    caption.id = captionId;
    const weekdays = el(doc, 'div', 'dpng-weekdays', node);
    /* The weekday strip is a sibling of the grid, so it cannot be a row of
       column headers inside it. Every day already announces its own weekday
       through `ariaLabel`, so the strip is hidden from assistive tech rather
       than lying about the grid's structure. */
    weekdays.setAttribute('aria-hidden', 'true');
    const grid = el(doc, 'div', 'dpng-grid', node);
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-labelledby', captionId);
    return {
      node,
      caption,
      weekdays,
      grid,
      captionId,
      rows: [],
      weekdaySignature: '',
      weekNumbers: false,
    };
  }

  function createDayCell(parent: Element): DayCell {
    const node = button(doc, 'dpng-day', 'day', parent);
    node.setAttribute('role', 'gridcell');
    const bg = el(doc, 'span', 'dpng-day__bg', node);
    bg.setAttribute('aria-hidden', 'true');
    const numberNode = el(doc, 'span', 'dpng-day__number', node);
    const number = doc.createTextNode('');
    numberNode.appendChild(number);
    const cell: DayCell = {
      node,
      bg,
      number,
      note: null,
      dots: null,
      badge: null,
      key: '',
      mask: -1,
      label: '',
      aria: '',
      meta: '',
      extra: '',
      styled: false,
    };
    return cell;
  }

  function createWeekRow(view: MonthView, weekNumbers: boolean): WeekRow {
    const node = el(doc, 'div', 'dpng-week', view.grid);
    node.setAttribute('role', 'row');
    let weekNumber: Text | null = null;
    if (weekNumbers) {
      const cell = el(doc, 'span', 'dpng-weeknumber', node);
      cell.setAttribute('role', 'rowheader');
      weekNumber = doc.createTextNode('');
      cell.appendChild(weekNumber);
    }
    const cells: DayCell[] = [];
    for (let i = 0; i < 7; i += 1) cells.push(createDayCell(node));
    return { node, weekNumber, cells };
  }

  function renderWeekdays(
    view: MonthView,
    month: MonthInfo,
    snapshot: CalendarSnapshot,
    weekNumbers: boolean,
  ): void {
    const signature = `${weekNumbers ? '#' : ''}${month.weekdays
      .map((weekday) => `${weekday.short}:${weekday.isWeekend ? 1 : 0}`)
      .join(',')}`;
    if (signature === view.weekdaySignature) return;
    view.weekdaySignature = signature;
    view.weekdays.textContent = '';
    if (weekNumbers) {
      const spacer = el(doc, 'span', 'dpng-weekday', view.weekdays);
      spacer.textContent = snapshot.labels.weekNumberHeader;
    }
    for (const weekday of month.weekdays) {
      const cell = el(doc, 'span', 'dpng-weekday', view.weekdays);
      if (weekday.isWeekend) cell.className = 'dpng-weekday dpng-weekday--weekend';
      cell.textContent = weekday.short;
      cell.title = weekday.long;
    }
  }

  function renderDayMeta(cell: DayCell, meta: DayMeta | undefined): void {
    const signature = metaSignature(meta);
    if (signature === cell.meta) return;
    cell.meta = signature;

    const note = meta?.note;
    if (note) {
      if (!cell.note) cell.note = el(doc, 'span', 'dpng-day__note', cell.node);
      setText(cell.note, note);
    } else if (cell.note) {
      cell.note.remove();
      cell.note = null;
    }

    const dots = meta?.dots;
    if (dots && dots.length > 0) {
      if (!cell.dots) cell.dots = el(doc, 'span', 'dpng-day__dots', cell.node);
      cell.dots.textContent = '';
      for (const dot of dots.slice(0, 3)) {
        const node = el(doc, 'span', 'dpng-day__dot', cell.dots);
        const color = typeof dot === 'string' ? dot : dot.color;
        const label = typeof dot === 'string' ? undefined : dot.label;
        node.style.backgroundColor = color;
        if (label) node.title = label;
      }
    } else if (cell.dots) {
      cell.dots.remove();
      cell.dots = null;
    }

    const badge = meta?.badge;
    if (badge !== undefined && badge !== null && badge !== '') {
      if (!cell.badge) cell.badge = el(doc, 'span', 'dpng-day__badge', cell.node);
      setText(cell.badge, String(badge));
    } else if (cell.badge) {
      cell.badge.remove();
      cell.badge = null;
    }

    setAttr(cell.node, 'title', meta?.tooltip ?? null);
  }

  function renderDay(cell: DayCell, day: DayInfo): void {
    const key = day.key;
    if (cell.key !== key) {
      cell.key = key;
      cell.node.dataset['date'] = key;
    }
    dayByKey.set(key, cell);

    /* An outside day the engine chose not to label stays in the grid so the
       geometry never shifts, but must not be clickable or announced. */
    const hidden = !day.inCurrentMonth && day.label === '';
    const mask = dayMask(day, hidden);
    const extra = day.meta?.className ?? '';
    if (mask !== cell.mask || extra !== cell.extra) {
      cell.mask = mask;
      cell.extra = extra;
      setClass(cell.node, dayClassName(mask, extra));
      applyDayFlags(cell.node, mask);
      // An unavailable day must stay focusable: the ARIA grid pattern walks
      // every cell, and the native `disabled` attribute would drop it out of
      // the roving tab order and swallow the click that fires
      // `onInvalidSelection`. Only a cell hidden from the grid entirely (an
      // outside day with `showOutsideDays: false`) is truly disabled.
      cell.node.disabled = hidden;
      setAttr(cell.node, 'aria-disabled', day.ariaDisabled ? 'true' : null);
      setAttr(cell.node, 'aria-selected', day.ariaSelected ? 'true' : 'false');
      setAttr(cell.node, 'aria-current', day.ariaCurrent ?? null);
      setAttr(cell.node, 'aria-hidden', hidden ? 'true' : null);
      cell.node.style.visibility = hidden ? 'hidden' : '';
    }

    if (cell.label !== day.label) {
      cell.label = day.label;
      setData(cell.number, day.label);
    }
    if (cell.aria !== day.ariaLabel) {
      cell.aria = day.ariaLabel;
      setAttr(cell.node, 'aria-label', day.ariaLabel || null);
    }

    const tabIndex = String(day.tabIndex);
    if (cell.node.getAttribute('tabindex') !== tabIndex) {
      cell.node.setAttribute('tabindex', tabIndex);
    }

    renderDayMeta(cell, day.meta);

    const style = day.meta?.style;
    if (style) {
      for (const [property, value] of Object.entries(style)) {
        cell.node.style.setProperty(property, String(value));
      }
      cell.styled = true;
    } else if (cell.styled) {
      const visibility = cell.node.style.visibility;
      cell.node.removeAttribute('style');
      if (visibility) cell.node.style.visibility = visibility;
      cell.styled = false;
    }
  }

  function renderWeek(row: WeekRow, week: WeekInfo, weekNumbers: boolean): void {
    if (row.weekNumber && weekNumbers) setData(row.weekNumber, week.weekNumberLabel);
    for (let i = 0; i < row.cells.length; i += 1) {
      const cell = row.cells[i];
      const day = week.days[i];
      if (cell && day) renderDay(cell, day);
    }
  }

  function renderMonths(
    snapshot: CalendarSnapshot,
    cfg: RenderConfig,
    weekNumbers: boolean,
    captions: boolean,
  ): void {
    /* Structural rebuilds only: month count, row count and the week-number
       column. Everything else is patched in place. */
    while (monthViews.length > snapshot.months.length) {
      const view = monthViews.pop();
      view?.node.remove();
    }
    while (monthViews.length < snapshot.months.length) {
      monthViews.push(createMonthView());
    }

    for (let index = 0; index < snapshot.months.length; index += 1) {
      const month = snapshot.months[index];
      const view = monthViews[index];
      if (!month || !view) continue;

      show(view.caption, captions);
      if (captions) setText(view.caption, month.label);
      setAttr(view.node, 'data-month', month.key);

      const weekdaysVisible = flag(cfg.showWeekdays, true);
      show(view.weekdays, weekdaysVisible);
      if (weekdaysVisible) renderWeekdays(view, month, snapshot, weekNumbers);

      setAttr(view.grid, 'aria-label', month.label);
      setAttr(view.grid, 'aria-multiselectable', snapshot.mode === 'multiple' ? 'true' : null);

      if (view.weekNumbers !== weekNumbers) {
        view.weekNumbers = weekNumbers;
        view.grid.textContent = '';
        view.rows = [];
      }
      while (view.rows.length > month.weeks.length) {
        const row = view.rows.pop();
        row?.node.remove();
      }
      while (view.rows.length < month.weeks.length) {
        view.rows.push(createWeekRow(view, weekNumbers));
      }
      for (let rowIndex = 0; rowIndex < month.weeks.length; rowIndex += 1) {
        const week = month.weeks[rowIndex];
        const row = view.rows[rowIndex];
        if (week && row) renderWeek(row, week, weekNumbers);
      }
    }
  }

  /* ---------------------------------- zoom ---------------------------------- */

  /**
   * The month strip and the zoom grid are alternatives, never siblings: the
   * stylesheet gives `.dpng-months > .dpng-zoom` the whole strip. Month views are
   * detached rather than destroyed, so returning to the day level costs an
   * `appendChild` per month instead of rebuilding forty-two cells.
   */
  function detachMonths(): void {
    if (monthsDetached) return;
    monthsDetached = true;
    for (const view of monthViews) view.node.remove();
  }

  function attachMonths(): void {
    if (!monthsDetached) return;
    monthsDetached = false;
    for (const view of monthViews) months.appendChild(view.node);
  }

  function createZoomGrid(): ZoomGrid {
    const node = el(doc, 'div', 'dpng-zoom');
    node.setAttribute('role', 'grid');
    return { node, rows: [], cells: [] };
  }

  /**
   * Every level hands over the same twelve cells, so this runs once and the grid
   * is patched from then on. It rebuilds only if the cell count itself changes,
   * which would also change the row count.
   */
  function buildZoomCells(grid: ZoomGrid, count: number): void {
    if (grid.cells.length === count) return;
    grid.node.textContent = '';
    grid.rows.length = 0;
    grid.cells.length = 0;
    for (let index = 0; index < count; index += 1) {
      if (index % ZOOM_COLUMNS === 0) {
        const row = el(doc, 'div', 'dpng-zoom__row', grid.node);
        row.setAttribute('role', 'row');
        grid.rows.push(row);
      }
      const row = grid.rows[grid.rows.length - 1];
      if (!row) continue;
      const node = button(doc, 'dpng-zoom__cell', 'zoom-cell', row);
      node.setAttribute('role', 'gridcell');
      const text = doc.createTextNode('');
      node.appendChild(text);
      grid.cells.push({
        node,
        text,
        key: '',
        date: '',
        label: '',
        aria: '',
        mask: -1,
        tabIndex: '',
      });
    }
  }

  function renderZoomCell(cell: ZoomCellNode, info: ZoomCell): void {
    if (cell.key !== info.key) {
      cell.key = info.key;
      cell.node.dataset['zoom'] = info.key;
    }
    /* `data-zoom` is the React-visible identity; `data-date` is what the
       delegated click handler zooms into, exactly as it is on a day cell. */
    const iso = toISODate(info.date);
    if (cell.date !== iso) {
      cell.date = iso;
      cell.node.dataset['date'] = iso;
    }

    const mask =
      (info.isCurrent ? Z_CURRENT : 0) |
      (info.isSelected ? Z_SELECTED : 0) |
      (info.disabled ? Z_DISABLED : 0);
    if (mask !== cell.mask) {
      cell.mask = mask;
      setClass(cell.node, zoomClassName(mask));
      setFlag(cell.node, 'data-current', (mask & Z_CURRENT) !== 0);
      setFlag(cell.node, 'data-selected', (mask & Z_SELECTED) !== 0);
      setFlag(cell.node, 'data-disabled', (mask & Z_DISABLED) !== 0);
      // Never the native `disabled` attribute, for the same reason the day cell
      // avoids it: an unreachable screen has to stay in the roving tab order the
      // ARIA grid pattern walks.
      setAttr(cell.node, 'aria-disabled', (mask & Z_DISABLED) !== 0 ? 'true' : 'false');
      setAttr(cell.node, 'aria-selected', (mask & Z_SELECTED) !== 0 ? 'true' : 'false');
      setAttr(cell.node, 'aria-current', (mask & Z_CURRENT) !== 0 ? 'date' : null);
    }

    if (cell.label !== info.label) {
      cell.label = info.label;
      setData(cell.text, info.label);
    }
    if (cell.aria !== info.ariaLabel) {
      cell.aria = info.ariaLabel;
      setAttr(cell.node, 'aria-label', info.ariaLabel || null);
    }

    const tabIndex = String(info.tabIndex);
    if (cell.tabIndex !== tabIndex) {
      cell.tabIndex = tabIndex;
      cell.node.setAttribute('tabindex', tabIndex);
    }
  }

  function renderZoom(snapshot: CalendarSnapshot): void {
    const zoom = snapshot.zoom;
    const grid = zoomGrid ?? (zoomGrid = createZoomGrid());
    buildZoomCells(grid, zoom.cells.length);
    if (grid.node.parentElement !== months) months.appendChild(grid.node);
    setAttr(grid.node, 'aria-label', zoom.label);

    for (let index = 0; index < grid.cells.length; index += 1) {
      const cell = grid.cells[index];
      const info = zoom.cells[index];
      if (cell && info) renderZoomCell(cell, info);
    }
  }

  /* --------------------------------- presets -------------------------------- */

  function renderPresets(snapshot: CalendarSnapshot, cfg: RenderConfig): void {
    const wantPresets = flag(cfg.showPresets, true) && snapshot.presets.length > 0;
    const wantClear = flag(cfg.showClear, true);
    show(presets, wantPresets || wantClear);
    setAttr(presets, 'role', wantPresets ? 'group' : null);
    setAttr(presets, 'aria-label', wantPresets ? snapshot.labels.presetsLabel : null);

    const list = wantPresets ? snapshot.presets : [];
    while (chips.length > list.length) {
      const chip = chips.pop();
      chip?.node.remove();
    }
    while (chips.length < list.length) {
      const node = button(doc, 'dpng-preset', 'preset');
      // See the note in `getPresetProps`: a label leading with a number would
      // otherwise be reordered by the bidi algorithm in an RTL calendar.
      node.setAttribute('dir', 'auto');
      presets.insertBefore(node, clearButton);
      const label = el(doc, 'span', undefined, node);
      chips.push({ node, label, hint: null, id: '', state: '' });
    }

    for (let index = 0; index < list.length; index += 1) {
      const preset = list[index];
      const chip = chips[index];
      if (!preset || !chip) continue;

      if (chip.id !== preset.id) {
        chip.id = preset.id;
        chip.node.dataset['preset'] = preset.id;
        setText(chip.label, preset.label);
      }

      const active = !preset.disabled && isPresetActive(preset, snapshot, cfg);
      const hint = preset.resolvedHint ?? preset.hint ?? '';
      const state = `${active ? 1 : 0}${preset.disabled ? 1 : 0}${preset.label} ${hint} ${preset.shortcut ?? ''}`;
      if (state === chip.state) continue;
      chip.state = state;

      setText(chip.label, preset.label);
      let className = 'dpng-preset';
      if (active) className += ' dpng-preset--active';
      if (preset.disabled) className += ' dpng-preset--disabled';
      setClass(chip.node, className);
      setFlag(chip.node, 'data-active', active);
      setFlag(chip.node, 'data-disabled', preset.disabled);
      chip.node.disabled = preset.disabled;
      setAttr(chip.node, 'aria-pressed', active ? 'true' : 'false');
      setAttr(
        chip.node,
        'aria-keyshortcuts',
        preset.shortcut ? preset.shortcut.toUpperCase() : null,
      );

      if (hint) {
        if (!chip.hint) chip.hint = el(doc, 'span', 'dpng-preset__hint', chip.node);
        setText(chip.hint, hint);
      } else if (chip.hint) {
        chip.hint.remove();
        chip.hint = null;
      }
    }

    show(clearButton, wantClear);
    if (wantClear) {
      setText(clearButton, snapshot.labels.clear);
      clearButton.disabled = !snapshot.canClear;
    }
  }

  /* ---------------------------------- time ---------------------------------- */

  function renderTime(snapshot: CalendarSnapshot, cfg: RenderConfig): void {
    const options = cfg.time;
    const visible = flag(cfg.showTime, !!options?.enabled);
    show(time, visible);
    if (!visible) return;

    const formatters = cfg.formatters ?? defaultFormatters;
    const step = Math.max(1, Math.trunc(options?.minuteStep ?? 30));
    const use12 =
      options?.use12Hours === undefined || options.use12Hours === 'locale'
        ? undefined
        : options.use12Hours;
    const signature = `${step} ${String(use12)} ${snapshot.locale}`;
    if (signature !== timeOptionsSignature) {
      timeOptionsSignature = signature;
      for (const select of [startTimeSelect, endTimeSelect]) {
        select.textContent = '';
        const empty = el(doc, 'option', undefined, select);
        empty.value = '';
        empty.textContent = '--:--';
        for (let minutes = 0; minutes < 24 * 60; minutes += step) {
          const value: PlainTime = {
            hour: Math.floor(minutes / 60),
            minute: minutes % 60,
            second: 0,
          };
          const node = el(doc, 'option', undefined, select);
          node.value = `${pad2(value.hour)}:${pad2(value.minute)}`;
          node.textContent = formatters.time(value, snapshot.locale, use12 ?? true);
        }
      }
    }

    const times = snapshot.value.times;
    setText(startTimeText, snapshot.labels.startLabel);
    setText(endTimeText, snapshot.labels.endLabel);
    show(endTimeField, snapshot.endLabel !== '');
    const startValue = times?.start ? `${pad2(times.start.hour)}:${pad2(times.start.minute)}` : '';
    const endValue = times?.end ? `${pad2(times.end.hour)}:${pad2(times.end.minute)}` : '';
    if (startTimeSelect.value !== startValue) startTimeSelect.value = startValue;
    if (endTimeSelect.value !== endValue) endTimeSelect.value = endValue;
  }

  /* --------------------------------- footer --------------------------------- */

  function renderFooter(snapshot: CalendarSnapshot, cfg: RenderConfig): void {
    const visible = flag(cfg.showFooter, false);
    show(footer, visible);
    if (!visible) return;

    const invalid = !snapshot.validation.valid;
    setText(footerInfo, invalid ? (snapshot.validation.message ?? '') : snapshot.summary);
    setFlag(footerInfo, 'data-invalid', invalid);

    const modal = (cfg.variant ?? 'inline') !== 'inline';
    const wantToday = flag(cfg.showTodayButton, true);
    const wantCancel = flag(cfg.showCancelButton, modal);
    const wantApply = flag(cfg.showApplyButton, modal);
    show(todayButton, wantToday);
    show(cancelButton, wantCancel);
    show(applyButton, wantApply);
    if (wantToday) setText(todayButton, snapshot.labels.today);
    if (wantCancel) setText(cancelButton, snapshot.labels.cancel);
    if (wantApply) {
      setText(applyButton, snapshot.labels.apply);
      applyButton.disabled = !snapshot.isComplete || invalid;
    }
  }

  /* ---------------------------------- render -------------------------------- */

  function render(snapshot: CalendarSnapshot, next?: RenderConfig): void {
    if (destroyed) return;
    if (next) current = next;
    const cfg = current;

    const firstMonth = snapshot.months[0];
    const firstWeek = firstMonth?.weeks[0];
    /* The snapshot has no `showWeekNumbers` flag; the core only fills
       `weekNumberLabel` when the column is on, which is the same signal. */
    const weekNumbers = !!firstWeek && firstWeek.weekNumberLabel !== '';
    const captions = flag(cfg.showMonthCaptions, snapshot.months.length > 1);
    zoomed = snapshot.view !== 'day';

    // Cells are reused by position, so yesterday's keys would otherwise point at
    // cells that now show a different date. The map is rebuilt as the grid patches.
    dayByKey.clear();

    renderRoot(snapshot, cfg, weekNumbers);
    renderHeader(snapshot, cfg);
    renderFields(snapshot, cfg);
    renderNav(snapshot, cfg, captions);
    if (zoomed) {
      detachMonths();
      renderZoom(snapshot);
    } else {
      zoomGrid?.node.remove();
      attachMonths();
      renderMonths(snapshot, cfg, weekNumbers, captions);
    }
    renderTime(snapshot, cfg);
    renderPresets(snapshot, cfg);
    renderFooter(snapshot, cfg);

    if (flag(cfg.showLiveRegion, true)) {
      show(live, true);
      setText(live, snapshot.announcement);
    } else {
      show(live, false);
    }
  }

  function focusDay(key?: string): boolean {
    if (destroyed) return false;
    /* Above the day level the zoom grid owns the roving tabindex and `key` — an
       ISO day — has no cell to land on, so the grid's own tab stop wins. Callers
       can keep passing `focusedDate` at every level. */
    const selector = zoomed ? '.dpng-zoom__cell[tabindex="0"]' : '.dpng-day[tabindex="0"]';
    const cell = zoomed || !key ? undefined : dayByKey.get(key);
    const node = cell?.node ?? root.querySelector<HTMLButtonElement>(selector) ?? null;
    if (!node || node.disabled) return false;
    node.focus();
    return true;
  }

  function focusables(): HTMLElement[] {
    if (destroyed) return [];
    const nodes = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const out: HTMLElement[] = [];
    for (const node of Array.from(nodes)) {
      if (node.tabIndex < 0 || node.hasAttribute('disabled')) continue;
      if (!isRendered(node, root)) continue;
      out.push(node);
    }
    return out;
  }

  function destroy(): void {
    destroyed = true;
    backdrop = null;
    sheet = null;
    // Detached while zoomed, so `root.textContent = ''` cannot reach them; the
    // caches are the only thing keeping them alive.
    for (const view of monthViews) view.node.remove();
    zoomGrid?.node.remove();
    zoomGrid = null;
    navLabelButton = null;
    zoomed = false;
    monthsDetached = false;
    dayByKey.clear();
    monthViews.length = 0;
    chips.length = 0;
    root.textContent = '';
    root.remove();
  }

  return { root, render, focusDay, focusables, destroy };
}

/** Everything tabbable the picker can contain, in DOM order. */
export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** `offsetParent` is unusable under jsdom, so hidden ancestors are walked instead. */
function isRendered(node: HTMLElement, boundary: HTMLElement): boolean {
  let current: HTMLElement | null = node;
  while (current) {
    if (current.style.display === 'none' || current.style.visibility === 'hidden') return false;
    if (current === boundary) return true;
    current = current.parentElement;
  }
  return true;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * `ResolvedPreset.isActive` takes a {@link PresetContext}. The snapshot carries
 * every field a preset can legitimately read at render time, so the context is
 * rebuilt from it rather than threading engine internals through the renderer.
 * A custom `isActive` is user code and may throw — a broken chip must never take
 * the calendar down with it.
 */
function isPresetActive(
  preset: ResolvedPreset,
  snapshot: CalendarSnapshot,
  cfg: RenderConfig,
): boolean {
  const ctx: PresetContext = {
    today: snapshot.today,
    mode: snapshot.mode,
    value: snapshot.value,
    anchor: snapshot.anchor,
    focusedDate: snapshot.focusedDate,
    firstDayOfWeek: snapshot.weekdays[0]?.weekday ?? 0,
    rangeSemantics: cfg.rangeSemantics ?? 'nights',
    clamp: (value) => value,
  };
  try {
    return preset.isActive(snapshot.value, ctx);
  } catch {
    return false;
  }
}

/** Resolve the ISO key of the day cell an event landed in, if any. */
export function dayKeyOf(target: Element | null): string | null {
  const node = target?.closest<HTMLElement>('.dpng-day[data-date]');
  return node?.dataset['date'] ?? null;
}

/**
 * Resolve the ISO date a zoomed-out cell steps into — the first day of its
 * month, year or decade — for an event that landed inside one.
 */
export function zoomDateOf(target: Element | null): string | null {
  const node = target?.closest<HTMLElement>('.dpng-zoom__cell[data-date]');
  return node?.dataset['date'] ?? null;
}
