import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import { defineConfig } from 'eslint/config';
import noRelativeImportPaths from 'eslint-plugin-no-relative-import-paths';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  eslintReact.configs['recommended-typescript'],
  prettierRecommended,
  {
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'no-relative-import-paths': noRelativeImportPaths },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-relative-import-paths/no-relative-import-paths': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      'prefer-arrow-callback': 'warn',
      'prefer-const': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
);
