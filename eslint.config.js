import { defineConfig } from 'eslint/config';

import crycode from '@crycode/eslint-config';

export default defineConfig(
  ...crycode.configs.ts,
  ...crycode.configs.stylistic,

  /*
   * Options for all files
   */
  {
    ignores: [
      'dist/',
      'dist-pages/',
      'coverage/',
      'pages/',
    ],
  },
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
        project: [
          './tsconfig.dev.json',
        ],
      },
    },
  },

  /*
   * Options for build scripts
   */
  {
    files: [
      'scripts/*',
    ],

    languageOptions: {
      parserOptions: {
        project: [
          './scripts/tsconfig.json',
        ],
      },
    },

    rules: {
      'no-console': 'off',
    },
  },
);
