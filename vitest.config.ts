import { defineConfig } from 'vitest/config';

// Directories whose tests touch the DOM (localStorage, window, React
// rendering, ...) and therefore need jsdom rather than the default node
// environment. Everything else — engine, data — is DOM-free by design and
// runs faster under plain node.
//
// This replaced `environmentMatchGlobs`, which does not exist in the
// installed vitest@5.0.1 (verified by grepping the whole installed package —
// zero matches) and was therefore a silent no-op since Task 1 first wrote
// it; nothing needed a DOM until Task 14's storage tests, so nobody noticed.
// `test.projects` is vitest 5's actual mechanism for a per-directory
// environment split.
const JSDOM_DIRS = ['src/storage', 'src/ui', 'src/state'];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: JSDOM_DIRS.map((dir) => `${dir}/**`),
        },
      },
      {
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: JSDOM_DIRS.map((dir) => `${dir}/**/*.test.{ts,tsx}`),
        },
      },
    ],
  },
});
