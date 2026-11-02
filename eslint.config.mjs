import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/tmp',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      '**/.angular/**',
      '**/.claude/**',
      '**/.cursor/**',
      '**/src/i18n-types/**', // generated Transloco tokens (apps/tracker)
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          // Apps bundle libraries from source; no consumer uses the standalone library build outputs.
          enforceBuildableLibDependency: false,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts', '**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
    // Override or add rules here
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx,cts,mts,js,jsx,cjs,mjs}'],
    ignores: ['**/*.{spec,test}.{ts,tsx,cts,mts,js,jsx,cjs,mjs}', '**/testing/**', '**/*.spec-helpers.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@simoncodes-ca/core/testing', message: 'Core testing helpers are only for tests.' }],
          patterns: ['@simoncodes-ca/core/testing/*'],
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Separate from `no-restricted-imports` above so neither block overrides the other.
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@angular/animations', '@angular/animations/*', '@angular/platform-browser/animations*'],
              message:
                '@angular/animations is deprecated; use animate.enter/animate.leave. Spectator already disables Material animations in specs.',
            },
          ],
        },
      ],
    },
  },
];
