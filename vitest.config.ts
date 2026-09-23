import type { Plugin } from 'vite';
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

/**
 * `src/ui/feedback/UpdatePrompt.tsx` (Task 24) imports `virtual:pwa-register/react`,
 * a module vite-plugin-pwa only provides for a real build/dev server —
 * vitest never runs either, so without this the import fails to resolve
 * before `vi.mock` (in UpdatePrompt.test.tsx) ever gets a chance to
 * intercept it. The real registration behaviour comes from vite-plugin-pwa
 * itself and is exercised for real in e2e/pwa-offline.spec.ts (against the
 * production build), never here — this stub only needs to exist so the
 * module graph resolves; every test that cares what `useRegisterSW` does
 * replaces it with its own `vi.mock`.
 */
const stubPwaRegisterVirtualModule: Plugin = {
  name: 'stub-virtual-pwa-register',
  resolveId(id) {
    if (id === 'virtual:pwa-register/react') return `\0${id}`;
  },
  load(id) {
    if (id === '\0virtual:pwa-register/react') {
      return `export function useRegisterSW() {
        return {
          needRefresh: [false, () => {}],
          offlineReady: [false, () => {}],
          updateServiceWorker: async () => {},
        };
      }`;
    }
  },
};

export default defineConfig({
  plugins: [stubPwaRegisterVirtualModule],
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
