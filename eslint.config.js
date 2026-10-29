import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import unused from 'eslint-plugin-unused-imports';
export default tseslint.config(
  { ignores: ['dist/**', 'dist-server/**', 'node_modules/**', 'data/**', 'playwright-report/**', 'test-results/**', 'public/demo/**'] },
  js.configs.recommended, ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } }, rules: { '@typescript-eslint/no-explicit-any': 'error', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } },
  { files: ['src/**/*.{ts,tsx}'], plugins: { 'react-hooks': hooks, 'unused-imports': unused }, rules: { 'unused-imports/no-unused-imports': 'error', '@typescript-eslint/no-unused-vars':'off', 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' } },
  { files: ['src/components/ui.tsx','src/lib/store.tsx'], rules: {'@typescript-eslint/no-explicit-any':'off'} },
  { files: ['*.js'], languageOptions: { globals: globals.node } }
);
