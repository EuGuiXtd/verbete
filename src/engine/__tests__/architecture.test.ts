import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const ENGINE_DIR = new URL('..', import.meta.url).pathname;
const FORBIDDEN = [
  'window', 'document', 'localStorage', 'sessionStorage', 'navigator',
  'Date.now', 'new Date', 'Math.random', 'fetch(', "from 'react'",
];

// Per-file exceptions to the forbidden-token list above. Keep this list to a
// single named file and a single named token; do not add broader exemptions.
const EXEMPTIONS: Record<string, readonly string[]> = {
  // clock.ts converts an epoch-day integer to a calendar string. That reads
  // no host clock; the ban exists to stop the engine reading real time.
  'clock.ts': ['new Date'],
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : sourceFiles(full);
    }
    // `.ts` AND `.tsx`: the ESLint zone that mirrors this check is
    // `src/engine/**/*.{ts,tsx}` (eslint.config.js), and the comment there
    // claims the two gates "reject exactly the same set". They did not — a
    // `src/engine/__probe.tsx` carrying `Math.random()` and `Date.now()`
    // produced two ESLint errors and zero failures here, because this
    // filter matched only `.ts`. Nothing in the engine is a `.tsx` today,
    // which is exactly why the hole was invisible.
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe('engine purity', () => {
  const files = sourceFiles(ENGINE_DIR);

  it('scans the same file extensions ESLint does, so the two gates cannot disagree', () => {
    // The parity claim is made in prose in eslint.config.js and in commit
    // d94fa7d's own title, and it was false: `sourceFiles` matched only
    // `.ts` while the ESLint zone is `**/*.{ts,tsx}`, so a `.tsx` engine
    // file calling `Math.random()` produced two lint errors and zero
    // failures here. This drives the REAL function over a real directory —
    // reproducing the regex inline would pass no matter what `sourceFiles`
    // went on to do.
    const dir = mkdtempSync(join(tmpdir(), 'verbete-arch-'));
    try {
      for (const name of ['pure.ts', 'component.tsx', 'styles.css', 'data.json', 'legacy.js']) {
        writeFileSync(join(dir, name), 'export const x = 1;\n', 'utf8');
      }
      mkdirSync(join(dir, '__tests__'));
      writeFileSync(join(dir, '__tests__', 'skipped.ts'), 'export const y = 1;\n', 'utf8');

      expect(sourceFiles(dir).map((file) => basename(file)).sort()).toEqual([
        'component.tsx',
        'pure.ts',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // it.each([]) throws rather than passing silently, and src/engine/ has no
  // sources yet at this stage of the project. Guard the empty case so this
  // suite passes vacuously until Task 2 adds engine files.
  if (files.length === 0) {
    it('has no engine source files yet', () => {
      expect(files).toEqual([]);
    });
    return;
  }

  it.each(files)('%s touches no host API', (file) => {
    const source = readFileSync(file, 'utf8');
    const exempt = EXEMPTIONS[basename(file)] ?? [];
    const found = FORBIDDEN.filter((token) => source.includes(token) && !exempt.includes(token));
    expect(found, `forbidden tokens in ${file}`).toEqual([]);
  });
});
