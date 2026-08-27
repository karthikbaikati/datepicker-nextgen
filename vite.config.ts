import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/** Paths are resolved against this file, not the cwd, so the demo builds and
 *  serves identically however the command is invoked. */
const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: at('./demo'),
  base: './',
  plugins: [react()],
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
