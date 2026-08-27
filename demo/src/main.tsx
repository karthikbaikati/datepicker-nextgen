/**
 * Showcase entry point.
 *
 * Stylesheet order matters: the library's tokens and component rules first,
 * then every optional theme (each one is a `[data-theme]` token block and
 * nothing else), then the page's own styles last so the demo chrome can never
 * be outranked by a theme it did not expect.
 *
 * The themes are imported by path rather than through the package's
 * `./themes/*.css` export because this app builds straight from source; in a
 * consuming app the import is `datepicker-nextgen/themes/emerald.css`.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import 'datepicker-nextgen/styles.css';
import '../../src/styles/themes/midnight.css';
import '../../src/styles/themes/emerald.css';
import '../../src/styles/themes/rose.css';
import '../../src/styles/themes/mono.css';
import '../../src/styles/themes/glass.css';
import '../../src/styles/themes/high-contrast.css';
import './demo.css';

import { App } from './app';

const container = document.getElementById('root');

if (!container) {
  throw new Error('[demo] #root is missing from index.html — nothing to mount into.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
