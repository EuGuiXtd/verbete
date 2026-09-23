// CI-safe subset of `pnpm dict:check`: verifies the COMMITTED generated
// files' own internal invariants without regenerating anything, so it needs
// none of data/raw/ — which is gitignored (see fetch-sources.ts) and does
// not exist on a clean checkout, including every GitHub Actions runner.
//
// This does NOT confirm the committed files are a fresh build of the raw
// sources (only `pnpm dict:check`, run locally after `pnpm sources:fetch`,
// does that — see that script's doc comment for why it can't run in CI: the
// Wiktionary dump it depends on is a rolling upstream release, so a CI run
// on someone else's release schedule would fail for reasons unrelated to
// this repo's own changes). What this DOES confirm, by decoding the
// committed files and running the exact same assertions the build itself
// runs before ever writing them (see assertBuildInvariants and
// assertDefinitionsDoNotSpoil in build-dictionary.ts — reused here, not
// reimplemented, so the two checks cannot drift apart):
//
//   - every answer normalizes to an accepted guess (otherwise unplayable)
//   - every answer normalizes to exactly five A-Z letters
//   - no two answers share a normalized key (a player would type it, win,
//     and be shown a different word)
//   - at least DAILY_POOL_SIZE answers exist
//   - every answer has a definition, so no board can ever reveal nothing
//     (the daily pool is the first DAILY_POOL_SIZE of them, and the reveal
//     is the point of the game — see assertBuildInvariants)
//   - no shipped definition contains its own answer's stem (a spoiler)
//
// Run with: pnpm dict:verify

import { assertBuildInvariants, assertDefinitionsDoNotSpoil } from './build-dictionary';
import { decodeWord, unpackWords } from '../src/data/codec';
import { GUESSES_B64, GUESSES_COUNT } from '../src/data/guesses.generated';
import { ANSWERS } from '../src/data/answers.generated';
import definitions from '../src/data/definitions.generated.json';

function main(): void {
  const guesses = Array.from(unpackWords(GUESSES_B64, GUESSES_COUNT), decodeWord);

  assertBuildInvariants(guesses, [...ANSWERS], definitions);
  assertDefinitionsDoNotSpoil(definitions);

  console.log(
    `dict:verify OK — ${guesses.length} guesses, ${ANSWERS.length} answers, ` +
      `${Object.keys(definitions).length} definitions, all invariants hold.`,
  );
}

main();
