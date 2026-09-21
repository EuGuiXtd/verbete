import { containsWord, unpackWords } from './codec';
import { GUESSES_B64, GUESSES_COUNT } from './guesses.generated';
import { ANSWERS, DICTIONARY_VERSION } from './answers.generated';
import { DAILY_POOL_SIZE } from '../engine/constants';

/**
 * A fingerprint of the exact `ANSWERS` array the running bundle was built
 * with — see `hashAnswers`'s doc comment in scripts/build-dictionary.ts for
 * why this exists (a stale service worker's word list, made detectable
 * rather than silently wrong). Re-exported through this facade rather than
 * importing `answers.generated` directly elsewhere, matching how every
 * other generated-file symbol in this module is already consumed.
 */
export { DICTIONARY_VERSION };

let table: Int32Array | null = null;

function lookupTable(): Int32Array {
  // Decoded once, lazily: about 1 ms and 40 KB of Int32Array, against the
  // ~1 MB a Set of ten thousand strings would hold.
  table ??= unpackWords(GUESSES_B64, GUESSES_COUNT);
  return table;
}

export function isValidGuess(normalized: string): boolean {
  return containsWord(lookupTable(), normalized);
}

export function answerPool(): readonly string[] {
  return ANSWERS;
}

/**
 * The daily deck permutes indices 0..DAILY_POOL_SIZE-1, so its output depends
 * on the pool's exact size. Slicing to a frozen constant means later additions
 * to ANSWERS extend infinite mode without renumbering every future daily word.
 * See Risk 2 in the spec. Do not make this dynamic.
 */
export function dailyPool(): readonly string[] {
  return ANSWERS.slice(0, DAILY_POOL_SIZE);
}

export function pickRandomAnswer(
  exclude: ReadonlySet<string>,
  rand: () => number,
): string {
  const pool = ANSWERS;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = pool[Math.floor(rand() * pool.length)]!;
    if (!exclude.has(candidate)) return candidate;
  }
  // Exhausted the sampling budget: the exclusion list has grown too dense.
  const open = pool.filter((word) => !exclude.has(word));
  return (open.length > 0 ? open : pool)[Math.floor(rand() * Math.max(open.length, 1))] ?? pool[0]!;
}
