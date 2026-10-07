import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import noRelativeImportPaths from 'eslint-plugin-no-relative-import-paths';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['target/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: { 'no-relative-import-paths': noRelativeImportPaths },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      'prefer-arrow-callback': 'warn',
      'prefer-const': 'warn',
      'no-relative-import-paths/no-relative-import-paths': 'warn',
    },
  },
);
