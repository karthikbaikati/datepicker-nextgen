/**
 * The row of quick-option chips, with `Clear` pinned to the trailing edge.
 *
 * Presets come from `snapshot.presets`, already resolved by the engine: each
 * one has been run once against the current constraints, so `disabled` and
 * `resolvedHint` are ready to render and no chip has to re-compute anything.
 */

import { Fragment, forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

import type { ResolvedPreset } from '../../core/types';
import { useDatePickerContext } from '../context';
import type { DatePickerProps as DomProps } from '../use-date-picker';

/** Props for {@link PresetList}. */
export interface PresetListProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Defaults to `snapshot.presets`. */
  presets?: readonly ResolvedPreset[];
  /**
   * Append the `Clear` action. The stylesheet gives the last `.dpng-button--ghost`
   * in the row `margin-inline-start: auto`, which is what pushes it right.
   */
  showClear?: boolean;
  /** Print each chip's resolved date hint (`Fri – Sun`) beside its label. */
  showHints?: boolean;
  /** Replace a chip. Receives the fully-built DOM props to spread. */
  renderPreset?: (preset: ResolvedPreset, props: DomProps) => ReactNode;
  /** Text of the clear action. Defaults to `labels.clear`. */
  clearLabel?: ReactNode;
}

/** The preset chip row. Renders nothing when there is nothing to show. */
export const PresetList = forwardRef<HTMLDivElement, PresetListProps>(function PresetList(
  { presets, showClear = true, showHints = false, renderPreset, clearLabel, className, ...rest },
  ref,
) {
  const { snapshot, getPresetProps, getClearProps } = useDatePickerContext();
  const items = presets ?? snapshot.presets;

  if (items.length === 0 && !showClear) return null;

  return (
    <div
      {...rest}
      ref={ref}
      className={className ? `dpng-presets ${className}` : 'dpng-presets'}
      role="group"
      aria-label={snapshot.labels.presetsLabel}
    >
      {items.map((preset) => {
        const props = getPresetProps(preset);
        if (renderPreset) return <Fragment key={preset.id}>{renderPreset(preset, props)}</Fragment>;
        const hint = showHints ? (preset.resolvedHint ?? preset.hint) : undefined;
        return (
          <button key={preset.id} {...props}>
            {preset.label}
            {hint ? <span className="dpng-preset__hint">{hint}</span> : null}
          </button>
        );
      })}
      {showClear ? (
        <button {...getClearProps()}>{clearLabel ?? snapshot.labels.clear}</button>
      ) : null}
    </div>
  );
});
