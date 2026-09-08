import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/** Paths are resolved against this file, not the cwd, so the demo builds and
 *  serves identically however the command is invoked. */
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Matches every `<script>` element that has no `src` — i.e. inline script —
 *  capturing its exact body. The body is hashed byte-for-byte, so the policy
 *  can never drift from what the HTML actually contains. */
const INLINE_SCRIPT = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;

/** Every `style="…"` attribute. The policy allows no inline styles, so a build
 *  that contains one must fail loudly rather than ship a page that silently
 *  drops those declarations. */
const INLINE_STYLE_ATTRIBUTE = /\sstyle\s*=/i;

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('base64');

/**
 * Injects a strict Content-Security-Policy and a referrer policy into the built
 * demo page.
 *
 * GitHub Pages cannot send response headers, so the policy has to travel as a
 * `<meta http-equiv>` tag. The one inline script on the page (the dark-mode
 * flash preventer) is allow-listed by hash; the hash is computed here, at build
 * time, over the body Vite emits, so it is correct by construction.
 *
 * Build only: in dev, `@vitejs/plugin-react` injects its own inline React
 * Refresh preamble and Vite opens an HMR websocket, both of which this policy
 * would forbid. `apply: 'build'` keeps `vite dev` exactly as it was.
 *
 * `frame-ancestors` is deliberately absent — the spec ignores it when the
 * policy is delivered via `<meta>`, so listing it would only mislead a reader
 * into thinking the page is protected against framing when it is not.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'demo:content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      // Run after Vite has finished rewriting the HTML, so the hash is taken
      // over the final document rather than the source template.
      order: 'post',
      handler(html): string {
        const inlineScripts = [...html.matchAll(INLINE_SCRIPT)].map((match) => match[1] ?? '');
        if (inlineScripts.length !== 1) {
          throw new Error(
            `demo:content-security-policy expected exactly one inline <script> in index.html ` +
              `(the dark-mode flash preventer) but found ${inlineScripts.length}. ` +
              `Add its hash to the policy or move the code into the module bundle.`,
          );
        }
        if (INLINE_STYLE_ATTRIBUTE.test(html)) {
          throw new Error(
            `demo:content-security-policy found a style="…" attribute in index.html. ` +
              `The policy forbids inline styles; move the declarations into demo.css.`,
          );
        }

        const scriptHashes = inlineScripts.map((body) => `'sha256-${sha256(body)}'`).join(' ');
        const policy = [
          `default-src 'none'`,
          `script-src 'self' ${scriptHashes}`,
          // Google Fonts serves the stylesheet from one origin and the font
          // files from another. React, the demo's motion helpers and the
          // library's vanilla renderer all style elements through the CSSOM,
          // which `style-src` does not govern, so no 'unsafe-inline' is needed.
          `style-src 'self' https://fonts.googleapis.com`,
          `font-src https://fonts.gstatic.com`,
          // The favicon is a data: URI declared in index.html.
          `img-src 'self' data:`,
          `connect-src 'none'`,
          `base-uri 'none'`,
          `form-action 'none'`,
          `object-src 'none'`,
          `upgrade-insecure-requests`,
        ].join('; ');

        // The tags are written into the document directly rather than returned
        // as tag descriptors: Vite's serializer HTML-escapes the policy's
        // single quotes to `&#39;`, which browsers decode correctly but which
        // leaves the raw HTML unreadable to anyone auditing it. They go
        // immediately after `<meta charset>` so the charset declaration stays
        // first and the policy is in force before the font stylesheet and the
        // inline script it allow-lists are parsed.
        const tags = [
          `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
          `<meta name="referrer" content="strict-origin-when-cross-origin" />`,
        ];
        const anchor = html.match(/^([ \t]*)<meta\s+charset=[^>]*>/im);
        if (!anchor || anchor.index === undefined) {
          throw new Error(
            `demo:content-security-policy could not find <meta charset> in index.html ` +
              `to anchor the policy after.`,
          );
        }
        const indent = anchor[1] ?? '';
        const insertAt = anchor.index + anchor[0].length;
        const injected = tags.map((tag) => `\n${indent}${tag}`).join('');
        return html.slice(0, insertAt) + injected + html.slice(insertAt);
      },
    },
  };
}

export default defineConfig({
  root: at('./demo'),
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  resolve: {
    alias: {
      'datepicker-nextgen/core': at('./src/core/index.ts'),
      'datepicker-nextgen/vanilla': at('./src/vanilla/index.ts'),
      'datepicker-nextgen/styles.css': at('./src/styles/styles.css'),
      'datepicker-nextgen': at('./src/react/index.ts'),
    },
  },
  build: { outDir: at('./dist-demo'), emptyOutDir: true },
});
