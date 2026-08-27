/**
 * The Voyanta travel experience, in one import.
 *
 * Everything under `travel/` is demo chrome: the library is imported by each
 * section directly from `datepicker-nextgen`, exactly the way an application
 * would import it.
 */

export { Hero } from './hero';
export type { HeroProps } from './hero';
export { INITIAL_TRIP } from './defaults';

export { StaySection } from './stay';
export { FlySection } from './fly';
export { DoSection } from './experiences';
export { TogetherSection } from './together';
export { SeasonSection } from './season';
export { ThemeSection, THEME_OPTIONS } from './theming';
export type { ThemeOption, ThemeSectionProps } from './theming';

export { Topbar } from './topbar';
export { TravelSection, PropNote } from './section';
export { Reveal, useMediaQuery, useMotionAllowed } from './motion';
export { TravelThemeProvider, usePickerScope, useTravelTheme } from './scope';
export type { Accent, Appearance, PickerScope, TravelThemeState } from './scope';
export { VoyantaMark, PlaneGlyph, CompassGlyph } from './scenery';
