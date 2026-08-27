import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Flat config. The rules that earn their place here are the ones a typechecker
 * cannot catch: hook dependency mistakes, floating promises, and accidental
 * `any` leaking into the public API.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'dist-demo/**', 'coverage/**', 'node_modules/**', '*.config.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // The library ships `unknown` in public signatures and narrows internally;
      // an explicit `any` is always a smell worth a second look.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Reading a `T | undefined` from an index is deliberate here — the code
      // guards it — so the template-expression rules stay off the noisy setting.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowNullish: false },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Every "method" here is an arrow function held on a plain object — the
      // prop getters from `useDatePicker`, and the engine methods the hook
      // already wraps in arrows. There is no `this` to lose, so this rule only
      // fires on destructuring that is entirely safe.
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['src/react/**/*.{ts,tsx}', 'demo/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Node build scripts are plain ESM and deliberately outside the TS project,
    // so the type-aware rules have nothing to work with.
    files: ['scripts/**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
);
