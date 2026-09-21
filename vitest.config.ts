import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['src/ui/**', 'jsdom'],
      ['src/state/**', 'jsdom'],
      ['src/storage/**', 'jsdom'],
    ],
  },
});
