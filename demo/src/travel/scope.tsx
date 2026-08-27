/**
 * How the travel page themes the pickers it embeds.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: the demo never restyles the picker's
 * internals. It only sets documented `--dpng-*` tokens, and it sets them on
 * the picker's own root element through the `className` prop — the element the
 * library itself declares those tokens on, which is the only place an override
 * can win the cascade.
 *
 * Each section asks for an accent by name (`tide`, `sea`, `shallow`, …) and
 * gets back a class plus the `data-theme` value to hand the picker. When the
 * visitor picks one of the bundled themes from "Make it yours", the accent
 * classes step aside so the chosen theme owns the whole page — which is the
 * honest behaviour: a theme file should not be fighting the demo for tokens.
 */

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

export type Appearance = 'light' | 'dark';

/**
 * The accents the travel sections may ask for — a walk down one beach day, from
 * the open sea at the horizon to the last of the light. Each is a block in
 * travel.css.
 */
export type Accent = 'tide' | 'sea' | 'shallow' | 'sunset' | 'indigo';

export interface TravelThemeState {
  /** The switcher's raw value: `default`, or a bundled theme id. */
  readonly theme: string;
  readonly appearance: Appearance;
}

const TravelThemeContext = createContext<TravelThemeState>({
  theme: 'default',
  appearance: 'light',
});

export interface TravelThemeProviderProps extends TravelThemeState {
  children: ReactNode;
}

export function TravelThemeProvider({
  theme,
  appearance,
  children,
}: TravelThemeProviderProps): ReactNode {
  const value = useMemo<TravelThemeState>(() => ({ theme, appearance }), [appearance, theme]);
  return <TravelThemeContext.Provider value={value}>{children}</TravelThemeContext.Provider>;
}

/** The current switcher state, for the theme gallery and the topbar. */
export function useTravelTheme(): TravelThemeState {
  return useContext(TravelThemeContext);
}

export interface PickerScope {
  /** Hand straight to `<DatePicker theme={…}>`. */
  readonly theme: string;
  /** Hand straight to `<DatePicker className={…}>` — tokens only, no internals. */
  readonly className: string;
}

/**
 * The `theme` and `className` a section's pickers should carry.
 *
 * `default` is not a stylesheet: it means "follow the page", so it resolves to
 * the library's own light or dark token set and lets the section accent apply.
 */
export function usePickerScope(accent: Accent): PickerScope {
  const { theme, appearance } = useTravelTheme();
  return useMemo<PickerScope>(
    () => ({
      theme: theme === 'default' ? appearance : theme,
      className: theme === 'default' ? `vy-scope vy-scope--${accent}` : 'vy-scope',
    }),
    [accent, appearance, theme],
  );
}
