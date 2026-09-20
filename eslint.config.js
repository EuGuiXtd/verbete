import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { import: importPlugin },
    rules: {
      'import/no-restricted-paths': ['error', {
        zones: [{
          target: './src/engine',
          from: './src',
          except: ['./engine'],
          message: 'engine/ must not import from outside engine/. See Global Constraints.',
        }],
      }],
      'no-restricted-imports': ['error', {
        paths: [{ name: 'react', message: 'engine/ is React-free.' }],
      }],
    },
  },
  {
    // Complements import/no-restricted-paths above: that rule only catches
    // cross-boundary *imports*. This catches bare references to host globals
    // (no import needed to reach `localStorage`, `window`, etc.) inside
    // engine/. See Global Constraints: engine/ touches no host API.
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'navigator'],
    },
  },
];
