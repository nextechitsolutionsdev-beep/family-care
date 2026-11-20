import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{js,jsx,ts,tsx}', 'scripts/**/*.mjs', 'supabase/functions/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node, Deno: 'readonly' } },
  },
];
