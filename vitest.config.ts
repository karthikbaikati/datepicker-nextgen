import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/index.ts'],
      thresholds: { lines: 70, functions: 70, branches: 70, statements: 70 },
    },
  },
  resolve: {
    alias: {
      'datepicker-nextgen/core': fileURLToPath(new URL('./src/core/index.ts', import.meta.url)),
      'datepicker-nextgen/vanilla': fileURLToPath(
        new URL('./src/vanilla/index.ts', import.meta.url),
      ),
      'datepicker-nextgen': fileURLToPath(new URL('./src/react/index.ts', import.meta.url)),
    },
  },
});
