import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
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
    return entry.endsWith('.ts') ? [full] : [];
  });
}

describe('engine purity', () => {
  const files = sourceFiles(ENGINE_DIR);

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
