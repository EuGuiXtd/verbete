import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Runs against the production build only, never the dev server: a previous
 * project in this codebase's lineage found that the dev server's on-demand
 * route compilation produced false negatives here. `vite preview` serves
 * the exact static `dist/` output that ships to production — the same
 * bytes nginx will hand a real player — so a pass here means something a
 * pass against `vite dev` would not.
 *
 * `test:e2e` (see package.json) runs `vite build` immediately before
 * `playwright test`, so `dist/` is always fresh when this config's
 * `webServer` starts `vite preview` against it.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    // A registered service worker is a chronic source of Playwright flake:
    // it caches between runs, races its own registration against
    // navigation, and produces failures that look like product bugs in
    // every one of these specs, none of which is testing PWA behaviour.
    // Blocked here, at the context level, for every spec by default;
    // e2e/pwa-offline.spec.ts — the one spec whose entire point IS the
    // service worker — opts back in with its own `test.use({ serviceWorkers:
    // 'allow' })`.
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `vite preview --port ${String(PORT)} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
