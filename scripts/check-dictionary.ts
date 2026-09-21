// CI gate: regenerates the dictionary into a temp directory and byte-compares
// it against the committed src/data/*.generated.ts files. Exits non-zero if
// they differ (raw sources changed, blocklist changed, or generation logic
// changed without rerunning `pnpm dict:build`), so a stale committed
// dictionary cannot merge.
//
// Run with: pnpm dict:check

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildDictionary,
  assertBuildInvariants,
  assertDefinitionsDoNotSpoil,
  writeGeneratedFiles,
} from './build-dictionary';

const COMMITTED_DIR = 'src/data';
const GENERATED_FILES = ['guesses.generated.ts', 'answers.generated.ts', 'definitions.generated.json'];

async function main(): Promise<void> {
  const { guesses, answers, definitions } = await buildDictionary();
  assertBuildInvariants(guesses, answers);
  assertDefinitionsDoNotSpoil(definitions);

  const tempDir = await mkdtemp(join(tmpdir(), 'verbete-dict-check-'));
  try {
    await writeGeneratedFiles(tempDir, guesses, answers, definitions);

    const stale: string[] = [];
    for (const file of GENERATED_FILES) {
      const fresh = await readFile(join(tempDir, file));
      const committed = await readFile(join(COMMITTED_DIR, file)).catch(() => null);
      if (committed === null || !fresh.equals(committed)) {
        stale.push(file);
      }
    }

    if (stale.length > 0) {
      console.error(
        `dict:check failed: committed dictionary is stale or missing. Run ` +
          `\`pnpm dict:build\` and commit the result. Differing files: ${stale.join(', ')}`,
      );
      process.exitCode = 1;
      return;
    }

    console.log('dict:check OK — committed dictionary matches a fresh build byte-for-byte.');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

await main();
