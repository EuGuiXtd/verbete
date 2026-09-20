// Builds the game's two word lists from the raw VERO Hunspell dictionary:
//
//   - guesses.generated.ts — every accepted five-letter guess, as normalized
//     (accent-free, uppercase) comparison keys, packed with the base-26
//     delta-varint codec.
//   - answers.generated.ts — a small curated pool of five-letter answers, in
//     their accented display form, ranked by real-world frequency and
//     restricted to dictionary head-forms (no conjugations or plurals).
//
// Run with: pnpm dict:build
//
// Pipeline (see .superpowers/sdd/2026-09-20-verbete/task-8-brief.md):
//   1. Expand pt_BR.dic against pt_BR.aff (affix rules) with hunspell-reader.
//   2. Keep forms whose NFC length is exactly five Latin letters.
//   3. Drop tokens that appear only capitalized in the .dic (proper nouns,
//      acronyms) — see the note below on why this heuristic, not DELAF_PB.
//   4. The surviving set, normalized, sorted, deduplicated: the guess list.
//   5. Rank pt_br_50k.txt (frequency list) into a lookup.
//   6. Candidate answers: guess-list head-forms present in the frequency
//      list, ranked best first, top ANSWER_TARGET.
//   7. Drop NOSUGGEST-flagged words and the manual data/blocklist.txt.
//   8. Resolve normalization collisions: keep the highest-frequency accented
//      form per comparison key.
//   9. Emit both generated files with the VERO licence header from NOTICE.md.
//
// NOTE on step 3: the original design planned to cross-reference the DELAF_PB
// part-of-speech database to strip proper nouns more precisely. That data was
// never acquired (a large academic download, out of scope — see NOTICE.md).
// This build relies solely on the capitalization heuristic below. A manual
// 100-word sample review of the built answer list is the empirical check on
// whether that heuristic is sufficient — see the Task 8 report.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { HunspellReader } from 'hunspell-reader';
import { normalize, toNfc } from '../src/engine/normalize';
import { packSortedWords } from '../src/data/codec';
import { DAILY_POOL_SIZE } from '../src/engine/constants';

const RAW_DIR = 'data/raw';
const DIC_PATH = `${RAW_DIR}/pt_BR.dic`;
const AFF_PATH = `${RAW_DIR}/pt_BR.aff`;
const FREQUENCY_PATH = `${RAW_DIR}/pt_br_50k.txt`;
const BLOCKLIST_PATH = 'data/blocklist.txt';

const WORD_LENGTH = 5;
const WORD_KEY_RE = /^[A-Z]{5}$/;

/**
 * How many frequency-ranked, head-form candidates to consider before
 * dropping NOSUGGEST/blocklisted words and resolving normalization
 * collisions. The final answer count is usually a little lower than this —
 * see the measured counts in data/SOURCES.md.
 */
const ANSWER_TARGET = 2400;

const LICENSE_HEADER = `/**
 * GENERATED FILE — produced by \`pnpm dict:build\` (scripts/build-dictionary.ts)
 * from the VERO Hunspell dictionary and affix file for Brazilian Portuguese
 * (data/raw/pt_BR.dic, data/raw/pt_BR.aff), by Raimundo Santos Moura and the
 * LibreOffice pt-BR community. Do not edit by hand — re-run the build.
 *
 * Licence: this derived word list is distributed under the GNU Lesser
 * General Public License version 3 (LGPL-3.0) — the grant common to every
 * downstream reading of VERO's ambiguous upstream licence statement — and
 * additionally under the Mozilla Public License to whatever extent
 * upstream's unversioned MPL grant permits. No specific MPL version is
 * asserted. See NOTICE.md and data/SOURCES.md for full provenance and the
 * four-way licence comparison this relies on.
 */`;

export interface BuildResult {
  /** Normalized (accent-free, uppercase) comparison keys, sorted, deduped. */
  guesses: string[];
  /** Accented display forms, ranked best-first, deduplicated by key. */
  answers: string[];
}

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/** Loads data/blocklist.txt into a set of normalized comparison keys. Missing file → empty set. */
async function loadBlocklist(): Promise<Set<string>> {
  const text = await readOptionalFile(BLOCKLIST_PATH);
  const keys = new Set<string>();
  if (text === null) return keys;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.split('#')[0]!.trim();
    if (!line) continue;
    keys.add(normalize(toNfc(line)));
  }
  return keys;
}

/**
 * Reads pt_br_50k.txt into a rank map keyed by the exact accented word text
 * (not the normalized key) — "sabia" and "sábia" are different words that
 * can each have their own frequency rank. The file is pre-sorted by
 * frequency descending, so line order is rank order (0 = most frequent).
 */
async function loadFrequencyRank(): Promise<Map<string, number>> {
  const text = await readFile(FREQUENCY_PATH, 'utf8');
  const rank = new Map<string, number>();
  let index = 0;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const word = toNfc(line.split(/\s+/)[0]!);
    if (!rank.has(word)) rank.set(word, index);
    index += 1;
  }
  return rank;
}

/** Runs the affix-expansion + filtering pipeline (steps 1–8) and returns the two word lists. */
export async function buildDictionary(): Promise<BuildResult> {
  const reader = await HunspellReader.createFromFiles(AFF_PATH, DIC_PATH);

  const seenKeys = new Set<string>();
  const sawLowercase = new Set<string>();
  const noSuggestWords = new Set<string>();
  // Accented, lowercase (i.e. non-proper), unmodified dictionary head-forms.
  //
  // hunspell-reader's own `prefix`/`suffix` fields are NOT a reliable
  // head-form signal: for suffix rules that strip part of the stem itself
  // (e.g. the "-ar" -> "-a" rule that turns "cantar" into "canta", 3rd
  // person present), the arithmetic in its internal substitution code can
  // land the computed suffix boundary exactly on the end of the new word,
  // reporting `suffix === ''` even though a real conjugation was applied
  // (verified empirically: CANTA, CUIDA, GOSTA, LAMBE, MANDA, MOLDA, PULSA,
  // TORNA all passed a prefix/suffix-based head-form check while their
  // `dic` field showed the true root — "cantar/2ajkLY...", etc.).
  //
  // The reliable signal is `AffWord.dic`: it carries the *original,
  // unmodified* "word/flags" text from the raw .dic line through every
  // recursive affix application untouched. A word is a genuine head-form
  // iff it equals the word half of that literal line — i.e. no affix
  // rule of any kind fired for it.
  const lowercaseHeadForms = new Set<string>();

  for (const affWord of reader.seqAffWords()) {
    const nfc = toNfc(affWord.word);
    if (nfc.length !== WORD_LENGTH) continue;

    const key = normalize(nfc);
    if (!WORD_KEY_RE.test(key)) continue;

    seenKeys.add(key);

    const firstChar = nfc.charAt(0);
    const isCapitalized = firstChar !== firstChar.toLowerCase();
    if (!isCapitalized) sawLowercase.add(key);

    if (affWord.flags.isNoSuggest) noSuggestWords.add(nfc);

    const dicWord = affWord.dic.split('/')[0];
    const isHeadForm = dicWord === affWord.word;
    if (isHeadForm && !isCapitalized) lowercaseHeadForms.add(nfc);
  }

  // Step 3 + 4: drop keys that never appeared lowercase (proper nouns,
  // acronyms), then sort + dedupe. Sets already dedupe; sort gives the
  // guess list its final, committed order.
  const guesses = [...seenKeys].filter((key) => sawLowercase.has(key)).sort();
  const guessSet = new Set(guesses);

  // Step 5
  const frequencyRank = await loadFrequencyRank();

  // Step 6: guess-list head-forms present in the frequency list, ranked
  // best first, top ANSWER_TARGET.
  const ranked = [...lowercaseHeadForms]
    .filter((word) => guessSet.has(normalize(word)))
    .filter((word) => frequencyRank.has(word))
    .sort((a, b) => frequencyRank.get(a)! - frequencyRank.get(b)!)
    .slice(0, ANSWER_TARGET);

  // Step 7: drop NOSUGGEST-flagged words and the manual blocklist.
  const blocklist = await loadBlocklist();
  const filtered = ranked.filter(
    (word) => !noSuggestWords.has(word) && !blocklist.has(normalize(word)),
  );

  // Step 8: keep the single highest-frequency accented form per comparison
  // key. `filtered` is already in best-first rank order, so the first
  // occurrence of a key is the one to keep.
  const answersByKey = new Map<string, string>();
  for (const word of filtered) {
    const key = normalize(word);
    if (!answersByKey.has(key)) answersByKey.set(key, word);
  }

  return { guesses, answers: [...answersByKey.values()] };
}

/**
 * These must actually throw and fail the build. The normalization-collision
 * check especially: if two answers share a comparison key, a player types
 * it, wins, and is shown a different word.
 */
export function assertBuildInvariants(guesses: string[], answers: string[]): void {
  const guessSet = new Set(guesses);

  for (const answer of answers) {
    const key = normalize(answer);
    if (!guessSet.has(key)) {
      throw new Error(`answer "${answer}" is not an accepted guess — unplayable`);
    }
    if (!/^[A-Z]{5}$/.test(key)) {
      throw new Error(`answer "${answer}" does not normalize to five letters`);
    }
  }

  const seen = new Map<string, string>();
  for (const answer of answers) {
    const key = normalize(answer);
    const clash = seen.get(key);
    if (clash) {
      throw new Error(
        `answers "${clash}" and "${answer}" share the key ${key}: the player ` +
          `would type it, win, and be shown the other word`,
      );
    }
    seen.set(key, answer);
  }

  if (answers.length < DAILY_POOL_SIZE) {
    throw new Error(`need at least ${DAILY_POOL_SIZE} answers, got ${answers.length}`);
  }
}

function renderGuessesSource(guesses: readonly string[]): string {
  const b64 = packSortedWords(guesses);
  return `${LICENSE_HEADER}

export const GUESSES_B64 = ${JSON.stringify(b64)};
export const GUESSES_COUNT = ${guesses.length};
`;
}

function renderAnswersSource(answers: readonly string[]): string {
  const entries = answers.map((word) => `  ${JSON.stringify(word)},`).join('\n');
  return `${LICENSE_HEADER}
//
// Ranked by real-world frequency using a build-time-only frequency list
// (hermitdave/FrequencyWords, CC BY-SA 4.0) that is never itself
// redistributed — see data/SOURCES.md. Restricted to dictionary head-forms:
// no conjugations or plurals ship as answers, only as accepted guesses.

export const ANSWERS: readonly string[] = [
${entries}
];
`;
}

/** Writes both generated files into `dir`. Exported so dict:check can reuse it against a temp dir. */
export async function writeGeneratedFiles(
  dir: string,
  guesses: readonly string[],
  answers: readonly string[],
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/guesses.generated.ts`, renderGuessesSource(guesses), 'utf8');
  await writeFile(`${dir}/answers.generated.ts`, renderAnswersSource(answers), 'utf8');
}

async function main(): Promise<void> {
  const { guesses, answers } = await buildDictionary();
  assertBuildInvariants(guesses, answers);
  await writeGeneratedFiles('src/data', guesses, answers);
  console.log(`guesses: ${guesses.length}`);
  console.log(`answers: ${answers.length}`);
}

const isMain = process.argv[1] !== undefined && process.argv[1].endsWith('build-dictionary.ts');
if (isMain) {
  await main();
}
