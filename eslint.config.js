import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

// Host-API syntax the engine may never touch, matched by AST shape rather
// than plain identifiers (Date.now / Math.random / fetch() are member or
// call expressions, not bare globals). Kept in sync with the FORBIDDEN
// token list in src/engine/__tests__/architecture.test.ts so ESLint and the
// architecture test reject exactly the same set.
const ENGINE_HOST_API_SYNTAX = [
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message: 'engine/ must not read Date.now(). See Global Constraints: engine/ touches no host API.',
  },
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message: 'engine/ must not call Math.random(). See Global Constraints: engine/ touches no host API.',
  },
  {
    selector: "CallExpression[callee.name='fetch']",
    message: 'engine/ must not call fetch(). See Global Constraints: engine/ touches no host API.',
  },
];

// `new Date(...)` is banned everywhere in engine/ except clock.ts, which
// converts an epoch-day integer into a calendar string and reads no host
// clock to do it. This is the single named exception, for this single
// named file and this single named construct; Date.now stays banned in
// clock.ts too (see the clock.ts override below).
const ENGINE_NEW_DATE_SYNTAX = {
  selector: "NewExpression[callee.name='Date']",
  message: 'engine/ must not construct new Date(). See Global Constraints: engine/ touches no host API.',
};

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
    },
  },
  {
    // engine/ touches no host API: no DOM/storage globals, no Date.now,
    // Math.random, fetch or new Date, and no React. Mirrors the FORBIDDEN
    // list in src/engine/__tests__/architecture.test.ts so both gates
    // reject the same violations.
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'navigator'],
      'no-restricted-syntax': ['error', ...ENGINE_HOST_API_SYNTAX, ENGINE_NEW_DATE_SYNTAX],
      'no-restricted-imports': ['error', {
        paths: [{ name: 'react', message: 'engine/ is React-free.' }],
      }],
    },
  },
  {
    // clock.ts is exempt from the new-Date ban only; every other host-API
    // rule above, including Date.now, still applies to it.
    files: ['src/engine/clock.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...ENGINE_HOST_API_SYNTAX],
    },
  },
  {
    // Task 12 amendment: engine test files are exempt from the new-Date and
    // Date.now bans, and from nothing else. A test building a fixed UTC
    // timestamp (e.g. `new Date(Date.UTC(...))`) to drive the injected clock
    // is exercising the engine deterministically, not reaching for a host
    // clock. Math.random and fetch stay banned here: a blanket __tests__
    // exemption would let a test reach for Math.random and go nondeterministic,
    // which is exactly what engine purity exists to prevent. This mirrors the
    // architecture test's __tests__ skip in src/engine/__tests__/architecture.test.ts,
    // which already excludes test files from the FORBIDDEN-token scan; do not
    // widen this beyond new Date / Date.now.
    files: ['src/engine/__tests__/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ENGINE_HOST_API_SYNTAX[1], ENGINE_HOST_API_SYNTAX[2]],
    },
  },
];
