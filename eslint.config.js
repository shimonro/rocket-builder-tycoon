import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const ENGINES = ['builder', 'journey', 'levels', 'progression', 'shop', 'tutorial'];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  // Engines stay independent: no engine imports another engine, and none import UI, state or services.
  ...ENGINES.map((engine) => ({
    files: [`src/engines/${engine}/**/*.ts`],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ENGINES.filter((e) => e !== engine).map((e) => `**/engines/${e}/**`).concat(ENGINES.filter((e) => e !== engine).map((e) => `../${e}/**`)), message: 'Engines must not import other engines.' },
            { group: ['**/ui/**', '**/state/**', '**/services/**'], message: 'Engines must stay free of UI, state and services.' },
          ],
        },
      ],
    },
  })),
);
